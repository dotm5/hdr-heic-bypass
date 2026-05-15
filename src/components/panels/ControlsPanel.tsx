import { Download, SlidersHorizontal } from 'lucide-react'
import { ParameterSelect } from '../controls/ParameterSelect'
import { ParameterSlider } from '../controls/ParameterSlider'
import type { BypassOptions, GainMapResolutionMode, PresetId, PresetSelection } from '../../lib/authoring'
import { gainMapResolutionModes, hdrPresets } from '../../lib/authoring'
import type { GainMapResult } from '../../lib/gainMap'
import type { Language, TranslationKey, translations } from '../../lib/i18n'
import type { ParameterHelpCopy } from '../../lib/parameterHelp'
import { hdrControlRanges } from '../../features/hdr/ranges'

type ControlsPanelProps = {
  language: Language
  t: typeof translations.en
  help: Record<string, ParameterHelpCopy>
  options: BypassOptions
  currentPreset: PresetSelection
  result: GainMapResult | null
  showDebugControls: boolean
  onApplyPreset: (presetId: PresetId) => void
  onUpdateOptions: (patch: Partial<BypassOptions>) => void
  onDownloadGainMapPng?: () => void
}

export function ControlsPanel({
  language,
  t,
  help,
  options,
  currentPreset,
  result,
  showDebugControls,
  onApplyPreset,
  onUpdateOptions,
  onDownloadGainMapPng,
}: ControlsPanelProps) {
  return (
    <>
      <div className="panel-heading">
        <SlidersHorizontal aria-hidden="true" />
        <h2>{t.controlsHeading}</h2>
      </div>

      <section className="control-section">
        <h3>{t.basicControls}</h3>
        <ParameterSelect
          language={language}
          label={t.preset}
          help={help.preset}
          value={currentPreset}
          onChange={(value) => {
            if (value !== 'custom') onApplyPreset(value as PresetId)
          }}
          options={[
            ...Object.keys(hdrPresets).map((id) => ({
              value: id,
              label: t[presetTranslationKey(id as PresetId)],
            })),
            ...(currentPreset === 'custom' ? [{ value: 'custom', label: t.customPreset }] : []),
          ]}
        />
        <ParameterSlider
          language={language}
          label={t.hdrStrength}
          help={help.hdrStrength}
          value={options.hdrStrengthStops}
          {...hdrControlRanges.hdrStrengthStops}
          format={(v) => `${v.toFixed(2)} ${t.stops}`}
          onChange={(hdrStrengthStops) => onUpdateOptions({ hdrStrengthStops })}
        />
        <ParameterSlider
          language={language}
          label={t.highlightStart}
          help={help.highlightStart}
          value={options.highlightStartPct}
          {...hdrControlRanges.highlightStartPct}
          format={formatPercentPoint}
          onChange={(highlightStartPct) => onUpdateOptions({ highlightStartPct })}
        />
        <ParameterSlider
          language={language}
          label={t.highlightRolloff}
          help={help.highlightRolloff}
          value={options.highlightRolloffPct}
          min={Math.min(99.8, options.highlightStartPct + 0.1)}
          max={hdrControlRanges.highlightRolloffPct.max}
          step={hdrControlRanges.highlightRolloffPct.step}
          format={formatPercentPoint}
          onChange={(highlightRolloffPct) => onUpdateOptions({ highlightRolloffPct })}
        />
        <ParameterSlider
          language={language}
          label={t.shadowLift}
          help={help.shadowLift}
          value={options.shadowLift}
          {...hdrControlRanges.shadowLift}
          format={formatPercent}
          onChange={(shadowLift) => onUpdateOptions({ shadowLift })}
        />
        <ParameterSlider
          language={language}
          label={t.colorProtect}
          help={help.colorProtect}
          value={options.colorProtect}
          {...hdrControlRanges.colorProtect}
          format={formatPercent}
          onChange={(colorProtect) => onUpdateOptions({ colorProtect })}
        />
        <ParameterSlider
          language={language}
          label={t.detail}
          help={help.detail}
          value={options.detail}
          {...hdrControlRanges.detail}
          format={formatPercent}
          onChange={(detail) => onUpdateOptions({ detail })}
        />
      </section>

      <details className="control-section">
        <summary>{t.advancedControls}</summary>
        <ParameterSlider
          language={language}
          label={t.headroom}
          help={help.headroom}
          value={options.headroomStops}
          {...hdrControlRanges.headroomStops}
          format={(v) => `${v.toFixed(2)} ${t.stops}`}
          onChange={(headroomStops) => onUpdateOptions({ headroomStops })}
        />
        <ParameterSlider
          language={language}
          label={t.midtoneLock}
          help={help.midtoneLock}
          value={options.midtoneLock}
          {...hdrControlRanges.midtoneLock}
          format={formatPercent}
          onChange={(midtoneLock) => onUpdateOptions({ midtoneLock })}
        />
        <ParameterSlider
          language={language}
          label={t.edgeAwareSmoothness}
          help={help.edgeAwareRadius}
          value={options.edgeAwareRadius}
          {...hdrControlRanges.edgeAwareRadius}
          format={(v) => `${Math.round(v)} px`}
          onChange={(edgeAwareRadius) => onUpdateOptions({ edgeAwareRadius })}
        />
        <ParameterSlider
          language={language}
          label={t.edgeAwareEps}
          help={help.edgeAwareEps}
          value={options.edgeAwareEps}
          {...hdrControlRanges.edgeAwareEps}
          format={(v) => v.toFixed(4)}
          onChange={(edgeAwareEps) => onUpdateOptions({ edgeAwareEps })}
        />
        <ParameterSlider
          language={language}
          label={t.clipGuard}
          help={help.clipGuard}
          value={options.clipGuard}
          {...hdrControlRanges.clipGuard}
          format={formatPercent}
          onChange={(clipGuard) => onUpdateOptions({ clipGuard })}
        />
        <ParameterSlider
          language={language}
          label={t.gainMapGamma}
          help={help.gainMapGamma}
          value={options.gainMapGamma}
          {...hdrControlRanges.gainMapGamma}
          format={(v) => v.toFixed(2)}
          onChange={(gainMapGamma) => onUpdateOptions({ gainMapGamma })}
        />
        <ParameterSlider
          language={language}
          label={t.whitePointGuard}
          help={help.whitePointGuard}
          value={options.whitePointGuardPct}
          {...hdrControlRanges.whitePointGuardPct}
          format={formatPercentPoint}
          onChange={(whitePointGuardPct) => onUpdateOptions({ whitePointGuardPct })}
        />
        <ParameterSlider
          language={language}
          label={t.blackPointGuard}
          help={help.blackPointGuard}
          value={options.blackPointGuardPct}
          {...hdrControlRanges.blackPointGuardPct}
          format={formatPercentPoint}
          onChange={(blackPointGuardPct) => onUpdateOptions({ blackPointGuardPct })}
        />
        <ParameterSelect
          language={language}
          label={t.gainMapResolution}
          help={help.gainMapResolution}
          value={options.gainMapResolutionMode}
          onChange={(gainMapResolutionMode) =>
            onUpdateOptions({ gainMapResolutionMode: gainMapResolutionMode as GainMapResolutionMode })
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
          <dl className="debug-list">
            <div>
              <dt>{t.currentPreset}</dt>
              <dd>{currentPreset === 'custom' ? t.customPreset : t[presetTranslationKey(currentPreset)]}</dd>
            </div>
            <div>
              <dt>{t.gainMapOutputSize}</dt>
              <dd>{result ? `${result.gainMap.width} x ${result.gainMap.height}` : '-'}</dd>
            </div>
            <div>
              <dt>{t.luminanceStats}</dt>
              <dd>{result ? formatLuminanceStats(result) : '-'}</dd>
            </div>
            <div>
              <dt>{t.gainStats}</dt>
              <dd>{result ? formatGainStats(result) : '-'}</dd>
            </div>
            <div>
              <dt>{t.processingTime}</dt>
              <dd>{result?.stats.timings ? `${result.stats.timings.totalMs.toFixed(1)} ms` : '-'}</dd>
            </div>
          </dl>
          {onDownloadGainMapPng && (
            <button className="mini-action" type="button" onClick={onDownloadGainMapPng}>
              <Download aria-hidden="true" />
              {t.downloadGainMapPng}
            </button>
          )}
        </section>
      )}
    </>
  )
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatPercentPoint(value: number) {
  return `${value.toFixed(value < 10 ? 2 : 1)}%`
}

function formatLinear(value: number) {
  return value < 0.01 ? value.toExponential(1) : value.toFixed(3)
}

function formatLuminanceStats(result: GainMapResult) {
  const { p50, p90, p95, p99, p99_9 } = result.stats.luminance
  return `p50 ${formatLinear(p50)} / p90 ${formatLinear(p90)} / p95 ${formatLinear(p95)} / p99 ${formatLinear(p99)} / p99.9 ${formatLinear(p99_9)}`
}

function formatGainStats(result: GainMapResult) {
  const { min, max, mean, encodedMin, encodedMax } = result.stats.gain
  return `log2 ${min.toFixed(2)}-${max.toFixed(2)} / mean ${mean.toFixed(2)} / encoded ${encodedMin}-${encodedMax}`
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
