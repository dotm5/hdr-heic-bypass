import { clamp } from '../../lib/math'

export function guidedFilter(
  guide: Float32Array,
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  eps: number,
) {
  const r = Math.max(0, Math.floor(radius))
  if (r <= 0) return source

  const meanI = boxFilterMean(guide, width, height, r)
  const meanP = boxFilterMean(source, width, height, r)

  const guideSq = new Float32Array(guide.length)
  const guideSource = new Float32Array(guide.length)
  for (let i = 0; i < guide.length; i++) {
    guideSq[i] = guide[i] * guide[i]
    guideSource[i] = guide[i] * source[i]
  }

  const corrI = boxFilterMean(guideSq, width, height, r)
  const corrIp = boxFilterMean(guideSource, width, height, r)
  const a = new Float32Array(source.length)
  const b = new Float32Array(source.length)

  for (let i = 0; i < source.length; i++) {
    const variance = Math.max(0, corrI[i] - meanI[i] * meanI[i])
    const covariance = corrIp[i] - meanI[i] * meanP[i]
    a[i] = covariance / (variance + eps)
    b[i] = meanP[i] - a[i] * meanI[i]
  }

  const meanA = boxFilterMean(a, width, height, r)
  const meanB = boxFilterMean(b, width, height, r)
  const output = new Float32Array(source.length)
  for (let i = 0; i < source.length; i++) {
    output[i] = clamp(meanA[i] * guide[i] + meanB[i])
  }
  return output
}

function boxFilterMean(source: Float32Array, width: number, height: number, radius: number) {
  const horizontal = new Float32Array(source.length)
  const output = new Float32Array(source.length)
  const rowPrefix = new Float32Array(width + 1)
  const colPrefix = new Float32Array(height + 1)

  for (let y = 0; y < height; y++) {
    rowPrefix[0] = 0
    const rowOffset = y * width
    for (let x = 0; x < width; x++) {
      rowPrefix[x + 1] = rowPrefix[x] + source[rowOffset + x]
    }
    for (let x = 0; x < width; x++) {
      const start = Math.max(0, x - radius)
      const end = Math.min(width, x + radius + 1)
      horizontal[rowOffset + x] = (rowPrefix[end] - rowPrefix[start]) / Math.max(end - start, 1)
    }
  }

  for (let x = 0; x < width; x++) {
    colPrefix[0] = 0
    for (let y = 0; y < height; y++) {
      colPrefix[y + 1] = colPrefix[y] + horizontal[y * width + x]
    }
    for (let y = 0; y < height; y++) {
      const start = Math.max(0, y - radius)
      const end = Math.min(height, y + radius + 1)
      output[y * width + x] = (colPrefix[end] - colPrefix[start]) / Math.max(end - start, 1)
    }
  }

  return output
}
