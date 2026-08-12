import Button from 'react-bootstrap/Button'
import Container from 'react-bootstrap/Container'
import { Link } from 'react-router-dom'
import CourseThumbnail from '../components/CourseThumbnail'
import { TEMPLATE_COURSES } from '../game/templates'
import { useDraftCourse } from '../hooks/useDraftCourse'

const HERO_COURSE = TEMPLATE_COURSES.find((c) => c.id === 'tpl-capitol-loop')
  ?? TEMPLATE_COURSES[0]
const HERO_CANVAS_WIDTH = 960

const SECONDARY_LINKS = [
  { label: 'Draw Car', to: '/car' },
  { label: 'Leaderboard', to: '/leaderboard' },
  { label: 'Race Night', to: '/invite' },
  { label: 'Settings', to: '/settings' },
]

export default function Home() {
  const startDraftCourse = useDraftCourse()

  return (
    <section className="wr-home-hero">
      <div className="wr-home-hero-art" aria-hidden="true">
        <CourseThumbnail course={HERO_COURSE} width={HERO_CANVAS_WIDTH} />
      </div>
      <div className="wr-home-hero-scrim" aria-hidden="true" />

      <Container className="wr-home-hero-content">
        <div className="wr-checker mb-4" aria-hidden="true" />
        <h1 className="wr-hero-title mb-1">Wisconsin Racer</h1>
        <p className="lead wr-home-hero-lead">
          Build a course, paint your ride, and race the clock with friends.
        </p>
        <div className="wr-home-cta">
          <Button as={Link} to="/browse" variant="primary" className="wr-menu-btn">
            Play
          </Button>
          <Button variant="outline-primary" className="wr-menu-btn" onClick={startDraftCourse}>
            Build Course
          </Button>
        </div>
        <nav className="wr-home-secondary" aria-label="More options">
          {SECONDARY_LINKS.map(({ label, to }) => (
            <Link key={label} to={to}>{label}</Link>
          ))}
        </nav>
        <div className="wr-checker" aria-hidden="true" />
      </Container>
    </section>
  )
}
