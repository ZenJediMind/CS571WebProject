import Container from 'react-bootstrap/Container'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import { Link } from 'react-router-dom'
import { useDraftCourse } from '../hooks/useDraftCourse'

export default function AppNavbar() {
  const startDraftCourse = useDraftCourse()

  return (
    <Navbar data-bs-theme="dark" expand="lg" className="wr-navbar">
      <Container>
        <Navbar.Brand as={Link} to="/">🏁 Wisconsin Racer</Navbar.Brand>
        <Navbar.Toggle aria-controls="main-nav" />
        <Navbar.Collapse id="main-nav">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/browse">Browse</Nav.Link>
            <Nav.Link as="button" type="button" onClick={startDraftCourse}>Build</Nav.Link>
            <Nav.Link as={Link} to="/car">Car</Nav.Link>
            <Nav.Link as={Link} to="/leaderboard">Leaderboard</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  )
}
