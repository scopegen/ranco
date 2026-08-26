import { Navigate, Route, Routes } from 'react-router-dom'
import { Login } from './pages/Login'
import { StyleGuide } from './pages/StyleGuide'
import { AdminLayout } from './layouts/AdminLayout'
import { AuthProvider } from './state/AuthContext'
import { RequireAuth } from './components/RequireAuth'
import { PatientsProvider } from './state/PatientsContext'
import { ClinicProvider } from './state/ClinicContext'
import { Dashboard } from './pages/admin/Dashboard'
import { PatientList } from './pages/admin/PatientList'
import { NewPatient } from './pages/admin/NewPatient'
import { PatientDetail } from './pages/admin/PatientDetail'
import { PatientOverview } from './pages/admin/patient-detail/PatientOverview'
import { TimelineSection, ConsultationsSection, TreatmentsSection, BillingSection } from './pages/admin/patient-detail/SectionPages'
import { Services } from './pages/admin/Services'
import { Doctors } from './pages/admin/Doctors'
import { TreatmentsOverview } from './pages/admin/TreatmentsOverview'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Login />} />
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
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="patients/new" element={<NewPatient />} />
          <Route path="patients/:code/edit" element={<NewPatient />} />
          <Route path="patients/:code" element={<PatientDetail />}>
            <Route index element={<PatientOverview />} />
            <Route path="timeline" element={<TimelineSection />} />
            <Route path="consultations" element={<ConsultationsSection />} />
            <Route path="treatments" element={<TreatmentsSection />} />
            <Route path="billing" element={<BillingSection />} />
          </Route>
          <Route path="treatments" element={<TreatmentsOverview />} />
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