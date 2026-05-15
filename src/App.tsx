import { Download, FileImage, ImageUp, Loader2, SlidersHorizontal, Sparkles } from 'lucide-react'
import React from 'react'
import './App.css'
import {
  defaultPresetId,
  gainMapResolutionModes,
  hdrPresets,
  type GainMapResolutionMode,
  type InputMode,
  type PresetId,
  type PresetSelection,
} from './lib/authoring'
import type { HeicEncodeResult } from './lib/encoderTypes'
import {
  defaultBypassOptions,
  detectUsefulGain,
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
  type TranslationKey,
} from './lib/i18n'
import { decodeImageFile, imageToPngUrl } from './lib/imageIo'

type PreviewState = {
  baseUrl: string
  gainUrl: string
  hdrUrl: string
}

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

const worker = new Worker(new URL('./workers/bypassWorker.ts', import.meta.url), {
  type: 'module',
})

let nextRequestId = 1
const showDebugControls = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')
const extremeGainMapOptions: BypassOptions = {
  ...hdrPresets.extreme,
  headroom: 8,
  strength: 1,
  gainMapResolutionMode: 'full',
}
const toneSliderMin = -1
const toneSliderMax = 1

function App() {
  const [language, setLanguage] = React.useState<Language>(() => getInitialLanguage())
  const [inputMode, setInputMode] = React.useState<InputMode>('single-image-enhance')
  const [currentPreset, setCurrentPreset] = React.useState<PresetSelection>(defaultPresetId)
  const [sourceName, setSourceName] = React.useState('')
  const [sourceImage, setSourceImage] = React.useState<RgbaImage | null>(null)
  const [gainMapName, setGainMapName] = React.useState('')
  const [gainMapImage, setGainMapImage] = React.useState<RgbaImage | null>(null)
  const [options, setOptions] = React.useState<BypassOptions>(defaultBypassOptions)
  const [extremeGainMap, setExtremeGainMap] = React.useState(false)
  const [quality, setQuality] = React.useState(82)
  const [preview, setPreview] = React.useState<PreviewState | null>(null)
  const [result, setResult] = React.useState<GainMapResult | null>(null)
  const [output, setOutput] = React.useState<OutputState | null>(null)
  const [status, setStatus] = React.useState<StatusState>({ key: 'statusDrop' })
  const [encoderCheck, setEncoderCheck] = React.useState<EncoderCheckState>('checking')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const encoderReady = encoderCheck === 'ready'
  const t = translations[language]
  const canProcess = Boolean(sourceImage && (inputMode === 'single-image-enhance' || gainMapImage))

  React.useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    saveLanguage(language)
  }, [language])

  React.useEffect(() => {
    return () => revokePreview(preview)
  }, [preview])

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
    worker.onmessage = (event: MessageEvent) => {
      const { type, message, result: workerResult, encoded } = event.data
      if (type === 'progress') {
        setStatus(translateWorkerProgress(message))
        return
      }
      if (type === 'error') {
        setBusy(false)
        setError(message)
        setStatus({ key: 'statusProcessingFailed' })
        return
      }
      if (type === 'processed' || type === 'encoded') {
        const nextResult = workerResult as GainMapResult
        setResult(nextResult)
        setPreview((current) => {
          revokePreview(current)
          return {
            baseUrl: imageToPngUrl(nextResult.base),
            gainUrl: imageToPngUrl(nextResult.gainMapPreview),
            hdrUrl: imageToPngUrl(nextResult.hdrPreview),
          }
        })

        if (type === 'encoded') {
          const encodedResult = encoded as HeicEncodeResult
          setOutput((current) => {
            if (current) URL.revokeObjectURL(current.url)
            return {
              url: URL.createObjectURL(
                new Blob([toArrayBuffer(encodedResult.bytes)], { type: encodedResult.mimeType }),
              ),
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
      }
    }
  }, [])

  const setExtremeDebugMode = (enabled: boolean) => {
    setExtremeGainMap(enabled)
    setCurrentPreset(enabled ? 'custom' : defaultPresetId)
    setOptions(enabled ? extremeGainMapOptions : defaultBypassOptions)
  }

  const applyPreset = (presetId: PresetId) => {
    setCurrentPreset(presetId)
    setExtremeGainMap(false)
    setOptions(hdrPresets[presetId])
  }

  const updateOptions = (patch: Partial<BypassOptions>) => {
    setCurrentPreset('custom')
    setExtremeGainMap(false)
    setOptions((state) => ({ ...state, ...patch }))
  }

  const handleImageFile = async (file: File | null, target: 'source' | 'gain-map') => {
    if (!file) return
    setBusy(true)
    setError(null)
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
      if (
        (target === 'source' && inputMode === 'base-plus-gain-map' && !gainMapImage) ||
        (target === 'gain-map' && !sourceImage)
      ) {
        setBusy(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus({ key: 'statusCouldNotLoadImage' })
      setBusy(false)
    }
  }

  const processImage = React.useCallback((encode: boolean) => {
    if (!sourceImage) return
    if (inputMode === 'base-plus-gain-map' && !gainMapImage) return
    if (encode && !encoderReady) {
      setError(t.errorBrowserEncoderUnavailable)
      setStatus({ key: 'statusExportUnavailable' })
      return
    }
    setBusy(true)
    setError(null)
    if (encode) {
      setOutput((current) => {
        if (current) URL.revokeObjectURL(current.url)
        return null
      })
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
    const transfer = [requestImage.data.buffer as ArrayBuffer]
    if (requestGainMapImage) transfer.push(requestGainMapImage.data.buffer as ArrayBuffer)
    worker.postMessage(
      {
        type: 'process',
        id,
        mode: inputMode,
        sourceName,
        image: requestImage,
        gainMapImage: requestGainMapImage,
        options,
        quality,
        encode,
      },
      transfer,
    )
  }, [encoderReady, gainMapImage, inputMode, options, quality, sourceImage, sourceName, t.errorBrowserEncoderUnavailable])

  React.useEffect(() => {
    if (!sourceImage) return
    if (inputMode === 'base-plus-gain-map' && !gainMapImage) return
    const handle = window.setTimeout(() => {
      processImage(false)
    }, 140)
    return () => window.clearTimeout(handle)
  }, [gainMapImage, inputMode, processImage, sourceImage])

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
          <div className="mode-switch" aria-label={t.inputMode}>
            <button
              className={inputMode === 'single-image-enhance' ? 'active' : undefined}
              type="button"
              onClick={() => setInputMode('single-image-enhance')}
            >
              {t.singleImageEnhance}
            </button>
            <button
              className={inputMode === 'base-plus-gain-map' ? 'active' : undefined}
              type="button"
              onClick={() => setInputMode('base-plus-gain-map')}
            >
              {t.basePlusGainMap}
            </button>
          </div>

          <div className="drop-stack">
            <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
              <ImageUp aria-hidden="true" />
              <span>{sourceName || (inputMode === 'base-plus-gain-map' ? t.chooseBaseImage : t.chooseImage)}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                onChange={(event) => handleImageFile(event.target.files?.[0] ?? null, 'source')}
              />
            </label>
            {inputMode === 'base-plus-gain-map' && (
              <label className="drop-zone secondary-drop" onDragOver={(event) => event.preventDefault()}>
                <FileImage aria-hidden="true" />
                <span>{gainMapName || t.chooseGainMapImage}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  onChange={(event) => handleImageFile(event.target.files?.[0] ?? null, 'gain-map')}
                />
              </label>
            )}
          </div>

          <p className={encoderReady ? 'encoder-status ready' : 'encoder-status'}>
            {encoderCheck === 'checking' && t.encoderChecking}
            {encoderCheck === 'ready' && t.encoderReady}
            {encoderCheck === 'missing' && t.encoderMissing}
          </p>

          <div className="panel-heading">
            <SlidersHorizontal aria-hidden="true" />
            <h2>{t.controlsHeading}</h2>
          </div>

          <section className="control-section">
            <h3>{t.basicControls}</h3>
            <SelectRow
              label={t.preset}
              value={currentPreset}
              onChange={(value) => {
                if (value !== 'custom') applyPreset(value as PresetId)
              }}
              options={[
                ...Object.keys(hdrPresets).map((id) => ({
                  value: id,
                  label: t[presetTranslationKey(id as PresetId)],
                })),
                ...(currentPreset === 'custom' ? [{ value: 'custom', label: t.customPreset }] : []),
              ]}
            />
            <Slider
              label={t.exposure}
              value={options.exposure}
              min={toneSliderMin}
              max={toneSliderMax}
              step={0.01}
              format={(v) => `${formatTonePercent(v)} (${v > 0 ? '+' : ''}${v.toFixed(2)} EV)`}
              onChange={(exposure) => updateOptions({ exposure })}
            />
            <Slider
              label={t.highlights}
              value={options.highlights}
              min={toneSliderMin}
              max={toneSliderMax}
              step={0.01}
              format={formatTonePercent}
              onChange={(highlights) => updateOptions({ highlights })}
            />
            <Slider
              label={t.whites}
              value={options.whites}
              min={toneSliderMin}
              max={toneSliderMax}
              step={0.01}
              format={formatTonePercent}
              onChange={(whites) => updateOptions({ whites })}
            />
            <Slider
              label={t.shadows}
              value={options.shadows}
              min={toneSliderMin}
              max={toneSliderMax}
              step={0.01}
              format={formatTonePercent}
              onChange={(shadows) => updateOptions({ shadows })}
            />
            <Slider
              label={t.blacks}
              value={options.blacks}
              min={toneSliderMin}
              max={toneSliderMax}
              step={0.01}
              format={formatTonePercent}
              onChange={(blacks) => updateOptions({ blacks })}
            />
            <Slider
              label={t.hdrStrength}
              value={options.strength}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(strength) => updateOptions({ strength })}
            />
            <Slider
              label={t.peakHeadroom}
              value={options.headroom}
              min={1.05}
              max={8}
              step={0.05}
              format={(v) => `${v.toFixed(2)}x`}
              onChange={(headroom) => updateOptions({ headroom })}
            />
            <Slider
              label={t.glow}
              value={options.glow}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(glow) => updateOptions({ glow })}
            />
            <Slider
              label={t.protection}
              value={(options.shadowProtect + options.saturationProtect + options.skinProtect) / 3}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(protection) =>
                updateOptions({
                  shadowProtect: protection,
                  saturationProtect: protection,
                  skinProtect: protection,
                })
              }
            />
          </section>

          <details className="control-section" open>
            <summary>{t.advancedControls}</summary>
            <Slider
              label={t.highlightStart}
              value={options.highlightStart}
              min={0.05}
              max={0.95}
              step={0.01}
              format={formatPercent}
              onChange={(highlightStart) => updateOptions({ highlightStart })}
            />
            <Slider
              label={t.highlightEnd}
              value={options.highlightEnd}
              min={0.05}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(highlightEnd) => updateOptions({ highlightEnd })}
            />
            <Slider
              label={t.shadowProtect}
              value={options.shadowProtect}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(shadowProtect) => updateOptions({ shadowProtect })}
            />
            <Slider
              label={t.saturationProtect}
              value={options.saturationProtect}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(saturationProtect) => updateOptions({ saturationProtect })}
            />
            <Slider
              label={t.skinProtect}
              value={options.skinProtect}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(skinProtect) => updateOptions({ skinProtect })}
            />
            <Slider
              label={t.edgeSmoothRadius}
              value={options.edgeSmoothRadius}
              min={0}
              max={40}
              step={1}
              format={(v) => `${Math.round(v)} px`}
              onChange={(edgeSmoothRadius) => updateOptions({ edgeSmoothRadius })}
            />
            <Slider
              label={t.smallHighlightPreserve}
              value={options.smallHighlightPreserve}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(smallHighlightPreserve) => updateOptions({ smallHighlightPreserve })}
            />
            <SelectRow
              label={t.gainMapResolution}
              value={options.gainMapResolutionMode}
              onChange={(gainMapResolutionMode) =>
                updateOptions({ gainMapResolutionMode: gainMapResolutionMode as GainMapResolutionMode })
              }
              options={gainMapResolutionModes.map((mode) => ({
                value: mode,
                label: t[resolutionTranslationKey(mode)],
                disabled: mode === 'custom',
              }))}
            />
          </details>
          {showDebugControls && (
            <section className="control-section debug-section">
              <h3>{t.debugControls}</h3>
              <label className="debug-toggle">
                <input
                  type="checkbox"
                  checked={extremeGainMap}
                  onChange={(event) => setExtremeDebugMode(event.target.checked)}
                />
                <span>{t.extremeGainDebug}</span>
              </label>
              <dl className="debug-list">
                <div>
                  <dt>{t.currentPreset}</dt>
                  <dd>{currentPreset === 'custom' ? t.customPreset : t[presetTranslationKey(currentPreset)]}</dd>
                </div>
                <div>
                  <dt>{t.gainMapOutputSize}</dt>
                  <dd>{result ? `${result.gainMap.width} x ${result.gainMap.height}` : '-'}</dd>
                </div>
              </dl>
              {preview?.gainUrl && (
                <a className="mini-action" download={withSuffix(sourceName, '-gain-map.png')} href={preview.gainUrl}>
                  <Download aria-hidden="true" />
                  {t.downloadGainMapPng}
                </a>
              )}
            </section>
          )}
          <Slider
            label={t.heicQuality}
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
          {error && <p className="error-line">{error}</p>}
        </aside>

        <section className="preview-panel">
          <div className="preview-grid">
            <Preview title={t.sdrBase} url={preview?.baseUrl} />
            <Preview title={t.gainMap} url={preview?.gainUrl} />
            <Preview title={t.hdrReference} url={preview?.hdrUrl} />
          </div>

          <div className="metrics">
            <Metric label={t.canvas} value={result ? `${result.base.width} x ${result.base.height}` : '-'} />
            <Metric
              label={t.gainMap}
              value={result ? `${result.gainMap.width} x ${result.gainMap.height}` : '-'}
            />
            <Metric
              label={t.activePixels}
              value={result ? `${Math.round((result.stats.activePixels / (result.base.width * result.base.height)) * 100)}%` : '-'}
            />
            <Metric label={t.headroom} value={result ? `${result.stats.headroomStops.toFixed(2)} ${t.stops}` : '-'} />
          </div>

          {output && <p className="output-note">{translateOutputLabel(output.label, t)}</p>}
        </section>
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

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <label className="slider-row">
      <span>
        {label}
        <strong>{format(value)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string; disabled?: boolean }[]
  onChange: (value: string) => void
}) {
  return (
    <label className="select-row">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Preview({ title, url }: { title: string; url?: string }) {
  return (
    <article className="preview-tile">
      <header>
        <FileImage aria-hidden="true" />
        <h2>{title}</h2>
      </header>
      {url ? <img src={url} alt={title} /> : <div className="empty-preview" />}
    </article>
  )
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatTonePercent(value: number) {
  return `${Math.round(((value + 1) / 2) * 100)}%`
}

function presetTranslationKey(id: PresetId) {
  return `preset${id[0].toUpperCase()}${id.slice(1)}` as TranslationKey
}

function resolutionTranslationKey(mode: GainMapResolutionMode) {
  const keys: Record<GainMapResolutionMode, TranslationKey> = {
    auto: 'resolutionAuto',
    '480p': 'resolution480p',
    '720p': 'resolution720p',
    '1080p': 'resolution1080p',
    quarter: 'resolutionQuarter',
    half: 'resolutionHalf',
    full: 'resolutionFull',
    custom: 'resolutionCustom',
  }
  return keys[mode]
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
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

function translateOutputLabel(label: string, t: typeof translations.en) {
  return label === translations.en.encodedHeicLocal ? t.encodedHeicLocal : label
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

function revokePreview(preview: PreviewState | null) {
  if (!preview) return
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function withSuffix(name: string, suffix: string) {
  const cleanName = name || 'luma-heic'
  const dot = cleanName.lastIndexOf('.')
  const stem = dot > 0 ? cleanName.slice(0, dot) : cleanName
  return `${stem}${suffix}`
}

export default App
