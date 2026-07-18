import { useEffect, useRef } from 'react'
import { drawCourseThumbnail } from '../game/render'

/**
 * Canvas that live-draws a course's track layout at the given pixel width.
 * Decorative unless a `label` marks it as meaningful to screen readers.
 */
export default function CourseThumbnail({ course, width, label, className }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    drawCourseThumbnail(canvasRef.current, course)
  }, [course])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      className={className}
      role={label ? 'img' : 'presentation'}
      aria-label={label || undefined}
    />
  )
}
