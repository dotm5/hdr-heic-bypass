import {
  defaultBypassOptions,
  defaultHdrGainMapControls,
  gainMapResolutionModes,
  hdrPresets,
  normalizeHdrGainMapControls,
  type BypassOptions,
  type GainMapResolutionMode,
  type HdrGainMapControls,
  type InputMode,
} from './authoring'
import { authorBasePlusGainMap } from '../features/gainmap/authorBasePlusGainMap'
import { encodedGainToMultiplier, gainMultiplierToEncoded, getAppleMakerNote48 } from '../features/gainmap/gainConversion'
import { buildHistogram, histogramPercentile, percentileFromSorted, sortedCopy } from '../features/gainmap/histogram'
import {
  detectUsefulGain,
} from '../features/gainmap/luminance'
import { downsampleGainMap, normalizeLogGain, resolveGainMapSize } from '../features/gainmap/quantizeGainMap'
import { guidedFilter } from '../features/gainmap/smoothing'
import { byteMax, byteMean, byteMin } from '../features/gainmap/stats'
import type { GainMapResult, ImageLike, RgbaImage } from '../features/gainmap/types'

export { defaultBypassOptions, defaultHdrGainMapControls, gainMapResolutionModes, hdrPresets, normalizeHdrGainMapControls }
export type { BypassOptions, GainMapResolutionMode, HdrGainMapControls, InputMode }
export {
  authorBasePlusGainMap,
  detectUsefulGain,
  downsampleGainMap,
  encodedGainToMultiplier,
  gainMultiplierToEncoded,
  getAppleMakerNote48,
  resolveGainMapSize,
}
export type { GainMapResult, RgbaImage }

const REC709_R = 0.2126
const REC709_G = 0.7152
const REC709_B = 0.0722
const LOG_OFFSET = 1 / 64
const LUMA_EPSILON = 1e-6

// Keep the tiny per-pixel helpers local to this hot pipeline. Cross-module calls
// measurably slowed large image generation in dev/browser runs.
function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6))
  return t * t * (3 - 2 * t)
}

function srgbToLinear(value: number) {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function linearToSrgbByte(value: number) {
  const v = clamp(value)
  const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.round(clamp(encoded) * 255)
}

function linearGrayByte(value: number) {
  return Math.round(clamp(value) * 255)
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t)
}

function imageWidthHeight(image: ImageLike) {
  return {
    width: Math.max(1, Math.floor(image.width)),
    height: Math.max(1, Math.floor(image.height)),
  }
}

function luminanceFromLinear(r: number, g: number, b: number) {
  return REC709_R * r + REC709_G * g + REC709_B * b
}

function saturationFromLinear(r: number, g: number, b: number) {
  const maxChannel = Math.max(r, g, b)
  const minChannel = Math.min(r, g, b)
  return maxChannel <= LUMA_EPSILON ? 0 : (maxChannel - minChannel) / Math.max(maxChannel, LUMA_EPSILON)
}

function buildGrayImage(width: number, height: number, values: Float32Array, scale = 1): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let pixel = 0, i = 0; pixel < values.length; pixel++, i += 4) {
    const gray = linearGrayByte(values[pixel] * scale)
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
    data[i + 3] = 255
  }
  return { width, height, data }
}

export function generateSyntheticGainMapV2(inputImage: ImageLike, controls: HdrGainMapControls): GainMapResult {
  const started = performance.now()
  const { width, height } = imageWidthHeight(inputImage)
  const pixelCount = width * height
  const base = inputImage.data
  const normalizedControls = normalizeHdrGainMapControls(controls)

  const linearLuma = new Float32Array(pixelCount)
  const logLuma = new Float32Array(pixelCount)
  const saturation = new Float32Array(pixelCount)
  let logMin = Number.POSITIVE_INFINITY
  let logMax = Number.NEGATIVE_INFINITY
  let maxLinearLuma = 0

  for (let pixel = 0, i = 0; pixel < pixelCount; pixel++, i += 4) {
    const r = srgbToLinear(base[i])
    const g = srgbToLinear(base[i + 1])
    const b = srgbToLinear(base[i + 2])
    const luma = luminanceFromLinear(r, g, b)
    const logY = Math.log2(Math.max(luma, LOG_OFFSET))

    linearLuma[pixel] = luma
    logLuma[pixel] = logY
    saturation[pixel] = saturationFromLinear(r, g, b)

    logMin = Math.min(logMin, logY)
    logMax = Math.max(logMax, logY)
    maxLinearLuma = Math.max(maxLinearLuma, luma)
  }

  const logHistogram = buildHistogram(logLuma, logMin, logMax)
  const thresholdBlack = histogramPercentile(logHistogram, logMin, logMax, clamp(normalizedControls.blackPointGuardPct / 100, 0, 1))
  const thresholdStart = histogramPercentile(
    logHistogram,
    logMin,
    logMax,
    clamp(normalizedControls.highlightStartPct / 100, 0, 1),
  )
  const thresholdRolloff = histogramPercentile(
    logHistogram,
    logMin,
    logMax,
    clamp(normalizedControls.highlightRolloffPct / 100, 0, 1),
  )
  const thresholdWhite = histogramPercentile(
    logHistogram,
    logMin,
    logMax,
    clamp(normalizedControls.whitePointGuardPct / 100, 0, 1),
  )
  const thresholdMedian = histogramPercentile(logHistogram, logMin, logMax, 0.5)
  const sortedLinearLuma = sortedCopy(linearLuma)

  const highlightMask = new Float32Array(pixelCount)
  const shadowMask = new Float32Array(pixelCount)
  const rawGainStops = new Float32Array(pixelCount)
  const rawHighlightGain = new Float32Array(pixelCount)
  const encodedPreview = new Float32Array(pixelCount)

  const fallbackRolloffSpan = Math.max(0.05, (logMax - logMin) * 0.15)
  const effectiveStart =
    thresholdRolloff <= thresholdStart + 1e-5 ? thresholdStart - fallbackRolloffSpan : thresholdStart
  const effectiveRolloff =
    thresholdRolloff <= effectiveStart + 1e-5 ? effectiveStart + fallbackRolloffSpan : thresholdRolloff
  const rolloffSpan = Math.max(effectiveRolloff - effectiveStart, 1e-6)
  const rolloffGamma = clamp(1.55 - rolloffSpan * 3.25, 0.75, 2.3)
  const midtoneAnchor = mix(0.18, Math.pow(2, thresholdMedian), 0.5)
  const midtoneWidth = mix(0.55, 1.5, 1 - normalizedControls.midtoneLock * 0.8)
  const shadowSpan = Math.max(thresholdStart - thresholdBlack, 1e-6)
  const shadowUpper = thresholdBlack + shadowSpan * 0.85 + 0.2
  const highlightIntensityGate = smoothstep(0.08, 0.35, maxLinearLuma)

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const luma = linearLuma[pixel]
    const logY = logLuma[pixel]

    const highlightRamp = smoothstep(effectiveStart, effectiveRolloff, logY)
    const highlightShape = Math.pow(highlightRamp, rolloffGamma)
    const whiteGuard = 1 - smoothstep(thresholdWhite, effectiveRolloff + rolloffSpan * 0.45 + 1e-6, logY)
    const highlightMaskValue = clamp(
      highlightShape * mix(1, whiteGuard, normalizedControls.clipGuard * 0.5) * highlightIntensityGate,
    )
    highlightMask[pixel] = highlightMaskValue

    const shadowRamp = 1 - smoothstep(thresholdBlack, shadowUpper, logY)
    shadowMask[pixel] = clamp(shadowRamp)

    const highlightStops = normalizedControls.hdrStrengthStops * highlightMaskValue
    const shadowStops = normalizedControls.shadowLift * shadowMask[pixel] * (1 - highlightMaskValue * 0.7)
    const rawStops = highlightStops + shadowStops * 0.42
    const midSuppress = Math.exp(-Math.pow(Math.log2(Math.max(luma, LOG_OFFSET) / Math.max(midtoneAnchor, LOG_OFFSET)) / midtoneWidth, 2))
    const lockedStops = rawStops * (1 - normalizedControls.midtoneLock * midSuppress * 0.75)

    rawHighlightGain[pixel] = highlightStops
    rawGainStops[pixel] = lockedStops
  }

  const smoothSource = normalizedControls.edgeAwareRadius > 0
    ? guidedFilter(linearLuma, highlightMask, width, height, normalizedControls.edgeAwareRadius, normalizedControls.edgeAwareEps)
    : highlightMask
  const detailMix = clamp(normalizedControls.detail / 0.5, 0, 1)
  const detailMask = new Float32Array(pixelCount)
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    detailMask[pixel] = clamp(mix(smoothSource[pixel], highlightMask[pixel], detailMix))
  }

  const gainStops = new Float32Array(pixelCount)
  const gainLogValues = new Float32Array(pixelCount)
  let gainLogMin = Number.POSITIVE_INFINITY
  let gainLogMax = Number.NEGATIVE_INFINITY
  let gainLogSum = 0
  let activePixels = 0

  for (let pixel = 0, i = 0; pixel < pixelCount; pixel++, i += 4) {
    const luma = linearLuma[pixel]
    const r = srgbToLinear(base[i])
    const g = srgbToLinear(base[i + 1])
    const b = srgbToLinear(base[i + 2])
    const maxChannel = Math.max(r, g, b)
    const detailWeighted = mix(rawGainStops[pixel], rawHighlightGain[pixel], detailMix)
    let gainStop = Math.max(0, detailWeighted)

    const ceilingStops = normalizedControls.headroomStops
    const peakStops = Math.log2(Math.max(maxChannel, LUMA_EPSILON)) + gainStop
    if (peakStops > ceilingStops) {
      const excess = peakStops - ceilingStops
      const knee = 0.18 + (1 - normalizedControls.clipGuard) * 0.55
      const soft = smoothstep(0, knee, excess)
      gainStop = Math.max(0, gainStop - excess * soft * normalizedControls.clipGuard)
    }

    const saturationDamp = mix(1.0, 1.0 - saturation[pixel] * 0.75, normalizedControls.colorProtect)
    gainStop = Math.max(0, gainStop * saturationDamp)

    const shadowPreviewLift = shadowMask[pixel] * normalizedControls.shadowLift * 0.22
    const previewStops = gainStop + shadowPreviewLift * (1 - detailMask[pixel] * 0.5)
    const hdrLin = Math.max(0, Math.pow(2, previewStops) * luma)
    const gainLog2 = Math.log2((hdrLin + LOG_OFFSET) / (luma + LOG_OFFSET))

    gainStops[pixel] = previewStops
    gainLogValues[pixel] = gainLog2
    gainLogMin = Math.min(gainLogMin, gainLog2)
    gainLogMax = Math.max(gainLogMax, gainLog2)
    gainLogSum += gainLog2
    if (previewStops > 0.015) activePixels += 1
  }

  const gainHistogram = buildHistogram(gainLogValues, gainLogMin, gainLogMax)
  const encodedMin = histogramPercentile(gainHistogram, gainLogMin, gainLogMax, 0.001)
  const encodedMax = histogramPercentile(gainHistogram, gainLogMin, gainLogMax, 0.999)

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    encodedPreview[pixel] = normalizeLogGain(gainLogValues[pixel], encodedMin, encodedMax, normalizedControls.gainMapGamma)
  }

  const gainMap = downsampleGainMap(encodedPreview, width, height, {
    mode: normalizedControls.gainMapResolutionMode,
    customWidth: normalizedControls.customGainMapWidth,
    customHeight: normalizedControls.customGainMapHeight,
  })

  const gainPreview = buildGrayImage(width, height, encodedPreview)
  const highlightPreview = buildGrayImage(width, height, highlightMask)
  const hdrPreviewData = new Uint8ClampedArray(pixelCount * 4)

  for (let pixel = 0, i = 0; pixel < pixelCount; pixel++, i += 4) {
    const r = srgbToLinear(base[i])
    const g = srgbToLinear(base[i + 1])
    const b = srgbToLinear(base[i + 2])
    const boost = Math.pow(2, gainStops[pixel])
    hdrPreviewData[i] = linearToSrgbByte(r * boost)
    hdrPreviewData[i + 1] = linearToSrgbByte(g * boost)
    hdrPreviewData[i + 2] = linearToSrgbByte(b * boost)
    hdrPreviewData[i + 3] = base[i + 3]
  }

  const totalMs = Math.round((performance.now() - started) * 10) / 10

  return {
    base: { width, height, data: base },
    gainMap,
    gainMapPreview: gainPreview,
    highlightMaskPreview: highlightPreview,
    hdrPreview: { width, height, data: hdrPreviewData },
    stats: {
      luminance: {
        p50: percentileFromSorted(sortedLinearLuma, 0.5),
        p90: percentileFromSorted(sortedLinearLuma, 0.9),
        p95: percentileFromSorted(sortedLinearLuma, 0.95),
        p99: percentileFromSorted(sortedLinearLuma, 0.99),
        p99_9: percentileFromSorted(sortedLinearLuma, 0.999),
      },
      gain: {
        min: gainLogMin,
        max: gainLogMax,
        mean: gainLogSum / Math.max(pixelCount, 1),
        encodedMin: byteMin(gainMap.data),
        encodedMax: byteMax(gainMap.data),
        encodedMean: byteMean(gainMap.data),
      },
      activePixels,
      headroomStops: normalizedControls.headroomStops,
      gainMapGamma: normalizedControls.gainMapGamma,
      thresholds: {
        blackPoint: thresholdBlack,
        highlightStart: effectiveStart,
        highlightRolloff: effectiveRolloff,
        whitePoint: thresholdWhite,
        median: thresholdMedian,
      },
      timings: {
        totalMs,
      },
    },
  }
}

export function generateBypassGainMap(image: ImageLike, options: BypassOptions) {
  return generateSyntheticGainMapV2(image, options)
}
