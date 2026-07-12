import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRaceState, stepRace, MAX_SPEED, TOTAL_LAPS } from '../game/engine'
import {
  createCourseBackground, createMarksOverlay, createSparkBurst, drawFrame,
  stampSkidMarks, updateAndDrawSparks,
} from '../game/render'
import {
  createGhostRecorder, createRivalGhosts, ghostPoseAt, stepRivalGhosts,
} from '../game/ghosts'
import { loadGhost, saveGhostIfBest } from '../services/ghostService'
import { getRivalTimes } from '../services/scoreService'
import { GHOST_MODES } from '../services/settingsService'

const KEY_BINDINGS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'handbrake',
}

const HUD_INTERVAL_MS = 100 // ~10Hz — HUD re-renders stay off the 60fps hot path
const OIL_SKID_MIN_SPEED = 120

const hudSnapshot = (state, split) => ({
  elapsedMs: state.elapsedMs,
  speed: Math.abs(state.speed),
  lap: Math.min(state.lap + 1, state.totalLaps),
  totalLaps: state.totalLaps,
  nextCheckpoint: state.nextCheckpoint,
  checkpointTotal: state.checkpoints.length,
  split,
})

/**
 * Owns the requestAnimationFrame loop, keyboard input, race state, ghosts,
 * particles, skid marks, and audio updates. The animation loop only runs
 * while `racing`; countdown/pause render a single static frame.
 */
export function useRaceLoop(canvasRef, course, carImage, { racing, onFinish, settings, audioRef }) {
  const raceStateRef = useRef(null)
  const inputsRef = useRef({ up: false, down: false, left: false, right: false, handbrake: false })
  const finishSentRef = useRef(false)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  const rivalGhostsRef = useRef([])
  const bestGhostRef = useRef(null)
  const recorderRef = useRef(null)
  const marksRef = useRef(null)
  const sparksRef = useRef([])
  const lastBoostCountRef = useRef(0)
  const splitRef = useRef(null)
  const lastSplitCountRef = useRef(0)
  const drawSceneRef = useRef(null) // lets restart() repaint while paused

  const [hud, setHud] = useState({
    elapsedMs: 0, speed: 0, lap: 1, totalLaps: TOTAL_LAPS,
    nextCheckpoint: 0, checkpointTotal: 0, split: null,
  })

  const background = useMemo(
    () => (course ? createCourseBackground(course) : null),
    [course],
  )

  const wantBest = settings.ghosts === GHOST_MODES.BEST || settings.ghosts === GHOST_MODES.BOTH
  const wantRivals = settings.ghosts === GHOST_MODES.RIVALS || settings.ghosts === GHOST_MODES.BOTH

  const restart = useCallback(() => {
    if (!course) return
    raceStateRef.current = createRaceState(course)
    finishSentRef.current = false
    recorderRef.current = createGhostRecorder()
    marksRef.current = createMarksOverlay()
    sparksRef.current = []
    lastBoostCountRef.current = 0
    splitRef.current = null
    lastSplitCountRef.current = 0
    bestGhostRef.current = wantBest ? loadGhost(course.id) : null
    rivalGhostsRef.current = wantRivals ? createRivalGhosts(course, getRivalTimes(course.id)) : []
    setHud(hudSnapshot(raceStateRef.current, null))
    drawSceneRef.current?.(0) // repaint immediately (Restart is reachable from the pause modal)
  }, [course, wantBest, wantRivals])

  // (Re)build race state when the course loads or changes
  useEffect(() => { restart() }, [restart])

  // Keyboard: arrows + WASD + Space handbrake; prevent page scroll
  useEffect(() => {
    const setInput = (pressed) => (event) => {
      const control = KEY_BINDINGS[event.code]
      if (!control) return
      event.preventDefault()
      inputsRef.current[control] = pressed
      if (pressed) audioRef.current?.init() // user gesture: safe to start audio
    }
    const handleKeyDown = setInput(true)
    const handleKeyUp = setInput(false)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [audioRef])

  // The render/simulation loop — only animates while racing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !background) return undefined

    const ctx = canvas.getContext('2d')

    const drawScene = (dtMs) => {
      const state = raceStateRef.current
      if (!state) return
      drawFrame(ctx, {
        background,
        marks: marksRef.current,
        state,
        carImage,
        bestGhostPose: racing && bestGhostRef.current
          ? ghostPoseAt(bestGhostRef.current, state.elapsedMs)
          : null,
        rivalGhosts: rivalGhostsRef.current,
        sparks: [],
      })
      sparksRef.current = updateAndDrawSparks(ctx, sparksRef.current, dtMs)
    }
    drawSceneRef.current = drawScene

    if (!racing) {
      // Countdown/pause: one static frame, engine muted, no animation loop
      drawScene(0)
      audioRef.current?.update(0, false)
      return () => { drawSceneRef.current = null }
    }

    let frameId = 0
    let lastTimestamp = null
    let hudDueAt = 0

    const frame = (timestamp) => {
      const state = raceStateRef.current
      if (state) {
        const dt = lastTimestamp === null ? 0 : (timestamp - lastTimestamp) / 1000
        lastTimestamp = timestamp

        if (dt > 0) {
          stepRace(state, inputsRef.current, dt)
          stepRivalGhosts(rivalGhostsRef.current, dt)
          recorderRef.current.sample(state)

          audioRef.current?.update(
            Math.abs(state.speed) / (MAX_SPEED * 1.25),
            state.drifting || state.onOil,
          )

          if (state.boostCount !== lastBoostCountRef.current) {
            lastBoostCountRef.current = state.boostCount
            sparksRef.current.push(...createSparkBurst(state.boostCount, state.x, state.y))
            audioRef.current?.boost()
          }

          if (state.drifting || (state.onOil && Math.abs(state.speed) > OIL_SKID_MIN_SPEED)) {
            stampSkidMarks(marksRef.current.getContext('2d'), state)
          }

          if (state.splits.length !== lastSplitCountRef.current) {
            lastSplitCountRef.current = state.splits.length
            const index = state.splits.length - 1
            const bestSplit = bestGhostRef.current?.splits?.[index]
            if (bestSplit != null) {
              splitRef.current = { deltaMs: state.splits[index] - bestSplit, id: state.splits.length }
            }
          }
        }

        drawScene(dt * 1000)

        if (timestamp >= hudDueAt) {
          hudDueAt = timestamp + HUD_INTERVAL_MS
          setHud(hudSnapshot(state, splitRef.current))
        }

        if (state.finished && !finishSentRef.current) {
          finishSentRef.current = true
          saveGhostIfBest(course.id, recorderRef.current.finish(state))
          onFinishRef.current?.(state.elapsedMs)
        }
      }
      frameId = requestAnimationFrame(frame)
    }

    frameId = requestAnimationFrame(frame)
    return () => {
      drawSceneRef.current = null
      cancelAnimationFrame(frameId)
    }
  }, [canvasRef, background, carImage, racing, course, audioRef])

  return { hud, restart }
}
