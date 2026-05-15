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

export type ImageLike = {
  width: number
  height: number
  data: Uint8ClampedArray
}
