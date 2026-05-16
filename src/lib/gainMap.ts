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

export { defaultBypassOptions, defaultHdrGainMapControls, gainMapResolutionModes, hdrPresets, normalizeHdrGainMapControls }
export type { BypassOptions, GainMapResolutionMode, HdrGainMapControls, InputMode }

export type RgbaImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type LuminanceStats = {
  p50: number
  p90: number
  p95: number
  p99: number
  p99_9: number
}

export type GainStats = {
  min: number
  max: number
  mean: number
  encodedMin: number
  encodedMax: number
  encodedMean: number
}

export type GainMapResult = {
  base: RgbaImage
  gainMap: {
    width: number
    height: number
    data: Uint8Array
  }
  gainMapPreview: RgbaImage
  highlightMaskPreview: RgbaImage
  hdrPreview: RgbaImage
  stats: {
    luminance: LuminanceStats
    gain: GainStats
    activePixels: number
    headroomStops: number
    gainMapGamma: number
    thresholds: {
      blackPoint: number
      highlightStart: number
      highlightRolloff: number
      whitePoint: number
      median: number
    }
    timings?: {
      totalMs: number
    }
  }
}

type ImageLike = {
  width: number
  height: number
  data: Uint8ClampedArray
}

const REC709_R = 0.2126
const REC709_G = 0.7152
const REC709_B = 0.0722
const HISTOGRAM_BINS = 1024
const LOG_OFFSET = 1 / 64
const LUMA_EPSILON = 1e-6
const EDGE_SOFTEN_RADIUS = 2
const EDGE_GAIN_SOFTEN_STRENGTH = 0.72
const EDGE_SHADOW_SUPPRESS_STRENGTH = 0.85
const GENERATED_GAIN_MAP_HIGHLIGHT_PRESERVE = 0.12
const srgbToLinearLut = new Float32Array(256)
for (let value = 0; value < srgbToLinearLut.length; value++) {
  const v = value / 255
  srgbToLinearLut[value] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6))
  return t * t * (3 - 2 * t)
}

function srgbToLinear(value: number) {
  return srgbToLinearLut[value] ?? srgbToLinearLut[clamp(Math.round(value), 0, 255)]
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

function applyNaturalSaturation(source: Uint8ClampedArray, amount: number) {
  const strength = clamp(amount)
  if (strength <= 0) return source

  const data = new Uint8ClampedArray(source.length)
  for (let i = 0; i < source.length; i += 4) {
    const r = srgbToLinear(source[i])
    const g = srgbToLinear(source[i + 1])
    const b = srgbToLinear(source[i + 2])
    const luma = luminanceFromLinear(r, g, b)
    const saturation = saturationFromLinear(r, g, b)
    const vibrance = strength * 0.85 * (1 - Math.pow(saturation, 0.65))

    data[i] = linearToSrgbByte(luma + (r - luma) * (1 + vibrance))
    data[i + 1] = linearToSrgbByte(luma + (g - luma) * (1 + vibrance))
    data[i + 2] = linearToSrgbByte(luma + (b - luma) * (1 + vibrance))
    data[i + 3] = source[i + 3]
  }
  return data
}

function buildContrastEdgeMask(values: Float32Array, width: number, height: number) {
  const mask = new Float32Array(values.length)
  if (width < 3 || height < 3) return mask

  const gradient = new Float32Array(values.length)
  let maxGradient = 0

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width
    for (let x = 1; x < width - 1; x++) {
      const top = rowOffset - width
      const bottom = rowOffset + width
      const gx =
        -values[top + x - 1] +
        values[top + x + 1] -
        2 * values[rowOffset + x - 1] +
        2 * values[rowOffset + x + 1] -
        values[bottom + x - 1] +
        values[bottom + x + 1]
      const gy =
        -values[top + x - 1] -
        2 * values[top + x] -
        values[top + x + 1] +
        values[bottom + x - 1] +
        2 * values[bottom + x] +
        values[bottom + x + 1]
      const magnitude = Math.hypot(gx, gy)
      gradient[rowOffset + x] = magnitude
      maxGradient = Math.max(maxGradient, magnitude)
    }
  }

  if (maxGradient <= 1e-6) return mask

  const histogram = buildHistogram(gradient, 0, maxGradient)
  const low = histogramPercentile(histogram, 0, maxGradient, 0.86)
  const high = Math.max(low + 1e-6, histogramPercentile(histogram, 0, maxGradient, 0.985))
  for (let i = 0; i < gradient.length; i++) {
    mask[i] = smoothstep(low, high, gradient[i])
  }

  const spread = boxFilterMean(mask, width, height, EDGE_SOFTEN_RADIUS)
  for (let i = 0; i < spread.length; i++) {
    spread[i] = smoothstep(0.02, 0.18, spread[i])
  }
  return spread
}

function buildHistogram(values: Float32Array, min: number, max: number) {
  const histogram = new Uint32Array(HISTOGRAM_BINS)
  const span = Math.max(max - min, 1e-6)
  for (let i = 0; i < values.length; i++) {
    const normalized = clamp((values[i] - min) / span)
    const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor(normalized * (HISTOGRAM_BINS - 1)))
    histogram[bin] += 1
  }
  return histogram
}

function histogramPercentile(histogram: Uint32Array, min: number, max: number, percentile: number) {
  const total = histogram.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return min
  const target = clamp(percentile, 0, 1) * (total - 1)
  let cumulative = 0
  for (let bin = 0; bin < histogram.length; bin++) {
    const count = histogram[bin]
    const next = cumulative + count
    if (target < next) {
      const within = count <= 0 ? 0 : (target - cumulative) / count
      return min + ((bin + within) / histogram.length) * (max - min)
    }
    cumulative = next
  }
  return max
}

function luminanceStatsFromHistogram(values: Float32Array, max: number): LuminanceStats {
  if (values.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, p99_9: 0 }
  }
  const histogram = buildHistogram(values, 0, max)
  return {
    p50: histogramPercentile(histogram, 0, max, 0.5),
    p90: histogramPercentile(histogram, 0, max, 0.9),
    p95: histogramPercentile(histogram, 0, max, 0.95),
    p99: histogramPercentile(histogram, 0, max, 0.99),
    p99_9: histogramPercentile(histogram, 0, max, 0.999),
  }
}

function byteMin(values: Uint8Array) {
  let min = 255
  for (let i = 0; i < values.length; i++) {
    min = Math.min(min, values[i])
  }
  return values.length ? min : 0
}

function byteMax(values: Uint8Array) {
  let max = 0
  for (let i = 0; i < values.length; i++) {
    max = Math.max(max, values[i])
  }
  return values.length ? max : 0
}

function byteMean(values: Uint8Array) {
  if (!values.length) return 0
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
  }
  return sum / (255 * values.length)
}

function encodeAbsoluteLogGain(value: number, headroomStops: number, gamma: number) {
  if (headroomStops <= 1e-6) return 0
  const normalized = clamp(value / Math.max(headroomStops, 1e-6))
  return Math.pow(normalized, 1 / Math.max(gamma, 1e-6))
}

export function generateSyntheticGainMapV2(inputImage: ImageLike, controls: HdrGainMapControls): GainMapResult {
  const started = performance.now()
  const { width, height } = imageWidthHeight(inputImage)
  const pixelCount = width * height
  const source = inputImage.data
  const normalizedControls = normalizeHdrGainMapControls(controls)

  const linearLuma = new Float32Array(pixelCount)
  const logLuma = new Float32Array(pixelCount)
  let logMin = Number.POSITIVE_INFINITY
  let logMax = Number.NEGATIVE_INFINITY
  let maxLinearLuma = 0

  for (let pixel = 0, i = 0; pixel < pixelCount; pixel++, i += 4) {
    const r = srgbToLinear(source[i])
    const g = srgbToLinear(source[i + 1])
    const b = srgbToLinear(source[i + 2])
    const luma = luminanceFromLinear(r, g, b)
    const logY = Math.log2(Math.max(luma, LOG_OFFSET))

    linearLuma[pixel] = luma
    logLuma[pixel] = logY

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
  const highlightMask = new Float32Array(pixelCount)
  const shadowMask = new Float32Array(pixelCount)
  const rawGainStops = new Float32Array(pixelCount)
  const rawHighlightGain = new Float32Array(pixelCount)
  const encodedPreview = new Float32Array(pixelCount)
  const highlightPreviewData = new Uint8ClampedArray(pixelCount * 4)

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

  for (let pixel = 0, i = 0; pixel < pixelCount; pixel++, i += 4) {
    const luma = linearLuma[pixel]
    const logY = logLuma[pixel]

    const highlightRamp = smoothstep(effectiveStart, effectiveRolloff, logY)
    const highlightShape = Math.pow(highlightRamp, rolloffGamma)
    const whiteGuard = 1 - smoothstep(thresholdWhite, effectiveRolloff + rolloffSpan * 0.45 + 1e-6, logY)
    const highlightMaskValue = clamp(
      highlightShape * mix(1, whiteGuard, normalizedControls.clipGuard * 0.5) * highlightIntensityGate,
    )
    highlightMask[pixel] = highlightMaskValue
    const highlightGray = linearGrayByte(highlightMaskValue)
    highlightPreviewData[i] = highlightGray
    highlightPreviewData[i + 1] = highlightGray
    highlightPreviewData[i + 2] = highlightGray
    highlightPreviewData[i + 3] = 255

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
  const contrastEdgeMask = buildContrastEdgeMask(logLuma, width, height)
  const edgeSoftGain = boxFilterMean(rawGainStops, width, height, EDGE_SOFTEN_RADIUS)
  const outputBase = applyNaturalSaturation(source, normalizedControls.naturalSaturation)
  const gainStops = new Float32Array(pixelCount)
  const gainLogValues = new Float32Array(pixelCount)
  let gainLogMin = Number.POSITIVE_INFINITY
  let gainLogMax = Number.NEGATIVE_INFINITY
  let gainLogSum = 0
  let activePixels = 0

  for (let pixel = 0, i = 0; pixel < pixelCount; pixel++, i += 4) {
    const luma = linearLuma[pixel]
    const r = srgbToLinear(source[i])
    const g = srgbToLinear(source[i + 1])
    const b = srgbToLinear(source[i + 2])
    const maxChannel = Math.max(r, g, b)
    const detailWeighted = mix(rawGainStops[pixel], rawHighlightGain[pixel], detailMix)
    const detailMask = clamp(mix(smoothSource[pixel], highlightMask[pixel], detailMix))
    const edgeAmount = contrastEdgeMask[pixel]
    let gainStop = Math.max(0, detailWeighted)

    if (edgeAmount > 0) {
      gainStop = mix(gainStop, Math.min(gainStop, edgeSoftGain[pixel]), edgeAmount * EDGE_GAIN_SOFTEN_STRENGTH)
    }

    const ceilingStops = normalizedControls.headroomStops
    const peakStops = Math.log2(Math.max(maxChannel, LUMA_EPSILON)) + gainStop
    if (peakStops > ceilingStops) {
      const excess = peakStops - ceilingStops
      const knee = 0.18 + (1 - normalizedControls.clipGuard) * 0.55
      const soft = smoothstep(0, knee, excess)
      gainStop = Math.max(0, gainStop - excess * soft * normalizedControls.clipGuard)
    }

    const shadowPreviewLift =
      shadowMask[pixel] *
      normalizedControls.shadowLift *
      0.22 *
      (1 - edgeAmount * EDGE_SHADOW_SUPPRESS_STRENGTH)
    const previewStops = gainStop + shadowPreviewLift * (1 - detailMask * 0.5)
    const hdrLin = Math.max(0, Math.pow(2, previewStops) * luma)
    const gainLog2 = Math.log2((hdrLin + LOG_OFFSET) / (luma + LOG_OFFSET))

    gainStops[pixel] = previewStops
    gainLogValues[pixel] = gainLog2
    gainLogMin = Math.min(gainLogMin, gainLog2)
    gainLogMax = Math.max(gainLogMax, gainLog2)
    gainLogSum += gainLog2
    if (previewStops > 0.015) activePixels += 1
  }

  const gainPreviewData = new Uint8ClampedArray(pixelCount * 4)

  for (let pixel = 0, i = 0; pixel < pixelCount; pixel++, i += 4) {
    const encoded = encodeAbsoluteLogGain(
      gainLogValues[pixel],
      normalizedControls.headroomStops,
      normalizedControls.gainMapGamma,
    )
    encodedPreview[pixel] = encoded
    const gray = linearGrayByte(encoded)
    gainPreviewData[i] = gray
    gainPreviewData[i + 1] = gray
    gainPreviewData[i + 2] = gray
    gainPreviewData[i + 3] = 255
  }

  const gainMap = downsampleGainMap(encodedPreview, width, height, {
    mode: normalizedControls.gainMapResolutionMode,
    customWidth: normalizedControls.customGainMapWidth,
    customHeight: normalizedControls.customGainMapHeight,
    smallHighlightPreserve: GENERATED_GAIN_MAP_HIGHLIGHT_PRESERVE,
  })

  const hdrPreviewData = new Uint8ClampedArray(pixelCount * 4)

  for (let pixel = 0, i = 0; pixel < pixelCount; pixel++, i += 4) {
    const r = srgbToLinear(outputBase[i])
    const g = srgbToLinear(outputBase[i + 1])
    const b = srgbToLinear(outputBase[i + 2])
    const boost = Math.pow(2, gainStops[pixel])
    hdrPreviewData[i] = linearToSrgbByte(r * boost)
    hdrPreviewData[i + 1] = linearToSrgbByte(g * boost)
    hdrPreviewData[i + 2] = linearToSrgbByte(b * boost)
    hdrPreviewData[i + 3] = outputBase[i + 3]
  }

  const totalMs = Math.round((performance.now() - started) * 10) / 10

  return {
    base: { width, height, data: outputBase },
    gainMap,
    gainMapPreview: { width, height, data: gainPreviewData },
    highlightMaskPreview: { width, height, data: highlightPreviewData },
    hdrPreview: { width, height, data: hdrPreviewData },
    stats: {
      luminance: {
        ...luminanceStatsFromHistogram(linearLuma, maxLinearLuma),
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

type DownsampleOptions = {
  mode?: GainMapResolutionMode
  customWidth?: number
  customHeight?: number
  smallHighlightPreserve?: number
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
  const xStart = new Uint32Array(gainWidth)
  const xEnd = new Uint32Array(gainWidth)
  const yStart = new Uint32Array(gainHeight)
  const yEnd = new Uint32Array(gainHeight)

  for (let x = 0; x < gainWidth; x++) {
    const start = Math.floor((x * width) / gainWidth)
    xStart[x] = start
    xEnd[x] = Math.min(width, Math.max(start + 1, Math.floor(((x + 1) * width) / gainWidth)))
  }
  for (let y = 0; y < gainHeight; y++) {
    const start = Math.floor((y * height) / gainHeight)
    yStart[y] = start
    yEnd[y] = Math.min(height, Math.max(start + 1, Math.floor(((y + 1) * height) / gainHeight)))
  }

  for (let y = 0; y < gainHeight; y++) {
    const targetRowOffset = y * gainWidth
    const startY = yStart[y]
    const endY = yEnd[y]
    for (let x = 0; x < gainWidth; x++) {
      let sum = 0
      let samples = 0
      let maxGain = 0
      const startX = xStart[x]
      const endX = xEnd[x]
      for (let sy = startY; sy < endY; sy++) {
        const sourceRowOffset = sy * width
        for (let sx = startX; sx < endX; sx++) {
          const value = source[sourceRowOffset + sx]
          sum += value
          maxGain = Math.max(maxGain, value)
          samples += 1
        }
      }
      const avgGain = sum / Math.max(samples, 1)
      const sparse = smoothstep(0.05, 0.35, maxGain - avgGain)
      const finalGain = mix(avgGain, maxGain, sparse * preserve)
      data[targetRowOffset + x] = linearGrayByte(finalGain)
    }
  }

  return { width: gainWidth, height: gainHeight, data }
}

export function authorBasePlusGainMap(
  baseImage: ImageLike,
  gainMapImage: ImageLike,
  options: BypassOptions,
): GainMapResult {
  const { width, height } = imageWidthHeight(baseImage)
  const normalizedControls = normalizeHdrGainMapControls(options)
  const base = applyNaturalSaturation(baseImage.data, normalizedControls.naturalSaturation)
  const headroomRatio = Math.pow(2, normalizedControls.headroomStops)
  const encodedFull = new Float32Array(width * height)
  const gainPreviewData = new Uint8ClampedArray(width * height * 4)
  const hdrPreview = new Uint8ClampedArray(width * height * 4)
  const linearLuma = new Float32Array(width * height)
  let activePixels = 0
  let gainSum = 0
  let maxLuminance = 0

  for (let pixel = 0, i = 0; pixel < width * height; pixel++, i += 4) {
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const encoded = sampleEncodedGain(gainMapImage, x / width, y / height)
    const gain = encodedGainToMultiplier(encoded, headroomRatio)
    encodedFull[pixel] = clamp(encoded)
    if (encoded > 0.01) activePixels += 1
    gainSum += encoded

    const gray = linearGrayByte(encoded)
    gainPreviewData[i] = gray
    gainPreviewData[i + 1] = gray
    gainPreviewData[i + 2] = gray
    gainPreviewData[i + 3] = 255

    const r = srgbToLinear(base[i])
    const g = srgbToLinear(base[i + 1])
    const b = srgbToLinear(base[i + 2])
    const luma = luminanceFromLinear(r, g, b)
    linearLuma[pixel] = luma
    maxLuminance = Math.max(maxLuminance, luma)
    hdrPreview[i] = linearToSrgbByte(r * gain)
    hdrPreview[i + 1] = linearToSrgbByte(g * gain)
    hdrPreview[i + 2] = linearToSrgbByte(b * gain)
    hdrPreview[i + 3] = base[i + 3]
  }

  const gainMap = downsampleGainMap(encodedFull, width, height, {
    mode: normalizedControls.gainMapResolutionMode,
    smallHighlightPreserve: 0.35,
    customWidth: normalizedControls.customGainMapWidth,
    customHeight: normalizedControls.customGainMapHeight,
  })

  return {
    base: { width, height, data: base },
    gainMap,
    gainMapPreview: { width, height, data: gainPreviewData },
    highlightMaskPreview: { width, height, data: gainPreviewData },
    hdrPreview: { width, height, data: hdrPreview },
    stats: {
      luminance: {
        ...luminanceStatsFromHistogram(linearLuma, maxLuminance),
      },
      gain: {
        min: 0,
        max: 1,
        mean: gainSum / Math.max(width * height, 1),
        encodedMin: byteMin(gainMap.data),
        encodedMax: byteMax(gainMap.data),
        encodedMean: byteMean(gainMap.data),
      },
      activePixels,
      headroomStops: normalizedControls.headroomStops,
      gainMapGamma: normalizedControls.gainMapGamma,
      thresholds: {
        blackPoint: 0,
        highlightStart: 0,
        highlightRolloff: 0,
        whitePoint: 0,
        median: 0,
      },
    },
  }
}

export function encodedGainToMultiplier(encoded: number, maxHeadroom: number) {
  return Math.pow(Math.max(maxHeadroom, 1.05), clamp(encoded))
}

export function gainMultiplierToEncoded(gain: number, maxHeadroom: number) {
  return clamp(Math.log2(Math.max(gain, 1)) / Math.log2(Math.max(maxHeadroom, 1.05)))
}

function sampleEncodedGain(image: ImageLike, normalizedX: number, normalizedY: number) {
  const x = Math.min(image.width - 1, Math.max(0, Math.floor(normalizedX * image.width)))
  const y = Math.min(image.height - 1, Math.max(0, Math.floor(normalizedY * image.height)))
  const index = (y * image.width + x) * 4
  return clamp(
    (REC709_R * image.data[index] + REC709_G * image.data[index + 1] + REC709_B * image.data[index + 2]) / 255,
  )
}

function guidedFilter(
  guide: Float32Array,
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  eps: number,
) {
  const r = Math.max(0, Math.floor(radius))
  if (r <= 0) return source

  const meanI = boxFilterMean(guide, width, height, r)
  const meanP = boxFilterMean(source, width, height, r)

  const guideSq = new Float32Array(guide.length)
  const guideSource = new Float32Array(guide.length)
  for (let i = 0; i < guide.length; i++) {
    guideSq[i] = guide[i] * guide[i]
    guideSource[i] = guide[i] * source[i]
  }

  const corrI = boxFilterMean(guideSq, width, height, r)
  const corrIp = boxFilterMean(guideSource, width, height, r)
  const a = new Float32Array(source.length)
  const b = new Float32Array(source.length)

  for (let i = 0; i < source.length; i++) {
    const variance = Math.max(0, corrI[i] - meanI[i] * meanI[i])
    const covariance = corrIp[i] - meanI[i] * meanP[i]
    a[i] = covariance / (variance + eps)
    b[i] = meanP[i] - a[i] * meanI[i]
  }

  const meanA = boxFilterMean(a, width, height, r)
  const meanB = boxFilterMean(b, width, height, r)
  const output = new Float32Array(source.length)
  for (let i = 0; i < source.length; i++) {
    output[i] = clamp(meanA[i] * guide[i] + meanB[i])
  }
  return output
}

function boxFilterMean(source: Float32Array, width: number, height: number, radius: number) {
  const horizontal = new Float32Array(source.length)
  const output = new Float32Array(source.length)

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    let sum = 0
    let count = 0
    const initialEnd = Math.min(width - 1, radius)
    for (let x = 0; x <= initialEnd; x++) {
      sum += source[rowOffset + x]
      count += 1
    }

    for (let x = 0; x < width; x++) {
      horizontal[rowOffset + x] = sum / Math.max(count, 1)
      const removeX = x - radius
      if (removeX >= 0) {
        sum -= source[rowOffset + removeX]
        count -= 1
      }
      const addX = x + radius + 1
      if (addX < width) {
        sum += source[rowOffset + addX]
        count += 1
      }
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0
    let count = 0
    const initialEnd = Math.min(height - 1, radius)
    for (let y = 0; y <= initialEnd; y++) {
      sum += horizontal[y * width + x]
      count += 1
    }

    for (let y = 0; y < height; y++) {
      output[y * width + x] = sum / Math.max(count, 1)
      const removeY = y - radius
      if (removeY >= 0) {
        sum -= horizontal[removeY * width + x]
        count -= 1
      }
      const addY = y + radius + 1
      if (addY < height) {
        sum += horizontal[addY * width + x]
        count += 1
      }
    }
  }

  return output
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

export function getAppleMakerNote48(headroom: number) {
  const stops = Math.log2(clamp(headroom, 1.05, 8))
  if (stops >= 2.3) return (3.0 - stops) / 70.0
  if (stops >= 1.8) return (2.30303 - stops) / 0.303
  if (stops >= 1.6) return (1.8 - stops) / 20.0
  return (1.60101 - stops) / 0.101
}

export function detectUsefulGain(image: RgbaImage) {
  let max = 0
  let sum = 0
  const pixels = image.width * image.height
  for (let pixel = 0, i = 0; pixel < pixels; pixel++, i += 4) {
    const r = srgbToLinear(image.data[i])
    const g = srgbToLinear(image.data[i + 1])
    const b = srgbToLinear(image.data[i + 2])
    const luma = luminanceFromLinear(r, g, b)
    max = Math.max(max, luma)
    sum += luma
  }
  return {
    maxLuminance: max,
    meanLuminance: sum / Math.max(pixels, 1),
    isLowDynamicRange: max < 0.25,
  }
}
