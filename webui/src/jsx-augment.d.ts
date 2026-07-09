/**
 * Make @material/web type work with React JSX
 * compatible bridge for converting `<HTMLElementTagNameMap>` to `<JSX.IntrinsicElements>`
 */

import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type CustomElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      [tag: string]: CustomElement
    }
  }
}
