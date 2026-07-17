import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * Blocks in-app navigation (useBlocker) and tab close/refresh (beforeunload)
 * while `dirty` is true. Confirms with the browser dialog before proceeding.
 * Returns `allowNextNavigation()` to skip the block after a successful save.
 */
export function useUnsavedChangesGuard(dirty, message) {
  const bypassRef = useRef(false)

  useEffect(() => {
    if (dirty) bypassRef.current = false
  }, [dirty])

  const blocker = useBlocker(() => Boolean(dirty) && !bypassRef.current)

  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(message)) blocker.proceed()
    else blocker.reset()
  }, [blocker, message])

  return useCallback(() => {
    bypassRef.current = true
  }, [])
}
