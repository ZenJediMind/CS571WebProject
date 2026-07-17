import { useEffect, useRef } from 'react'
import { PAINT_TOOLS } from './paintTools'

const PENCIL_WIDTH = 3

/* ---------- pixel helpers (little-endian RGBA words) ---------- */

function hexToPixelWord(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0
}

function pixelToHex(data) {
  const [r, g, b, alpha] = data
  if (alpha === 0) return null
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Classic exact-match flood fill on a typed-array stack. */
function floodFill(ctx, width, height, startX, startY, fillHex) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const pixels = new Uint32Array(imageData.data.buffer)
  const fillWord = hexToPixelWord(fillHex)
  const startIndex = startY * width + startX
  const targetWord = pixels[startIndex]
  if (targetWord === fillWord) return

  const stack = [startIndex]
  while (stack.length > 0) {
    const index = stack.pop()
    if (pixels[index] !== targetWord) continue
    pixels[index] = fillWord
    const column = index % width
    if (column > 0) stack.push(index - 1)
    if (column < width - 1) stack.push(index + 1)
    if (index >= width) stack.push(index - width)
    if (index < width * (height - 1)) stack.push(index + width)
  }
  ctx.putImageData(imageData, 0, 0)
}

/**
 * MS Paint–style freehand bitmap editor on a transparent canvas.
 * Controlled from outside via imageDataUrl; emits onChange(dataUrl) after
 * each committed stroke/shape/fill so the parent can keep undo history.
 */
export default function PaintCanvas({
  width,
  height,
  tool,
  color,
  brushSize,
  imageDataUrl,
  onChange,
  onPickColor,
}) {
  const canvasRef = useRef(null)
  const lastEmittedRef = useRef(null)
  // Active pointer gesture: { lastX, lastY, startX, startY, snapshot }
  const gestureRef = useRef(null)

  // Repaint when the parent swaps the bitmap (undo, template, initial load) —
  // but not in response to our own onChange emissions.
  useEffect(() => {
    if (!imageDataUrl || imageDataUrl === lastEmittedRef.current) return
    let cancelled = false
    const emittedAtStart = lastEmittedRef.current
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      // User committed strokes while this Image was decoding — keep their work.
      if (lastEmittedRef.current !== emittedAtStart) return
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(image, 0, 0, width, height)
      lastEmittedRef.current = imageDataUrl
    }
    image.src = imageDataUrl
    return () => { cancelled = true }
  }, [imageDataUrl, width, height])

  const canvasPoint = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.min(width - 1, Math.max(0, Math.round(((event.clientX - rect.left) / rect.width) * width))),
      y: Math.min(height - 1, Math.max(0, Math.round(((event.clientY - rect.top) / rect.height) * height))),
    }
  }

  const strokeContext = () => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = color
    ctx.globalCompositeOperation = tool === PAINT_TOOLS.ERASER ? 'destination-out' : 'source-over'
    ctx.lineWidth = tool === PAINT_TOOLS.PENCIL ? PENCIL_WIDTH : brushSize
    return ctx
  }

  const drawSegment = (from, to) => {
    const ctx = strokeContext()
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  const drawShapePreview = (start, current) => {
    const ctx = strokeContext()
    ctx.putImageData(gestureRef.current.snapshot, 0, 0)
    ctx.beginPath()
    if (tool === PAINT_TOOLS.LINE) {
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(current.x, current.y)
    } else if (tool === PAINT_TOOLS.RECT) {
      ctx.rect(start.x, start.y, current.x - start.x, current.y - start.y)
    } else {
      ctx.ellipse(
        (start.x + current.x) / 2, (start.y + current.y) / 2,
        Math.abs(current.x - start.x) / 2, Math.abs(current.y - start.y) / 2,
        0, 0, Math.PI * 2,
      )
    }
    ctx.stroke()
  }

  const emitChange = () => {
    const dataUrl = canvasRef.current.toDataURL('image/png')
    lastEmittedRef.current = dataUrl
    onChange?.(dataUrl)
  }

  const handlePointerDown = (event) => {
    event.preventDefault()
    const point = canvasPoint(event)
    const ctx = canvasRef.current.getContext('2d')

    if (tool === PAINT_TOOLS.EYEDROPPER) {
      const picked = pixelToHex(ctx.getImageData(point.x, point.y, 1, 1).data)
      if (picked) onPickColor?.(picked)
      return
    }
    if (tool === PAINT_TOOLS.FILL) {
      floodFill(ctx, width, height, point.x, point.y, color)
      emitChange()
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const isShapeTool = [PAINT_TOOLS.LINE, PAINT_TOOLS.RECT, PAINT_TOOLS.ELLIPSE].includes(tool)
    gestureRef.current = {
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      snapshot: isShapeTool ? ctx.getImageData(0, 0, width, height) : null,
    }
    if (!isShapeTool) drawSegment(point, point) // click = dot
  }

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current
    if (!gesture) return
    const point = canvasPoint(event)

    if (gesture.snapshot) {
      drawShapePreview({ x: gesture.startX, y: gesture.startY }, point)
    } else {
      drawSegment({ x: gesture.lastX, y: gesture.lastY }, point)
    }
    gesture.lastX = point.x
    gesture.lastY = point.y
  }

  const handlePointerUp = () => {
    if (!gestureRef.current) return
    gestureRef.current = null
    emitChange()
  }

  return (
    <div className="wr-paint-frame">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        role="img"
        aria-label="Car drawing canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  )
}
