import { clamp } from '../../lib/math'
import type { HdrGainMapControls, LegacyBypassOptions } from './types'

export function migrateLegacyControls(input: LegacyBypassOptions): Partial<HdrGainMapControls> {
  const strength =
    typeof input.hdrStrengthStops === 'number'
      ? input.hdrStrengthStops
      : typeof input.strength === 'number'
        ? input.strength * 1.85
        : undefined

  const headroomStops =
    typeof input.headroomStops === 'number'
      ? input.headroomStops
      : typeof input.headroom === 'number'
        ? Math.log2(Math.max(input.headroom, 1.0001))
        : undefined

  const highlightStartPct =
    typeof input.highlightStartPct === 'number'
      ? input.highlightStartPct
      : typeof input.highlightStart === 'number'
        ? 80 + clamp(input.highlightStart, 0, 1) * 19.5
        : undefined

  const highlightRolloffPct =
    typeof input.highlightRolloffPct === 'number'
      ? input.highlightRolloffPct
      : typeof input.highlightEnd === 'number'
        ? 80 + clamp(input.highlightEnd, 0, 1) * 19.5
        : undefined

  const protection =
    typeof input.colorProtect === 'number'
      ? input.colorProtect
      : typeof input.protection === 'number'
        ? input.protection
        : undefined

  const shadowLift =
    typeof input.shadowLift === 'number'
      ? input.shadowLift
      : typeof input.shadows === 'number' || typeof input.blacks === 'number'
        ? clamp(0.15 + Math.max(0, input.shadows ?? 0) * 0.2 + Math.max(0, input.blacks ?? 0) * 0.1, 0, 0.5)
        : undefined

  const detail =
    typeof input.detail === 'number'
      ? input.detail
      : typeof input.highlights === 'number' || typeof input.whites === 'number'
        ? clamp(0.08 + Math.max(0, input.highlights ?? 0) * 0.12 + Math.max(0, input.whites ?? 0) * 0.08, 0, 0.5)
        : undefined

  return {
    hdrStrengthStops: strength,
    headroomStops,
    highlightStartPct,
    highlightRolloffPct,
    colorProtect: protection,
    shadowLift,
    detail,
    clipGuard:
      typeof input.clipGuard === 'number'
        ? input.clipGuard
        : typeof input.shadowProtect === 'number'
          ? input.shadowProtect
          : protection,
    gainMapGamma: input.gainMapGamma,
    edgeAwareRadius:
      typeof input.edgeAwareRadius === 'number'
        ? input.edgeAwareRadius
        : typeof input.edgeSmoothRadius === 'number'
          ? input.edgeSmoothRadius
          : undefined,
    edgeAwareEps: input.edgeAwareEps,
    gainMapResolutionMode: input.gainMapResolutionMode,
    customGainMapWidth: normalizePositiveInteger(input.customGainMapWidth),
    customGainMapHeight: normalizePositiveInteger(input.customGainMapHeight),
  }
}

export function normalizePositiveInteger(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.max(1, Math.round(value))
}
