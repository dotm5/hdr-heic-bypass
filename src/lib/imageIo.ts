import type { RgbaImage } from './gainMap'
import {
  createTrackedObjectURL,
  debugImagePerfLog,
  measureImageTask,
  revokeTrackedObjectURL,
} from './imagePerfDebug'

export const imageIoLimits = {
  maxUploadBytes: 50 * 1024 * 1024,
  maxDecodedPixels: 80_000_000,
  maxProcessLongEdge: 4096,
  maxPreviewLongEdge: 1280,
}

type DecodeImageOptions = {
  signal?: AbortSignal
  maxLongEdge?: number
}

type PreviewImageOptions = {
  signal?: AbortSignal
  maxLongEdge?: number
  label?: string
}

type DecodedImageSource = {
  width: number
  height: number
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void
  cleanup(): void
}

export async function decodeImageFile(file: File, options: DecodeImageOptions = {}): Promise<RgbaImage> {
  validateImageFile(file)
  assertNotAborted(options.signal)

  return measureImageTask('decode', async () => {
    debugImagePerfLog('upload:start', {
      fileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || 'unknown',
    })

    const decodedSource = await createDecodedImageSource(file, options.signal)
    const maxLongEdge = options.maxLongEdge ?? imageIoLimits.maxProcessLongEdge

    try {
      assertNotAborted(options.signal)
      if (decodedSource.width * decodedSource.height > imageIoLimits.maxDecodedPixels) {
        throw new Error(
          `Image dimensions are too large (${decodedSource.width} x ${decodedSource.height}). Please use an image below 80 megapixels.`,
        )
      }

      const targetSize = scaleToLongEdge(decodedSource.width, decodedSource.height, maxLongEdge)
      const canvas = document.createElement('canvas')
      canvas.width = targetSize.width
      canvas.height = targetSize.height
      const ctx = canvas.getContext('2d', {
        colorSpace: 'display-p3',
        willReadFrequently: true,
      } as CanvasRenderingContext2DSettings)

      if (!ctx) throw new Error('Could not create a 2D canvas context.')

      try {
        decodedSource.draw(ctx, targetSize.width, targetSize.height)
        assertNotAborted(options.signal)

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        debugImagePerfLog('decode:done', {
          fileName: file.name,
          originalDimensions: `${decodedSource.width}x${decodedSource.height}`,
          decodedDimensions: `${canvas.width}x${canvas.height}`,
          downsampled: decodedSource.width !== canvas.width || decodedSource.height !== canvas.height,
          bytesHeld: imageData.data.byteLength,
        })

        return {
          width: canvas.width,
          height: canvas.height,
          data: imageData.data,
        }
      } finally {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        canvas.width = 0
        canvas.height = 0
        debugImagePerfLog('cleanup:canvas', { stage: 'decode' })
      }
    } finally {
      decodedSource.cleanup()
      debugImagePerfLog('cleanup:decoded-image', { fileName: file.name })
    }
  })
}

export function validateImageFile(file: File) {
  if (!/^image\/(jpeg|png)$/.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
    throw new Error('Only JPEG and PNG inputs are supported.')
  }

  if (file.size > imageIoLimits.maxUploadBytes) {
    throw new Error(`Image file is too large (${formatBytes(file.size)}). Please use an image below 50 MB.`)
  }
}

async function createDecodedImageSource(file: File, signal?: AbortSignal): Promise<DecodedImageSource> {
  if ('createImageBitmap' in window) {
    assertNotAborted(signal)
    const bitmap = await createImageBitmap(file, {
      colorSpaceConversion: 'default',
      imageOrientation: 'from-image',
    })
    if (signal?.aborted) {
      bitmap.close()
      throw createAbortError()
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw(ctx, width, height) {
        ctx.drawImage(bitmap, 0, 0, width, height)
      },
      cleanup() {
        bitmap.close()
        debugImagePerfLog('cleanup:imageBitmap', { fileName: file.name })
      },
    }
  }

  const url = createTrackedObjectURL(file, 'decode-fallback')
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      const cleanup = () => {
        el.onload = null
        el.onerror = null
        signal?.removeEventListener('abort', abort)
      }
      const abort = () => {
        cleanup()
        el.src = ''
        reject(createAbortError())
      }
      el.onload = () => {
        cleanup()
        resolve(el)
      }
      el.onerror = () => {
        cleanup()
        reject(new Error('Could not decode image.'))
      }
      signal?.addEventListener('abort', abort, { once: true })
      el.src = url
    })
    if (signal?.aborted) {
      image.src = ''
      throw createAbortError()
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw(ctx, width, height) {
        ctx.drawImage(image, 0, 0, width, height)
      },
      cleanup() {
        image.onload = null
        image.onerror = null
        image.src = ''
        debugImagePerfLog('cleanup:html-image', { fileName: file.name })
      },
    }
  } finally {
    revokeTrackedObjectURL(url, 'decode-fallback')
  }
}

export async function imageToPngObjectUrl(image: RgbaImage, options: PreviewImageOptions = {}) {
  assertNotAborted(options.signal)

  const sourceCanvas = document.createElement('canvas')
  const targetCanvas = document.createElement('canvas')
  const targetSize = scaleToLongEdge(image.width, image.height, options.maxLongEdge ?? imageIoLimits.maxPreviewLongEdge)
  sourceCanvas.width = image.width
  sourceCanvas.height = image.height
  targetCanvas.width = targetSize.width
  targetCanvas.height = targetSize.height

  try {
    const sourceCtx = sourceCanvas.getContext('2d')
    const targetCtx = targetCanvas.getContext('2d')
    if (!sourceCtx || !targetCtx) throw new Error('Could not create preview canvas.')

    sourceCtx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
    assertNotAborted(options.signal)

    targetCtx.drawImage(sourceCanvas, 0, 0, targetSize.width, targetSize.height)
    const blob = await canvasToBlob(targetCanvas, 'image/png', options.signal)
    const url = createTrackedObjectURL(blob, options.label ?? 'preview')
    debugImagePerfLog('preview:done', {
      label: options.label ?? 'preview',
      originalDimensions: `${image.width}x${image.height}`,
      previewDimensions: `${targetSize.width}x${targetSize.height}`,
      blobSizeBytes: blob.size,
    })
    return url
  } finally {
    const sourceCtx = sourceCanvas.getContext('2d')
    const targetCtx = targetCanvas.getContext('2d')
    sourceCtx?.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height)
    targetCtx?.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
    sourceCanvas.width = 0
    sourceCanvas.height = 0
    targetCanvas.width = 0
    targetCanvas.height = 0
    debugImagePerfLog('cleanup:canvas', { stage: options.label ?? 'preview' })
  }
}

function scaleToLongEdge(width: number, height: number, maxLongEdge: number) {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) return { width, height }

  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, signal?: AbortSignal) {
  assertNotAborted(signal)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (signal?.aborted) {
        reject(createAbortError())
        return
      }
      if (!blob) {
        reject(new Error('Could not create preview blob.'))
        return
      }
      resolve(blob)
    }, type)
  })
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError()
}

function createAbortError() {
  return new DOMException('Image task was cancelled.', 'AbortError')
}

function formatBytes(bytes: number) {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}
