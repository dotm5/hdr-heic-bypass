import { clamp, lerp, smoothstep } from '../../lib/math'
import { linearGrayByte } from './luminance'
import type { GainMapResolutionMode } from '../hdr/types'

type DownsampleOptions = {
  mode?: GainMapResolutionMode
  customWidth?: number
  customHeight?: number
  smallHighlightPreserve?: number
}

export function normalizeLogGain(value: number, min: number, max: number, gamma: number) {
  if (max <= min + 1e-6) return 0
  const normalized = clamp((value - min) / (max - min))
  return Math.pow(normalized, 1 / Math.max(gamma, 1e-6))
}

export function resolveGainMapSize(
  width: number,
  height: number,
  mode: GainMapResolutionMode = 'auto',
  customWidth?: number,
  customHeight?: number,
) {
  const sourceWidth = Math.max(1, Math.floor(width))
  const sourceHeight = Math.max(1, Math.floor(height))
  const longEdge = Math.max(sourceWidth, sourceHeight)

  if (mode === 'full') return { width: sourceWidth, height: sourceHeight }
  if (mode === 'half') return scaleByRatio(sourceWidth, sourceHeight, 0.5)
  if (mode === 'quarter') return scaleByRatio(sourceWidth, sourceHeight, 0.25)
  if (mode === 'custom' && customWidth && customHeight) {
    return clampSize(sourceWidth, sourceHeight, Math.floor(customWidth), Math.floor(customHeight))
  }

  const cap =
    mode === '480p'
      ? 480
      : mode === '720p'
        ? 720
        : mode === '1080p'
          ? 1080
          : longEdge <= 1200
            ? Math.floor(longEdge * 0.5)
            : longEdge <= 3000
              ? 720
              : longEdge <= 6000
                ? 1080
                : 1440

  return scaleToLongEdge(sourceWidth, sourceHeight, cap)
}

export function downsampleGainMap(
  source: Float32Array,
  width: number,
  height: number,
  options: DownsampleOptions = {},
) {
  const { width: gainWidth, height: gainHeight } = resolveGainMapSize(
    width,
    height,
    options.mode ?? 'quarter',
    options.customWidth,
    options.customHeight,
  )
  const preserve = clamp(options.smallHighlightPreserve ?? 0.35)
  const data = new Uint8Array(gainWidth * gainHeight)

  for (let y = 0; y < gainHeight; y++) {
    for (let x = 0; x < gainWidth; x++) {
      let sum = 0
      let samples = 0
      let maxGain = 0
      const startX = Math.floor((x * width) / gainWidth)
      const endX = Math.max(startX + 1, Math.floor(((x + 1) * width) / gainWidth))
      const startY = Math.floor((y * height) / gainHeight)
      const endY = Math.max(startY + 1, Math.floor(((y + 1) * height) / gainHeight))
      for (let sy = startY; sy < Math.min(endY, height); sy++) {
        for (let sx = startX; sx < Math.min(endX, width); sx++) {
          const value = source[sy * width + sx]
          sum += value
          maxGain = Math.max(maxGain, value)
          samples += 1
        }
      }
      const avgGain = sum / Math.max(samples, 1)
      const sparse = smoothstep(0.05, 0.35, maxGain - avgGain)
      const finalGain = lerp(avgGain, maxGain, sparse * preserve)
      data[y * gainWidth + x] = linearGrayByte(finalGain)
    }
  }

  return { width: gainWidth, height: gainHeight, data }
}

function scaleByRatio(width: number, height: number, ratio: number) {
  return {
    width: Math.max(1, Math.min(width, Math.floor(width * ratio))),
    height: Math.max(1, Math.min(height, Math.floor(height * ratio))),
  }
}

function scaleToLongEdge(width: number, height: number, targetLongEdge: number) {
  const longEdge = Math.max(width, height)
  const clampedLongEdge = Math.max(1, Math.min(longEdge, Math.floor(targetLongEdge)))
  if (clampedLongEdge >= longEdge) return { width, height }
  const ratio = clampedLongEdge / longEdge
  return scaleByRatio(width, height, ratio)
}

function clampSize(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  return {
    width: Math.max(1, Math.min(sourceWidth, width)),
    height: Math.max(1, Math.min(sourceHeight, height)),
  }
}
