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

export type HdrPresetId = 'natural' | 'bright' | 'neonNight' | 'soft' | 'product'
export type PresetId = HdrPresetId
export type PresetSelection = HdrPresetId | 'custom'

export type HdrGainMapControls = {
  preset: HdrPresetId
  hdrStrengthStops: number
  highlightStartPct: number
  highlightRolloffPct: number
  shadowLift: number
  colorProtect: number
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
    skinProtect: number
    glow: number
    edgeSmoothRadius: number
    smallHighlightPreserve: number
    protection: number
  }
>
