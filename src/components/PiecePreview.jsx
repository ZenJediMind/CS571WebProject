import { useEffect, useRef } from 'react'
import { getTheme } from '../game/themes'
import { drawTrackPiece } from '../game/render'

/** Small canvas swatch of one oriented track piece, used by the palette. */
export default function PiecePreview({ piece, rotation = 0, size = 44, label }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const theme = getTheme('circuit')
    const ctx = canvasRef.current.getContext('2d')
    theme.drawTerrain(ctx, size, size, size)
    drawTrackPiece(ctx, piece, rotation, 0, 0, size, theme)
  }, [piece, rotation, size])

  // Decorative when unlabeled (the enclosing button carries the text label)
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{ borderRadius: 4 }}
    />
  )
}
