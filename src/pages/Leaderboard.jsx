import { useEffect, useMemo, useState } from 'react'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import Tab from 'react-bootstrap/Tab'
import Table from 'react-bootstrap/Table'
import Tabs from 'react-bootstrap/Tabs'
import PageHeader from '../components/PageHeader'
import { listCourses } from '../services/courseService'
import { formatMs, getCourseLeaderboard, getPointsRanking } from '../services/scoreService'

export default function Leaderboard() {
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')

  useEffect(() => {
    const loaded = listCourses()
    setCourses(loaded)
    setSelectedCourseId((current) => current || loaded[0]?.id || '')
  }, [])

  // Leaderboards are derived on render — never mirrored into extra state
  const times = useMemo(
    () => (selectedCourseId ? getCourseLeaderboard(selectedCourseId) : []),
    [selectedCourseId],
  )
  const ranking = useMemo(() => getPointsRanking(), [])

  return (
    <Container className="py-4">
      <PageHeader title="Leaderboard" />
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
          <Table striped hover responsive>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Racer</th>
                <th scope="col">Car</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {times.map((row, index) => (
                <tr key={row.id} className={row.isPlayer ? 'wr-row-you' : undefined}>
                  <td>{index + 1}</td>
                  <td>{row.name}{row.isPlayer && ' ★'}</td>
                  <td>{row.car}</td>
                  <td className="wr-mono">{formatMs(row.ms)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!times.some((row) => row.isPlayer) && (
            <p className="text-secondary">
              Finish a race on this course to put yourself on the board!
            </p>
          )}
        </Tab>
        <Tab eventKey="points" title="Overall Points">
          <Table striped hover responsive>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Racer</th>
                <th scope="col">Car</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row, index) => (
                <tr key={row.id} className={row.isPlayer ? 'wr-row-you' : undefined}>
                  <td>{index + 1}</td>
                  <td>{row.name}{row.isPlayer && ' ★'}</td>
                  <td>{row.car}</td>
                  <td className="wr-mono">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-secondary">
            Earn +10 points for every rival you out-race and +5 for a new personal best.
          </p>
        </Tab>
      </Tabs>
    </Container>
  )
}
