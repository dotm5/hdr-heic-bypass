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

const supportedImageFormats = [
  { label: 'JPEG', mimeTypes: ['image/jpeg'], extensions: ['.jpg', '.jpeg'] },
  { label: 'PNG', mimeTypes: ['image/png'], extensions: ['.png'] },
  { label: 'GIF', mimeTypes: ['image/gif'], extensions: ['.gif'] },
  { label: 'WebP', mimeTypes: ['image/webp'], extensions: ['.webp'] },
  { label: 'AVIF', mimeTypes: ['image/avif'], extensions: ['.avif'] },
  { label: 'BMP', mimeTypes: ['image/bmp', 'image/x-ms-bmp'], extensions: ['.bmp'] },
  { label: 'TIFF', mimeTypes: ['image/tiff', 'image/x-tiff'], extensions: ['.tif', '.tiff'] },
] as const

const tiffMimeTypes: Set<string> = new Set(['image/tiff', 'image/x-tiff'])
const tiffExtensions: Set<string> = new Set(['.tif', '.tiff'])
const supportedImageMimeTypes: Set<string> = new Set(supportedImageFormats.flatMap((format) => format.mimeTypes))
const supportedImageExtensions: Set<string> = new Set(supportedImageFormats.flatMap((format) => format.extensions))

export const supportedImageInputAccept = supportedImageFormats
  .flatMap((format) => [...format.mimeTypes, ...format.extensions])
  .join(',')

export const supportedImageInputLabel = supportedImageFormats.map((format) => format.label).join(', ')

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

type UtifApi = typeof import('utif2')
type TiffIfd = ReturnType<UtifApi['decode']>[number]

let utifPromise: Promise<UtifApi> | null = null

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
  if (!isSupportedImageFile(file)) {
    throw new Error(`Only ${supportedImageInputLabel} inputs are supported.`)
  }

  if (file.size > imageIoLimits.maxUploadBytes) {
    throw new Error(`Image file is too large (${formatBytes(file.size)}). Please use an image below 50 MB.`)
  }
}

async function createDecodedImageSource(file: File, signal?: AbortSignal): Promise<DecodedImageSource> {
  if (isTiffFile(file)) {
    return createTiffDecodedImageSource(file, signal)
  }

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

async function createTiffDecodedImageSource(file: File, signal?: AbortSignal): Promise<DecodedImageSource> {
  assertNotAborted(signal)
  const [utif, buffer] = await Promise.all([loadUtif(), file.arrayBuffer()])
  assertNotAborted(signal)

  const ifds = utif.decode(buffer)
  const ifd = ifds.find(hasTiffDimensions)
  if (!ifd) {
    throw new Error('Could not decode TIFF image.')
  }

  const width = getTiffDimension(ifd, 't256')
  const height = getTiffDimension(ifd, 't257')
  if (!width || !height) {
    throw new Error('Could not decode TIFF image dimensions.')
  }

  if (width * height > imageIoLimits.maxDecodedPixels) {
    throw new Error(`Image dimensions are too large (${width} x ${height}). Please use an image below 80 megapixels.`)
  }

  utif.decodeImage(buffer, ifd)
  assertNotAborted(signal)

  const rgba = utif.toRGBA8(ifd)
  if (rgba.byteLength < width * height * 4) {
    throw new Error('Could not decode TIFF image pixels.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create a TIFF canvas context.')

  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)

  return {
    width,
    height,
    draw(targetCtx, targetWidth, targetHeight) {
      targetCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight)
    },
    cleanup() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      canvas.width = 0
      canvas.height = 0
      debugImagePerfLog('cleanup:tiff-canvas', { fileName: file.name })
    },
  }
}

function isSupportedImageFile(file: File) {
  const mimeType = file.type.toLowerCase()
  return supportedImageMimeTypes.has(mimeType) || supportedImageExtensions.has(getFileExtension(file.name))
}

function isTiffFile(file: File) {
  const mimeType = file.type.toLowerCase()
  return tiffMimeTypes.has(mimeType) || tiffExtensions.has(getFileExtension(file.name))
}

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex === -1 ? '' : fileName.slice(dotIndex).toLowerCase()
}

function hasTiffDimensions(ifd: TiffIfd) {
  return Boolean(getTiffDimension(ifd, 't256') && getTiffDimension(ifd, 't257'))
}

function getTiffDimension(ifd: TiffIfd, tag: 't256' | 't257') {
  const value = ifd[tag]
  const dimension = Array.isArray(value) ? Number(value[0]) : Number(value)
  return Number.isFinite(dimension) && dimension > 0 ? Math.floor(dimension) : null
}

function loadUtif(): Promise<UtifApi> {
  utifPromise ??= import('utif2').then((module) => {
    const cjsModule = module as UtifApi & { default?: UtifApi }
    return cjsModule.default ?? module
  })
  return utifPromise
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
