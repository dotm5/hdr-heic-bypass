import { encodeAppleHdrHeic } from '../encoders/appleHeicEncoder'
import type { BypassOptions, InputMode, RgbaImage } from '../lib/gainMap'
import { authorBasePlusGainMap, generateBypassGainMap } from '../lib/gainMap'

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope

type ProcessRequest = {
  type: 'process'
  id: number
  mode: InputMode
  sourceName: string
  image: RgbaImage
  gainMapImage?: RgbaImage
  options: BypassOptions
  quality: number
  encode: boolean
}

type WorkerRequest = ProcessRequest

function postProgress(id: number, message: string) {
  scope.postMessage({ type: 'progress', id, message })
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type !== 'process') return

  try {
    postProgress(request.id, 'Generating HDR gain map')
    const result =
      request.mode === 'base-plus-gain-map'
        ? authorBasePlusGainMap(request.image, requireGainMapImage(request.gainMapImage), request.options)
        : generateBypassGainMap(request.image, request.options)

    if (!request.encode) {
      scope.postMessage(
        {
          type: 'processed',
          id: request.id,
          result,
        },
        [
          result.base.data.buffer as ArrayBuffer,
          result.gainMap.data.buffer as ArrayBuffer,
          result.gainMapPreview.data.buffer as ArrayBuffer,
          result.hdrPreview.data.buffer as ArrayBuffer,
        ] satisfies Transferable[],
      )
      return
    }

    postProgress(request.id, 'Encoding HEIC payload')
    const encoded = await encodeAppleHdrHeic({
      sourceName: request.sourceName,
      result,
      options: request.options,
      quality: request.quality,
    })

    scope.postMessage(
      {
        type: 'encoded',
        id: request.id,
        result,
        encoded,
      },
      [
        result.base.data.buffer as ArrayBuffer,
        result.gainMap.data.buffer as ArrayBuffer,
        result.gainMapPreview.data.buffer as ArrayBuffer,
        result.hdrPreview.data.buffer as ArrayBuffer,
        encoded.bytes.buffer as ArrayBuffer,
      ] satisfies Transferable[],
    )
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function requireGainMapImage(image: RgbaImage | undefined) {
  if (!image) throw new Error('Base + Gain Map mode requires a gain map image.')
  return image
}
