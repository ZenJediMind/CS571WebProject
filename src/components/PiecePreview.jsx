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

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      style={{ borderRadius: 4 }}
    />
  )
}
