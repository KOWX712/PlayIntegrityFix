import { type ReactNode } from 'react'
import ListItem from './ListItem'

interface SwitchItemProps {
  label: string
  selected?: boolean
  disabled?: boolean
  playStore?: boolean
  onChange?: (selected: boolean) => void
  leading?: ReactNode
  index?: number
  count?: number
  className?: string
}

export default function SwitchItem({ label, selected, disabled, playStore, onChange, leading, index, count, className }: SwitchItemProps) {
  return (
    <ListItem
      leading={leading}
      trailing={<md-switch icons selected={selected} disabled={disabled} style={{ pointerEvents: 'none' }} />}
      onClick={() => onChange?.(!selected)}
      disabled={disabled}
      index={index}
      count={count}
      className={className}
    >
      <span className="truncate">{label}</span>
      {playStore && (
        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs bg-primary text-on-primary shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className="w-2 h-2 fill-on-primary">
            <path d="M14.222 9.374c1.037-.61 1.037-2.137 0-2.748L11.528 5.04 8.32 8l3.207 2.96zm-3.595 2.116L7.583 8.68 1.03 14.73c.201 1.029 1.36 1.61 2.303 1.055zM1 13.396V2.603L6.846 8zM1.03 1.27l6.553 6.05 3.044-2.81L3.333.215C2.39-.341 1.231.24 1.03 1.27" />
          </svg>
          <span className='font-semibold'>Play Store</span>
        </span>
      )}
    </ListItem>
  )
}
