import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const controlClass =
  'w-full rounded-lg border border-rule bg-white px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint ' +
  'transition-colors duration-150 outline-none ' +
  'focus:border-accent focus:ring-2 focus:ring-accent-tint'

function Label({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-body font-medium text-ink">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      {hint && <span className="text-[12px] text-ink-faint">{hint}</span>}
    </div>
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
}

export function Field({ label, required, hint, className = '', ...props }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label label={label} required={required} hint={hint} />
      <input required={required} className={`${controlClass} ${className}`} {...props} />
    </label>
  )
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
}

export function TextareaField({ label, required, hint, className = '', ...props }: TextareaFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label label={label} required={required} hint={hint} />
      <textarea required={required} className={`${controlClass} min-h-24 resize-y ${className}`} {...props} />
    </label>
  )
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  options: readonly string[]
}

export function SelectField({ label, required, hint, options, className = '', ...props }: SelectFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label label={label} required={required} hint={hint} />
      <select required={required} className={`${controlClass} ${className}`} {...props}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label label={label} />
      <div className={`${controlClass} bg-paper-raised text-ink-soft`}>{value}</div>
    </div>
  )
}