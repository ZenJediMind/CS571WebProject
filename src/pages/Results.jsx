import { useEffect, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Spinner from 'react-bootstrap/Spinner'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { getCourse } from '../services/courseService'
import { saveSharedGhostIfFaster } from '../services/ghostService'
import { getRaceLobby, recordRaceLobbyFinish } from '../services/inviteService'
import { formatMs, recordTimeOnce } from '../services/scoreService'

export default function Results() {
  const { courseId } = useParams()
  const location = useLocation()
  const {
    ms, resultId, ghostSaved, recording,
  } = location.state ?? {}
  const lobbyId = typeof location.state?.lobbyId === 'string' ? location.state.lobbyId : null
  const [course, setCourse] = useState(undefined)
  const [courseError, setCourseError] = useState(null)
  const [award, setAward] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [sharedGhostSaveError, setSharedGhostSaveError] = useState(null)
  const [sharedGhostSaved, setSharedGhostSaved] = useState(null)
  const [lobbySaveError, setLobbySaveError] = useState(null)
  const [lobbyFinishSaved, setLobbyFinishSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadCourse = async () => {
      try {
        let loaded
        if (lobbyId) {
          const lobby = await getRaceLobby(lobbyId)
          if (!lobby.course || lobby.course.id !== courseId) {
            throw new Error('This result does not match the race lobby\'s selected course.')
          }
          loaded = lobby.course
        } else {
          loaded = await getCourse(courseId)
        }
        if (!cancelled) setCourse(loaded)
      } catch (error) {
        if (!cancelled) setCourseError(error instanceof Error ? error.message : 'Could not load this course.')
      }
    }
    void loadCourse()
    return () => { cancelled = true }
  }, [courseId, lobbyId])

  useEffect(() => {
    if (!course || ms == null || !resultId) return undefined
    let cancelled = false
    setAward(null)
    setSaveError(null)
    setSharedGhostSaveError(null)
    setSharedGhostSaved(null)
    setLobbySaveError(null)
    setLobbyFinishSaved(false)
    const writes = [
      recordTimeOnce(resultId, courseId, course.revision, ms, recording, lobbyId),
      saveSharedGhostIfFaster(courseId, course.revision, recording),
    ]
    if (lobbyId) writes.push(recordRaceLobbyFinish(lobbyId, Math.round(ms)))
    void Promise.allSettled(writes).then((outcomes) => {
      if (cancelled) return
      const scoreOutcome = outcomes[0]
      if (scoreOutcome.status === 'fulfilled') {
        setAward(scoreOutcome.value)
      } else {
        setSaveError(
          scoreOutcome.reason instanceof Error
            ? scoreOutcome.reason.message
            : 'Could not save your shared race result.',
        )
      }
      const sharedGhostOutcome = outcomes[1]
      if (sharedGhostOutcome.status === 'fulfilled') {
        setSharedGhostSaved(sharedGhostOutcome.value)
      } else {
        setSharedGhostSaveError(
          sharedGhostOutcome.reason instanceof Error
            ? sharedGhostOutcome.reason.message
            : 'Could not save your shared ghost replay.',
        )
      }
      if (lobbyId) {
        const lobbyOutcome = outcomes[2]
        if (lobbyOutcome.status === 'fulfilled') {
          setLobbyFinishSaved(true)
        } else {
          setLobbySaveError(
            lobbyOutcome.reason instanceof Error
              ? lobbyOutcome.reason.message
              : 'Could not share your finish time with the race lobby.',
          )
        }
      }
    })
    return () => { cancelled = true }
  }, [course, courseId, lobbyId, ms, recording, resultId])

  // Deep-linked here without a finished race - nothing to show.
  if (ms == null || !resultId) return <Navigate to="/browse" replace />
  if (course === undefined && !courseError) {
    return (
      <Container className="py-5 text-center" role="status" aria-live="polite">
        <Spinner animation="border" className="me-2" /> Loading race result…
      </Container>
    )
  }
  if (courseError) {
    return (
      <Container className="py-4">
        <Alert variant="danger">{courseError}</Alert>
      </Container>
    )
  }
  if (!course) return <Navigate to="/browse" replace />

  const bestMs = award?.newBest ? ms : award?.previousBest
  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <div className="wr-checker mb-3" aria-hidden="true" />
          <h1 className="wr-hero-title text-center mb-1">Finish!</h1>
          <p className="lead text-center mb-4">{course.name}</p>

          {ghostSaved === false && (
            <Alert variant="warning" className="py-2">
              Your result is shared, but this device could not store its local ghost replay.
            </Alert>
          )}
          {!award && !saveError && (
            <Alert variant="info" className="py-2" role="status">
              <Spinner animation="border" size="sm" className="me-2" /> Saving your shared result…
            </Alert>
          )}
          {saveError && (
            <Alert variant="danger" className="py-2">
              Your race finished, but the shared result was not saved: {saveError}
            </Alert>
          )}
          {sharedGhostSaved === null && !sharedGhostSaveError && (
            <Alert variant="info" className="py-2" role="status">
              <Spinner animation="border" size="sm" className="me-2" /> Saving your shared ghost replayâ€¦
            </Alert>
          )}
          {sharedGhostSaved && (
            <Alert variant="success" className="py-2">
              Your fastest shared ghost is ready for future Race Night opponents.
            </Alert>
          )}
          {sharedGhostSaved === false && (
            <Alert variant="secondary" className="py-2">
              Your existing shared ghost for this course is already faster.
            </Alert>
          )}
          {sharedGhostSaveError && (
            <Alert variant="warning" className="py-2">
              Your score may be saved, but your shared ghost replay was not: {sharedGhostSaveError}
            </Alert>
          )}
          {lobbyId && !lobbyFinishSaved && !lobbySaveError && (
            <Alert variant="info" className="py-2" role="status">
              <Spinner animation="border" size="sm" className="me-2" /> Sharing your finish with the race lobbyâ€¦
            </Alert>
          )}
          {lobbyFinishSaved && (
            <Alert variant="success" className="py-2">
              Your finish time is now visible to everyone in this race night.
            </Alert>
          )}
          {lobbySaveError && (
            <Alert variant="warning" className="py-2">
              Your shared score may be saved, but the race lobby could not receive this finish: {lobbySaveError}
            </Alert>
          )}
          {award?.alreadyRecorded && (
            <Alert variant="secondary" className="py-2">
              This result was already saved, so it was not counted twice.
            </Alert>
          )}

          <div className="wr-results-panel">
            <Row className="text-center gy-3">
              <Col sm={4}>
                <div className="wr-stat-label">Your Time</div>
                <div className="wr-mono fs-3">{formatMs(ms)}</div>
              </Col>
              <Col sm={4}>
                <div className="wr-stat-label">Best Time</div>
                <div className="wr-mono fs-3">
                  {bestMs != null ? formatMs(bestMs) : '—'}
                  {award?.newBest && <Badge bg="success" className="ms-2 align-middle">New!</Badge>}
                </div>
              </Col>
              <Col sm={4}>
                <div className="wr-stat-label">Points Earned</div>
                <div className="wr-mono fs-3">+{award?.pointsEarned ?? 0}</div>
              </Col>
            </Row>
            {award?.beatenRivals?.length > 0 && (
              <p className="text-center mt-3 mb-0">
                You beat simulated rivals: {award.beatenRivals.map((rival) => rival.name).join(', ')}!
              </p>
            )}
            {award?.beatenPlayers?.length > 0 && (
              <p className="text-center mt-2 mb-0">
                You beat {award.beatenPlayers.map((player) => `${player.name}'s ghost`).join(', ')}!
              </p>
            )}
          </div>

          <div className="d-grid gap-2">
            {lobbyId ? (
              <Button as={Link} to="/invite" variant="primary" className="wr-menu-btn">
                Return to Race Night
              </Button>
            ) : (
              <Button as={Link} to={`/race/${courseId}`} variant="primary" className="wr-menu-btn">
                Race Again
              </Button>
            )}
            <Button
              as={Link}
              to="/leaderboard"
              state={{ courseId }}
              variant="outline-primary"
              className="wr-menu-btn"
            >
              View Leaderboard
            </Button>
            <Button as={Link} to="/" variant="outline-secondary" className="wr-menu-btn">
              Main Menu
            </Button>
          </div>
        </Col>
      </Row>
    </Container>
  )
}
