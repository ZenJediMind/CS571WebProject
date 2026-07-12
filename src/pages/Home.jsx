import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import { Link } from 'react-router-dom'
import { useDraftCourse } from '../hooks/useDraftCourse'

const SECONDARY_LINKS = [
  { label: 'Draw Car', to: '/car' },
  { label: 'Browse Courses', to: '/browse' },
  { label: 'Leaderboard', to: '/leaderboard' },
  { label: 'Invite Friends', to: '/invite' },
]

export default function Home() {
  const startDraftCourse = useDraftCourse()

  return (
    <Container className="py-5">
      <Row className="justify-content-center text-center">
        <Col md={8} lg={6}>
          <div className="wr-checker mb-4" aria-hidden="true" />
          <h1 className="wr-hero-title mb-1">Wisconsin Racer</h1>
          <p className="lead mb-4">
            Build a course, paint your ride, and race the clock.
          </p>
          <div className="d-grid gap-2 mb-4">
            <Button as={Link} to="/browse" variant="primary" className="wr-menu-btn">
              Play
            </Button>
            <Button variant="outline-primary" className="wr-menu-btn" onClick={startDraftCourse}>
              Build Course
            </Button>
            {SECONDARY_LINKS.map(({ label, to }) => (
              <Button key={label} as={Link} to={to} variant="outline-primary" className="wr-menu-btn">
                {label}
              </Button>
            ))}
          </div>
          <div className="wr-checker" aria-hidden="true" />
        </Col>
      </Row>
    </Container>
  )
}
