import { useMemo, useState, type SubmitEvent } from 'react'
import { useAuth } from '../../state/AuthContext'
import { useClinic } from '../../state/ClinicContext'
import { formatINR } from '../../lib/currency'
import { Button } from '../../components/Button'
import { Field, SelectField } from '../../components/Field'
import { Pill } from '../../components/Pill'
import type { Service, ServiceType } from '../../types/clinical'

const UNCATEGORIZED = 'General'

export function Services() {
  const { staff } = useAuth()
  const { services, loading, addService, updateService } = useClinic()
  const isAdmin = staff?.role === 'admin'
  const [formOpen, setFormOpen] = useState(false)

  const grouped = useMemo(() => {
    const groups = new Map<string, Service[]>()
    for (const service of services) {
      const key = service.category ?? UNCATEGORIZED
      groups.set(key, [...(groups.get(key) ?? []), service])
    }
    // Uncategorized services last, everything else alphabetical.
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1
      if (b === UNCATEGORIZED) return -1
      return a.localeCompare(b)
    })
  }, [services])

  const existingCategories = useMemo(
    () => [...new Set(services.map((s) => s.category).filter((c): c is string => Boolean(c)))].sort(),
    [services],
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1>Services</h1>
          <p className="text-ink-soft">{loading ? 'Loading…' : `${services.length} in the catalog`}</p>
        </div>
        {isAdmin && (
          <Button variant={formOpen ? 'ghost' : 'primary'} onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? 'Cancel' : '+ Add service'}
          </Button>
        )}
      </div>

      {!isAdmin && (
        <p className="rounded-lg bg-paper-raised px-3.5 py-2.5 text-body text-ink-soft">
          Read-only — only Admin can add or edit services.
        </p>
      )}

      {formOpen && isAdmin && (
        <ServiceForm
          existingCategories={existingCategories}
          onSubmit={async (input) => {
            await addService(input)
            setFormOpen(false)
          }}
          onCancel={() => setFormOpen(false)}
        />
      )}

      <div className="flex flex-col gap-6">
        {grouped.map(([category, groupServices]) => (
          <div key={category} className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">{category}</p>
            {groupServices.map((service) => (
              <ServiceRow key={service.id} service={service} editable={isAdmin} existingCategories={existingCategories} onSave={updateService} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ServiceRow({
  service,
  editable,
  existingCategories,
  onSave,
}: {
  service: Service
  editable: boolean
  existingCategories: string[]
  onSave: (
    id: string,
    input: { name: string; category?: string | null; serviceType: ServiceType; listedPrice: number; active: boolean },
  ) => Promise<Service>
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <ServiceForm
        initial={service}
        existingCategories={existingCategories}
        onSubmit={async (input) => {
          await onSave(service.id, input)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-ink">{service.name}</span>
        <span className="text-[12px] text-ink-faint">
          {formatINR(service.listedPrice)} &middot; {service.serviceType === 'lab' ? 'Lab' : 'Dental'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {service.active ? <Pill variant="solid">Active</Pill> : <Pill variant="outline">Inactive</Pill>}
        {editable && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
    </div>
  )
}

const NO_CATEGORY = 'No category (General)'
const NEW_CATEGORY = '+ Add new category…'

function ServiceForm({
  initial,
  existingCategories,
  onSubmit,
  onCancel,
}: {
  initial?: Service
  existingCategories: string[]
  onSubmit: (input: {
    name: string
    category?: string | null
    serviceType: ServiceType
    listedPrice: number
    active: boolean
  }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [categoryChoice, setCategoryChoice] = useState(initial?.category ?? NO_CATEGORY)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [serviceTypeLabel, setServiceTypeLabel] = useState(initial?.serviceType === 'lab' ? 'Lab' : 'Dental')
  const [price, setPrice] = useState(initial ? String(initial.listedPrice) : '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [submitting, setSubmitting] = useState(false)

  const categoryOptions = [NO_CATEGORY, ...existingCategories, NEW_CATEGORY]

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const category =
        categoryChoice === NO_CATEGORY ? null : categoryChoice === NEW_CATEGORY ? newCategoryName.trim() || null : categoryChoice
      const serviceType: ServiceType = serviceTypeLabel === 'Lab' ? 'lab' : 'dental'
      await onSubmit({ name, category, serviceType, listedPrice: Number(price), active })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-rule bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Molar RCT" />
        <SelectField
          label="Category"
          options={categoryOptions}
          value={categoryChoice}
          onChange={(e) => setCategoryChoice(e.target.value)}
        />
      </div>
      {categoryChoice === NEW_CATEGORY && (
        <Field
          label="New category name"
          required
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="e.g. Dental Bridges"
        />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Type"
          options={['Dental', 'Lab']}
          value={serviceTypeLabel}
          onChange={(e) => setServiceTypeLabel(e.target.value)}
        />
        <Field label="Price" required type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="8000" />
      </div>
      <label className="flex items-center gap-2 text-body text-ink">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-accent" />
        Active
      </label>
      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}