import { useEffect, useState } from 'react'
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
    if (copy) navigate(`/build/${copy.id}`)
  }

  const handleDelete = (course) => {
    if (window.confirm(`Delete "${course.name}"? This can't be undone.`)) {
      deleteCourse(course.id)
      setCourses(listCourses())
    }
  }

  return (
    <Container className="py-4">
      <PageHeader title="Community Courses" />
      <p className="text-secondary">
        Vote for your favorites, race them, or copy one as a starting point for your own track.
      </p>
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
