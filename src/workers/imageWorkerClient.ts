import type { ProcessWorkerRequest } from './imageWorkerProtocol'

export function postProcessRequest(worker: Worker, request: ProcessWorkerRequest) {
  const transfer = [request.image.data.buffer as ArrayBuffer]
  if (request.gainMapImage) transfer.push(request.gainMapImage.data.buffer as ArrayBuffer)
  worker.postMessage(request, transfer)
}
