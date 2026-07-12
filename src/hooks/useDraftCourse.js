import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { createDraftCourse, saveCourse } from '../services/courseService'

/** Create a fresh draft course and jump into the builder for it. */
export function useDraftCourse() {
  const navigate = useNavigate()
  return useCallback(() => {
    const draft = saveCourse(createDraftCourse())
    navigate(`/build/${draft.id}`)
  }, [navigate])
}
