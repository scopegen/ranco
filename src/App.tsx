import { Navigate, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { StyleGuide } from './pages/StyleGuide'
import { AdminLayout } from './layouts/AdminLayout'
import { AuthProvider } from './state/AuthContext'
import { RequireAuth } from './components/RequireAuth'
import { PatientsProvider } from './state/PatientsContext'
import { ClinicProvider } from './state/ClinicContext'
import { PatientList } from './pages/admin/PatientList'
import { NewPatient } from './pages/admin/NewPatient'
import { PatientDetail } from './pages/admin/PatientDetail'
import { Services } from './pages/admin/Services'
import { Doctors } from './pages/admin/Doctors'
import { TreatmentsOverview } from './pages/admin/TreatmentsOverview'
import { BillingOverview } from './pages/admin/BillingOverview'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/style-guide" element={<StyleGuide />} />

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <PatientsProvider>
                <ClinicProvider>
                  <AdminLayout />
                </ClinicProvider>
              </PatientsProvider>
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="patients" replace />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="patients/new" element={<NewPatient />} />
          <Route path="patients/:id/edit" element={<NewPatient />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="treatments" element={<TreatmentsOverview />} />
          <Route path="billing" element={<BillingOverview />} />
          <Route path="services" element={<Services />} />
          <Route path="doctors" element={<Doctors />} />
        </Route>

        {/* Doctor and Admin share one role-aware shell — no separate panel to build.
            This just catches old bookmarks/links to the retired placeholder. */}
        <Route path="/doctor/*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App