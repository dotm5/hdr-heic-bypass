export type GainMapResolutionMode =
  | 'auto'
  | '480p'
  | '720p'
  | '1080p'
  | 'quarter'
  | 'half'
  | 'full'
  | 'custom'

export type InputMode = 'single-image-enhance' | 'base-plus-gain-map'

export type HdrPresetId = 'macbookPro1600' | 'lightScene' | 'natural' | 'bright' | 'neonNight' | 'soft' | 'product'
export type PresetId = HdrPresetId
export type PresetSelection = HdrPresetId | 'custom'

export type HdrGainMapControls = {
  preset: HdrPresetId
  hdrStrengthStops: number
  highlightStartPct: number
  highlightRolloffPct: number
  shadowLift: number
  naturalSaturation: number
  detail: number
  headroomStops: number
  midtoneLock: number
  whitePointGuardPct: number
  blackPointGuardPct: number
  edgeAwareRadius: number
  edgeAwareEps: number
  clipGuard: number
  gainMapGamma: number
  gainMapResolutionMode: GainMapResolutionMode
  customGainMapWidth?: number
  customGainMapHeight?: number
}

export type BypassOptions = HdrGainMapControls

export type LegacyBypassOptions = Partial<
  HdrGainMapControls & {
    strength: number
    headroom: number
    exposure: number
    highlights: number
    whites: number
    shadows: number
    blacks: number
    highlightStart: number
    highlightEnd: number
    shadowProtect: number
    saturationProtect: number
    colorProtect: number
    skinProtect: number
    glow: number
    edgeSmoothRadius: number
    smallHighlightPreserve: number
    protection: number
  }
>

export const defaultPresetId: HdrPresetId = 'macbookPro1600'

export const defaultHdrGainMapControls: HdrGainMapControls = {
  preset: defaultPresetId,
  hdrStrengthStops: 2.85,
  highlightStartPct: 92.0,
  highlightRolloffPct: 99.7,
  shadowLift: 0.18,
  naturalSaturation: 0.1,
  detail: 0.08,
  headroomStops: 4.0,
  midtoneLock: 0.68,
  whitePointGuardPct: 99.6,
  blackPointGuardPct: 0.2,
  edgeAwareRadius: 10,
  edgeAwareEps: 0.006,
  clipGuard: 0.9,
  gainMapGamma: 1.2,
  gainMapResolutionMode: 'auto',
}

export const hdrPresets: Record<HdrPresetId, HdrGainMapControls> = {
  macbookPro1600: {
    ...defaultHdrGainMapControls,
    preset: 'macbookPro1600',
  },
  lightScene: {
    preset: 'lightScene',
    hdrStrengthStops: 0.65,
    highlightStartPct: 90.0,
    highlightRolloffPct: 99.5,
    shadowLift: 0.18,
    naturalSaturation: 0.2,
    detail: 0.07,
    headroomStops: 1.4,
    midtoneLock: 0.64,
    whitePointGuardPct: 99.5,
    blackPointGuardPct: 0.2,
    edgeAwareRadius: 12,
    edgeAwareEps: 0.008,
    clipGuard: 0.9,
    gainMapGamma: 1.15,
    gainMapResolutionMode: 'auto',
  },
  natural: {
    preset: 'natural',
    hdrStrengthStops: 1.15,
    highlightStartPct: 95.0,
    highlightRolloffPct: 99.7,
    shadowLift: 0.12,
    naturalSaturation: 0.08,
    detail: 0.11,
    headroomStops: 2.2,
    midtoneLock: 0.62,
    whitePointGuardPct: 99.8,
    blackPointGuardPct: 0.2,
    edgeAwareRadius: 8,
    edgeAwareEps: 0.001,
    clipGuard: 0.85,
    gainMapGamma: 1.0,
    gainMapResolutionMode: 'auto',
  },
  bright: {
    preset: 'bright',
    hdrStrengthStops: 1.75,
    highlightStartPct: 93.0,
    highlightRolloffPct: 99.6,
    shadowLift: 0.22,
    naturalSaturation: 0.14,
    detail: 0.16,
    headroomStops: 2.7,
    midtoneLock: 0.5,
    whitePointGuardPct: 99.7,
    blackPointGuardPct: 0.25,
    edgeAwareRadius: 8,
    edgeAwareEps: 0.0012,
    clipGuard: 0.75,
    gainMapGamma: 1.04,
    gainMapResolutionMode: 'auto',
  },
  neonNight: {
    preset: 'neonNight',
    hdrStrengthStops: 2.1,
    highlightStartPct: 91.0,
    highlightRolloffPct: 99.8,
    shadowLift: 0.2,
    naturalSaturation: 0.08,
    detail: 0.21,
    headroomStops: 3.0,
    midtoneLock: 0.72,
    whitePointGuardPct: 99.86,
    blackPointGuardPct: 0.1,
    edgeAwareRadius: 6,
    edgeAwareEps: 0.0008,
    clipGuard: 0.8,
    gainMapGamma: 1.08,
    gainMapResolutionMode: 'auto',
  },
  soft: {
    preset: 'soft',
    hdrStrengthStops: 1.3,
    highlightStartPct: 94.5,
    highlightRolloffPct: 99.7,
    shadowLift: 0.14,
    naturalSaturation: 0.05,
    detail: 0.05,
    headroomStops: 2.1,
    midtoneLock: 0.6,
    whitePointGuardPct: 99.75,
    blackPointGuardPct: 0.2,
    edgeAwareRadius: 14,
    edgeAwareEps: 0.0015,
    clipGuard: 0.85,
    gainMapGamma: 0.96,
    gainMapResolutionMode: 'auto',
  },
  product: {
    preset: 'product',
    hdrStrengthStops: 0.9,
    highlightStartPct: 96.5,
    highlightRolloffPct: 99.9,
    shadowLift: 0.08,
    naturalSaturation: 0.02,
    detail: 0.06,
    headroomStops: 1.8,
    midtoneLock: 0.76,
    whitePointGuardPct: 99.92,
    blackPointGuardPct: 0.15,
    edgeAwareRadius: 6,
    edgeAwareEps: 0.0008,
    clipGuard: 0.92,
    gainMapGamma: 1.0,
    gainMapResolutionMode: 'auto',
  },
}

export const defaultBypassOptions: BypassOptions = hdrPresets[defaultPresetId]

export const gainMapResolutionModes: GainMapResolutionMode[] = [
  'auto',
  '480p',
  '720p',
  '1080p',
  'quarter',
  'half',
  'full',
  'custom',
]

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
    naturalSaturation: clamp(merged.naturalSaturation, 0, 1),
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
  return (
    value === 'macbookPro1600' ||
    value === 'lightScene' ||
    value === 'natural' ||
    value === 'bright' ||
    value === 'neonNight' ||
    value === 'soft' ||
    value === 'product'
  )
}

function migrateLegacyControls(input: LegacyBypassOptions): Partial<HdrGainMapControls> {
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

  const naturalSaturation = typeof input.naturalSaturation === 'number' ? input.naturalSaturation : undefined

  const protection =
    typeof input.protection === 'number'
      ? input.protection
      : typeof input.colorProtect === 'number'
        ? input.colorProtect
        : typeof input.saturationProtect === 'number'
          ? input.saturationProtect
          : undefined

  const shadowLift =
    typeof input.shadowLift === 'number'
      ? input.shadowLift
      : typeof input.shadows === 'number' || typeof input.blacks === 'number'
        ? clamp(
            0.15 +
              Math.max(0, input.shadows ?? 0) * 0.2 +
              Math.max(0, input.blacks ?? 0) * 0.1,
            0,
            0.5,
          )
        : undefined

  const detail =
    typeof input.detail === 'number'
      ? input.detail
      : typeof input.highlights === 'number' || typeof input.whites === 'number'
        ? clamp(
            0.08 +
              Math.max(0, input.highlights ?? 0) * 0.12 +
              Math.max(0, input.whites ?? 0) * 0.08,
            0,
            0.5,
          )
        : undefined

  return {
    hdrStrengthStops: strength,
    headroomStops,
    highlightStartPct,
    highlightRolloffPct,
    naturalSaturation,
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

function normalizePositiveInteger(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.max(1, Math.round(value))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
