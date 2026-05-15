import { translations, type TranslationKey } from '../lib/i18n'
import type { StatusState } from './types'
import { workerProgressMessages } from '../workers/imageWorkerProtocol'

export function translateWorkerProgress(message: string): StatusState {
  if (message === workerProgressMessages.generatingGainMap) return { key: 'statusGeneratingGainMap' }
  if (message === workerProgressMessages.encodingHeic) return { key: 'statusEncodingHeic' }
  return { key: 'statusProcessingFailed', fallback: message }
}

export function translateEncoderMessage(message: string): { key: TranslationKey; fallback?: string } {
  if (message === translations.en.encodedHeicLocal) return { key: 'encodedHeicLocal' }
  return { key: 'statusPreviewUpdated', fallback: message }
}
