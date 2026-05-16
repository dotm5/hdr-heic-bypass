type ImagePerfData = Record<string, unknown>

const imagePerfDebugEnabled = import.meta.env.DEV

let objectUrlCreateCount = 0
let objectUrlRevokeCount = 0

export function debugImagePerfLog(stage: string, data: ImagePerfData = {}) {
  if (!imagePerfDebugEnabled) return

  console.debug(`[image-perf] ${stage}`, {
    ...data,
    memory: getMemorySnapshot(),
    objectUrls: {
      created: objectUrlCreateCount,
      revoked: objectUrlRevokeCount,
      active: objectUrlCreateCount - objectUrlRevokeCount,
    },
  })
}

export async function measureImageTask<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!imagePerfDebugEnabled) return fn()

  const started = performance.now()
  debugImagePerfLog(`${name}:start`)
  try {
    const result = await fn()
    debugImagePerfLog(`${name}:done`, {
      durationMs: Math.round((performance.now() - started) * 10) / 10,
    })
    return result
  } catch (error) {
    debugImagePerfLog(`${name}:error`, {
      durationMs: Math.round((performance.now() - started) * 10) / 10,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export function getMemorySnapshot() {
  const memory = (performance as Performance & {
    memory?: {
      usedJSHeapSize: number
      totalJSHeapSize: number
      jsHeapSizeLimit: number
    }
  }).memory

  if (!memory) return 'unavailable'

  return {
    usedMB: bytesToMb(memory.usedJSHeapSize),
    totalMB: bytesToMb(memory.totalJSHeapSize),
    limitMB: bytesToMb(memory.jsHeapSizeLimit),
  }
}

export function createTrackedObjectURL(blob: Blob, label: string) {
  const url = URL.createObjectURL(blob)
  objectUrlCreateCount += 1
  debugImagePerfLog('object-url:create', {
    label,
    count: objectUrlCreateCount,
    sizeBytes: blob.size,
    type: blob.type || 'unknown',
  })
  return url
}

export function revokeTrackedObjectURL(url: string | undefined | null, label: string) {
  if (!url || !url.startsWith('blob:')) return

  URL.revokeObjectURL(url)
  objectUrlRevokeCount += 1
  debugImagePerfLog('object-url:revoke', {
    label,
    count: objectUrlRevokeCount,
  })
}

function bytesToMb(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10
}
