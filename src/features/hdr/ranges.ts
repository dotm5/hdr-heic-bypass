import type { HdrGainMapControls } from './types'

export type NumericControlId = Exclude<keyof HdrGainMapControls, 'preset' | 'gainMapResolutionMode'>

export type NumericControlRange = {
  min: number
  max: number
  step: number
}

export const hdrControlRanges = {
  hdrStrengthStops: { min: 0, max: 3, step: 0.05 },
  highlightStartPct: { min: 80, max: 99.5, step: 0.1 },
  highlightRolloffPct: { min: 80.1, max: 99.9, step: 0.1 },
  shadowLift: { min: 0, max: 0.5, step: 0.01 },
  colorProtect: { min: 0, max: 1, step: 0.01 },
  detail: { min: 0, max: 0.5, step: 0.01 },
  headroomStops: { min: 0, max: 4, step: 0.05 },
  midtoneLock: { min: 0, max: 1, step: 0.01 },
  whitePointGuardPct: { min: 98, max: 99.95, step: 0.05 },
  blackPointGuardPct: { min: 0, max: 2, step: 0.05 },
  edgeAwareRadius: { min: 0, max: 32, step: 1 },
  edgeAwareEps: { min: 0.0001, max: 0.02, step: 0.0001 },
  clipGuard: { min: 0, max: 1, step: 0.01 },
  gainMapGamma: { min: 0.6, max: 2.2, step: 0.01 },
  customGainMapWidth: { min: 1, max: Number.MAX_SAFE_INTEGER, step: 1 },
  customGainMapHeight: { min: 1, max: Number.MAX_SAFE_INTEGER, step: 1 },
} satisfies Record<NumericControlId, NumericControlRange>
