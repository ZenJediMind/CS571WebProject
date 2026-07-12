import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRaceState, stepRace, TOTAL_LAPS } from '../game/engine'
import { createCourseBackground, drawFrame } from '../game/render'

const KEY_BINDINGS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
}

const HUD_INTERVAL_MS = 100 // ~10Hz — HUD re-renders stay off the 60fps hot path

const hudSnapshot = (state) => ({
  elapsedMs: state.elapsedMs,
  speed: Math.abs(state.speed),
  lap: Math.min(state.lap + 1, state.totalLaps),
  totalLaps: state.totalLaps,
  nextCheckpoint: state.nextCheckpoint,
  checkpointTotal: state.checkpoints.length,
})

/**
 * Owns the requestAnimationFrame loop, keyboard input, and race state.
 * `racing` gates simulation (countdown / pause); the track always renders.
 */
export function useRaceLoop(canvasRef, course, carImage, { racing, onFinish }) {
  const raceStateRef = useRef(null)
  const inputsRef = useRef({ up: false, down: false, left: false, right: false })
  const finishSentRef = useRef(false)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  const [hud, setHud] = useState({
    elapsedMs: 0, speed: 0, lap: 1, totalLaps: TOTAL_LAPS,
    nextCheckpoint: 0, checkpointTotal: 0,
  })

  const background = useMemo(
    () => (course ? createCourseBackground(course) : null),
    [course],
  )

  const restart = useCallback(() => {
    if (!course) return
    raceStateRef.current = createRaceState(course)
    finishSentRef.current = false
    setHud(hudSnapshot(raceStateRef.current))
  }, [course])

  // (Re)build race state when the course loads or changes
  useEffect(() => { restart() }, [restart])

  // Keyboard: arrows + WASD; prevent page scroll on arrows
  useEffect(() => {
    const setInput = (pressed) => (event) => {
      const control = KEY_BINDINGS[event.code]
      if (!control) return
      event.preventDefault()
      inputsRef.current[control] = pressed
    }
    const handleKeyDown = setInput(true)
    const handleKeyUp = setInput(false)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // The render/simulation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !background) return undefined

    const ctx = canvas.getContext('2d')
    let frameId = 0
    let lastTimestamp = null
    let hudDueAt = 0

    const frame = (timestamp) => {
      const state = raceStateRef.current
      if (state) {
        const dt = lastTimestamp === null ? 0 : (timestamp - lastTimestamp) / 1000
        lastTimestamp = timestamp

        if (racing && dt > 0) stepRace(state, inputsRef.current, dt)
        drawFrame(ctx, background, state, carImage)

        if (timestamp >= hudDueAt) {
          hudDueAt = timestamp + HUD_INTERVAL_MS
          setHud(hudSnapshot(state))
        }

        if (state.finished && !finishSentRef.current) {
          finishSentRef.current = true
          onFinishRef.current?.(state.elapsedMs)
        }
      }
      frameId = requestAnimationFrame(frame)
    }

    frameId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(frameId)
  }, [canvasRef, background, carImage, racing])

  return { hud, restart }
}
