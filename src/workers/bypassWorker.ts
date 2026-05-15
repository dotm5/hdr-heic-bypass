import { encodeAppleHdrHeic } from '../encoders/appleHeicEncoder'
import { authorBasePlusGainMap, generateBypassGainMap, type GainMapResult } from '../lib/gainMap'
import type { RgbaImage } from '../lib/gainMap'
import { downsampleRgbaImage } from '../features/preview/downsampleRgba'
import { previewMaxLongEdge } from '../features/preview/constants'
import {
  serializeWorkerError,
  workerProgressMessages,
  type WorkerRequest,
} from './imageWorkerProtocol'

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope
function postProgress(id: number, message: (typeof workerProgressMessages)[keyof typeof workerProgressMessages]) {
  scope.postMessage({ type: 'progress', id, message })
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type !== 'process') return

  try {
    postProgress(request.id, workerProgressMessages.generatingGainMap)
    const result =
      request.mode === 'base-plus-gain-map'
        ? authorBasePlusGainMap(request.image, requireGainMapImage(request.gainMapImage), request.options)
        : generateBypassGainMap(request.image, request.options)
    const uiResult = buildUiResult(result)

    if (!request.encode) {
      scope.postMessage(
        {
          type: 'processed',
          id: request.id,
          result: uiResult,
        },
        transferResult(uiResult),
      )
      return
    }

    postProgress(request.id, workerProgressMessages.encodingHeic)
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
        result: uiResult,
        encoded,
      },
      [...transferResult(uiResult), encoded.bytes.buffer as ArrayBuffer] satisfies Transferable[],
    )
  } catch (error) {
    scope.postMessage(serializeWorkerError(request.id, error))
  }
}

function requireGainMapImage(image: RgbaImage | undefined) {
  if (!image) throw new Error('Base + Gain Map mode requires a gain map image.')
  return image
}

function buildUiResult(result: GainMapResult): GainMapResult {
  return {
    ...result,
    base: downsampleRgbaImage(result.base, previewMaxLongEdge),
    gainMapPreview: downsampleRgbaImage(result.gainMapPreview, previewMaxLongEdge),
    highlightMaskPreview: downsampleRgbaImage(result.highlightMaskPreview, previewMaxLongEdge),
    hdrPreview: downsampleRgbaImage(result.hdrPreview, previewMaxLongEdge),
  }
}

function transferResult(result: GainMapResult) {
  return [
    result.base.data.buffer as ArrayBuffer,
    result.gainMap.data.buffer as ArrayBuffer,
    result.gainMapPreview.data.buffer as ArrayBuffer,
    result.highlightMaskPreview.data.buffer as ArrayBuffer,
    result.hdrPreview.data.buffer as ArrayBuffer,
  ] satisfies Transferable[]
}
