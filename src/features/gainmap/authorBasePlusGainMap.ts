import { clamp } from '../../lib/math'
import { normalizeHdrGainMapControls } from '../hdr/controls'
import type { BypassOptions } from '../hdr/types'
import { encodedGainToMultiplier } from './gainConversion'
import { percentileFromSorted, sortedCopy } from './histogram'
import {
  imageWidthHeight,
  linearGrayByte,
  linearToSrgbByte,
  luminanceFromLinear,
  sampleEncodedGain,
  srgbToLinear,
} from './luminance'
import { downsampleGainMap } from './quantizeGainMap'
import { byteMax, byteMean, byteMin } from './stats'
import type { GainMapResult, ImageLike } from './types'

export function authorBasePlusGainMap(
  baseImage: ImageLike,
  gainMapImage: ImageLike,
  options: BypassOptions,
): GainMapResult {
  const { width, height } = imageWidthHeight(baseImage)
  const base = baseImage.data
  const normalizedControls = normalizeHdrGainMapControls(options)
  const headroomRatio = Math.pow(2, normalizedControls.headroomStops)
  const encodedFull = new Float32Array(width * height)
  const gainPreviewData = new Uint8ClampedArray(width * height * 4)
  const hdrPreview = new Uint8ClampedArray(width * height * 4)
  const linearLuma = new Float32Array(width * height)
  let activePixels = 0
  let gainSum = 0

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
    hdrPreview[i] = linearToSrgbByte(r * gain)
    hdrPreview[i + 1] = linearToSrgbByte(g * gain)
    hdrPreview[i + 2] = linearToSrgbByte(b * gain)
    hdrPreview[i + 3] = base[i + 3]
  }
  const sortedLinearLuma = sortedCopy(linearLuma)

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
        p50: percentileFromSorted(sortedLinearLuma, 0.5),
        p90: percentileFromSorted(sortedLinearLuma, 0.9),
        p95: percentileFromSorted(sortedLinearLuma, 0.95),
        p99: percentileFromSorted(sortedLinearLuma, 0.99),
        p99_9: percentileFromSorted(sortedLinearLuma, 0.999),
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
