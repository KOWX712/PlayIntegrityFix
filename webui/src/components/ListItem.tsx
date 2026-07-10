import { type ReactNode } from 'react'

interface ListItemProps {
  leading?: ReactNode
  children: ReactNode
  trailing?: ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
  index?: number
  count?: number
}

export default function ListItem({ leading, children, trailing, className = '', onClick, disabled, index, count }: ListItemProps) {
  const handleClick = () => onClick?.()

  const roundedClass = getRoundedClass(index, count)

  return (
    <div
      className={`relative overflow-hidden flex items-center gap-4 px-4 py-2 select-none ${roundedClass} active:rounded-2xl transition-all duration-150 ${className}`}
      onClick={handleClick}
    >
      {leading && <span className="flex shrink-0">{leading}</span>}
      <span className="flex-1 flex items-center gap-2 min-w-0">{children}</span>
      {trailing && <span className="flex shrink-0">{trailing}</span>}
      <md-ripple disabled={disabled} />
    </div>
  )
}

function getRoundedClass(index?: number, count?: number): string {
  if (count === 1) return 'rounded-2xl'
  if (index === 0) return 'rounded-t-2xl rounded-b'
  if (count != null && index === count - 1) return 'rounded-t rounded-b-2xl'
  return 'rounded'
}
