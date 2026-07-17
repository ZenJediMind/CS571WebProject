import { useEffect, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import { useNavigate } from 'react-router-dom'
import CourseCard from '../components/CourseCard'
import PageHeader from '../components/PageHeader'
import { copyCourse, deleteCourse, listCourses, voteForCourse } from '../services/courseService'

export default function CourseBrowser() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    setCourses(listCourses())
  }, [])

  // localStorage writes never re-render — re-read into state after voting
  const handleVote = (courseId) => {
    if (!voteForCourse(courseId)) {
      setError('Could not save your vote. Browser storage may be full or unavailable.')
      return
    }
    setError(null)
    setCourses(listCourses())
  }

  const handleCopy = (courseId) => {
    const copy = copyCourse(courseId)
    if (!copy) {
      setError('Could not copy this course. Browser storage may be full or unavailable.')
      return
    }
    setError(null)
    navigate(`/build/${copy.id}`)
  }

  const handleDelete = (course) => {
    if (!window.confirm(`Delete "${course.name}"? This can't be undone.`)) return
    if (!deleteCourse(course.id)) {
      setError('Could not delete this course. Browser storage may be full or unavailable.')
      return
    }
    setError(null)
    setCourses(listCourses())
  }

  return (
    <Container className="py-4">
      <PageHeader title="Courses" />
      <p className="text-secondary">
        Browse built-in and locally saved courses. Votes and edits stay on this device.
      </p>
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Row xs={1} sm={2} lg={3} className="g-3">
        {courses.map((course) => (
          <Col key={course.id}>
            <CourseCard
              course={course}
              onVote={handleVote}
              onCopy={handleCopy}
              onDelete={handleDelete}
            />
          </Col>
        ))}
      </Row>
    </Container>
  )
}
