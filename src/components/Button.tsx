import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tint'

const base =
  'rounded-lg text-body font-medium transition-all duration-150 ease-out ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ' +
  'disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white px-5 py-2.5 ' +
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(18,63,92,0.18),0_10px_22px_-8px_rgba(30,95,140,0.55)] ' +
    'hover:bg-accent-hover hover:-translate-y-px ' +
    'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_2px_4px_rgba(18,63,92,0.22),0_16px_30px_-8px_rgba(18,63,92,0.6)] ' +
    'active:bg-accent-deep active:translate-y-0 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)] ' +
    'disabled:bg-rule disabled:text-ink-faint disabled:shadow-none disabled:hover:translate-y-0',
  secondary:
    'bg-white text-accent-deep border border-accent px-5 py-2.5 shadow-sm ' +
    'hover:bg-accent-tint hover:-translate-y-px hover:shadow-[0_6px_16px_-6px_rgba(30,95,140,0.35)] ' +
    'active:translate-y-0',
  ghost:
    'bg-transparent text-ink-soft px-3.5 py-2.5 ' +
    'hover:bg-paper-raised hover:text-ink',
  danger:
    'bg-white text-crit border border-crit-soft px-5 py-2.5 ' +
    'hover:bg-crit-soft hover:shadow-[0_6px_16px_-6px_rgba(168,67,58,0.3)]',
  tint:
    'bg-accent-tint text-accent-deep border border-accent px-3.5 py-2 ' +
    'hover:-translate-y-px hover:shadow-[0_6px_16px_-6px_rgba(30,95,140,0.35)] ' +
    'active:translate-y-0',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
