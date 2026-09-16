import { ArrowLeft, ChevronRight, LogOut, Package, UserCog } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext'

// Services/Doctors are reachable only from here now (no sidebar/tab-bar
// entries of their own) — this is the one way in, grouped alongside account
// actions (sign out) since that's the one thing that has no other home.
export function Settings() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            aria-label="Back to dashboard"
            title="Back"
            className="flex items-center justify-center rounded-full border border-rule bg-white p-1.5 text-ink-soft transition-colors hover:text-accent-deep"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <SettingsLink to="/admin/services" icon={Package} label="Services" bg="#E1F1FC" fg="#2F8FE0" />
        <SettingsLink to="/admin/doctors" icon={UserCog} label="Doctors" bg="#EDEBFB" fg="#6C5CE7" />
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-4 rounded-xl border border-rule bg-white px-5 py-4 text-left shadow-sm transition-colors hover:bg-paper-raised"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-crit-soft text-crit">
          <LogOut size={18} strokeWidth={2} />
        </span>
        <span className="flex-1 text-subheading font-medium text-crit">Sign out</span>
      </button>
    </div>
  )
}

function SettingsLink({
  to,
  icon: Icon,
  label,
  bg,
  fg,
}: {
  to: string
  icon: typeof Package
  label: string
  bg: string
  fg: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-xl border border-rule bg-white px-5 py-4 shadow-sm transition-colors hover:bg-paper-raised"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: bg, color: fg }}>
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="flex-1 text-subheading font-medium text-ink">{label}</span>
      <ChevronRight size={18} className="shrink-0 text-ink-faint" />
    </Link>
  )
}
