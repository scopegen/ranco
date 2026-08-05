import { Button } from '../components/Button'
import { Pill } from '../components/Pill'

export function StyleGuide() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-medium uppercase tracking-wider text-accent">Design tokens</p>
        <h1>Deep Ocean style guide</h1>
        <p className="max-w-[52ch] text-ink-soft">
          Living reference for the locked palette, font, and type scale. Not a real page — just a
          check that the tokens wired into Tailwind match the approved artifact.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2>Buttons</h2>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-rule bg-white p-6 shadow-sm">
          <Button variant="primary">Generate Invoice</Button>
          <Button variant="primary" disabled>
            Generate Invoice
          </Button>
          <Button variant="secondary">Edit Prescription</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Delete Patient</Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Status pills</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rule bg-white p-6 shadow-sm">
          <Pill variant="solid">✓ Paid</Pill>
          <Pill variant="outline">Unpaid</Pill>
          <Pill variant="solid">Ongoing</Pill>
          <Pill variant="outline">Scheduled</Pill>
          <Pill variant="crit">Overdue</Pill>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Type scale</h2>
        <div className="flex flex-col gap-5 rounded-xl border border-rule bg-white p-6 shadow-sm">
          <p className="text-heading font-bold">Patient Timeline — Priya Sharma</p>
          <p className="text-subheading font-medium">Root Canal Treatment — ongoing</p>
          <p className="text-body max-w-[52ch] text-ink-soft">
            Consultation on 2 Aug found deep caries on tooth 36. RCT recommended and assigned to
            Dr. Mehta. First sitting completed 4 Aug — visit charge ₹1,200, paid via UPI.
          </p>
        </div>
      </section>
    </div>
  )
}