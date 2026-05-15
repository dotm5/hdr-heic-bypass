import type { HeicEncodeResult } from '../lib/encoderTypes'
import type { BypassOptions, InputMode, RgbaImage, GainMapResult } from '../lib/gainMap'

export const workerProgressMessages = {
  generatingGainMap: 'Generating HDR gain map',
  encodingHeic: 'Encoding HEIC payload',
} as const

export type ProcessWorkerRequest = {
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

export type WorkerRequest = ProcessWorkerRequest

export type WorkerProgressResponse = {
  type: 'progress'
  id: number
  message: (typeof workerProgressMessages)[keyof typeof workerProgressMessages]
}

export type WorkerProcessedResponse = {
  type: 'processed'
  id: number
  result: GainMapResult
}

export type WorkerEncodedResponse = {
  type: 'encoded'
  id: number
  result: GainMapResult
  encoded: HeicEncodeResult
}

export type WorkerErrorResponse = {
  type: 'error'
  id: number
  message: string
}

export type WorkerResponse =
  | WorkerProgressResponse
  | WorkerProcessedResponse
  | WorkerEncodedResponse
  | WorkerErrorResponse

export function serializeWorkerError(id: number, error: unknown): WorkerErrorResponse {
  return {
    type: 'error',
    id,
    message: error instanceof Error ? error.message : String(error),
  }
}

export function isKnownWorkerResponse(value: unknown): value is WorkerResponse {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'progress' || type === 'processed' || type === 'encoded' || type === 'error'
}
