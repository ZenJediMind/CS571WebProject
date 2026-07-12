import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Jump into the builder with a fresh, in-memory draft. Nothing is persisted
 * until the racer saves or test-drives, so abandoned drafts leave no litter.
 */
export function useDraftCourse() {
  const navigate = useNavigate()
  return useCallback(() => navigate('/build/new'), [navigate])
}
