import { type ReactNode } from 'react'
import ListItem from './ListItem'

interface RadioItemProps {
  name: string
  value: string
  checked?: boolean
  disabled?: boolean
  label: string
  onChange?: (value: string) => void
  leading?: ReactNode
  index?: number
  count?: number
  className?: string
}

export default function RadioItem({ name, value, checked, disabled, label, onChange, leading, index, count, className }: RadioItemProps) {
  return (
    <ListItem
      leading={leading}
      trailing={<md-radio name={name} value={value} checked={checked} disabled={disabled} style={{ pointerEvents: 'none' }} />}
      onClick={() => onChange?.(value)}
      disabled={disabled}
      index={index}
      count={count}
      className={`min-h-6 ${className}`}
    >
      {label}
    </ListItem>
  )
}
