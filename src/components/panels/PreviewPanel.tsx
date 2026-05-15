import { PreviewTile } from '../preview/PreviewTile'
import type { InputMode } from '../../lib/authoring'
import type { GainMapResult } from '../../lib/gainMap'
import { translations } from '../../lib/i18n'
import type { OutputState } from '../../app/types'

type PreviewPanelProps = {
  t: typeof translations.en
  inputMode: InputMode
  result: GainMapResult | null
  sourceSize?: { width: number; height: number }
  output: OutputState | null
}

export function PreviewPanel({ t, inputMode, result, sourceSize, output }: PreviewPanelProps) {
  const canvasWidth = sourceSize?.width ?? result?.base.width
  const canvasHeight = sourceSize?.height ?? result?.base.height
  const activePixelCount = Math.max((result?.base.width ?? 0) * (result?.base.height ?? 0), 1)

  return (
    <section className="preview-panel">
      <div className="preview-grid">
        <PreviewTile title={t.sdrBase} image={result?.base} />
        <PreviewTile
          title={inputMode === 'single-image-enhance' ? t.highlightMask : t.suppliedGainMap}
          image={result?.highlightMaskPreview}
        />
        <PreviewTile title={t.gainMap} image={result?.gainMapPreview} />
        <PreviewTile title={t.hdrReference} image={result?.hdrPreview} />
      </div>

      <div className="metrics">
        <Metric label={t.canvas} value={canvasWidth && canvasHeight ? `${canvasWidth} x ${canvasHeight}` : '-'} />
        <Metric label={t.gainMap} value={result ? `${result.gainMap.width} x ${result.gainMap.height}` : '-'} />
        <Metric
          label={t.activePixels}
          value={result ? `${Math.round((result.stats.activePixels / activePixelCount) * 100)}%` : '-'}
        />
        <Metric label={t.headroom} value={result ? `${result.stats.headroomStops.toFixed(2)} ${t.stops}` : '-'} />
        <Metric label={t.luminanceP95} value={result ? formatLinear(result.stats.luminance.p95) : '-'} />
        <Metric
          label={t.gainLog2Range}
          value={result ? `${result.stats.gain.min.toFixed(2)}-${result.stats.gain.max.toFixed(2)}` : '-'}
        />
      </div>

      {output && <p className="output-note">{translateOutputLabel(output.label, t)}</p>}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatLinear(value: number) {
  return value < 0.01 ? value.toExponential(1) : value.toFixed(3)
}

function translateOutputLabel(label: string, t: typeof translations.en) {
  return label === translations.en.encodedHeicLocal ? t.encodedHeicLocal : label
}
