import type { RgbaImage } from './gainMap'

export async function decodeImageFile(file: File): Promise<RgbaImage> {
  if (!/^image\/(jpeg|png)$/.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
    throw new Error('Only JPEG and PNG inputs are supported.')
  }

  const bitmap = await createBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', {
    colorSpace: 'display-p3',
    willReadFrequently: true,
  } as CanvasRenderingContext2DSettings)

  if (!ctx) throw new Error('Could not create a 2D canvas context.')
  ctx.drawImage(bitmap, 0, 0)
  if ('close' in bitmap) bitmap.close()

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return {
    width: canvas.width,
    height: canvas.height,
    data: imageData.data,
  }
}

async function createBitmap(file: File): Promise<ImageBitmap> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, {
      colorSpaceConversion: 'default',
      imageOrientation: 'from-image',
    })
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not decode image.'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create decode canvas.')
    ctx.drawImage(image, 0, 0)
    return createImageBitmap(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const previewMaxLongEdge = 1200

export async function imageToPngUrl(image: RgbaImage, maxLongEdge = previewMaxLongEdge) {
  const { width, height } = resolvePreviewSize(image.width, image.height, maxLongEdge)
  const previewData = downsampleRgbaForPreview(image, width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create preview canvas.')
  ctx.putImageData(new ImageData(previewData, width, height), 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not encode preview image.')
  return URL.createObjectURL(blob)
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

function downsampleRgbaForPreview(image: RgbaImage, width: number, height: number) {
  if (width === image.width && height === image.height) {
    return new Uint8ClampedArray(image.data)
  }

  const output = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height))
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width))
      const sourceIndex = (sourceY * image.width + sourceX) * 4
      const targetIndex = (y * width + x) * 4
      output[targetIndex] = image.data[sourceIndex]
      output[targetIndex + 1] = image.data[sourceIndex + 1]
      output[targetIndex + 2] = image.data[sourceIndex + 2]
      output[targetIndex + 3] = image.data[sourceIndex + 3]
    }
  }
  return output
}
