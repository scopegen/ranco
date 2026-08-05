import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePatients, type Patient } from '../../state/PatientsContext'
import { useAuth } from '../../state/AuthContext'
import { useClinic } from '../../state/ClinicContext'
import { clinicalApi } from '../../lib/clinicalApi'
import { Pill } from '../../components/Pill'
import { formatDate } from '../../lib/date'
import type { Treatment } from '../../types/clinical'

interface Row {
  patient: Patient
  treatment: Treatment
}

export function TreatmentsOverview() {
  const { staff } = useAuth()
  const { patients, loading: patientsLoading } = usePatients()
  const { doctorName, serviceName } = useClinic()
  const [rows, setRows] = useState<Row[] | null>(null)
  const scopeLabel = staff?.role === 'admin' ? 'across the clinic' : 'across your patients'

  useEffect(() => {
    if (patientsLoading) return
    let cancelled = false

    Promise.all(
      patients.map(async (patient) => {
        const treatments = await clinicalApi.listTreatments(patient.id)
        return treatments.map((treatment) => ({ patient, treatment }))
      }),
    ).then((groups) => {
      if (cancelled) return
      const flat = groups.flat().sort((a, b) => b.treatment.startedAt.localeCompare(a.treatment.startedAt))
      setRows(flat)
    })

    return () => {
      cancelled = true
    }
  }, [patients, patientsLoading])

  const loading = patientsLoading || rows === null

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1>Treatments</h1>
        <p className="text-ink-soft">{loading ? 'Loading…' : `${rows!.length} ${scopeLabel}`}</p>
      </div>

      {!loading && rows!.length === 0 && <p className="text-ink-soft">No treatments yet.</p>}

      {!loading && rows!.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-rule bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-rule">
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Patient</th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Service</th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Doctor</th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Started</th>
                <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows!.map(({ patient, treatment }) => (
                <tr key={treatment.id} className="border-b border-rule last:border-none">
                  <td className="px-4 py-3">
                    <Link to={`/admin/patients/${patient.id}`} className="font-medium text-ink hover:text-accent-deep">
                      {patient.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{serviceName(treatment.serviceId)}</td>
                  <td className="px-4 py-3 text-ink-soft">{doctorName(treatment.doctorId)}</td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(treatment.startedAt)}</td>
                  <td className="px-4 py-3">
                    {treatment.status === 'finished' ? (
                      <Pill variant="solid">Finished</Pill>
                    ) : (
                      <Pill variant="outline">Ongoing</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}