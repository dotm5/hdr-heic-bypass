import { Download, SlidersHorizontal } from 'lucide-react'
import React from 'react'
import {
  gainMapResolutionModes,
  hdrPresets,
  type BypassOptions,
  type GainMapResolutionMode,
  type PresetId,
  type PresetSelection,
} from '../../lib/authoring'
import { resolveGainMapSize } from '../../lib/gainMap'
import type { UiGainMapResult } from '../../features/preview/types'
import { translations, type Language, type TranslationKey } from '../../lib/i18n'
import type { ParameterHelpCopy, ParameterHelpKey } from '../../lib/parameterHelp'
import { ParameterSelect } from '../controls/ParameterSelect'
import { ParameterSlider } from '../controls/ParameterSlider'

type ControlsPanelProps = {
  language: Language
  t: typeof translations.en
  help: Record<ParameterHelpKey, ParameterHelpCopy>
  options: BypassOptions
  currentPreset: PresetSelection
  result: UiGainMapResult | null
  sourceDimensions: { width: number; height: number } | null
  showDebugControls: boolean
  onApplyPreset: (presetId: PresetId) => void
  onUpdateOptions: (patch: Partial<BypassOptions>) => void
  onDownloadGainMapPng?: () => void
}

export const ControlsPanel = React.memo(function ControlsPanel({
  language,
  t,
  help,
  options,
  currentPreset,
  result,
  sourceDimensions,
  showDebugControls,
  onApplyPreset,
  onUpdateOptions,
  onDownloadGainMapPng,
}: ControlsPanelProps) {
  const handlers = React.useMemo(
    () => ({
      onPresetChange: (value: string) => {
        if (value !== 'custom') onApplyPreset(value as PresetId)
      },
      onHdrStrengthStops: (hdrStrengthStops: number) => onUpdateOptions({ hdrStrengthStops }),
      onHighlightStartPct: (highlightStartPct: number) => onUpdateOptions({ highlightStartPct }),
      onHighlightRolloffPct: (highlightRolloffPct: number) => onUpdateOptions({ highlightRolloffPct }),
      onShadowLift: (shadowLift: number) => onUpdateOptions({ shadowLift }),
      onNaturalSaturation: (naturalSaturation: number) => onUpdateOptions({ naturalSaturation }),
      onDetail: (detail: number) => onUpdateOptions({ detail }),
      onHeadroomStops: (headroomStops: number) => onUpdateOptions({ headroomStops }),
      onMidtoneLock: (midtoneLock: number) => onUpdateOptions({ midtoneLock }),
      onEdgeAwareRadius: (edgeAwareRadius: number) => onUpdateOptions({ edgeAwareRadius }),
      onEdgeAwareEps: (edgeAwareEps: number) => onUpdateOptions({ edgeAwareEps }),
      onClipGuard: (clipGuard: number) => onUpdateOptions({ clipGuard }),
      onGainMapGamma: (gainMapGamma: number) => onUpdateOptions({ gainMapGamma }),
      onWhitePointGuardPct: (whitePointGuardPct: number) => onUpdateOptions({ whitePointGuardPct }),
      onBlackPointGuardPct: (blackPointGuardPct: number) => onUpdateOptions({ blackPointGuardPct }),
      onGainMapResolutionMode: (gainMapResolutionMode: string) =>
        onUpdateOptions({ gainMapResolutionMode: gainMapResolutionMode as GainMapResolutionMode }),
    }),
    [onApplyPreset, onUpdateOptions],
  )

  const presetOptions = React.useMemo(
    () => [
      ...Object.keys(hdrPresets).map((id) => ({
        value: id,
        label: t[presetTranslationKey(id as PresetId)],
      })),
      ...(currentPreset === 'custom' ? [{ value: 'custom', label: t.customPreset }] : []),
    ],
    [currentPreset, t],
  )

  const resolutionOptions = React.useMemo(
    () =>
      gainMapResolutionModes.map((mode) => ({
        value: mode,
        label: t[resolutionTranslationKey(mode)],
        disabled: mode === 'custom',
      })),
    [t],
  )
  const formatStops = React.useCallback((v: number) => `${v.toFixed(2)} ${t.stops}`, [t.stops])

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
          onChange={handlers.onPresetChange}
          options={presetOptions}
        />
        <ParameterSlider
          language={language}
          label={t.hdrStrength}
          help={help.hdrStrength}
          value={options.hdrStrengthStops}
          min={0}
          max={3}
          step={0.05}
          format={formatStops}
          onChange={handlers.onHdrStrengthStops}
        />
        <ParameterSlider
          language={language}
          label={t.highlightStart}
          help={help.highlightStart}
          value={options.highlightStartPct}
          min={80}
          max={99.5}
          step={0.1}
          format={formatPercentPoint}
          onChange={handlers.onHighlightStartPct}
        />
        <ParameterSlider
          language={language}
          label={t.highlightRolloff}
          help={help.highlightRolloff}
          value={options.highlightRolloffPct}
          min={Math.min(99.8, options.highlightStartPct + 0.1)}
          max={99.9}
          step={0.1}
          format={formatPercentPoint}
          onChange={handlers.onHighlightRolloffPct}
        />
        <ParameterSlider
          language={language}
          label={t.shadowLift}
          help={help.shadowLift}
          value={options.shadowLift}
          min={0}
          max={0.5}
          step={0.01}
          format={formatPercent}
          onChange={handlers.onShadowLift}
        />
        <ParameterSlider
          language={language}
          label={t.naturalSaturation}
          help={help.naturalSaturation}
          value={options.naturalSaturation}
          min={0}
          max={1}
          step={0.01}
          format={formatPercent}
          onChange={handlers.onNaturalSaturation}
        />
        <ParameterSlider
          language={language}
          label={t.detail}
          help={help.detail}
          value={options.detail}
          min={0}
          max={0.5}
          step={0.01}
          format={formatPercent}
          onChange={handlers.onDetail}
        />
      </section>

      <details className="control-section">
        <summary>{t.advancedControls}</summary>
        <ParameterSlider
          language={language}
          label={t.headroom}
          help={help.headroom}
          value={options.headroomStops}
          min={0}
          max={4}
          step={0.05}
          format={formatStops}
          onChange={handlers.onHeadroomStops}
        />
        <ParameterSlider
          language={language}
          label={t.midtoneLock}
          help={help.midtoneLock}
          value={options.midtoneLock}
          min={0}
          max={1}
          step={0.01}
          format={formatPercent}
          onChange={handlers.onMidtoneLock}
        />
        <ParameterSlider
          language={language}
          label={t.edgeAwareSmoothness}
          help={help.edgeAwareRadius}
          value={options.edgeAwareRadius}
          min={0}
          max={32}
          step={1}
          format={formatPixels}
          onChange={handlers.onEdgeAwareRadius}
        />
        <ParameterSlider
          language={language}
          label={t.edgeAwareEps}
          help={help.edgeAwareEps}
          value={options.edgeAwareEps}
          min={0.0001}
          max={0.02}
          step={0.0001}
          format={formatFixed4}
          onChange={handlers.onEdgeAwareEps}
        />
        <ParameterSlider
          language={language}
          label={t.clipGuard}
          help={help.clipGuard}
          value={options.clipGuard}
          min={0}
          max={1}
          step={0.01}
          format={formatPercent}
          onChange={handlers.onClipGuard}
        />
        <ParameterSlider
          language={language}
          label={t.gainMapGamma}
          help={help.gainMapGamma}
          value={options.gainMapGamma}
          min={0.6}
          max={2.2}
          step={0.01}
          format={formatFixed2}
          onChange={handlers.onGainMapGamma}
        />
        <ParameterSlider
          language={language}
          label={t.whitePointGuard}
          help={help.whitePointGuard}
          value={options.whitePointGuardPct}
          min={98}
          max={99.95}
          step={0.05}
          format={formatPercentPoint}
          onChange={handlers.onWhitePointGuardPct}
        />
        <ParameterSlider
          language={language}
          label={t.blackPointGuard}
          help={help.blackPointGuard}
          value={options.blackPointGuardPct}
          min={0}
          max={2}
          step={0.05}
          format={formatPercentPoint}
          onChange={handlers.onBlackPointGuardPct}
        />
        <ParameterSelect
          language={language}
          label={t.gainMapResolution}
          help={help.gainMapResolution}
          value={options.gainMapResolutionMode}
          onChange={handlers.onGainMapResolutionMode}
          options={resolutionOptions}
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
              <dd>{formatGainMapOutputSize(result, sourceDimensions, options, t)}</dd>
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
})

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatPercentPoint(value: number) {
  return `${value.toFixed(value < 10 ? 2 : 1)}%`
}

function formatPixels(value: number) {
  return `${Math.round(value)} px`
}

function formatFixed4(value: number) {
  return value.toFixed(4)
}

function formatFixed2(value: number) {
  return value.toFixed(2)
}

function formatLinear(value: number) {
  return value < 0.01 ? value.toExponential(1) : value.toFixed(3)
}

function formatLuminanceStats(result: UiGainMapResult) {
  const { p50, p90, p95, p99, p99_9 } = result.stats.luminance
  return `p50 ${formatLinear(p50)} / p90 ${formatLinear(p90)} / p95 ${formatLinear(p95)} / p99 ${formatLinear(p99)} / p99.9 ${formatLinear(p99_9)}`
}

function formatGainStats(result: UiGainMapResult) {
  const { min, max, mean, encodedMin, encodedMax } = result.stats.gain
  return `log2 ${min.toFixed(2)}-${max.toFixed(2)} / mean ${mean.toFixed(2)} / encoded ${encodedMin}-${encodedMax}`
}

function formatGainMapOutputSize(
  result: UiGainMapResult | null,
  sourceDimensions: { width: number; height: number } | null,
  options: BypassOptions,
  t: typeof translations.en,
) {
  if (!result) return '-'
  const previewSize = `${result.gainMap.width} x ${result.gainMap.height}`
  if (!sourceDimensions) return previewSize

  const exportSize = resolveGainMapSize(
    sourceDimensions.width,
    sourceDimensions.height,
    options.gainMapResolutionMode,
    options.customGainMapWidth,
    options.customGainMapHeight,
  )
  const exportSizeText = `${exportSize.width} x ${exportSize.height}`
  if (previewSize === exportSizeText) return exportSizeText
  return `${t.previewOutput}: ${previewSize} / ${t.exportOutput}: ${exportSizeText}`
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
