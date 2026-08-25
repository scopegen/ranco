import type { ReactNode } from 'react'

type Variant = 'solid' | 'outline' | 'crit' | 'accent' | 'success' | 'warning'

const variants: Record<Variant, string> = {
  solid: 'bg-accent-deep text-white',
  outline: 'bg-transparent border border-rule text-ink-soft',
  crit: 'bg-crit-soft text-crit',
  accent: 'bg-accent-tint text-accent-deep',
  success: 'bg-ok-soft text-ok',
  warning: 'bg-warn-soft text-warn',
}

export function Pill({ variant = 'outline', children }: { variant?: Variant; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium leading-none ${variants[variant]}`}
    >
      {variant === 'outline' && <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />}
      {children}
    </span>
  )
}