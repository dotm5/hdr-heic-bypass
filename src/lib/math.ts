export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t)
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6))
  return t * t * (3 - 2 * t)
}
