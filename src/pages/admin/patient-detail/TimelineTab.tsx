import type { ReactNode } from 'react'
import { CalendarCheck, ClipboardList, Receipt, Stethoscope, UserPlus } from 'lucide-react'
import type { Patient } from '../../../state/PatientsContext'
import { useClinic } from '../../../state/ClinicContext'
import { formatINR } from '../../../lib/currency'
import { PaymentStatusPill } from '../../../components/PaymentStatusPill'
import { visitAmount } from '../../../types/clinical'
import { formatDate, formatDateTime } from '../../../lib/date'
import type { PatientClinicalData } from '../PatientDetail'

interface TimelineEvent {
  date: string
  /** true when `date` carries a real time-of-day (registered_at, issued_at, ...) */
  hasTime: boolean
  icon: ReactNode
  title: string
  description?: string
  pill?: ReactNode
}

export function TimelineTab({ patient, data }: { patient: Patient; data: PatientClinicalData }) {
  const { doctorName, serviceName } = useClinic()
  const events: TimelineEvent[] = []

  events.push({
    date: patient.registeredAt,
    hasTime: true,
    icon: <UserPlus size={16} />,
    title: 'Patient registered',
  })

  for (const consultation of data.consultations) {
    events.push({
      date: consultation.consultDate,
      hasTime: false,
      icon: <Stethoscope size={16} />,
      title: `Consultation with ${doctorName(consultation.doctorId)}`,
      description: consultation.findings,
      pill: <PaymentStatusPill status={consultation.paymentStatus} />,
    })

    for (const treatment of data.treatments.filter((t) => t.consultationId === consultation.id)) {
      const serviceLabel = serviceName(treatment.serviceId)
      events.push({
        date: treatment.startedAt,
        hasTime: false,
        icon: <ClipboardList size={16} />,
        title: `${serviceLabel} started`,
        description: `assigned to ${doctorName(treatment.doctorId)}`,
      })

      if (treatment.completedAt) {
        events.push({
          date: treatment.completedAt,
          hasTime: false,
          icon: <ClipboardList size={16} />,
          title: `${serviceLabel} finished`,
        })
      }

      for (const visit of data.visitsByTreatment[treatment.id] ?? []) {
        events.push({
          date: visit.visitDate,
          hasTime: false,
          icon: <CalendarCheck size={16} />,
          title: `Visit — ${serviceLabel}`,
          description: formatINR(visitAmount(visit)),
          pill: <PaymentStatusPill status={visit.paymentStatus} />,
        })
      }

      const invoice = data.invoiceByTreatment[treatment.id]
      if (invoice) {
        events.push({
          date: invoice.issuedAt,
          hasTime: true,
          icon: <Receipt size={16} />,
          title: 'Invoice generated',
          description: `${formatINR(invoice.finalTotal)} via ${invoice.paymentMode.toUpperCase()}`,
        })
      }
    }
  }

  events.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="flex flex-col gap-4">
      {events.map((event, i) => (
        <div key={i} className="flex gap-3 rounded-xl border border-rule bg-white p-4 shadow-sm">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-deep">
            {event.icon}
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body font-medium text-ink">{event.title}</span>
              {event.pill}
            </div>
            {event.description && <p className="text-ink-soft">{event.description}</p>}
            <span className="text-[12px] text-ink-faint">
              {event.hasTime ? formatDateTime(event.date) : formatDate(event.date)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}