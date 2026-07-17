import { useEffect, useMemo, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { getCourse } from '../services/courseService'
import { formatMs, recordTimeOnce } from '../services/scoreService'

export default function Results() {
  const { courseId } = useParams()
  const location = useLocation()
  const course = useMemo(() => getCourse(courseId), [courseId])

  const { ms, resultId, award: passedAward, ghostSaved } = location.state ?? {}
  const [award, setAward] = useState(passedAward ?? null)

  // Prefer award from race navigation; only record when that payload is missing.
  useEffect(() => {
    if (ms == null || !resultId) return
    if (passedAward != null) {
      setAward(passedAward)
      return
    }
    setAward(recordTimeOnce(resultId, courseId, ms))
  }, [ms, resultId, courseId, passedAward])

  // Deep-linked here without a finished race — nothing to show
  if (ms == null || !resultId || !course) return <Navigate to="/browse" replace />

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
              Your personal best was saved, but the ghost replay could not be stored
              (browser storage may be full or blocked).
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
            <Button as={Link} to="/leaderboard" variant="outline-primary" className="wr-menu-btn">
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
