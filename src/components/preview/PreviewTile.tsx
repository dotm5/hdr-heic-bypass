import { FileImage } from 'lucide-react'
import { PreviewCanvas } from './PreviewCanvas'
import type { RgbaImage } from '../../lib/gainMap'

type PreviewTileProps = {
  title: string
  image?: RgbaImage
}

export function PreviewTile({ title, image }: PreviewTileProps) {
  return (
    <article className="preview-tile">
      <header>
        <FileImage aria-hidden="true" />
        <h2>{title}</h2>
      </header>
      {image ? <PreviewCanvas image={image} title={title} /> : <div className="empty-preview" />}
    </article>
  )
}
