import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { TEMPLATE_COURSES } = await loadGameModule('templates')
const { createRaceState, stepRace } = await loadGameModule('engine')
const { createAutopilotCursor, autopilotInputs } = await loadGameModule('autopilot')
const {
  simulateRunMs, createRivalGhosts, stepRivalGhosts, createGhostRecorder, ghostPoseAt,
} = await loadGameModule('ghosts')

const ring = TEMPLATE_COURSES[0]

test('pace factor lands rivals near their target times', () => {
  const natural = simulateRunMs(ring, 1)
  assert.ok(natural, 'natural run finishes')
  const target = natural * 1.5 // a mid-pack rival, inside the clamp range
  const ghosts = createRivalGhosts(ring, [{ id: 'r', name: 'R', ms: target }], 1)
  const paced = simulateRunMs(ring, ghosts[0].state.maxSpeedFactor)
  assert.ok(Math.abs(paced - target) / target < 0.15, `paced ${paced} vs target ${target}`)
})

test('stepRivalGhosts advances deterministically to a finish', () => {
  const run = () => {
    const ghosts = createRivalGhosts(ring, [{ id: 'r', name: 'R', ms: 40000 }], 1)
    for (let i = 0; i < 120 * 60 && !ghosts[0].state.finished; i++) stepRivalGhosts(ghosts, 1 / 60)
    return ghosts[0].state.elapsedMs
  }
  const first = run()
  assert.ok(first > 0)
  assert.equal(run(), first)
})

test('recorder + interpolation round-trip', () => {
  const state = createRaceState(ring)
  const cursor = createAutopilotCursor()
  const recorder = createGhostRecorder(100)
  for (let i = 0; i < 60 * 60 && !state.finished; i++) {
    stepRace(state, autopilotInputs(state, cursor), 1 / 60)
    recorder.sample(state)
  }
  const recording = recorder.finish(state)
  assert.ok(recording.samples.length > 50)
  assert.equal(recording.splits.length, (state.checkpoints.length + 1) * state.totalLaps)

  const sampleIndex = 40
  const pose = ghostPoseAt(recording, sampleIndex * 100)
  assert.equal(Math.round(pose.x), recording.samples[sampleIndex][0])
  assert.equal(Math.round(pose.y), recording.samples[sampleIndex][1])
  assert.equal(ghostPoseAt(recording, recording.ms + 1), null, 'ghost disappears after its run')
})
