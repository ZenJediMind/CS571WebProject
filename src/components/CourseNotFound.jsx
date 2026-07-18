import Alert from 'react-bootstrap/Alert'
import Container from 'react-bootstrap/Container'
import { Link } from 'react-router-dom'

/** Full-page notice for a course id that no longer exists in storage. */
export default function CourseNotFound() {
  return (
    <Container className="py-4">
      <Alert variant="warning">
        Course not found. <Alert.Link as={Link} to="/browse">Back to Browse</Alert.Link>
      </Alert>
    </Container>
  )
}
