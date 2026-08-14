import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Package, Receipt, Stethoscope, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../state/AuthContext'

const navItems = [
  { to: '/admin/patients', label: 'Patients', icon: Users, adminOnly: false },
  { to: '/admin/treatments', label: 'Treatments', icon: Stethoscope, adminOnly: false },
  { to: '/admin/billing', label: 'Billing', icon: Receipt, adminOnly: true },
  { to: '/admin/services', label: 'Services', icon: Package, adminOnly: true },
]

// Matches /admin/patients/<id> but not /admin/patients/new or the /edit
// sub-route — those still want the normal global nav.
const PATIENT_DETAIL_PATH = /^\/admin\/patients\/(?!new$)[^/]+$/

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'bg-accent-tint text-accent-deep'
    : 'text-ink-soft hover:bg-paper-raised hover:text-ink'
}

export function AdminLayout() {
  const { staff, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || staff?.role === 'admin')
  // Patient detail pages render their own mobile bottom bar (the patient's
  // own tabs) in place of the global nav — see PatientDetail.tsx.
  const isPatientDetailPage = PATIENT_DETAIL_PATH.test(location.pathname)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/* desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-rule bg-white p-4 md:flex">
        <Brand />
        <nav className="mt-6 flex flex-col gap-1">
          {visibleNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={(state) => `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-body font-medium transition-colors duration-150 ${navLinkClass(state)}`}
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-rule pt-3">
          <div className="px-3 py-1">
            <p className="text-body font-medium text-ink">{staff?.name}</p>
            <p className="text-[12px] capitalize text-ink-faint">{staff?.role}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-body font-medium text-ink-soft transition-colors duration-150 hover:bg-paper-raised hover:text-ink"
          >
            <LogOut size={17} strokeWidth={2} />
            Sign out
          </button>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="flex items-center justify-between border-b border-rule bg-white px-4 py-3 md:hidden">
        <Brand />
        <button type="button" onClick={handleLogout} className="text-ink-soft">
          <LogOut size={20} strokeWidth={2} />
        </button>
      </header>

      <main className={`flex-1 md:pb-0 ${isPatientDetailPage ? '' : 'pb-20'}`}>
        <Outlet />
      </main>

      {/* mobile bottom tab bar — hidden on patient detail pages, which render their own */}
      <nav
        className={`fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-white md:hidden ${
          isPatientDetailPage ? 'hidden' : 'flex'
        }`}
      >
        {visibleNavItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={(state) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors duration-150 ${navLinkClass(state)}`
            }
          >
            <Icon size={20} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Brand(): ReactNode {
  return <img src="/images/Ranco-logo-new.webp" alt="Ranco Dental Clinic" className="h-[52px] w-auto" />
}