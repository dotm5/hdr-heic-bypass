import { describe, expect, it } from 'vitest'
import { defaultBypassOptions, defaultPresetId, hdrPresets } from './authoring'
import {
  authorBasePlusGainMap,
  detectUsefulGain,
  downsampleGainMap,
  encodedGainToMultiplier,
  gainMultiplierToEncoded,
  generateSyntheticGainMapV2,
  resolveGainMapSize,
  type RgbaImage,
} from './gainMap'

function solid(width: number, height: number, value: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return { width, height, data }
}

function solidRgb(width: number, height: number, r: number, g: number, b: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }
  return { width, height, data }
}

function grayscale(width: number, height: number, values: number[]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let pixel = 0, i = 0; pixel < width * height; pixel++, i += 4) {
    const value = values[pixel] ?? 0
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return { width, height, data }
}

function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Math.round((x / Math.max(width - 1, 1)) * 255)
      const index = (y * width + x) * 4
      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
      data[index + 3] = 255
    }
  }
  return { width, height, data }
}

function hardEdge(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = x < width / 2 ? 0 : 255
      const index = (y * width + x) * 4
      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
      data[index + 3] = 255
    }
  }
  return { width, height, data }
}

function brightPoint(width: number, height: number): RgbaImage {
  const image = solid(width, height, 72)
  const point = Math.floor(height / 2) * width + Math.floor(width / 2)
  const index = point * 4
  image.data[index] = 255
  image.data[index + 1] = 255
  image.data[index + 2] = 255
  return image
}

function grayAt(image: RgbaImage, x: number, y: number) {
  return image.data[(y * image.width + x) * 4]
}

const pipelineTestControls = {
  ...defaultBypassOptions,
  gainMapResolutionMode: 'full' as const,
  edgeAwareRadius: 0,
  shadowLift: 0,
  midtoneLock: 0,
  naturalSaturation: 0,
  clipGuard: 0,
}

describe('presets', () => {
  it('uses the High HDR preset as the default preset', () => {
    expect(defaultPresetId).toBe('macbookPro1600')
    expect(defaultBypassOptions).toEqual(hdrPresets.macbookPro1600)
    expect(defaultBypassOptions.hdrStrengthStops).toBe(2.85)
    expect(defaultBypassOptions.headroomStops).toBe(4)
    expect(defaultBypassOptions.highlightStartPct).toBe(92)
    expect(defaultBypassOptions.highlightRolloffPct).toBe(99.7)
    expect(defaultBypassOptions.naturalSaturation).toBe(0.1)
    expect(defaultBypassOptions.gainMapResolutionMode).toBe('auto')
  })

  it('includes the first-stage HDR gain-map presets', () => {
    expect(Object.keys(hdrPresets)).toEqual(['macbookPro1600', 'lightScene', 'natural', 'bright', 'neonNight', 'soft', 'product'])
    expect(hdrPresets.lightScene.hdrStrengthStops).toBe(0.65)
    expect(hdrPresets.lightScene.headroomStops).toBe(1.4)
    expect(hdrPresets.lightScene.naturalSaturation).toBe(0.2)
    expect(hdrPresets.bright.hdrStrengthStops).toBeGreaterThan(hdrPresets.natural.hdrStrengthStops)
    expect(hdrPresets.neonNight.headroomStops).toBeGreaterThan(hdrPresets.bright.headroomStops)
    expect(hdrPresets.macbookPro1600.naturalSaturation).toBeGreaterThan(hdrPresets.natural.naturalSaturation)
  })
})

describe('synthetic gain-map generation v2', () => {
  it('keeps a grayscale gradient monotonic and avoids dark gain spikes', () => {
    const result = generateSyntheticGainMapV2(gradient(48, 1), {
      ...pipelineTestControls,
      highlightStartPct: 80,
      highlightRolloffPct: 99.9,
    })
    const mask = Array.from({ length: 48 }, (_, x) => grayAt(result.highlightMaskPreview, x, 0))

    for (let i = 1; i < mask.length; i++) {
      expect(mask[i]).toBeGreaterThanOrEqual(mask[i - 1])
    }
    expect(grayAt(result.gainMapPreview, 2, 0)).toBeLessThan(8)
    expect(grayAt(result.gainMapPreview, 46, 0)).toBeGreaterThan(grayAt(result.gainMapPreview, 2, 0))
  })

  it('keeps edge-aware smoothing from heavily leaking across a black-white edge', () => {
    const result = generateSyntheticGainMapV2(hardEdge(32, 8), {
      ...pipelineTestControls,
      highlightStartPct: 50,
      highlightRolloffPct: 99.9,
      edgeAwareRadius: 8,
      edgeAwareEps: 0.0001,
    })

    const leftNearEdge = grayAt(result.gainMapPreview, 14, 4)
    const rightNearEdge = grayAt(result.gainMapPreview, 17, 4)
    const rightInterior = grayAt(result.gainMapPreview, 24, 4)
    expect(leftNearEdge).toBeLessThan(45)
    expect(rightNearEdge).toBeGreaterThan(leftNearEdge + 80)
    expect(rightInterior).toBeGreaterThanOrEqual(rightNearEdge)
  })

  it('adds natural saturation to the exported base without shifting neutral gray', () => {
    const muted = solidRgb(8, 8, 160, 130, 120)
    const neutral = solid(8, 8, 130)
    const unchanged = generateSyntheticGainMapV2(muted, {
      ...pipelineTestControls,
      naturalSaturation: 0,
    })
    const saturated = generateSyntheticGainMapV2(muted, {
      ...pipelineTestControls,
      naturalSaturation: 1,
    })
    const neutralResult = generateSyntheticGainMapV2(neutral, {
      ...pipelineTestControls,
      naturalSaturation: 1,
    })

    expect(saturated.base.data[0] - saturated.base.data[2]).toBeGreaterThan(unchanged.base.data[0] - unchanged.base.data[2])
    expect(Array.from(neutralResult.base.data.slice(0, 3))).toEqual([130, 130, 130])
  })

  it('lets a small high point receive more gain than the surrounding image', () => {
    const result = generateSyntheticGainMapV2(brightPoint(16, 16), {
      ...pipelineTestControls,
      hdrStrengthStops: 2,
      highlightStartPct: 95,
      highlightRolloffPct: 99.9,
    })

    const center = grayAt(result.gainMapPreview, 8, 8)
    const background = grayAt(result.gainMapPreview, 0, 0)
    expect(center).toBeGreaterThan(background + 50)
  })

  it('uses clip guard to reduce excessive gain on a bright white field', () => {
    const image = solid(12, 12, 255)
    const unguarded = generateSyntheticGainMapV2(image, {
      ...pipelineTestControls,
      hdrStrengthStops: 3,
      headroomStops: 1,
      clipGuard: 0,
    })
    const guarded = generateSyntheticGainMapV2(image, {
      ...pipelineTestControls,
      hdrStrengthStops: 3,
      headroomStops: 1,
      clipGuard: 1,
    })

    expect(guarded.stats.gain.max).toBeLessThan(unguarded.stats.gain.max)
  })

  it('encodes synthetic gain against absolute headroom instead of always filling the full byte range', () => {
    const image = brightPoint(16, 16)
    const lowStrength = generateSyntheticGainMapV2(image, {
      ...pipelineTestControls,
      hdrStrengthStops: 1,
      headroomStops: 4,
      highlightStartPct: 95,
      highlightRolloffPct: 99.9,
    })
    const highStrength = generateSyntheticGainMapV2(image, {
      ...pipelineTestControls,
      hdrStrengthStops: 3,
      headroomStops: 4,
      highlightStartPct: 95,
      highlightRolloffPct: 99.9,
    })
    const lowerHeadroom = generateSyntheticGainMapV2(image, {
      ...pipelineTestControls,
      hdrStrengthStops: 3,
      headroomStops: 2,
      highlightStartPct: 95,
      highlightRolloffPct: 99.9,
    })

    expect(lowStrength.stats.gain.encodedMax).toBeLessThan(255)
    expect(highStrength.stats.gain.encodedMax).toBeGreaterThan(lowStrength.stats.gain.encodedMax)
    expect(lowerHeadroom.stats.gain.encodedMax).toBeGreaterThan(highStrength.stats.gain.encodedMax)
  })

  it('keeps zero headroom from encoding positive HDR gain', () => {
    const result = generateSyntheticGainMapV2(brightPoint(16, 16), {
      ...pipelineTestControls,
      hdrStrengthStops: 3,
      headroomStops: 0,
      highlightStartPct: 95,
      highlightRolloffPct: 99.9,
    })

    expect(result.stats.gain.encodedMax).toBe(0)
  })

  it('handles all-black and all-white extreme inputs without invalid stats', () => {
    for (const image of [solid(8, 8, 0), solid(8, 8, 255)]) {
      const result = generateSyntheticGainMapV2(image, pipelineTestControls)
      expect(Number.isFinite(result.stats.gain.min)).toBe(true)
      expect(Number.isFinite(result.stats.gain.max)).toBe(true)
      expect(Number.isFinite(result.stats.gain.mean)).toBe(true)
      for (const value of result.gainMap.data) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(255)
      }
    }
    expect(generateSyntheticGainMapV2(solid(8, 8, 0), pipelineTestControls).stats.activePixels).toBe(0)
  })

  it('keeps low luminance inputs effectively inactive', () => {
    const image = solid(8, 8, 12)
    const result = generateSyntheticGainMapV2(image, pipelineTestControls)
    expect(result.stats.activePixels).toBe(0)
    expect(detectUsefulGain(image).isLowDynamicRange).toBe(true)
  })

  it('computes stable luminance percentiles without sorting every pixel', () => {
    const result = generateSyntheticGainMapV2(gradient(256, 1), pipelineTestControls)

    expect(result.stats.luminance.p50).toBeCloseTo(0.21, 1)
    expect(result.stats.luminance.p90).toBeCloseTo(0.79, 1)
    expect(result.stats.luminance.p95).toBeCloseTo(0.89, 1)
    expect(result.stats.luminance.p99).toBeLessThanOrEqual(1)
    expect(result.stats.luminance.p50).toBeLessThan(result.stats.luminance.p90)
    expect(result.stats.luminance.p90).toBeLessThan(result.stats.luminance.p99)
  })
})

describe('gain map resolution', () => {
  it('chooses 1080 long edge for 4000x3000 auto', () => {
    expect(resolveGainMapSize(4000, 3000, 'auto')).toEqual({ width: 1080, height: 810 })
  })

  it('caps 1920x1080 480p output to a 480 long edge', () => {
    const size = resolveGainMapSize(1920, 1080, '480p')
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(480)
    expect(size).toEqual({ width: 480, height: 270 })
  })

  it('uses one quarter of the original dimensions', () => {
    expect(resolveGainMapSize(1920, 1080, 'quarter')).toEqual({ width: 480, height: 270 })
  })

  it('uses original source dimensions for full resolution gain maps', () => {
    expect(resolveGainMapSize(3840, 2160, 'full')).toEqual({ width: 3840, height: 2160 })
  })

  it('never exceeds the original image dimensions', () => {
    for (const mode of ['auto', '480p', '720p', '1080p', 'quarter', 'half', 'full'] as const) {
      const size = resolveGainMapSize(320, 200, mode)
      expect(size.width).toBeLessThanOrEqual(320)
      expect(size.height).toBeLessThanOrEqual(200)
      expect(size.width).toBeGreaterThanOrEqual(1)
      expect(size.height).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('downsample preservation', () => {
  it('keeps sparse highlights above pure average when preservation is enabled', () => {
    const source = new Float32Array(16 * 16)
    source[0] = 1
    const averaged = downsampleGainMap(source, 16, 16, {
      mode: 'quarter',
      smallHighlightPreserve: 0,
    })
    const preserved = downsampleGainMap(source, 16, 16, {
      mode: 'quarter',
      smallHighlightPreserve: 1,
    })
    expect(preserved.data[0]).toBeGreaterThan(averaged.data[0])
  })
})

describe('Base + Gain Map authoring', () => {
  it('interprets black as 1x gain and white as max headroom', () => {
    const maxHeadroom = 4
    expect(encodedGainToMultiplier(0, maxHeadroom)).toBeCloseTo(1)
    expect(encodedGainToMultiplier(1, maxHeadroom)).toBeCloseTo(maxHeadroom)
  })

  it('uses log2 gain encoding for middle gray values', () => {
    const maxHeadroom = 4
    expect(gainMultiplierToEncoded(2, maxHeadroom)).toBeCloseTo(0.5)
    expect(encodedGainToMultiplier(0.5, maxHeadroom)).toBeCloseTo(2)
  })

  it('packages an uploaded grayscale gain map as encoded luma', () => {
    const result = authorBasePlusGainMap(solid(2, 1, 120), grayscale(2, 1, [0, 255]), {
      ...defaultBypassOptions,
      headroomStops: 2,
      gainMapResolutionMode: 'full',
    })

    expect(result.gainMap.width).toBe(2)
    expect(result.gainMap.height).toBe(1)
    expect(result.gainMap.data[0]).toBe(0)
    expect(result.gainMap.data[1]).toBe(255)
  })
})
