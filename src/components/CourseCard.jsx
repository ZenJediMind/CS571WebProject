import { useMemo } from 'react'
import Button from 'react-bootstrap/Button'
import Badge from 'react-bootstrap/Badge'
import Card from 'react-bootstrap/Card'
import { useNavigate } from 'react-router-dom'
import { validateCourse } from '../game/courseModel'
import CourseThumbnail from './CourseThumbnail'

const THUMBNAIL_WIDTH = 320

/**
 * One shared course: live-drawn thumbnail, votes, Play, and ownership-aware
 * edit controls. Supabase RLS remains the final authority for every write.
 */
export default function CourseCard({ course, onVote, onCopy, onDelete, onShare, votePending }) {
  const navigate = useNavigate()
  const playCheck = useMemo(() => validateCourse(course.grid), [course.grid])

  return (
    <Card className="h-100">
      <CourseThumbnail
        course={course}
        width={THUMBNAIL_WIDTH}
        className="card-img-top"
        label={`Track layout preview for ${course.name}`}
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
            disabled={votePending}
            aria-label={`Vote for ${course.name}, currently ${course.votes} votes`}
          >
            ▲ {course.votes}
          </Button>
        </div>
        {!course.isPublic && course.isOwner && (
          <div className="mt-2">
            <Badge bg="secondary">Private draft</Badge>
          </div>
        )}
        {!playCheck.ok && (
          <Card.Text className="small text-warning-emphasis mt-2 mb-0">
            Needs editing before it can be played or shared: {playCheck.error}
          </Card.Text>
        )}
        <div className="d-flex gap-2 mt-3">
          <Button
            variant="primary"
            className="flex-grow-1"
            onClick={() => navigate(`/race/${course.id}`)}
            disabled={!playCheck.ok}
            title={playCheck.ok ? 'Play this course' : playCheck.error}
          >
            Play
          </Button>
          {course.isPublic && playCheck.ok && (
            <Button
              variant="outline-secondary"
              onClick={() => onShare(course)}
              aria-label={`Copy a playable link for ${course.name}`}
            >
              Share
            </Button>
          )}
          {course.isOwner ? (
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
          ) : (
            <Button variant="outline-primary" onClick={() => onCopy(course.id)}>
              Copy &amp; Edit
            </Button>
          )}
        </div>
      </Card.Body>
    </Card>
  )
}
