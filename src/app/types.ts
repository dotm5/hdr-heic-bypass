import type { HeicEncodeResult } from '../lib/encoderTypes'
import type { TranslationKey } from '../lib/i18n'

export type PreviewState = {
  baseUrl: string
  maskUrl: string
  gainUrl: string
  hdrUrl: string
}

export type OutputState = {
  url: string
  fileName: string
  label: string
  kind: HeicEncodeResult['kind']
}

export type EncoderCheckState = 'checking' | 'ready' | 'missing'

export type StatusState = {
  key: TranslationKey
  fallback?: string
}

export type ProgressState = {
  active: boolean
  label: string
  startedAt: number
  estimatedMs: number
}
