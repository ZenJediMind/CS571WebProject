import { useEffect, useRef } from 'react'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import { useNavigate } from 'react-router-dom'
import { drawCourseThumbnail } from '../game/render'

const THUMBNAIL_WIDTH = 320

/**
 * One community course: live-drawn thumbnail, votes, Play, and
 * Copy & Edit (templates) or Edit / Delete (your own courses).
 */
export default function CourseCard({ course, onVote, onCopy, onDelete }) {
  const navigate = useNavigate()
  const canvasRef = useRef(null)

  useEffect(() => {
    drawCourseThumbnail(canvasRef.current, course)
  }, [course])

  return (
    <Card className="h-100">
      <canvas
        ref={canvasRef}
        width={THUMBNAIL_WIDTH}
        className="card-img-top"
        role="img"
        aria-label={`Track layout preview for ${course.name}`}
      />
      <Card.Body className="d-flex flex-column">
        <div className="d-flex align-items-start justify-content-between gap-2">
          <div>
            <Card.Title className="h6 mb-0">{course.name}</Card.Title>
            <Card.Subtitle className="small text-secondary mt-1">
              by {course.author}
            </Card.Subtitle>
          </div>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => onVote(course.id)}
            aria-label={`Vote for ${course.name}, currently ${course.votes} votes`}
          >
            ▲ {course.votes}
          </Button>
        </div>
        <div className="d-flex gap-2 mt-3">
          <Button
            variant="primary"
            className="flex-grow-1"
            onClick={() => navigate(`/race/${course.id}`)}
          >
            Play
          </Button>
          {course.isTemplate ? (
            <Button variant="outline-primary" onClick={() => onCopy(course.id)}>
              Copy &amp; Edit
            </Button>
          ) : (
            <>
              <Button variant="outline-primary" onClick={() => navigate(`/build/${course.id}`)}>
                Edit
              </Button>
              <Button
                variant="outline-danger"
                onClick={() => onDelete(course)}
                aria-label={`Delete ${course.name}`}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </Card.Body>
    </Card>
  )
}
