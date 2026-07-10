import { useCallback, useEffect, useRef, useState } from 'react'
import type { Terminal as TerminalClass } from '../lib/Terminal'
import { i18n } from '../lib/I18n'

const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 24

let _fontSize = 14

interface TerminalProps {
  terminal: TerminalClass
}

export default function Terminal({ terminal }: TerminalProps) {
  const [outputLines, setOutputLines] = useState(terminal.lines)
  const [fontSize, setFontSize] = useState(_fontSize)
  const contentRef = useRef<HTMLDivElement>(null)
  const initialPinchRef = useRef<number | null>(null)
  const currentFontSizeRef = useRef(_fontSize)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  // Auto-scroll ref for use in scroll callback (avoids stale closure in rAF)
  const autoScrollRef = useRef(shouldAutoScroll)
  useEffect(() => {
    autoScrollRef.current = shouldAutoScroll
  }, [shouldAutoScroll])

  // Subscribe to terminal output
  useEffect(() => {
    return terminal.subscribe(setOutputLines)
  }, [terminal])

  // Subscribe to explicit scroll requests (fires after each terminal.output())
  useEffect(() => {
    let rafId: number | null = null
    return terminal.onScrollRequested(() => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (contentRef.current && autoScrollRef.current) {
          contentRef.current.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' })
        }
      })
    })
  }, [terminal])

  // Keep ref and module variable in sync
  useEffect(() => {
    currentFontSizeRef.current = fontSize
    _fontSize = fontSize
  }, [fontSize])

  const clampFontSize = useCallback((size: number) => {
    return Math.min(Math.max(size, MIN_FONT_SIZE), MAX_FONT_SIZE)
  }, [])

  // Pinch-to-zoom handlers — native addEventListener to bypass passive listener restriction
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
        initialPinchRef.current = dist
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchRef.current !== null) {
        e.preventDefault()
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
        const scale = currentDist / initialPinchRef.current
        const newSize = clampFontSize(currentFontSizeRef.current * scale)
        setFontSize(newSize)
        initialPinchRef.current = currentDist
      }
    }

    const onTouchEnd = () => {
      initialPinchRef.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [clampFontSize])

  // Mouse wheel zoom — useEffect to get non-passive listener
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 1 : -1
      setFontSize(prev => clampFontSize(prev + delta))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [clampFontSize])

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (contentRef.current && shouldAutoScroll) {
      contentRef.current.scrollTo({ top: contentRef.current.scrollHeight })
    }
  }, [outputLines, shouldAutoScroll])

  // Track manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 50
    setShouldAutoScroll(isNearBottom)
  }, [])

  const handleClear = useCallback(() => {
    terminal.clear()
  }, [terminal])

  return (
    <div className="w-full max-w-200 flex-1 bg-surface rounded-lg overflow-hidden flex flex-col landscape:max-w-none min-h-0">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3.75 py-1.25 text-sm bg-surface-container-highest select-none shrink-0">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" className="fill-outline h-4">
            <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H160v400Zm140-40-56-56 103-104-104-104 57-56 160 160-160 160Zm180 0v-80h240v80H480Z" />
          </svg>
        </div>
        <md-text-button
          id="clear-terminal"
          className="-mr-3! gap-1"
          onClick={handleClear}
          style={{
            '--md-text-button-container-height': '24px',
            '--md-text-button-icon-size': '16px',
            '--md-sys-color-primary': 'var(--md-sys-color-outline)',
          } as React.CSSProperties}
        >
          {i18n.t('terminal_clear', 'clear')}
          <svg slot="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" className="fill-current">
            <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm80-160h80v-360h-80v360Zm160 0h80v-360h-80v360Z" />
          </svg>
        </md-text-button>
      </div>

      {/* Terminal content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto p-2.5 font-mono"
        style={{ fontSize: `${fontSize}px` }}
        onScroll={handleScroll}
      >
        {outputLines.map((line, i) =>
          line.content === '' ? (
            <br key={i} />
          ) : (
            <p
              key={i}
              className="output-line m-0 w-full break-all"
              style={{ ...(line.error ? { color: 'red' } : {}), pointerEvents: 'none' } as React.CSSProperties}
            >
              {line.content}
            </p>
          ),
        )}
      </div>
    </div>
  )
}
