export function byteMin(values: Uint8Array) {
  let min = 255
  for (let i = 0; i < values.length; i++) {
    min = Math.min(min, values[i])
  }
  return values.length ? min : 0
}

export function byteMax(values: Uint8Array) {
  let max = 0
  for (let i = 0; i < values.length; i++) {
    max = Math.max(max, values[i])
  }
  return values.length ? max : 0
}

export function byteMean(values: Uint8Array) {
  if (!values.length) return 0
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
  }
  return sum / (255 * values.length)
}
