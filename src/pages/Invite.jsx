import { useEffect, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import InputGroup from 'react-bootstrap/InputGroup'
import Form from 'react-bootstrap/Form'
import ListGroup from 'react-bootstrap/ListGroup'
import Row from 'react-bootstrap/Row'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { getInviteCode, getJoinedFriends } from '../services/inviteService'

const STATUS_VARIANTS = { host: 'primary', ready: 'success' }

export default function Invite() {
  const [inviteCode, setInviteCode] = useState('')
  const [friends, setFriends] = useState([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setInviteCode(getInviteCode())
    setFriends(getJoinedFriends())
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (permissions) — the code is still visible to copy by hand
    }
  }

  return (
    <Container className="py-4">
      <PageHeader title="Invite Friends" />
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Alert variant="info">
            Demo lobby: invite codes and joined friends are simulated on this device.
          </Alert>
          <Card className="mb-3">
            <Card.Body>
              <Form.Label htmlFor="invite-code">
                Share this code so friends can join your race night:
              </Form.Label>
              <InputGroup>
                <Form.Control
                  id="invite-code"
                  value={inviteCode}
                  readOnly
                  className="wr-mono fs-4 text-center"
                />
                <Button variant={copied ? 'success' : 'primary'} onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </InputGroup>
            </Card.Body>
          </Card>

          <Card className="mb-3">
            <Card.Header>Friends joined</Card.Header>
            <ListGroup variant="flush">
              {friends.map((friend) => (
                <ListGroup.Item key={friend.id} className="d-flex justify-content-between">
                  {friend.name}
                  <Badge bg={STATUS_VARIANTS[friend.status] ?? 'secondary'}>
                    {friend.status}
                  </Badge>
                </ListGroup.Item>
              ))}
            </ListGroup>
            <Card.Footer className="text-secondary small">
              Waiting for more racers to join…
            </Card.Footer>
          </Card>

          <div className="d-grid gap-2">
            <Button as={Link} to="/browse" variant="primary" className="wr-menu-btn">
              Start Race
            </Button>
            <Button as={Link} to="/" variant="outline-secondary">
              Back to Main Menu
            </Button>
          </div>
        </Col>
      </Row>
    </Container>
  )
}
