import { clamp } from '../../lib/math'

export function encodedGainToMultiplier(encoded: number, maxHeadroom: number) {
  return Math.pow(Math.max(maxHeadroom, 1.05), clamp(encoded))
}

export function gainMultiplierToEncoded(gain: number, maxHeadroom: number) {
  return clamp(Math.log2(Math.max(gain, 1)) / Math.log2(Math.max(maxHeadroom, 1.05)))
}

export function getAppleMakerNote48(headroom: number) {
  const stops = Math.log2(clamp(headroom, 1.05, 8))
  if (stops >= 2.3) return (3.0 - stops) / 70.0
  if (stops >= 1.8) return (2.30303 - stops) / 0.303
  if (stops >= 1.6) return (1.8 - stops) / 20.0
  return (1.60101 - stops) / 0.101
}
