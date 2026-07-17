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
  const [copyError, setCopyError] = useState(null)

  useEffect(() => {
    setCourses(listCourses())
  }, [])

  // localStorage writes never re-render — re-read into state after voting
  const handleVote = (courseId) => {
    voteForCourse(courseId)
    setCourses(listCourses())
  }

  const handleCopy = (courseId) => {
    const copy = copyCourse(courseId)
    if (!copy) {
      setCopyError('Could not copy this course. Browser storage may be full or unavailable.')
      return
    }
    setCopyError(null)
    navigate(`/build/${copy.id}`)
  }

  const handleDelete = (course) => {
    if (window.confirm(`Delete "${course.name}"? This can't be undone.`)) {
      deleteCourse(course.id)
      setCourses(listCourses())
    }
  }

  return (
    <Container className="py-4">
      <PageHeader title="Courses" />
      <p className="text-secondary">
        Browse built-in and locally saved courses. Votes and edits stay on this device.
      </p>
      {copyError && (
        <Alert variant="danger" dismissible onClose={() => setCopyError(null)}>
          {copyError}
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
