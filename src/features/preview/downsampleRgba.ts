import type { RgbaImage } from '../../lib/gainMap'

export function downsampleRgbaImage(image: RgbaImage, maxLongEdge: number): RgbaImage {
  const { width, height } = resolvePreviewSize(image.width, image.height, maxLongEdge)
  if (width === image.width && height === image.height) {
    return {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data),
    }
  }

  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height))
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width))
      const sourceIndex = (sourceY * image.width + sourceX) * 4
      const targetIndex = (y * width + x) * 4
      data[targetIndex] = image.data[sourceIndex]
      data[targetIndex + 1] = image.data[sourceIndex + 1]
      data[targetIndex + 2] = image.data[sourceIndex + 2]
      data[targetIndex + 3] = image.data[sourceIndex + 3]
    }
  }

  return { width, height, data }
}

function resolvePreviewSize(width: number, height: number, maxLongEdge: number) {
  const sourceWidth = Math.max(1, Math.floor(width))
  const sourceHeight = Math.max(1, Math.floor(height))
  const longEdge = Math.max(sourceWidth, sourceHeight)
  const targetLongEdge = Math.max(1, Math.floor(maxLongEdge))
  if (longEdge <= targetLongEdge) return { width: sourceWidth, height: sourceHeight }
  const scale = targetLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}
