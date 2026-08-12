import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Container from 'react-bootstrap/Container'
import Modal from 'react-bootstrap/Modal'
import Spinner from 'react-bootstrap/Spinner'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import CourseNotFound from '../components/CourseNotFound'
import { getCourse } from '../services/courseService'
import { defaultCarDataUrl, loadPlayerCar } from '../services/carService'
import { validateCourse } from '../game/courseModel'
import { COURSE_WIDTH, COURSE_HEIGHT } from '../game/render'
import { RaceAudio } from '../game/audio'
import { formatMs } from '../services/scoreService'
import { getSettings, saveSettings } from '../services/settingsService'
import { getRaceLobby } from '../services/inviteService'
import { loadRaceLobbyGhosts } from '../services/ghostService'
import { useRaceLoop } from '../hooks/useRaceLoop'

const COUNTDOWN_START = 3
const COUNTDOWN_TICK_MS = 800
const GO_FLASH_MS = 700
const NARROW_QUERY = '(max-width: 767.98px)'

/** Playful arcade speedometer: converts px/s to a mph-looking number. */
const displayMph = (pxPerSecond) => Math.round(pxPerSecond / 3.2)

function useIsNarrowScreen() {
  const [isNarrow, setIsNarrow] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches
  ))

  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY)
    const update = () => setIsNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isNarrow
}

export default function Race() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const lobbyId = searchParams.get('lobby')
  const canvasRef = useRef(null)
  const isNarrow = useIsNarrowScreen()

  const [course, setCourse] = useState(undefined)
  const [courseLoadError, setCourseLoadError] = useState(null)
  const [lobby, setLobby] = useState(null)
  const [opponentGhosts, setOpponentGhosts] = useState([])
  const [opponentGhostLoadError, setOpponentGhostLoadError] = useState(null)
  useEffect(() => {
    let cancelled = false
    const loadCourse = async () => {
      try {
        let loaded
        let loadedLobby = null
        let loadedOpponentGhosts = []
        let ghostLoadError = null
        if (lobbyId) {
          loadedLobby = await getRaceLobby(lobbyId)
          if (loadedLobby.status !== 'racing') {
            throw new Error('This race night is not currently running. Return to Race Night for its latest status.')
          }
          if (!loadedLobby.course || loadedLobby.course.id !== courseId) {
            throw new Error('This race does not match the lobby\'s selected course.')
          }
          loaded = loadedLobby.course
          try {
            loadedOpponentGhosts = await loadRaceLobbyGhosts(lobbyId, loaded.id, loaded.revision)
          } catch (error) {
            ghostLoadError = error instanceof Error ? error.message : 'Could not load player ghost replays.'
          }
        } else {
          loaded = await getCourse(courseId)
        }
        if (!cancelled) {
          setLobby(loadedLobby)
          setOpponentGhosts(loadedOpponentGhosts)
          setOpponentGhostLoadError(ghostLoadError)
          setCourse(loaded)
          setCourseLoadError(null)
        }
      } catch (error) {
        if (!cancelled) setCourseLoadError(error instanceof Error ? error.message : 'Could not load this course.')
      }
    }
    void loadCourse()
    return () => { cancelled = true }
  }, [courseId, lobbyId])
  const courseCheck = useMemo(
    () => (course ? validateCourse(course.grid) : null),
    [course],
  )
  const courseReady = Boolean(course && courseCheck?.ok)
  const canRace = courseReady && !isNarrow

  const [carImage, setCarImage] = useState(null)
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const [showGo, setShowGo] = useState(false)
  const [paused, setPaused] = useState(false)
  const [showTip, setShowTip] = useState(true)

  const settings = useMemo(() => getSettings(), [])
  const [soundOn, setSoundOn] = useState(settings.sound)
  const [settingsSaveError, setSettingsSaveError] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    audioRef.current = new RaceAudio()
    return () => audioRef.current?.stop()
  }, [])

  useEffect(() => {
    audioRef.current?.setEnabled(soundOn)
  }, [soundOn])

  // Unlock AudioContext on first gesture (countdown beeps need a prior gesture).
  useEffect(() => {
    const unlockAudio = () => audioRef.current?.init()
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [])

  const toggleSound = () => {
    audioRef.current?.init()
    const nextSoundOn = !soundOn
    setSoundOn(nextSoundOn)
    setSettingsSaveError(!saveSettings({ sound: nextSoundOn }))
  }

  // Preload the saved car bitmap once; fall back to the classic template on error.
  useEffect(() => {
    let cancelled = false
    let usedFallback = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled) setCarImage(image)
    }
    image.onerror = () => {
      if (cancelled || usedFallback) return
      usedFallback = true
      image.src = defaultCarDataUrl()
    }
    image.src = loadPlayerCar().imageDataUrl
    return () => { cancelled = true }
  }, [])

  // Leaving raceable mode (e.g. narrow breakpoint) must reset countdown so a
  // later widen doesn't resume mid-race with countdown already at 0.
  useEffect(() => {
    if (canRace) return
    setCountdown(COUNTDOWN_START)
    setShowGo(false)
    setPaused(false)
  }, [canRace])

  // 3-2-1 countdown, then a brief GO! flash — only for raceable desktop sessions.
  useEffect(() => {
    if (!canRace) return undefined
    if (countdown === 0) {
      setShowGo(true)
      audioRef.current?.countdownBeep(true)
      const timer = setTimeout(() => setShowGo(false), GO_FLASH_MS)
      return () => clearTimeout(timer)
    }
    audioRef.current?.countdownBeep(false)
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), COUNTDOWN_TICK_MS)
    return () => clearTimeout(timer)
  }, [countdown, canRace])

  const handleFinish = useCallback(({ ms, resultId, ghostSaved, recording }) => {
    navigate(`/results/${courseId}`, {
      state: {
        ms, resultId, ghostSaved, lobbyId, recording,
      },
    })
  }, [navigate, courseId, lobbyId])

  const racing = canRace && countdown === 0 && !paused
  const { hud, restart } = useRaceLoop(canvasRef, canRace ? course : null, carImage, {
    racing,
    onFinish: handleFinish,
    settings,
    audioRef,
    opponentGhosts,
  })

  // Asphalt page chrome only while an actual race session is on screen
  useEffect(() => {
    if (!canRace) return undefined
    document.body.classList.add('wr-race-active')
    return () => document.body.classList.remove('wr-race-active')
  }, [canRace])

  // Split chip: show each checkpoint delta briefly, keyed by split id
  const [visibleSplit, setVisibleSplit] = useState(null)
  useEffect(() => {
    if (!hud.split) return undefined
    setVisibleSplit(hud.split)
    const timer = setTimeout(() => setVisibleSplit(null), 1500)
    return () => clearTimeout(timer)
  }, [hud.split])

  // One listener owns Escape; the modal's competing keyboard handler is disabled below.
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.code === 'Escape' && canRace && countdown === 0) {
        setPaused((current) => !current)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [canRace, countdown])

  const handleRestart = () => {
    restart()
    setPaused(false)
    setCountdown(COUNTDOWN_START)
    // Restarting inside the GO flash window clears the flash timer, so the
    // flag must reset here or the green lamp stays lit through the countdown.
    setShowGo(false)
  }

  if (course === undefined && !courseLoadError) {
    return (
      <Container className="py-5 text-center" role="status" aria-live="polite">
        <Spinner animation="border" className="me-2" /> Loading race course…
      </Container>
    )
  }

  if (courseLoadError) {
    return (
      <Container className="py-4">
        <Alert variant="danger">{courseLoadError}</Alert>
      </Container>
    )
  }

  if (!course) return <CourseNotFound />

  if (lobby?.members.some((member) => member.isYou && member.status === 'finished')) {
    return (
      <Container className="py-4">
        <h1 className="h2 mb-3">Race already finished</h1>
        <Alert variant="success">
          Your time for this race night is already locked in.{' '}
          <Alert.Link as={Link} to="/invite">Return to Race Night</Alert.Link>
        </Alert>
      </Container>
    )
  }

  if (!courseCheck.ok) {
    return (
      <Container className="py-4">
        <h1 className="h2 mb-3">{course.name}</h1>
        <Alert variant="danger">
          {course.name} is not raceable: {courseCheck.error}{' '}
          <Alert.Link as={Link} to="/browse">Back to Browse</Alert.Link>
        </Alert>
      </Container>
    )
  }

  if (isNarrow) {
    return (
      <Container className="py-4">
        <h1 className="h2 mb-3">{course.name}</h1>
        <Alert variant="warning" className="mb-3">
          Wisconsin Racer needs a keyboard on a wider screen. Racing is disabled on this device size.
        </Alert>
        <div className="d-grid gap-2">
          <Button as={Link} to="/browse" variant="primary">Browse Courses</Button>
          <Button as={Link} to="/" variant="outline-secondary">Main Menu</Button>
        </div>
      </Container>
    )
  }

  return (
    <Container className="py-3 wr-race-shell">
      <div className="wr-race-hud">
        <h1 className="wr-race-hud-title">{course.name}</h1>
        <div className="wr-hud-badge" aria-label={`Race time ${formatMs(hud.elapsedMs)}`}>
          TIME {formatMs(hud.elapsedMs)}
        </div>
        <div className="wr-hud-badge">LAP {hud.lap}/{hud.totalLaps}</div>
        <div className="wr-hud-badge">{displayMph(hud.speed)} MPH</div>
        <div className="wr-hud-badge">
          CHECK {hud.nextCheckpoint}/{hud.checkpointTotal}
        </div>
        {opponentGhosts.length > 0 && (
          <div className="wr-hud-badge" aria-label={`Racing player ghosts: ${opponentGhosts.map((ghost) => ghost.name).join(', ')}`}>
            GHOSTS {opponentGhosts.map((ghost) => ghost.name).join(', ')}
          </div>
        )}
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
          className="wr-race-icon-btn"
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
        >
          {soundOn ? '🔊' : '🔇'}
        </Button>
        <Button
          variant="outline-secondary"
          className="wr-race-icon-btn"
          onClick={() => setPaused(true)}
          disabled={countdown > 0}
        >
          Pause
        </Button>
      </div>

      {settingsSaveError && (
        <Alert variant="warning" className="py-2" dismissible onClose={() => setSettingsSaveError(false)}>
          Sound changed for this race, but browser storage could not save the setting.
        </Alert>
      )}

      {opponentGhostLoadError && (
        <Alert variant="warning" className="py-2">
          This race night started without player ghost replays: {opponentGhostLoadError}
        </Alert>
      )}

      {showTip && (
        <div className="wr-race-tip">
          <p>
            ←↑→↓ / WASD steer · Space drift · Esc pause · checkpoints in order · 3 laps
          </p>
          <button
            type="button"
            className="wr-race-tip-dismiss"
            onClick={() => setShowTip(false)}
            aria-label="Dismiss controls tip"
          >
            ×
          </button>
        </div>
      )}

      <div className="wr-race-stage">
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
            className={`wr-countdown wr-countdown--${countdown > 0 ? countdown : 'go'}`}
            key={countdown} // re-mounts so the pop animation replays each tick
            aria-live="assertive"
            aria-label={countdown > 0 ? `Countdown ${countdown}` : 'Go'}
          >
            <div className="wr-traffic-light" aria-hidden="true">
              <span className={`wr-traffic-lamp wr-traffic-lamp--red${countdown === 3 ? ' is-on' : ''}`} />
              <span className={`wr-traffic-lamp wr-traffic-lamp--yellow${countdown === 2 || countdown === 1 ? ' is-on' : ''}`} />
              <span className={`wr-traffic-lamp wr-traffic-lamp--green${showGo ? ' is-on' : ''}`} />
            </div>
            <span className="wr-countdown-label">
              {countdown > 0 ? countdown : 'GO!'}
            </span>
          </div>
        )}
      </div>

      <Modal show={paused} onHide={() => setPaused(false)} keyboard={false} centered>
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
