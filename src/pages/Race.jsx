import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Container from 'react-bootstrap/Container'
import Modal from 'react-bootstrap/Modal'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getCourse } from '../services/courseService'
import { loadPlayerCar } from '../services/carService'
import { validateCourse } from '../game/courseModel'
import { COURSE_WIDTH, COURSE_HEIGHT } from '../game/render'
import { RaceAudio } from '../game/audio'
import { formatMs } from '../services/scoreService'
import { getSettings, saveSettings } from '../services/settingsService'
import { useRaceLoop } from '../hooks/useRaceLoop'

const COUNTDOWN_START = 3
const COUNTDOWN_TICK_MS = 800
const GO_FLASH_MS = 700

/** Playful arcade speedometer: converts px/s to a mph-looking number. */
const displayMph = (pxPerSecond) => Math.round(pxPerSecond / 3.2)

export default function Race() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const canvasRef = useRef(null)

  const course = useMemo(() => getCourse(courseId), [courseId])
  const courseCheck = useMemo(
    () => (course ? validateCourse(course.grid) : null),
    [course],
  )

  const [carImage, setCarImage] = useState(null)
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const [showGo, setShowGo] = useState(false)
  const [paused, setPaused] = useState(false)

  const settings = useMemo(() => getSettings(), [])
  const [soundOn, setSoundOn] = useState(settings.sound)
  const audioRef = useRef(null)

  useEffect(() => {
    audioRef.current = new RaceAudio()
    return () => audioRef.current?.stop()
  }, [])

  useEffect(() => {
    audioRef.current?.setEnabled(soundOn)
  }, [soundOn])

  const toggleSound = () => {
    setSoundOn((prev) => {
      saveSettings({ sound: !prev })
      return !prev
    })
  }

  // Preload the saved car bitmap once
  useEffect(() => {
    const image = new Image()
    image.onload = () => setCarImage(image)
    image.src = loadPlayerCar().imageDataUrl
  }, [])

  // 3-2-1 countdown, then a brief GO! flash
  useEffect(() => {
    if (countdown === 0) {
      setShowGo(true)
      audioRef.current?.countdownBeep(true)
      const timer = setTimeout(() => setShowGo(false), GO_FLASH_MS)
      return () => clearTimeout(timer)
    }
    audioRef.current?.countdownBeep(false)
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), COUNTDOWN_TICK_MS)
    return () => clearTimeout(timer)
  }, [countdown])

  const handleFinish = useCallback((ms) => {
    navigate(`/results/${courseId}`, {
      state: { ms, resultId: crypto.randomUUID() },
    })
  }, [navigate, courseId])

  const racing = countdown === 0 && !paused
  const { hud, restart } = useRaceLoop(canvasRef, courseCheck?.ok ? course : null, carImage, {
    racing,
    onFinish: handleFinish,
    settings,
    audioRef,
  })

  // Split chip: show each checkpoint delta briefly, keyed by split id
  const [visibleSplit, setVisibleSplit] = useState(null)
  useEffect(() => {
    if (!hud.split) return undefined
    setVisibleSplit(hud.split)
    const timer = setTimeout(() => setVisibleSplit(null), 1500)
    return () => clearTimeout(timer)
  }, [hud.split])

  // Escape pauses once the race is underway
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.code === 'Escape' && countdown === 0) setPaused((prev) => !prev)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [countdown])

  const handleRestart = () => {
    restart()
    setPaused(false)
    setCountdown(COUNTDOWN_START)
  }

  if (!course) {
    return (
      <Container className="py-4">
        <Alert variant="warning">
          Course not found. <Alert.Link as={Link} to="/browse">Back to Browse</Alert.Link>
        </Alert>
      </Container>
    )
  }

  if (!courseCheck.ok) {
    return (
      <Container className="py-4">
        <Alert variant="danger">
          {course.name} is not raceable: {courseCheck.error}{' '}
          <Alert.Link as={Link} to="/browse">Back to Browse</Alert.Link>
        </Alert>
      </Container>
    )
  }

  return (
    <Container className="py-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h1 className="h4 mb-0 me-auto">{course.name}</h1>
        <div className="wr-hud-badge" aria-label={`Race time ${formatMs(hud.elapsedMs)}`}>
          TIME {formatMs(hud.elapsedMs)}
        </div>
        <div className="wr-hud-badge">LAP {hud.lap}/{hud.totalLaps}</div>
        <div className="wr-hud-badge">{displayMph(hud.speed)} MPH</div>
        <div className="wr-hud-badge">
          CHECK {hud.nextCheckpoint}/{hud.checkpointTotal}
        </div>
        {visibleSplit && (
          <span
            className={`wr-split-chip ${visibleSplit.deltaMs <= 0 ? 'wr-split-ahead' : 'wr-split-behind'}`}
            role="status"
          >
            {visibleSplit.deltaMs <= 0 ? '−' : '+'}
            {(Math.abs(visibleSplit.deltaMs) / 1000).toFixed(1)}s
          </span>
        )}
        <Button
          variant="outline-secondary"
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
        >
          {soundOn ? '🔊' : '🔇'}
        </Button>
        <Button
          variant="outline-secondary"
          onClick={() => setPaused(true)}
          disabled={countdown > 0}
        >
          Pause
        </Button>
      </div>

      <Alert variant="light" className="py-2 mb-2 d-none d-md-block">
        Steer with ← ↑ → ↓ (or WASD). Space = handbrake drift. Esc pauses.
        Hit the glowing checkpoints in order — 3 laps to finish!
      </Alert>
      <Alert variant="warning" className="py-2 mb-2 d-md-none">
        Wisconsin Racer needs a keyboard — grab a bigger screen to race.
      </Alert>

      <div className="position-relative">
        <canvas
          ref={canvasRef}
          width={COURSE_WIDTH}
          height={COURSE_HEIGHT}
          className="wr-game-canvas mx-auto"
          role="img"
          aria-label={`Top-down race track for ${course.name}`}
        />
        {(countdown > 0 || showGo) && (
          <div
            className="position-absolute top-50 start-50 translate-middle wr-countdown"
            key={countdown} // re-mounts so the pop animation replays each tick
            aria-live="assertive"
          >
            {countdown > 0 ? countdown : 'GO!'}
          </div>
        )}
      </div>

      <Modal show={paused} onHide={() => setPaused(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Paused</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-2">
          <Button variant="primary" onClick={() => setPaused(false)}>Resume</Button>
          <Button variant="outline-primary" onClick={handleRestart}>Restart</Button>
          <Button variant="outline-secondary" onClick={() => navigate('/')}>
            Quit to Main Menu
          </Button>
        </Modal.Body>
      </Modal>
    </Container>
  )
}
