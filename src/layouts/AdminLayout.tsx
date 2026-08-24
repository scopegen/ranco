import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CircleUserRound, LogOut, Package, Receipt, Stethoscope, UserCog, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../state/AuthContext'
import { QuickAddMenu } from '../components/QuickAddMenu'
import { isPatientDetailPath } from '../lib/patientRoutes'

const navItems = [
  { to: '/admin/patients', label: 'Patients', icon: Users, adminOnly: false },
  { to: '/admin/treatments', label: 'Treatments', icon: Stethoscope, adminOnly: false },
  { to: '/admin/billing', label: 'Billing', icon: Receipt, adminOnly: true },
  { to: '/admin/services', label: 'Services', icon: Package, adminOnly: true },
  { to: '/admin/doctors', label: 'Doctors', icon: UserCog, adminOnly: true },
]

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'bg-accent-tint text-accent-deep'
    : 'text-ink-soft hover:bg-paper-raised hover:text-ink'
}

export function AdminLayout() {
  const { staff, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const hideMobileNav = isPatientDetailPath(location.pathname)
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || staff?.role === 'admin')

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-svh flex-col">
      {/* Desktop-only top bar: logo on the left, staff name/role + sign out
          on the right — replaces the old bottom-left sign-out in the sidebar. */}
      <header className="hidden items-center justify-between border-b border-rule bg-white px-6 py-3 md:flex">
        <Brand />
        <div className="flex items-center gap-2">
          <div className="group relative flex items-center">
            <button
              type="button"
              aria-label={`Signed in as ${staff?.name ?? 'staff'}`}
              className="flex items-center justify-center rounded-full p-1.5 text-ink-soft transition-colors hover:bg-paper-raised hover:text-ink"
            >
              <CircleUserRound size={20} strokeWidth={2} />
            </button>
            {/* Name/role only on hover — not shown by default */}
            <div className="absolute right-0 top-full z-10 mt-1 hidden flex-col items-end whitespace-nowrap rounded-lg border border-rule bg-white px-3 py-2 text-right shadow-lg group-hover:flex">
              <p className="text-body font-medium text-ink">{staff?.name}</p>
              <p className="text-[12px] capitalize text-ink-faint">{staff?.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-body font-medium text-ink-soft transition-colors duration-150 hover:bg-paper-raised hover:text-ink"
          >
            <LogOut size={17} strokeWidth={2} />
            Sign out
          </button>
        </div>
      </header>

      {/* mobile top bar */}
      <header className="flex items-center justify-between border-b border-rule bg-white px-4 py-3 md:hidden">
        <Brand />
        <button type="button" onClick={handleLogout} className="text-ink-soft">
          <LogOut size={20} strokeWidth={2} />
        </button>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* desktop sidebar — nav only now, logo/sign-out live in the top bar */}
        <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-rule bg-white p-4 md:flex">
          <nav className="flex flex-col gap-1">
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
        </aside>

        <main className={`flex-1 md:pb-0 ${hideMobileNav ? 'pb-0' : 'pb-20'}`}>
          <Outlet />
        </main>
      </div>

      {/* mobile bottom tab bar — hidden inside a patient's own pages */}
      {!hideMobileNav && (
        <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-rule bg-white md:hidden">
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
      )}

      <QuickAddMenu />
    </div>
  )
}

function Brand(): ReactNode {
  return (
    <Link to="/admin" aria-label="Go to dashboard" title="Dashboard">
      <img src="/images/Ranco-logo-new.webp" alt="Ranco Dental Clinic" className="h-[52px] w-auto" />
    </Link>
  )
}