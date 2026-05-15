import { clamp } from '../../lib/math'
import { migrateLegacyControls, normalizePositiveInteger } from './migrateControls'
import { defaultPresetId, hdrPresets } from './presets'
import type { HdrGainMapControls, HdrPresetId, LegacyBypassOptions } from './types'

export function normalizeHdrGainMapControls(
  input: Partial<HdrGainMapControls> & LegacyBypassOptions = {},
): HdrGainMapControls {
  const preset = isHdrPresetId(input.preset) ? input.preset : defaultPresetId
  const fallback = hdrPresets[preset]
  const migrated = migrateLegacyControls(input)
  const merged = {
    ...fallback,
    ...migrated,
    ...input,
    preset,
  }

  const highlightStartPct = clamp(merged.highlightStartPct, 80.0, 99.5)
  const highlightRolloffPct = clamp(merged.highlightRolloffPct, highlightStartPct + 0.1, 99.9)

  return {
    preset,
    hdrStrengthStops: clamp(merged.hdrStrengthStops, 0, 3),
    highlightStartPct,
    highlightRolloffPct,
    shadowLift: clamp(merged.shadowLift, 0, 0.5),
    colorProtect: clamp(merged.colorProtect, 0, 1),
    detail: clamp(merged.detail, 0, 0.5),
    headroomStops: clamp(merged.headroomStops, 0, 4),
    midtoneLock: clamp(merged.midtoneLock, 0, 1),
    whitePointGuardPct: clamp(merged.whitePointGuardPct, 98.0, 99.95),
    blackPointGuardPct: clamp(merged.blackPointGuardPct, 0.0, 2.0),
    edgeAwareRadius: Math.round(clamp(merged.edgeAwareRadius, 0, 32)),
    edgeAwareEps: clamp(merged.edgeAwareEps, 0.0001, 0.02),
    clipGuard: clamp(merged.clipGuard, 0, 1),
    gainMapGamma: clamp(merged.gainMapGamma, 0.6, 2.2),
    gainMapResolutionMode: merged.gainMapResolutionMode ?? 'auto',
    customGainMapWidth: normalizePositiveInteger(merged.customGainMapWidth),
    customGainMapHeight: normalizePositiveInteger(merged.customGainMapHeight),
  }
}

export function isHdrPresetId(value: unknown): value is HdrPresetId {
  return value === 'natural' || value === 'bright' || value === 'neonNight' || value === 'soft' || value === 'product'
}
