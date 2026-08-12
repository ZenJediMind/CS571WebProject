import { useCallback, useEffect, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Spinner from 'react-bootstrap/Spinner'
import { useNavigate } from 'react-router-dom'
import CourseCard from '../components/CourseCard'
import PageHeader from '../components/PageHeader'
import {
  copyCourse, deleteCourse, getCourseShareUrl, listCourses, voteForCourse,
} from '../services/courseService'

function errorMessage(error) {
  return error instanceof Error ? error.message : 'The shared course service is unavailable.'
}

export default function CourseBrowser() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [shareMessage, setShareMessage] = useState(null)
  const [votePendingId, setVotePendingId] = useState(null)

  const loadCourses = useCallback(async () => {
    setLoading(true)
    try {
      setCourses(await listCourses())
      setError(null)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadCourses() }, [loadCourses])

  const handleVote = async (courseId) => {
    setVotePendingId(courseId)
    try {
      const created = await voteForCourse(courseId)
      await loadCourses()
      setError(created ? null : 'Your guest racer has already voted for this course.')
    } catch (voteError) {
      setError(errorMessage(voteError))
    } finally {
      setVotePendingId(null)
    }
  }

  const handleCopy = async (courseId) => {
    try {
      const copy = await copyCourse(courseId)
      if (!copy) throw new Error('That course no longer exists.')
      navigate(`/build/${copy.id}`)
    } catch (copyError) {
      setError(errorMessage(copyError))
    }
  }

  const handleDelete = async (course) => {
    if (!window.confirm(`Delete "${course.name}"? This cannot be undone.`)) return
    try {
      await deleteCourse(course)
      await loadCourses()
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    }
  }

  const handleShare = async (course) => {
    const shareUrl = getCourseShareUrl(course.id)
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareMessage(`A playable link for "${course.name}" is copied to your clipboard.`)
    } catch {
      window.prompt(`Copy this playable link for "${course.name}":`, shareUrl)
      setShareMessage('Copy the link shown in the dialog to share this course.')
    }
  }

  return (
    <Container className="py-4">
      <PageHeader title="Courses" />
      <p className="text-secondary">
        Published community courses are visible and playable by everyone. Your private drafts appear only to you.
      </p>
      {shareMessage && (
        <Alert variant="success" dismissible onClose={() => setShareMessage(null)}>
          {shareMessage}
        </Alert>
      )}
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {loading ? (
        <div className="py-5 text-center" role="status" aria-live="polite">
          <Spinner animation="border" className="me-2" /> Loading shared courses…
        </div>
      ) : (
        <Row xs={1} sm={2} lg={3} className="g-3">
          {courses.map((course) => (
            <Col key={course.id}>
              <CourseCard
                course={course}
                onVote={handleVote}
                onCopy={handleCopy}
                onDelete={handleDelete}
                onShare={handleShare}
                votePending={votePendingId === course.id}
              />
            </Col>
          ))}
        </Row>
      )}
    </Container>
  )
}
