import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, Package, UserCog } from 'lucide-react'
import { useAuth } from '../../state/AuthContext'

// Services/Doctors also have their own direct nav entries (sidebar + mobile
// tab bar) — this page is a second way in, not a replacement for those,
// grouped here alongside account actions (sign out) since that's the one
// thing that has no other home.
export function Settings() {
  const { staff, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1>Settings</h1>
        <p className="text-ink-soft">
          Signed in as {staff?.name} <span className="capitalize">({staff?.role})</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <SettingsLink to="/admin/services" icon={Package} label="Services" description="Manage the service catalog" />
        <SettingsLink to="/admin/doctors" icon={UserCog} label="Doctors" description="Manage doctor accounts" />
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-lg border border-rule bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-paper-raised"
      >
        <LogOut size={18} strokeWidth={2} className="text-crit" />
        <span className="text-body font-medium text-crit">Sign out</span>
      </button>
    </div>
  )
}

function SettingsLink({
  to,
  icon: Icon,
  label,
  description,
}: {
  to: string
  icon: typeof Package
  label: string
  description: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-rule bg-white px-4 py-3 shadow-sm transition-colors hover:bg-paper-raised"
    >
      <Icon size={18} strokeWidth={2} className="text-ink-soft" />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-body font-medium text-ink">{label}</span>
        <span className="text-[12px] text-ink-faint">{description}</span>
      </div>
      <ChevronRight size={16} className="text-ink-faint" />
    </Link>
  )
}
