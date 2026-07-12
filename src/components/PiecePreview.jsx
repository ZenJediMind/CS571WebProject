import { useEffect, useRef } from 'react'
import { drawGrass, drawTrackPiece } from '../game/render'

/** Small canvas swatch of one oriented track piece, used by the palette. */
export default function PiecePreview({ piece, rotation = 0, size = 44, label }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    drawGrass(ctx, size, size, size)
    drawTrackPiece(ctx, piece, rotation, 0, 0, size)
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
