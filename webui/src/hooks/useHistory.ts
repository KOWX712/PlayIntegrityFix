/**
 * useHistory - React hook wrapping a parallel history stack.
 *
 * Manages a parallel key stack in sync with window.history. When the user
 * navigates back (back button / gesture), the matching entry is popped and
 * its onBack callback fires.
 *
 * Usage:
 *   const { push, back, consume } = useHistory()
 *
 *   // Push a state when opening a component:
 *   push('about', () => component.close())
 *
 *   // When the component is dismissed externally (e.g. scrim click),
 *   // tell history to clean up without triggering onBack:
 *   component.onDismiss(() => consume('about'))
 *
 *   // Programmatic back:
 *   closeButton.onclick = () => back()
 */
import { useRef, useEffect, useCallback } from 'react'

export function useHistory() {
  const activeKeysRef = useRef<string[]>([])
  const entriesRef = useRef<Map<string, () => void>>(new Map())
  const pendingCleanupCountRef = useRef(0)

  const onPopState = useCallback((event: PopStateEvent) => {
    if (pendingCleanupCountRef.current > 0) {
      pendingCleanupCountRef.current--
      return
    }

    const currentKey = event.state?.key as string | undefined
    const activeKeys = activeKeysRef.current
    const entries = entriesRef.current

    while (activeKeys.length > 0) {
      const lastKey = activeKeys[activeKeys.length - 1]
      if (lastKey === currentKey) break
      activeKeys.pop()
      const onBack = entries.get(lastKey)
      if (onBack) {
        entries.delete(lastKey)
        onBack()
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('popstate', onPopState)
    const activeKeys = activeKeysRef.current
    const entries = entriesRef.current
    return () => {
      window.removeEventListener('popstate', onPopState)
      activeKeys.length = 0
      entries.clear()
    }
  }, [onPopState])

  const push = useCallback((key: string, onBack: () => void) => {
    activeKeysRef.current.push(key)
    entriesRef.current.set(key, onBack)
    window.history.pushState({ key }, '')
  }, [])

  const back = useCallback(() => {
    window.history.back()
  }, [])

  const consume = useCallback((key: string): boolean => {
    if (!entriesRef.current.has(key)) return false

    activeKeysRef.current = activeKeysRef.current.filter(k => k !== key)
    entriesRef.current.delete(key)
    pendingCleanupCountRef.current++
    window.history.back()
    return true
  }, [])

  const size = useCallback(() => activeKeysRef.current.length, [])

  return { push, back, consume, size }
}
