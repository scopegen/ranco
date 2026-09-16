import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CircleUserRound, LogOut, Settings, Stethoscope, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../state/AuthContext'
import { QuickAddMenu } from '../components/QuickAddMenu'
import { isPatientDetailPath } from '../lib/patientRoutes'

// Services/Doctors are reachable only from Settings now (each with its own
// back arrow) — not sidebar/tab-bar destinations of their own.
const navItems = [
  { to: '/admin/patients', label: 'Patients', icon: Users, adminOnly: false },
  { to: '/admin/treatments', label: 'Treatments', icon: Stethoscope, adminOnly: false },
]

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'bg-accent-tint text-accent-deep'
    : 'text-ink-soft hover:bg-paper-raised hover:text-ink'
}

// Both top bars (desktop + mobile) share this — a diagonal sweep between the
// two existing "Deep Ocean" brand tokens (dark at the edges, lighter through
// the middle) rather than a flat fill, to match the gradient look of the new
// white logo mark. Kept as one constant so the two headers can't drift apart.
const TOPBAR_GRADIENT =
  'bg-[linear-gradient(120deg,var(--color-accent-deep)_0%,var(--color-accent)_45%,var(--color-accent-deep)_100%)]'

export function AdminLayout() {
  const { staff, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // isPatientDetailPath deliberately excludes /admin/patients/new and
  // /admin/patients/:code/edit (see its own doc comment) — those aren't
  // PatientDetail's nested routes, but the new/edit patient form now has its
  // own fixed bottom action bar (see NewPatient.tsx), which the global
  // Patients/Treatments tab bar would otherwise sit right on top of. Checked
  // here instead of changing isPatientDetailPath itself, since that
  // function's other caller (QuickAddMenu) has no reason to treat this page
  // any differently — it already hides itself there entirely.
  const isPatientFormPath = location.pathname === '/admin/patients/new' || /^\/admin\/patients\/[^/]+\/edit$/.test(location.pathname)
  const hideMobileNav = isPatientDetailPath(location.pathname) || isPatientFormPath
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || staff?.role === 'admin')
  // The mobile bottom tab bar only ever shows Patients/Treatments — Services
  // and Doctors are reachable from Settings instead, and the "+" QuickAddMenu
  // button now sits inline between these two, so the bar stays exactly two
  // items regardless of role.
  const mobileNavItems = navItems.filter((item) => !item.adminOnly)
  const isAdmin = staff?.role === 'admin'

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-svh flex-col">
      {/* Desktop-only top bar: logo on the left, staff name/role + sign out
          on the right — replaces the old bottom-left sign-out in the sidebar.
          Sticky (with the sidebar below matched to its height, see aside)
          so both stay put while only the page content scrolls. */}
      <header className={`sticky top-0 z-20 hidden items-center justify-between px-6 py-3 shadow-sm md:flex ${TOPBAR_GRADIENT}`}>
        <Brand />
        <div className="flex items-center gap-2">
          <div className="group relative flex items-center">
            <button
              type="button"
              aria-label={`Signed in as ${staff?.name ?? 'staff'}`}
              className="flex items-center justify-center rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CircleUserRound size={20} strokeWidth={2} />
            </button>
            {/* Name/role only on hover — not shown by default. This popup
                stays light regardless of the bar's own color, same as any
                floating menu would. */}
            <div className="absolute right-0 top-full z-10 mt-1 hidden flex-col items-end whitespace-nowrap rounded-lg border border-rule bg-white px-3 py-2 text-right shadow-lg group-hover:flex">
              <p className="text-body font-medium text-ink">{staff?.name}</p>
              <p className="text-[12px] capitalize text-ink-faint">{staff?.role}</p>
            </div>
          </div>
          {isAdmin ? (
            <Link
              to="/admin/settings"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-body font-medium text-white/90 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              <Settings size={17} strokeWidth={2} />
              Settings
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-body font-medium text-white/90 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              <LogOut size={17} strokeWidth={2} />
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* mobile top bar — shorter than the desktop one (py-2 not py-3, and
          Brand's own logo shrinks on mobile too) so it eats less of a phone
          screen's vertical space. z-20 (matching the desktop header) so a
          page that adds its own fixed/absolute content (e.g. a full-bleed
          background) can never paint over this — it did once, with no
          z-index here, before this was added. */}
      <header className={`relative z-20 flex items-center justify-between px-4 py-2 shadow-sm md:hidden ${TOPBAR_GRADIENT}`}>
        <Brand />
        {isAdmin ? (
          <Link to="/admin/settings" className="text-white/90">
            <Settings size={20} strokeWidth={2} />
          </Link>
        ) : (
          <button type="button" onClick={handleLogout} className="text-white/90">
            <LogOut size={20} strokeWidth={2} />
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* desktop sidebar — nav only now, logo/sign-out live in the top bar */}
        {/* bg-[#E7F8FD]: a light tint of the logo's own teal (~#5FD1EF, sampled
            from the tooth mark) — not one of the existing tokens, since
            nothing else in the palette is teal. Sticky, pinned right below
            the (also sticky) header and sized to exactly fill the rest of
            the viewport — 76px is that header's own height (py-3 + the
            52px logo) — so the promo image pinned to its bottom is always
            fully on-screen, not just after scrolling past it. */}
        <aside className="sticky top-[76px] hidden h-[calc(100svh-76px)] w-60 shrink-0 flex-col gap-1 self-start overflow-y-auto border-r border-rule bg-[#E7F8FD] p-4 md:flex">
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
          {/* Pinned to the bottom of the sidebar, nav above it. The asset
              already bakes in its own soft-white edges, so no border-radius
              is added here on top of it. */}
          <img src="/images/sidebar-promo-healthy-smiles.png" alt="Healthy Smiles, Happier Lives" className="mt-auto w-full" />
        </aside>

        {/* Bottom padding reserves room below the last row of content so it
            can clear the fixed QuickAddMenu "+" button — and, on the patient
            Overview page, the "Edit patient" pencil sitting in that same
            corner — which otherwise sit right on top of the last item in any
            list, unreachable even by scrolling further. Sized to each
            breakpoint's actual FAB position (see QuickAddMenu's own bottom
            offset logic): on patient-detail pages the FAB sits close to the
            bottom edge since the mobile tab bar is hidden there; everywhere
            else it sits higher, above that tab bar. */}
        <main className={`flex-1 md:pb-28 ${hideMobileNav ? 'pb-50' : 'pb-70'}`}>
          <Outlet />
        </main>
      </div>

      {/* mobile bottom tab bar — hidden inside a patient's own pages. Just
          Patients/Treatments now — the "+" QuickAddMenu button (rendered
          separately, positioned to line up here — see its own component)
          sits visually between them. */}
      {!hideMobileNav && (
        <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-rule bg-white md:hidden">
          {mobileNavItems.map(({ to, label, icon: Icon }) => (
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
      <img src="/images/logo-ranco-white.png" alt="Ranco Dental Clinic" className="h-10 w-auto md:h-[52px]" />
    </Link>
  )
}