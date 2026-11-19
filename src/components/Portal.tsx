import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Renders popups at the top of the page. Cards use a frosted-glass effect (backdrop-filter), and a popup rendered *inside* such a
 * card is positioned relative to the card instead of the screen, so neighbouring cards paint over it. Portals avoid that entirely.
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
