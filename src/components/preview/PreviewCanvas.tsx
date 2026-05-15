import React from 'react'
import { renderRgbaPreview } from '../../features/preview/renderRgbaPreview'
import type { RgbaImage } from '../../lib/gainMap'

type PreviewCanvasProps = {
  image: RgbaImage
  title: string
}

export function PreviewCanvas({ image, title }: PreviewCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    renderRgbaPreview(canvas, image)
  }, [image])

  return <canvas ref={canvasRef} aria-label={title} role="img" />
}
