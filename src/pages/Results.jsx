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
import { formatMs, recordTimeOnce } from '../services/scoreService'

export default function Results() {
  const { courseId } = useParams()
  const location = useLocation()
  const { ms, resultId, ghostSaved } = location.state ?? {}
  const [course, setCourse] = useState(undefined)
  const [courseError, setCourseError] = useState(null)
  const [award, setAward] = useState(null)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const loadCourse = async () => {
      try {
        const loaded = await getCourse(courseId)
        if (!cancelled) setCourse(loaded)
      } catch (error) {
        if (!cancelled) setCourseError(error instanceof Error ? error.message : 'Could not load this course.')
      }
    }
    void loadCourse()
    return () => { cancelled = true }
  }, [courseId])

  useEffect(() => {
    if (!course || ms == null || !resultId) return undefined
    let cancelled = false
    setAward(null)
    setSaveError(null)
    void recordTimeOnce(resultId, courseId, course.revision, ms)
      .then((savedAward) => {
        if (!cancelled) setAward(savedAward)
      })
      .catch((error) => {
        if (!cancelled) setSaveError(
          error instanceof Error ? error.message : 'Could not save your shared race result.',
        )
      })
    return () => { cancelled = true }
  }, [course, courseId, ms, resultId])

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
                You beat {award.beatenRivals.map((rival) => rival.name).join(', ')}!
              </p>
            )}
          </div>

          <div className="d-grid gap-2">
            <Button as={Link} to={`/race/${courseId}`} variant="primary" className="wr-menu-btn">
              Race Again
            </Button>
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
