import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRaceState, stepRace, MAX_FRAME_SECONDS, MAX_SPEED, TOTAL_LAPS } from '../game/engine'
import {
  createCourseBackground, createMarksOverlay, createSparkBurst, drawFrame,
  stampSkidMarks, updateAndDrawSparks,
} from '../game/render'
import {
  createGhostRecorder, createRivalGhosts, ghostPoseAt, stepRivalGhosts,
} from '../game/ghosts'
import { loadGhost, saveGhostIfFaster } from '../services/ghostService'
import { getRivalTimes } from '../services/scoreService'
import { GHOST_MODES } from '../services/settingsService'
import { recordPerformance } from '../services/performanceService'

const KEY_BINDINGS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'handbrake',
}

const EMPTY_INPUTS = { up: false, down: false, left: false, right: false, handbrake: false }
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
  const heldKeysRef = useRef({ ...EMPTY_INPUTS })
  const inputsRef = useRef({ ...EMPTY_INPUTS })
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

  // Always track physical key state; only feed the sim while racing.
  // Audio init runs on any bound key so countdown beeps unlock during the countdown.
  useEffect(() => {
    const setHeld = (pressed) => (event) => {
      const control = KEY_BINDINGS[event.code]
      if (!control) return
      heldKeysRef.current[control] = pressed
      if (pressed) audioRef.current?.init()
      if (!racing) return
      event.preventDefault()
      inputsRef.current[control] = pressed
    }
    const handleKeyDown = setHeld(true)
    const handleKeyUp = setHeld(false)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [audioRef, racing])

  // Sync held keys into the sim when racing starts/resumes; clear while paused.
  useEffect(() => {
    inputsRef.current = racing ? { ...heldKeysRef.current } : { ...EMPTY_INPUTS }
  }, [racing])

  // The render/simulation loop — only animates while racing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !background) {
      // Canvas gone mid-race (e.g. resized under the raceable breakpoint):
      // the AudioContext outlives it, so silence the engine explicitly.
      audioRef.current?.update(0, false)
      return undefined
    }

    const ctx = canvas.getContext('2d')

    const drawScene = (dtMs) => {
      const state = raceStateRef.current
      if (!state) return
      drawFrame(ctx, {
        background,
        marks: marksRef.current,
        state,
        carImage,
        bestGhostPose: bestGhostRef.current
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
          const simulationStartedAt = performance.now()
          // Same stall clamp as stepRace so tab-switch gaps don't desync rivals.
          const simDt = Math.min(dt, MAX_FRAME_SECONDS)
          stepRace(state, inputsRef.current, simDt)
          stepRivalGhosts(rivalGhostsRef.current, simDt)
          recorderRef.current.sample(state)

          const skidding = state.drifting
            || (state.onOil && Math.abs(state.speed) > OIL_SKID_MIN_SPEED)
          audioRef.current?.update(Math.abs(state.speed) / (MAX_SPEED * 1.25), skidding)

          if (state.boostCount !== lastBoostCountRef.current) {
            lastBoostCountRef.current = state.boostCount
            sparksRef.current.push(...createSparkBurst(state.boostCount, state.x, state.y))
            audioRef.current?.boost()
          }

          if (skidding) {
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
          recordPerformance('race.simulation', performance.now() - simulationStartedAt)
        }

        const renderStartedAt = performance.now()
        drawScene(dt * 1000)
        recordPerformance('race.render', performance.now() - renderStartedAt)
        if (dt > 0) recordPerformance('race.frame_interval', dt * 1000)

        if (timestamp >= hudDueAt) {
          hudDueAt = timestamp + HUD_INTERVAL_MS
          setHud(hudSnapshot(state, splitRef.current))
        }

        if (state.finished && !finishSentRef.current) {
          finishSentRef.current = true
          const recording = recorderRef.current.finish(state)
          const ms = recording.ms
          const resultId = crypto.randomUUID()
          const ghostSaved = saveGhostIfFaster(course.id, recording)
          onFinishRef.current?.({ ms, resultId, ghostSaved })
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
