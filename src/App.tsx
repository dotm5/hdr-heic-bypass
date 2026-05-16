import React from 'react'
import './App.css'
import { Download, Loader2, Sparkles } from 'lucide-react'
import { ParameterSlider } from './components/controls/ParameterSlider'
import { ControlsPanel } from './components/panels/ControlsPanel'
import { InputPanel } from './components/panels/InputPanel'
import { PreviewPanel } from './components/panels/PreviewPanel'
import {
  defaultPresetId,
  hdrPresets,
  type InputMode,
  type PresetId,
  type PresetSelection,
} from './lib/authoring'
import type { HeicEncodeResult } from './lib/encoderTypes'
import {
  defaultBypassOptions,
  normalizeHdrGainMapControls,
  type BypassOptions,
  type RgbaImage,
} from './lib/gainMap'
import {
  getInitialLanguage,
  languageLabels,
  saveLanguage,
  translations,
  type Language,
  type TranslationKey,
} from './lib/i18n'
import { parameterHelp } from './lib/parameterHelp'
import type { UiGainMapResult } from './features/preview/types'
import { decodeImageFile, imageToPngObjectUrl, validateImageFile } from './lib/imageIo'
import { createTrackedObjectURL, debugImagePerfLog, revokeTrackedObjectURL } from './lib/imagePerfDebug'
import { prepareImageInWorker } from './workers/imagePrepareClient'
import { postProcessRequest } from './workers/imageWorkerClient'
import type { ProcessWorkerRequest, WorkerResponse } from './workers/imageWorkerProtocol'

type OutputState = {
  url: string
  fileName: string
  label: string
  kind: HeicEncodeResult['kind']
}

type EncoderCheckState = 'checking' | 'ready' | 'missing'
type StatusState = {
  key: TranslationKey
  fallback?: string
}
type ActiveRequestKind = 'preview' | 'encode' | null

let nextRequestId = 1
const showDebugControls = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')
const autoPreviewDelayMs = 750

function App() {
  useSystemColorScheme()

  const [language, setLanguage] = React.useState<Language>(() => getInitialLanguage())
  const [inputMode, setInputMode] = React.useState<InputMode>('single-image-enhance')
  const [currentPreset, setCurrentPreset] = React.useState<PresetSelection>(defaultPresetId)
  const [sourceName, setSourceName] = React.useState('')
  const [sourceImage, setSourceImage] = React.useState<RgbaImage | null>(null)
  const [sourcePreviewImage, setSourcePreviewImage] = React.useState<RgbaImage | null>(null)
  const [gainMapName, setGainMapName] = React.useState('')
  const [gainMapImage, setGainMapImage] = React.useState<RgbaImage | null>(null)
  const [gainMapPreviewImage, setGainMapPreviewImage] = React.useState<RgbaImage | null>(null)
  const [options, setOptions] = React.useState<BypassOptions>(defaultBypassOptions)
  const [quality, setQuality] = React.useState(100)
  const [result, setResult] = React.useState<UiGainMapResult | null>(null)
  const [output, setOutput] = React.useState<OutputState | null>(null)
  const [status, setStatus] = React.useState<StatusState>({ key: 'statusDrop' })
  const [encoderCheck, setEncoderCheck] = React.useState<EncoderCheckState>('checking')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const mountedRef = React.useRef(true)
  const workerRef = React.useRef<Worker | null>(null)
  const latestRequestIdRef = React.useRef(0)
  const activeRequestKindRef = React.useRef<ActiveRequestKind>(null)
  const pendingPreviewTimerRef = React.useRef<number | null>(null)
  const decodeControllersRef = React.useRef<Record<'source' | 'gain-map', AbortController | null>>({
    source: null,
    'gain-map': null,
  })
  const decodeSequenceRef = React.useRef<Record<'source' | 'gain-map', number>>({ source: 0, 'gain-map': 0 })

  const encoderReady = encoderCheck === 'ready'
  const t = translations[language]
  const help = parameterHelp[language]
  const canProcess = Boolean(sourceImage && (inputMode === 'single-image-enhance' || gainMapImage))

  React.useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    saveLanguage(language)
  }, [language])

  React.useEffect(() => {
    return () => {
      revokeTrackedObjectURL(output?.url, 'heic-output')
    }
  }, [output])

  React.useEffect(() => {
    mountedRef.current = true
    const decodeControllers = decodeControllersRef.current
    return () => {
      mountedRef.current = false
      if (pendingPreviewTimerRef.current !== null) {
        window.clearTimeout(pendingPreviewTimerRef.current)
        pendingPreviewTimerRef.current = null
      }
      decodeControllers.source?.abort()
      decodeControllers['gain-map']?.abort()
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
        latestRequestIdRef.current += 1
        activeRequestKindRef.current = null
        debugImagePerfLog('worker:terminate', { reason: 'component-unmount' })
      }
    }
  }, [])

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

  const clearPendingPreview = React.useCallback(() => {
    if (pendingPreviewTimerRef.current === null) return
    window.clearTimeout(pendingPreviewTimerRef.current)
    pendingPreviewTimerRef.current = null
  }, [])

  const handleWorkerMessage = React.useCallback((event: MessageEvent<WorkerResponse>, worker: Worker) => {
    const { type, id } = event.data
    if (id !== latestRequestIdRef.current) {
      debugImagePerfLog('worker:stale-message', { id, activeId: latestRequestIdRef.current, type })
      return
    }

    if (type === 'progress') {
      setStatus(translateWorkerProgress(event.data.message))
      return
    }

    if (workerRef.current === worker) {
      workerRef.current = null
    }
    activeRequestKindRef.current = null
    worker.terminate()

    if (type === 'error') {
      setBusy(false)
      setError(event.data.message)
      setStatus({ key: 'statusProcessingFailed' })
      debugImagePerfLog('worker:error', { id, message: event.data.message })
      return
    }

    const nextResult = event.data.result
    React.startTransition(() => {
      setResult(nextResult)

      if (type === 'encoded') {
        const encodedResult = event.data.encoded
        setOutput({
          url: createTrackedObjectURL(
            new Blob([toArrayBuffer(encodedResult.bytes)], { type: encodedResult.mimeType }),
            'heic-output',
          ),
          fileName: encodedResult.fileName,
          label: encodedResult.message,
          kind: encodedResult.kind,
        })
        setStatus(translateEncoderMessage(encodedResult.message))
      } else {
        setStatus({ key: 'statusPreviewUpdated' })
      }
    })
    debugImagePerfLog('worker:result-applied', {
      id,
      type,
      baseDimensions: `${nextResult.base.width}x${nextResult.base.height}`,
      gainMapDimensions: `${nextResult.gainMap.width}x${nextResult.gainMap.height}`,
      totalMs: nextResult.stats.timings?.totalMs ?? 'unavailable',
    })
    setBusy(false)
  }, [])

  const cancelActiveWorker = React.useCallback((reason: string) => {
    latestRequestIdRef.current += 1
    activeRequestKindRef.current = null
    if (!workerRef.current) return

    workerRef.current.terminate()
    workerRef.current = null
    setBusy(false)
    debugImagePerfLog('worker:terminate', { reason })
  }, [])

  const applyPreset = React.useCallback(
    (presetId: PresetId) => {
      cancelActiveWorker('preset-change')
      setCurrentPreset(presetId)
      setOptions(hdrPresets[presetId])
    },
    [cancelActiveWorker],
  )

  const updateOptions = React.useCallback(
    (patch: Partial<BypassOptions>) => {
      cancelActiveWorker('options-change')
      if (currentPreset !== 'custom') setCurrentPreset('custom')
      setOptions((state) => normalizeHdrGainMapControls({ ...state, ...patch }))
    },
    [cancelActiveWorker, currentPreset],
  )

  const updateInputMode = React.useCallback(
    (mode: InputMode) => {
      cancelActiveWorker('input-mode-change')
      setInputMode(mode)
    },
    [cancelActiveWorker],
  )

  const handleImageFile = React.useCallback(
    async (file: File | null, target: 'source' | 'gain-map') => {
      if (!file) return
      const decodeId = ++decodeSequenceRef.current[target]
      decodeControllersRef.current[target]?.abort()
      const decodeController = new AbortController()
      decodeControllersRef.current[target] = decodeController
      cancelActiveWorker(`new-${target}-upload`)

      setBusy(true)
      setError(null)
      setOutput(null)
      setResult(null)
      if (target === 'gain-map') {
        setGainMapName(file.name)
        setGainMapImage(null)
        setGainMapPreviewImage(null)
      } else {
        setSourceName(file.name)
        setSourceImage(null)
        setSourcePreviewImage(null)
      }

      try {
        validateImageFile(file)
        debugImagePerfLog('upload:accepted', {
          target,
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type || 'unknown',
          queueLength: 1,
          activeTasks: workerRef.current ? 1 : 0,
        })
        setStatus({ key: 'statusDecodingSource' })
        const decoded = await decodeImageFile(file, { signal: decodeController.signal })
        if (!mountedRef.current || decodeId !== decodeSequenceRef.current[target] || decodeController.signal.aborted) {
          debugImagePerfLog('decode:discard-stale', { target, fileName: file.name, decodeId })
          return
        }
        const prepared = await prepareImageInWorker(decoded, {
          detectUsefulGain: target === 'source',
          signal: decodeController.signal,
        })
        if (!mountedRef.current || decodeId !== decodeSequenceRef.current[target] || decodeController.signal.aborted) {
          debugImagePerfLog('prepare:discard-stale', { target, fileName: file.name, decodeId })
          return
        }

        if (target === 'gain-map') {
          setGainMapName(file.name)
          setGainMapImage(decoded)
          setGainMapPreviewImage(prepared.previewImage)
          setStatus({ key: 'statusGainMapDecodedPreview' })
        } else {
          setSourceName(file.name)
          setSourceImage(decoded)
          setSourcePreviewImage(prepared.previewImage)
          setStatus(
            prepared.usefulGain?.isLowDynamicRange
              ? { key: 'statusImageDecodedLowLuminance' }
              : { key: 'statusImageDecodedPreview' },
          )
        }
        if (
          (target === 'source' && inputMode === 'base-plus-gain-map' && !gainMapImage) ||
          (target === 'gain-map' && !sourceImage)
        ) {
          setBusy(false)
        }
      } catch (err) {
        if (!isAbortError(err)) {
          setError(err instanceof Error ? err.message : String(err))
          setStatus({ key: 'statusCouldNotLoadImage' })
          setBusy(false)
        }
        debugImagePerfLog(isAbortError(err) ? 'decode:cancelled' : 'decode:error', {
          target,
          fileName: file.name,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        if (decodeControllersRef.current[target] === decodeController) {
          decodeControllersRef.current[target] = null
        }
      }
    },
    [
      cancelActiveWorker,
      gainMapImage,
      inputMode,
      sourceImage,
    ],
  )

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      void handleImageFile(event.dataTransfer.files[0] ?? null, 'source')
    },
    [handleImageFile],
  )

  const handleDownloadGainMapPng = React.useCallback(() => {
    if (!result?.gainMapPreview) return
    void downloadPreviewPng(result.gainMapPreview, withSuffix(sourceName, '-gain-map.png'))
  }, [result, sourceName])

  const startProcessing = React.useCallback((requestInput: ProcessingRequestInput) => {
    const { encode, sourceImage, gainMapImage, inputMode, sourceName, options, quality } = requestInput
    if (!encode && activeRequestKindRef.current === 'encode') {
      debugImagePerfLog('worker:skip-preview', { reason: 'encode-active' })
      return
    }
    if (encode) {
      clearPendingPreview()
    }
    cancelActiveWorker(encode ? 'new-encode-request' : 'new-preview-request')
    activeRequestKindRef.current = encode ? 'encode' : 'preview'
    setBusy(true)
    setError(null)
    if (encode) {
      setOutput(null)
    }

    const requestImage = {
      width: sourceImage.width,
      height: sourceImage.height,
      data: new Uint8ClampedArray(sourceImage.data),
    }
    const requestGainMapImage = gainMapImage
      ? {
          width: gainMapImage.width,
          height: gainMapImage.height,
          data: new Uint8ClampedArray(gainMapImage.data),
        }
      : undefined
    const id = nextRequestId++
    latestRequestIdRef.current = id
    debugImagePerfLog('worker:post', {
      id,
      encode,
      sourceName,
      imageDimensions: `${requestImage.width}x${requestImage.height}`,
      imageBytes: requestImage.data.byteLength,
      gainMapBytes: requestGainMapImage?.data.byteLength ?? 0,
      activeTasks: 1,
      queueLength: 0,
    })

    const worker = createBypassWorker()
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => handleWorkerMessage(event, worker)
    const request: ProcessWorkerRequest = {
      type: 'process',
      id,
      mode: inputMode,
      sourceName,
      image: requestImage,
      gainMapImage: requestGainMapImage,
      options,
      quality,
      encode,
    }
    postProcessRequest(worker, request)
  }, [cancelActiveWorker, clearPendingPreview, handleWorkerMessage])

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
      sourceImage: encode ? sourceImage : (sourcePreviewImage ?? sourceImage),
      gainMapImage: encode ? gainMapImage : (gainMapPreviewImage ?? gainMapImage),
      inputMode,
      sourceName,
      options,
      quality,
    })
  }, [
    encoderReady,
    gainMapImage,
    gainMapPreviewImage,
    inputMode,
    options,
    quality,
    sourceImage,
    sourcePreviewImage,
    sourceName,
    startProcessing,
    t.errorBrowserEncoderUnavailable,
  ])

  React.useEffect(() => {
    if (!sourceImage || !sourcePreviewImage) return
    if (inputMode === 'base-plus-gain-map' && (!gainMapImage || !gainMapPreviewImage)) return
    const handle = window.setTimeout(() => {
      if (pendingPreviewTimerRef.current !== handle) return
      pendingPreviewTimerRef.current = null
      if (activeRequestKindRef.current === 'encode') {
        debugImagePerfLog('worker:skip-preview', { reason: 'encode-active' })
        return
      }
      startProcessing({
        encode: false,
        sourceImage: sourcePreviewImage,
        gainMapImage: gainMapPreviewImage,
        inputMode,
        sourceName: '',
        options,
        quality: 0,
      })
    }, autoPreviewDelayMs)
    pendingPreviewTimerRef.current = handle
    return () => {
      if (pendingPreviewTimerRef.current === handle) {
        pendingPreviewTimerRef.current = null
      }
      window.clearTimeout(handle)
    }
  }, [gainMapImage, gainMapPreviewImage, inputMode, options, sourceImage, sourcePreviewImage, startProcessing])

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
            help={{ inputMode: help.inputMode }}
            inputMode={inputMode}
            sourceName={sourceName}
            gainMapName={gainMapName}
            onInputModeChange={updateInputMode}
            onImageFile={handleImageFile}
            onDrop={handleDrop}
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
            sourceDimensions={sourceImage ? { width: sourceImage.width, height: sourceImage.height } : null}
            showDebugControls={showDebugControls}
            onApplyPreset={applyPreset}
            onUpdateOptions={updateOptions}
            onDownloadGainMapPng={handleDownloadGainMapPng}
          />

          <ParameterSlider
            language={language}
            label={t.heicQuality}
            help={help.heicQuality}
            value={quality}
            min={45}
            max={100}
            step={1}
            format={formatInteger}
            onChange={setQuality}
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

          <p className="status-line" role="status" aria-live="polite">
            {status.fallback ?? t[status.key]}
          </p>
          {error && (
            <p className="error-line" role="alert">
              {error}
            </p>
          )}
        </aside>

        <PreviewPanel
          t={t}
          inputMode={inputMode}
          result={result}
          sourceSize={sourceImage ? { width: sourceImage.width, height: sourceImage.height } : undefined}
          outputLabel={output?.label}
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

function formatInteger(value: number) {
  return `${Math.round(value)}`
}

function translateWorkerProgress(message: string): StatusState {
  if (message === 'Generating HDR gain map') return { key: 'statusGeneratingGainMap' }
  if (message === 'Encoding HEIC payload') return { key: 'statusEncodingHeic' }
  return { key: 'statusProcessingFailed', fallback: message }
}

function translateEncoderMessage(message: string): StatusState {
  if (message === translations.en.encodedHeicLocal) return { key: 'encodedHeicLocal' }
  return { key: 'statusPreviewUpdated', fallback: message }
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

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function withSuffix(name: string, suffix: string) {
  const cleanName = name || 'luma-heic'
  const dot = cleanName.lastIndexOf('.')
  const stem = dot > 0 ? cleanName.slice(0, dot) : cleanName
  return `${stem}${suffix}`
}

async function downloadPreviewPng(image: RgbaImage, fileName: string) {
  const url = await imageToPngObjectUrl(image, { label: 'download-gain-preview' })
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
  } finally {
    revokeTrackedObjectURL(url, 'download-gain-preview')
  }
}

export default App

type ProcessingRequestInput = {
  encode: boolean
  sourceImage: RgbaImage
  gainMapImage: RgbaImage | null
  inputMode: InputMode
  sourceName: string
  options: BypassOptions
  quality: number
}

function createBypassWorker() {
  return new Worker(new URL('./workers/bypassWorker.ts', import.meta.url), {
    type: 'module',
  })
}

function useSystemColorScheme() {
  React.useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyColorScheme = () => {
      document.documentElement.dataset.colorScheme = media.matches ? 'dark' : 'light'
    }

    applyColorScheme()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', applyColorScheme)
      return () => media.removeEventListener('change', applyColorScheme)
    }

    const legacyMedia = media as MediaQueryList & {
      addListener?: (listener: () => void) => void
      removeListener?: (listener: () => void) => void
    }
    legacyMedia.addListener?.(applyColorScheme)
    return () => legacyMedia.removeListener?.(applyColorScheme)
  }, [])
}
