import type { RgbaImage } from '../../lib/gainMap'
import { downsampleRgbaImage } from './downsampleRgba'
import { previewMaxLongEdge } from './constants'

export function renderRgbaPreview(canvas: HTMLCanvasElement, image: RgbaImage, maxLongEdge = previewMaxLongEdge) {
  const preview = needsDownsample(image, maxLongEdge) ? downsampleRgbaImage(image, maxLongEdge) : image
  canvas.width = preview.width
  canvas.height = preview.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create preview canvas.')
  const imageData = new ImageData(preview.data as ImageDataArray, preview.width, preview.height)
  ctx.putImageData(imageData, 0, 0)
}

function needsDownsample(image: RgbaImage, maxLongEdge: number) {
  return Math.max(image.width, image.height) > maxLongEdge
}
