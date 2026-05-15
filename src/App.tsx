import { Download, Loader2, Sparkles } from 'lucide-react'
import React from 'react'
import './App.css'
import { ControlsPanel } from './components/panels/ControlsPanel'
import { InputPanel } from './components/panels/InputPanel'
import { PreviewPanel } from './components/panels/PreviewPanel'
import { ParameterSlider } from './components/controls/ParameterSlider'
import { ProgressStatus } from './components/ProgressStatus'
import { translateEncoderMessage, translateWorkerProgress } from './app/statusMessages'
import { postProcessRequest } from './workers/imageWorkerClient'
import type { ProcessWorkerRequest, WorkerResponse } from './workers/imageWorkerProtocol'
import {
  defaultPresetId,
  hdrPresets,
  type InputMode,
  type PresetId,
  type PresetSelection,
} from './lib/authoring'
import {
  defaultBypassOptions,
  detectUsefulGain,
  normalizeHdrGainMapControls,
  type BypassOptions,
  type GainMapResult,
  type RgbaImage,
} from './lib/gainMap'
import {
  getInitialLanguage,
  languageLabels,
  saveLanguage,
  translations,
  type Language,
} from './lib/i18n'
import { parameterHelp } from './lib/parameterHelp'
import { decodeImageFile, imageToPngUrl } from './lib/imageIo'
import type { EncoderCheckState, OutputState, ProgressState, StatusState } from './app/types'
import { downsampleRgbaImage } from './features/preview/downsampleRgba'

let nextRequestId = 1
const showDebugControls = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')
const previewProcessMaxLongEdge = 2400
const autoPreviewDelayMs = 750
const previewOverheadMs = 350
const defaultPreviewMsPerMegapixel = 850
const defaultEncodeMsPerMegapixel = 1800

function App() {
  const [language, setLanguage] = React.useState<Language>(() => getInitialLanguage())
  const [inputMode, setInputMode] = React.useState<InputMode>('single-image-enhance')
  const [currentPreset, setCurrentPreset] = React.useState<PresetSelection>(defaultPresetId)
  const [sourceName, setSourceName] = React.useState('')
  const [sourceImage, setSourceImage] = React.useState<RgbaImage | null>(null)
  const [gainMapName, setGainMapName] = React.useState('')
  const [gainMapImage, setGainMapImage] = React.useState<RgbaImage | null>(null)
  const [options, setOptions] = React.useState<BypassOptions>(defaultBypassOptions)
  const [quality, setQuality] = React.useState(82)
  const [result, setResult] = React.useState<GainMapResult | null>(null)
  const [output, setOutput] = React.useState<OutputState | null>(null)
  const [status, setStatus] = React.useState<StatusState>({ key: 'statusDrop' })
  const [encoderCheck, setEncoderCheck] = React.useState<EncoderCheckState>('checking')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState<ProgressState | null>(null)
  const previewMsPerMegapixelRef = React.useRef(defaultPreviewMsPerMegapixel)
  const encodeMsPerMegapixelRef = React.useRef(defaultEncodeMsPerMegapixel)
  const latestRequestIdRef = React.useRef(0)
  const activeWorkerRef = React.useRef<Worker | null>(null)

  const encoderReady = encoderCheck === 'ready'
  const t = translations[language]
  const translationRef = React.useRef(t)
  const help = parameterHelp[language]
  const canProcess = Boolean(sourceImage && (inputMode === 'single-image-enhance' || gainMapImage))

  React.useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    saveLanguage(language)
  }, [language])

  React.useEffect(() => {
    translationRef.current = t
  }, [t])

  React.useEffect(() => {
    return () => {
      if (output) URL.revokeObjectURL(output.url)
    }
  }, [output])

  React.useEffect(() => {
    let cancelled = false
    Promise.all([checkEncoderAsset('apple-hdr-heic.js'), checkEncoderAsset('apple-hdr-heic.wasm')])
      .then(() => {
        if (!cancelled) setEncoderCheck('ready')
      })
      .catch(() => {
        if (!cancelled) setEncoderCheck('missing')
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    return () => activeWorkerRef.current?.terminate()
  }, [])

  const applyPreset = (presetId: PresetId) => {
    cancelActiveRequest()
    setCurrentPreset(presetId)
    setOptions(hdrPresets[presetId])
    setStatus({ key: 'statusWaitingForInput' })
    setProgress(null)
  }

  const updateOptions = (patch: Partial<BypassOptions>) => {
    cancelActiveRequest()
    setCurrentPreset('custom')
    setOptions((state) => normalizeHdrGainMapControls({ ...state, ...patch }))
    setStatus({ key: 'statusWaitingForInput' })
    setProgress(null)
  }

  const updateInputMode = (mode: InputMode) => {
    cancelActiveRequest()
    setInputMode(mode)
    setStatus({ key: 'statusWaitingForInput' })
    setProgress(null)
  }

  const handleImageFile = async (file: File | null, target: 'source' | 'gain-map') => {
    if (!file) return
    cancelActiveRequest()
    setBusy(true)
    setProgress({
      active: true,
      label: t.statusDecodingSource,
      startedAt: nowMs(),
      estimatedMs: 1200,
    })
    setError(null)
    setResult(null)
    setOutput((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    try {
      setStatus({ key: 'statusDecodingSource' })
      const decoded = await decodeImageFile(file)
      if (target === 'gain-map') {
        setGainMapName(file.name)
        setGainMapImage(decoded)
        setStatus({ key: 'statusGainMapDecodedPreview' })
      } else {
        const signal = detectUsefulGain(decoded)
        setSourceName(file.name)
        setSourceImage(decoded)
        setStatus(
          signal.isLowDynamicRange
            ? { key: 'statusImageDecodedLowLuminance' }
            : { key: 'statusImageDecodedPreview' },
        )
      }
      setProgress(null)
      setBusy(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus({ key: 'statusCouldNotLoadImage' })
      setBusy(false)
      setProgress(null)
    }
  }

  const startProcessing = React.useCallback((requestInput: ProcessingRequestInput) => {
    const { encode, sourceImage, gainMapImage, inputMode, sourceName, options, quality } = requestInput
    const currentText = translationRef.current
    setBusy(true)
    const processingSourceImage = encode ? sourceImage : downsampleRgbaImage(sourceImage, previewProcessMaxLongEdge)
    const processingGainMapImage = gainMapImage && !encode ? downsampleRgbaImage(gainMapImage, previewProcessMaxLongEdge) : gainMapImage
    const estimatedMs = estimateProcessingMs({
      image: processingSourceImage,
      encode,
      previewMsPerMegapixel: previewMsPerMegapixelRef.current,
      encodeMsPerMegapixel: encodeMsPerMegapixelRef.current,
    })
    setProgress({
      active: true,
      label: encode ? currentText.statusEncodingHeic : currentText.statusGeneratingGainMap,
      startedAt: nowMs(),
      estimatedMs,
    })
    setError(null)
    if (encode) {
      setOutput((current) => {
        if (current) URL.revokeObjectURL(current.url)
        return null
      })
    }
    const requestImage = {
      width: processingSourceImage.width,
      height: processingSourceImage.height,
      data: new Uint8ClampedArray(processingSourceImage.data),
    }
    const requestGainMapImage = processingGainMapImage
      ? {
          width: processingGainMapImage.width,
          height: processingGainMapImage.height,
          data: new Uint8ClampedArray(processingGainMapImage.data),
        }
      : undefined
    const request: ProcessWorkerRequest = {
      type: 'process',
      id: nextRequestId++,
      mode: inputMode,
      sourceName,
      image: requestImage,
      gainMapImage: requestGainMapImage,
      options,
      quality,
      encode,
    }
    latestRequestIdRef.current = request.id
    activeWorkerRef.current?.terminate()
    const worker = createBypassWorker()
    activeWorkerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      handleWorkerMessage({
        event,
        worker,
        latestRequestIdRef,
        activeWorkerRef,
        previewMsPerMegapixelRef,
        encodeMsPerMegapixelRef,
        setBusy,
        setError,
        setOutput,
        setProgress,
        setResult,
        setStatus,
      })
    }
    postProcessRequest(worker, request)
  }, [])

  const processImage = React.useCallback((encode: boolean) => {
    if (!sourceImage) return
    if (inputMode === 'base-plus-gain-map' && !gainMapImage) return
    if (encode && !encoderReady) {
      setError(t.errorBrowserEncoderUnavailable)
      setStatus({ key: 'statusExportUnavailable' })
      return
    }
    startProcessing({
      encode,
      sourceImage,
      gainMapImage,
      inputMode,
      sourceName,
      options,
      quality,
    })
  }, [
    encoderReady,
    gainMapImage,
    inputMode,
    options,
    quality,
    sourceImage,
    sourceName,
    startProcessing,
    t.errorBrowserEncoderUnavailable,
  ])

  React.useEffect(() => {
    if (!sourceImage) return
    if (inputMode === 'base-plus-gain-map' && !gainMapImage) return
    const handle = window.setTimeout(() => {
      startProcessing({
        encode: false,
        sourceImage,
        gainMapImage,
        inputMode,
        sourceName: '',
        options,
        quality: 0,
      })
    }, autoPreviewDelayMs)
    return () => window.clearTimeout(handle)
  }, [gainMapImage, inputMode, options, sourceImage, startProcessing])

  const clearWorkspace = () => {
    cancelActiveRequest()
    setSourceName('')
    setSourceImage(null)
    setGainMapName('')
    setGainMapImage(null)
    setResult(null)
    setError(null)
    setBusy(false)
    setProgress(null)
    setStatus({ key: 'statusDrop' })
    setOutput((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
  }

  const cancelActiveRequest = () => {
    latestRequestIdRef.current += 1
    activeWorkerRef.current?.terminate()
    activeWorkerRef.current = null
    setBusy(false)
    setProgress(null)
  }

  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    handleImageFile(event.dataTransfer.files[0] ?? null, 'source')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-icon" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" aria-hidden="true" />
          <div>
            <p className="eyebrow">{t.appEyebrow}</p>
            <h1>{t.appTitle}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="language-switch" aria-label="Language">
            {(['en', 'zh'] satisfies Language[]).map((nextLanguage) => (
              <button
                key={nextLanguage}
                className={language === nextLanguage ? 'active' : undefined}
                type="button"
                onClick={() => setLanguage(nextLanguage)}
              >
                {languageLabels[nextLanguage]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <InputPanel
            language={language}
            t={t}
            help={help}
            inputMode={inputMode}
            sourceName={sourceName}
            gainMapName={gainMapName}
            canClear={Boolean(sourceImage || gainMapImage || result || output)}
            onInputModeChange={updateInputMode}
            onImageFile={handleImageFile}
            onDrop={onDrop}
            onClearWorkspace={clearWorkspace}
          />

          <p className={encoderReady ? 'encoder-status ready' : 'encoder-status'}>
            {encoderCheck === 'checking' && t.encoderChecking}
            {encoderCheck === 'ready' && t.encoderReady}
            {encoderCheck === 'missing' && t.encoderMissing}
          </p>

          <ControlsPanel
            language={language}
            t={t}
            help={help}
            options={options}
            currentPreset={currentPreset}
            result={result}
            showDebugControls={showDebugControls}
            onApplyPreset={applyPreset}
            onUpdateOptions={updateOptions}
            onDownloadGainMapPng={result ? () => downloadGainMapPreview(result.gainMapPreview, sourceName) : undefined}
          />

          <ParameterSlider
            language={language}
            label={t.heicQuality}
            help={help.heicQuality}
            value={quality}
            min={45}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}`}
            onChange={(nextQuality) => setQuality(nextQuality)}
          />

          <button className="primary-action" disabled={!canProcess || busy || !encoderReady} onClick={() => processImage(true)}>
            {busy ? <Loader2 className="spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {t.exportHeic}
          </button>

          {output && (
            <a className="download-action" download={output.fileName} href={output.url}>
              <Download aria-hidden="true" />
              {output.kind === 'heic' ? t.downloadHeic : t.downloadDebugPackage}
            </a>
          )}

          <p className="status-line">{status.fallback ?? t[status.key]}</p>
          {progress && (
            <ProgressStatus
              active={progress.active}
              label={progress.label}
              startedAt={progress.startedAt}
              estimatedMs={progress.estimatedMs}
              completeLabel={t.progressAlmostDone}
            />
          )}
          {error && <p className="error-line">{error}</p>}
        </aside>

        <PreviewPanel
          t={t}
          inputMode={inputMode}
          result={result}
          sourceSize={sourceImage ? { width: sourceImage.width, height: sourceImage.height } : undefined}
          output={output}
        />
      </section>

      <footer className="app-footer">
        <span>{t.conceptReferencePrefix}</span>
        <a href="https://github.com/chemharuka/toGainMapHDR" target="_blank">
          toGainMapHDR
        </a>
      </footer>
    </main>
  )
}

function createBypassWorker() {
  return new Worker(new URL('./workers/bypassWorker.ts', import.meta.url), {
    type: 'module',
  })
}

function nowMs() {
  return performance.now()
}

type WorkerMessageContext = {
  event: MessageEvent<WorkerResponse>
  worker: Worker
  latestRequestIdRef: { current: number }
  activeWorkerRef: { current: Worker | null }
  previewMsPerMegapixelRef: { current: number }
  encodeMsPerMegapixelRef: { current: number }
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setOutput: React.Dispatch<React.SetStateAction<OutputState | null>>
  setProgress: React.Dispatch<React.SetStateAction<ProgressState | null>>
  setResult: React.Dispatch<React.SetStateAction<GainMapResult | null>>
  setStatus: React.Dispatch<React.SetStateAction<StatusState>>
}

type ProcessingRequestInput = {
  encode: boolean
  sourceImage: RgbaImage
  gainMapImage: RgbaImage | null
  inputMode: InputMode
  sourceName: string
  options: BypassOptions
  quality: number
}

function handleWorkerMessage({
  event,
  worker,
  latestRequestIdRef,
  activeWorkerRef,
  previewMsPerMegapixelRef,
  encodeMsPerMegapixelRef,
  setBusy,
  setError,
  setOutput,
  setProgress,
  setResult,
  setStatus,
}: WorkerMessageContext) {
  const { type } = event.data
  if (event.data.id !== latestRequestIdRef.current) return

  if (type === 'progress') {
    setStatus(translateWorkerProgress(event.data.message))
    return
  }

  if (activeWorkerRef.current === worker) {
    activeWorkerRef.current = null
  }
  worker.terminate()

  if (type === 'error') {
    setBusy(false)
    setProgress(null)
    setError(event.data.message)
    setStatus({ key: 'statusProcessingFailed' })
    return
  }

  if (type === 'processed' || type === 'encoded') {
    const nextResult = event.data.result
    setResult(nextResult)
    const totalMs = nextResult.stats.timings?.totalMs
    const resultMegapixels = megapixels(nextResult.base)
    if (totalMs && resultMegapixels > 0) {
      if (type === 'encoded') {
        encodeMsPerMegapixelRef.current = blendEstimate(encodeMsPerMegapixelRef.current, totalMs / resultMegapixels)
      } else {
        previewMsPerMegapixelRef.current = blendEstimate(previewMsPerMegapixelRef.current, totalMs / resultMegapixels)
      }
    }
    if (type === 'encoded') {
      const encodedResult = event.data.encoded
      setOutput((current) => {
        if (current) URL.revokeObjectURL(current.url)
        return {
          url: URL.createObjectURL(new Blob([toArrayBuffer(encodedResult.bytes)], { type: encodedResult.mimeType })),
          fileName: encodedResult.fileName,
          label: encodedResult.message,
          kind: encodedResult.kind,
        }
      })
      setStatus(translateEncoderMessage(encodedResult.message))
    } else {
      setStatus({ key: 'statusPreviewUpdated' })
    }
    setBusy(false)
    setProgress(null)
  }
}

async function checkEncoderAsset(fileName: string) {
  const url = `${import.meta.env.BASE_URL}encoders/${fileName}`
  const head = await fetch(url, { method: 'HEAD', cache: 'no-store' })
  if (head.ok) return

  const get = await fetch(url, { method: 'GET', cache: 'no-store' })
  if (!get.ok) {
    throw new Error(`${fileName} is missing`)
  }
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function megapixels(image: Pick<RgbaImage, 'width' | 'height'>) {
  return (image.width * image.height) / 1_000_000
}

function estimateProcessingMs({
  image,
  encode,
  previewMsPerMegapixel,
  encodeMsPerMegapixel,
}: {
  image: RgbaImage
  encode: boolean
  previewMsPerMegapixel: number
  encodeMsPerMegapixel: number
}) {
  const rate = encode ? encodeMsPerMegapixel : previewMsPerMegapixel
  return Math.max(900, megapixels(image) * rate + previewOverheadMs)
}

function blendEstimate(current: number, next: number) {
  if (!Number.isFinite(next) || next <= 0) return current
  return current * 0.7 + next * 0.3
}

async function downloadGainMapPreview(image: RgbaImage, sourceName: string) {
  const url = await imageToPngUrl(image)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = withSuffix(sourceName, '-gain-map.png')
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function withSuffix(name: string, suffix: string) {
  const cleanName = name || 'luma-heic'
  const dot = cleanName.lastIndexOf('.')
  const stem = dot > 0 ? cleanName.slice(0, dot) : cleanName
  return `${stem}${suffix}`
}

export default App
