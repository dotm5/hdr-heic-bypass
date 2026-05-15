import { clamp } from '../../lib/math'
import type { ImageLike, RgbaImage } from './types'

export const REC709_R = 0.2126
export const REC709_G = 0.7152
export const REC709_B = 0.0722
export const LOG_OFFSET = 1 / 64
export const LUMA_EPSILON = 1e-6

export function imageWidthHeight(image: ImageLike) {
  return {
    width: Math.max(1, Math.floor(image.width)),
    height: Math.max(1, Math.floor(image.height)),
  }
}

export function srgbToLinear(value: number) {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function linearToSrgbByte(value: number) {
  const v = clamp(value)
  const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.round(clamp(encoded) * 255)
}

export function linearGrayByte(value: number) {
  return Math.round(clamp(value) * 255)
}

export function luminanceFromLinear(r: number, g: number, b: number) {
  return REC709_R * r + REC709_G * g + REC709_B * b
}

export function saturationFromLinear(r: number, g: number, b: number) {
  const maxChannel = Math.max(r, g, b)
  const minChannel = Math.min(r, g, b)
  return maxChannel <= LUMA_EPSILON ? 0 : (maxChannel - minChannel) / Math.max(maxChannel, LUMA_EPSILON)
}

export function sampleEncodedGain(image: ImageLike, normalizedX: number, normalizedY: number) {
  const x = Math.min(image.width - 1, Math.max(0, Math.floor(normalizedX * image.width)))
  const y = Math.min(image.height - 1, Math.max(0, Math.floor(normalizedY * image.height)))
  const index = (y * image.width + x) * 4
  return clamp((REC709_R * image.data[index] + REC709_G * image.data[index + 1] + REC709_B * image.data[index + 2]) / 255)
}

export function buildGrayImage(width: number, height: number, values: Float32Array, scale = 1): RgbaImage {
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
