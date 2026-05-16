import { describe, expect, it } from 'vitest'
import { supportedImageInputAccept, supportedImageInputLabel, validateImageFile } from './imageIo'

describe('image IO format support', () => {
  it('advertises the supported file picker formats', () => {
    expect(supportedImageInputAccept).toContain('image/tiff')
    expect(supportedImageInputAccept).toContain('.gif')
    expect(supportedImageInputAccept).toContain('.tiff')
    expect(supportedImageInputLabel).toContain('TIFF')
  })

  it('accepts common raster image types including GIF and TIFF', () => {
    expect(() => validateImageFile(new File(['x'], 'sample.gif', { type: 'image/gif' }))).not.toThrow()
    expect(() => validateImageFile(new File(['x'], 'sample.tif', { type: 'image/tiff' }))).not.toThrow()
    expect(() => validateImageFile(new File(['x'], 'sample.TIFF', { type: '' }))).not.toThrow()
  })

  it('rejects non-image inputs', () => {
    expect(() => validateImageFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toThrow(
      'Only JPEG, PNG, GIF, WebP, AVIF, BMP, TIFF inputs are supported.',
    )
  })
})
