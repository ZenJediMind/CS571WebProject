import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import InputGroup from 'react-bootstrap/InputGroup'
import ListGroup from 'react-bootstrap/ListGroup'
import Row from 'react-bootstrap/Row'
import Spinner from 'react-bootstrap/Spinner'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { validateCourse } from '../game/courseModel'
import { formatMs } from '../services/scoreService'
import { listCourses } from '../services/courseService'
import {
  clearActiveRaceLobby,
  createRaceLobby,
  endRaceLobby,
  getActiveRaceLobbyId,
  getInviteShareUrl,
  getRaceLobby,
  joinRaceLobby,
  leaveRaceLobby,
  normalizeInviteCode,
  selectRaceLobbyCourse,
  startRaceLobby,
} from '../services/inviteService'

const POLL_INTERVAL_MS = 4_000

function memberStatus(member) {
  const state = member.status === 'finished'
    ? `finished ${formatMs(member.finishMs)}`
    : member.status === 'waiting' ? 'ready' : 'racing'
  return member.isHost ? `host · ${state}` : state
}

function lobbyErrorMessage(error) {
  return error instanceof Error ? error.message : 'The race lobby request failed. Please try again.'
}

export default function Invite() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedCode = searchParams.get('join')
  const [lobby, setLobby] = useState(null)
  const [inviteCode, setInviteCode] = useState('')
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [initializing, setInitializing] = useState(true)
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [copied, setCopied] = useState('')

  const refreshLobby = useCallback(async (lobbyId, reportError = true) => {
    try {
      const nextLobby = await getRaceLobby(lobbyId)
      setLobby(nextLobby)
      return nextLobby
    } catch (refreshError) {
      if (reportError) setError(lobbyErrorMessage(refreshError))
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const initialize = async () => {
      setInitializing(true)
      setError(null)
      try {
        let nextLobby = null
        if (requestedCode !== null) {
          nextLobby = await joinRaceLobby(requestedCode)
          navigate('/invite', { replace: true })
        } else {
          const activeLobbyId = getActiveRaceLobbyId()
          if (activeLobbyId) nextLobby = await getRaceLobby(activeLobbyId)
        }
        if (!cancelled) setLobby(nextLobby)
      } catch (initializeError) {
        if (!cancelled) {
          clearActiveRaceLobby()
          setLobby(null)
          setError(lobbyErrorMessage(initializeError))
        }
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }
    void initialize()
    return () => { cancelled = true }
  }, [navigate, requestedCode])

  useEffect(() => {
    if (!lobby?.id || lobby.status === 'ended') return undefined
    const timer = setInterval(() => { void refreshLobby(lobby.id, false) }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [lobby?.id, lobby?.status, refreshLobby])

  useEffect(() => {
    setSelectedCourseId(lobby?.course?.id ?? '')
  }, [lobby?.course?.id, lobby?.id])

  useEffect(() => {
    if (!lobby?.isHost || lobby.status !== 'open') return undefined
    let cancelled = false
    setCoursesLoading(true)
    void listCourses()
      .then((loadedCourses) => {
        if (!cancelled) setCourses(loadedCourses.filter((course) => validateCourse(course.grid).ok))
      })
      .catch((loadError) => {
        if (!cancelled) setError(lobbyErrorMessage(loadError))
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false)
      })
    return () => { cancelled = true }
  }, [lobby?.id, lobby?.isHost, lobby?.status])

  const shareUrl = useMemo(() => {
    try {
      return lobby ? getInviteShareUrl(lobby.code) : ''
    } catch {
      return ''
    }
  }, [lobby])
  const playerMember = lobby?.members.find((member) => member.isYou)
  const raceableCourse = lobby?.course && validateCourse(lobby.course.grid).ok
  const canStart = Boolean(
    lobby?.isHost && lobby.status === 'open' && raceableCourse && lobby.members.length >= 2,
  )

  const runLobbyAction = async (actionName, operation) => {
    setBusyAction(actionName)
    setError(null)
    setNotice(null)
    try {
      const nextLobby = await operation()
      if (nextLobby) setLobby(nextLobby)
      return nextLobby
    } catch (actionError) {
      setError(lobbyErrorMessage(actionError))
      return null
    } finally {
      setBusyAction('')
    }
  }

  const handleJoin = async (event) => {
    event.preventDefault()
    const normalizedCode = normalizeInviteCode(inviteCode)
    if (!normalizedCode) {
      setError('Enter the six-character code your friend shared, such as ABC-234.')
      return
    }
    const joinedLobby = await runLobbyAction('join', () => joinRaceLobby(normalizedCode))
    if (joinedLobby) {
      setInviteCode('')
      setNotice(`Joined ${joinedLobby.code}. Waiting for the host to choose a course.`)
    }
  }

  const handleCopy = async (value, target) => {
    if (!value || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(target)
      setTimeout(() => setCopied(''), 2_000)
    } catch {
      setError('Clipboard access was unavailable. You can still select and copy the invite manually.')
    }
  }

  if (initializing) {
    return (
      <Container className="py-5 text-center" role="status" aria-live="polite">
        <Spinner animation="border" className="me-2" /> Opening race nightâ€¦
      </Container>
    )
  }

  return (
    <Container className="py-4">
      <PageHeader title="Race Night" />
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
          {notice && <Alert variant="success" dismissible onClose={() => setNotice(null)}>{notice}</Alert>}

          {!lobby ? (
            <>
              <p className="text-secondary">
                Start a shared time-trial lobby or enter a friend&apos;s six-character code. Everyone in the
                lobby races the same locked-in course, then sees the group&apos;s finish times.
              </p>
              <div className="wr-lobby-panel mb-3">
                <h2 className="h5">Host a race night</h2>
                <p className="small text-secondary">Create a code, choose a public course, then invite at least one friend.</p>
                <Button
                  variant="primary"
                  className="w-100"
                  disabled={busyAction === 'host'}
                  onClick={() => void runLobbyAction('host', createRaceLobby)}
                >
                  {busyAction === 'host' ? 'Creatingâ€¦' : 'Host a Race Night'}
                </Button>
              </div>

              <div className="wr-lobby-panel">
                <h2 className="h5">Join a friend</h2>
                <p className="small text-secondary">Open a shared invite link, or enter the code your friend sent.</p>
                <Form onSubmit={handleJoin}>
                  <Form.Label htmlFor="join-code">Race code</Form.Label>
                  <InputGroup>
                    <Form.Control
                      id="join-code"
                      value={inviteCode}
                      onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                      placeholder="ABC-234"
                      autoComplete="off"
                      maxLength={7}
                      className="wr-mono text-center"
                    />
                    <Button type="submit" variant="primary" disabled={busyAction === 'join'}>
                      {busyAction === 'join' ? 'Joiningâ€¦' : 'Join Race'}
                    </Button>
                  </InputGroup>
                </Form>
              </div>
            </>
          ) : (
            <>
              {lobby.status === 'ended' && (
                <Alert variant="secondary">This race night has ended. Its final times remain below.</Alert>
              )}
              <div className="wr-lobby-panel mb-3">
                <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
                  <div>
                    <div className="wr-panel-label">Race code</div>
                    <div className="wr-mono fs-3 wr-lobby-code">{lobby.code}</div>
                  </div>
                  <Badge bg={lobby.status === 'racing' ? 'success' : 'secondary'}>
                    {lobby.status === 'open' ? 'Lobby open' : lobby.status}
                  </Badge>
                </div>
                <Form.Label htmlFor="share-link" className="small">Share this link so a friend joins this lobby directly:</Form.Label>
                <InputGroup>
                  <Form.Control id="share-link" value={shareUrl} readOnly className="small" />
                  <Button variant={copied === 'link' ? 'success' : 'outline-primary'} onClick={() => void handleCopy(shareUrl, 'link')}>
                    {copied === 'link' ? 'Copied!' : 'Copy link'}
                  </Button>
                </InputGroup>
                <Button
                  variant={copied === 'code' ? 'success' : 'link'}
                  className="px-0 mt-2"
                  onClick={() => void handleCopy(lobby.code, 'code')}
                >
                  {copied === 'code' ? 'Code copied!' : 'Copy code only'}
                </Button>
              </div>

              <div className="wr-lobby-panel wr-lobby-list mb-3">
                <div className="wr-panel-label mb-2">Racers ({lobby.members.length})</div>
                <ListGroup variant="flush">
                  {lobby.members.map((member) => (
                    <ListGroup.Item key={`${member.name}-${member.isYou}`} className="d-flex justify-content-between px-0">
                      <span>{member.name}{member.isYou ? ' (You)' : ''}</span>
                      <Badge bg={member.status === 'finished' ? 'success' : 'secondary'}>
                        {memberStatus(member)}
                      </Badge>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </div>

              {lobby.status === 'open' && lobby.isHost && (
                <div className="wr-lobby-panel mb-3">
                  <h2 className="h5">Choose the shared course</h2>
                  <p className="small text-secondary">The track is snapshotted when selected so every racer receives the same layout.</p>
                  {coursesLoading ? (
                    <div role="status"><Spinner animation="border" size="sm" className="me-2" /> Loading public coursesâ€¦</div>
                  ) : (
                    <InputGroup>
                      <Form.Select
                        aria-label="Race night course"
                        value={selectedCourseId}
                        onChange={(event) => setSelectedCourseId(event.target.value)}
                      >
                        <option value="">Choose a raceable public course</option>
                        {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                      </Form.Select>
                      <Button
                        variant="outline-primary"
                        disabled={!selectedCourseId || busyAction === 'course' || selectedCourseId === lobby.course?.id}
                        onClick={() => void runLobbyAction('course', () => selectRaceLobbyCourse(lobby.id, selectedCourseId))}
                      >
                        {busyAction === 'course' ? 'Savingâ€¦' : 'Choose'}
                      </Button>
                    </InputGroup>
                  )}
                </div>
              )}

              {lobby.course && (
                <Alert variant={raceableCourse ? 'info' : 'danger'}>
                  <strong>{lobby.course.name}</strong>{' '}
                  {raceableCourse ? 'is the shared race-night course.' : 'is no longer a valid race course.'}
                </Alert>
              )}

              {lobby.status === 'open' && !lobby.isHost && (
                <Alert variant="info">
                  Waiting for the host to choose a course and start the race. This lobby refreshes automatically.
                </Alert>
              )}

              {lobby.status === 'racing' && lobby.course && (
                <div className="d-grid mb-3">
                  {playerMember?.status === 'finished' ? (
                    <Alert variant="success" className="mb-0">Your finish time is locked in. Nice run!</Alert>
                  ) : (
                    <Button as={Link} to={`/race/${lobby.course.id}?lobby=${lobby.id}`} variant="success" className="wr-menu-btn">
                      Race {lobby.course.name}
                    </Button>
                  )}
                </div>
              )}

              <div className="d-grid gap-2">
                {lobby.status === 'open' && lobby.isHost && (
                  <Button
                    variant="primary"
                    className="wr-menu-btn"
                    disabled={!canStart || busyAction === 'start'}
                    onClick={() => void runLobbyAction('start', () => startRaceLobby(lobby.id))}
                  >
                    {busyAction === 'start' ? 'Startingâ€¦' : 'Start Race'}
                  </Button>
                )}
                {lobby.status !== 'ended' && lobby.isHost && (
                  <Button
                    variant="outline-danger"
                    disabled={busyAction === 'end'}
                    onClick={() => void runLobbyAction('end', () => endRaceLobby(lobby.id))}
                  >
                    {busyAction === 'end' ? 'Endingâ€¦' : 'End Race Night'}
                  </Button>
                )}
                <Button
                  variant="outline-danger"
                  disabled={busyAction === 'leave'}
                  onClick={() => void runLobbyAction('leave', async () => {
                    await leaveRaceLobby(lobby.id)
                    setLobby(null)
                    setNotice('You left the race lobby.')
                    return null
                  })}
                >
                  {busyAction === 'leave' ? 'Leavingâ€¦' : 'Leave Race Night'}
                </Button>
                <Button as={Link} to="/" variant="outline-secondary">Back to Main Menu</Button>
              </div>
              {lobby.status === 'open' && lobby.isHost && lobby.members.length < 2 && (
                <p className="text-secondary small text-center mt-2 mb-0">Invite at least one friend before starting.</p>
              )}
            </>
          )}
        </Col>
      </Row>
    </Container>
  )
}
