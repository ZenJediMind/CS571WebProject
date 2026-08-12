import { useEffect, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import InputGroup from 'react-bootstrap/InputGroup'
import Form from 'react-bootstrap/Form'
import ListGroup from 'react-bootstrap/ListGroup'
import Row from 'react-bootstrap/Row'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { getInviteCode, getJoinedFriends } from '../services/inviteService'

const STATUS_CLASS = { host: 'wr-status-host', ready: 'wr-status-ready' }

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
          <Alert variant="warning" className="border-0">
            Demo lobby: invite codes and joined friends are simulated on this device.
          </Alert>
          <div className="wr-lobby-panel">
            <Form.Label htmlFor="invite-code">
              Share this code so friends can join your race night:
            </Form.Label>
            <InputGroup>
              <Form.Control
                id="invite-code"
                value={inviteCode}
                readOnly
                className="wr-mono fs-4 text-center wr-lobby-code"
              />
              <Button variant={copied ? 'success' : 'primary'} onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </InputGroup>
          </div>

          <div className="wr-lobby-panel wr-lobby-list">
            <div className="wr-panel-label mb-2">Friends joined</div>
            <ListGroup variant="flush">
              {friends.map((friend) => (
                <ListGroup.Item key={friend.id} className="d-flex justify-content-between px-0">
                  {friend.name}
                  <Badge bg="secondary" className={STATUS_CLASS[friend.status] ?? ''}>
                    {friend.status}
                  </Badge>
                </ListGroup.Item>
              ))}
            </ListGroup>
            <p className="text-secondary small mb-0 mt-2">
              Waiting for more racers to join…
            </p>
          </div>

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
