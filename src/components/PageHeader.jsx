import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Row from 'react-bootstrap/Row'
import { useNavigate } from 'react-router-dom'

/**
 * Shared page header: Back button, Bungee title, and the checkered
 * start/finish ribbon that brands every screen.
 */
export default function PageHeader({ title, backTo = '/', backLabel = 'Back', onBack, children }) {
  const navigate = useNavigate()
  const handleBack = onBack ?? (() => navigate(backTo))

  return (
    <header className="mb-4">
      <Row className="align-items-center g-2 mb-2">
        <Col xs="auto">
          <Button variant="outline-secondary" size="sm" onClick={handleBack}>
            ← {backLabel}
          </Button>
        </Col>
        <Col>
          <h1 className="h2 mb-0">{title}</h1>
        </Col>
        {children && <Col xs="auto">{children}</Col>}
      </Row>
      <div className="wr-checker" aria-hidden="true" />
    </header>
  )
}
