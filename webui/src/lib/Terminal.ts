import type { OutputLine } from '../types'

export type TerminalListener = (lines: OutputLine[]) => void
export type ShellStateListener = (running: boolean) => void

/**
 * Observable terminal class holding output lines and shell running state.
 * Created once in App, passed to lib classes for output, subscribed by React component.
 */
export class Terminal {
  #lines: OutputLine[] = []
  #listeners = new Set<TerminalListener>()
  #shellRunning = false
  #shellListeners = new Set<ShellStateListener>()
  #scrollCallbacks = new Set<() => void>()

  get lines(): OutputLine[] {
    return this.#lines
  }

  get shellRunning(): boolean {
    return this.#shellRunning
  }

  subscribe(listener: TerminalListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  onShellStateChange(listener: ShellStateListener): () => void {
    this.#shellListeners.add(listener)
    return () => this.#shellListeners.delete(listener)
  }

  onScrollRequested(listener: () => void): () => void {
    this.#scrollCallbacks.add(listener)
    return () => this.#scrollCallbacks.delete(listener)
  }

  output(content: string, error = false): void {
    const line: OutputLine = { content, error }
    this.#lines = [...this.#lines, line]
    for (const listener of this.#listeners) listener(this.#lines)
    for (const cb of this.#scrollCallbacks) cb()
  }

  clear(): void {
    this.#lines = []
    for (const listener of this.#listeners) {
      listener(this.#lines)
    }
  }

  setShellRunning(running: boolean): void {
    this.#shellRunning = running
    for (const listener of this.#shellListeners) {
      listener(running)
    }
  }
}
