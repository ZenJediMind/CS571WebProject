import { useEffect, useState } from 'react'
import Container from 'react-bootstrap/Container'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import { Link } from 'react-router-dom'
import { useDraftCourse } from '../hooks/useDraftCourse'
import { ensureRacerSession } from '../services/authService'

export default function AppNavbar() {
  const startDraftCourse = useDraftCourse()
  const [racerName, setRacerName] = useState(null)

  useEffect(() => {
    let cancelled = false
    void ensureRacerSession()
      .then((racer) => {
        if (!cancelled) setRacerName(racer.displayName)
      })
      .catch(() => {
        if (!cancelled) setRacerName(null)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <Navbar data-bs-theme="dark" expand="lg" className="wr-navbar">
      <Container>
        <Navbar.Brand as={Link} to="/" className="wr-brand">
          <span className="wr-brand-marker" aria-hidden="true" />
          <span>Wisconsin Racer</span>
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="main-nav" />
        <Navbar.Collapse id="main-nav">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/browse">Browse</Nav.Link>
            <Nav.Link as="button" type="button" onClick={startDraftCourse}>Build</Nav.Link>
            <Nav.Link as={Link} to="/car">Car</Nav.Link>
            <Nav.Link as={Link} to="/leaderboard">Leaderboard</Nav.Link>
            <Nav.Link as={Link} to="/invite">Race Night</Nav.Link>
          </Nav>
          {racerName && <Navbar.Text className="small">Guest: {racerName}</Navbar.Text>}
        </Navbar.Collapse>
      </Container>
    </Navbar>
  )
}
