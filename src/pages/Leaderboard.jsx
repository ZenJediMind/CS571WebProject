import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import Spinner from 'react-bootstrap/Spinner'
import Tab from 'react-bootstrap/Tab'
import Table from 'react-bootstrap/Table'
import Tabs from 'react-bootstrap/Tabs'
import { useLocation } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { ensureRacerSession } from '../services/authService'
import { listCourses } from '../services/courseService'
import { formatMs, getCourseLeaderboard, getPointsRanking } from '../services/scoreService'

/** Pit-board ranking table: position, racer, car, and one value column. */
function RankingTable({ rows, valueHeader, valueOf }) {
  return (
    <Table striped hover responsive className="wr-board-table mb-0">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Racer</th>
          <th scope="col">Car</th>
          <th scope="col">{valueHeader}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id} className={row.isPlayer ? 'wr-row-you' : undefined}>
            <td className="wr-mono">{index + 1}</td>
            <td>{row.name}{row.isPlayer && ' ★'}</td>
            <td>{row.car}</td>
            <td className="wr-mono">{valueOf(row)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

function errorMessage(error) {
  return error instanceof Error ? error.message : 'The shared leaderboard is unavailable.'
}

export default function Leaderboard() {
  const location = useLocation()
  const requestedCourseId = location.state?.courseId
  const [courses, setCourses] = useState([])
  const [racer, setRacer] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [times, setTimes] = useState([])
  const [ranking, setRanking] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingTimes, setLoadingTimes] = useState(false)
  const [error, setError] = useState(null)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const [loadedCourses, loadedRacer] = await Promise.all([listCourses(), ensureRacerSession()])
      setCourses(loadedCourses)
      setRacer(loadedRacer)
      setSelectedCourseId((current) => {
        const requested = loadedCourses.find((course) => course.id === requestedCourseId)?.id
        return requested || current || loadedCourses[0]?.id || ''
      })
      setError(null)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [requestedCourseId])

  useEffect(() => { void loadCatalog() }, [loadCatalog])

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  )

  useEffect(() => {
    if (!selectedCourse || !racer) return undefined
    let cancelled = false
    setLoadingTimes(true)
    void getCourseLeaderboard(selectedCourse.id, selectedCourse.revision, racer.displayName)
      .then((loadedTimes) => {
        if (!cancelled) {
          setTimes(loadedTimes)
          setError(null)
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoadingTimes(false)
      })
    return () => { cancelled = true }
  }, [selectedCourse, racer])

  useEffect(() => {
    if (!racer) return undefined
    let cancelled = false
    void getPointsRanking(racer.displayName)
      .then((loadedRanking) => {
        if (!cancelled) setRanking(loadedRanking)
      })
      .catch((loadError) => {
        if (!cancelled) setError(errorMessage(loadError))
      })
    return () => { cancelled = true }
  }, [racer])

  return (
    <Container className="py-4 wr-board">
      <PageHeader title="Leaderboard" />
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {loading ? (
        <div className="py-5 text-center" role="status" aria-live="polite">
          <Spinner animation="border" className="me-2" /> Loading shared leaderboard…
        </div>
      ) : (
        <Tabs defaultActiveKey="times" className="mb-3">
          <Tab eventKey="times" title="Fastest Times">
            <Form.Group className="mb-3" style={{ maxWidth: '20rem' }}>
              <Form.Label htmlFor="leaderboard-course">Course</Form.Label>
              <Form.Select
                id="leaderboard-course"
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
            {loadingTimes ? (
              <p role="status"><Spinner animation="border" size="sm" className="me-2" /> Loading times…</p>
            ) : (
              <RankingTable rows={times} valueHeader="Time" valueOf={(row) => formatMs(row.ms)} />
            )}
            {!loadingTimes && !times.some((row) => row.isPlayer) && (
              <p className="text-secondary mt-3">
                Finish a race on this course to put your guest racer on the board.
              </p>
            )}
          </Tab>
          <Tab eventKey="points" title="Overall Points">
            <RankingTable rows={ranking} valueHeader="Points" valueOf={(row) => row.points} />
            <p className="text-secondary mt-3">
              Earn +10 points for every simulated rival you out-race and +5 for a new personal best.
            </p>
          </Tab>
        </Tabs>
      )}
    </Container>
  )
}
