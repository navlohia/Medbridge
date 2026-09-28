import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { usePath, navigate, pathStartsWith } from './router';
import RolePickerPage from './pages/RolePickerPage';
import AuthPage from './pages/AuthPage';
import DoctorDashboardPage from './pages/DoctorDashboardPage';
import PatientDashboardPage from './pages/PatientDashboardPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import ForceChangePasswordPage from './pages/ForceChangePasswordPage';
import { SkeletonLine } from './components/common/Skeleton';
import LogoMark from './components/common/LogoMark';

const ROLE_HOME = {
  doctor: '/doctor',
  patient: '/patient',
  admin: '/admin'
};

// Known routes per area — anything else inside an area is a branded 404.
// (Doctor tab deep links land with brief Phase 3.)
const KNOWN_PATHS = new Set([
  '/login', '/',
  '/auth/patient', '/auth/doctor', '/auth/admin',
  '/doctor',
  '/patient',
  '/admin', '/admin/doctors', '/admin/patients', '/admin/appointments'
]);

/** Branded unknown-route state — never a bare blank page. */
function NotFound() {
  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
      <div className="bg-white border border-surface-border rounded-card shadow-card p-8 max-w-sm w-full text-center space-y-4">
        <LogoMark size="lg" />
        <h1 className="font-heading font-extrabold text-xl text-primary-950 tracking-tight">
          Page not found
        </h1>
        <p className="text-xs text-primary-500">
          That link doesn't match anything in MedBridge. Head back to your workspace.
        </p>
        <button
          onClick={() => navigate('/')}
          className="w-full py-2.5 rounded-button bg-gradient-to-b from-clinical-500 to-clinical-600 text-white font-heading font-bold text-xs shadow-subtle transition-med cursor-pointer"
        >
          Take me home
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const path = usePath();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
        <div className="bg-white border border-surface-border rounded-xl p-8 shadow-card w-full max-w-sm space-y-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-clinical-50 border border-clinical-200 mx-auto flex items-center justify-center text-clinical-600 font-bold">
            M
          </div>
          <SkeletonLine className="h-4 w-3/4 mx-auto" />
          <SkeletonLine className="h-3 w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  // Signed out → role picker at "/", per-role auth pages at /auth/:role.
  // (Legacy /login folds into the picker.)
  if (!user) {
    const authMatch = path.match(/^\/auth\/(patient|doctor|admin)$/);
    if (authMatch) {
      return <AuthPage key={authMatch[1]} role={authMatch[1]} />;
    }
    return <RolePickerPage />;
  }

  // P41: forced password change — full-screen gate before any portal access.
  if (user.must_change_password) {
    return <ForceChangePasswordPage />;
  }

  // Signed in but on an auth surface → role home.
  if (
    path === '/login' || path === '/' || path.startsWith('/auth/')
  ) {
    const home = ROLE_HOME[user.role] || '/';
    if (path !== home) {
      navigate(home, { replace: true });
      return null;
    }
  }

  // Role/area mismatch → redirect to own home.
  const area = pathStartsWith(path, '/doctor') ? 'doctor'
    : pathStartsWith(path, '/patient') ? 'patient'
    : pathStartsWith(path, '/admin') ? 'admin'
    : null;

  if (area && area !== user.role) {
    navigate(ROLE_HOME[user.role], { replace: true });
    return null;
  }

  if (pathStartsWith(path, '/doctor')) {
    return path === '/doctor' ? <DoctorDashboardPage /> : <NotFound />;
  }
  if (pathStartsWith(path, '/patient')) {
    return path === '/patient' ? <PatientDashboardPage /> : <NotFound />;
  }
  if (pathStartsWith(path, '/admin')) {
    return KNOWN_PATHS.has(path) ? <AdminDashboardPage /> : <NotFound />;
  }

  // Anything else → branded 404 (signed-in users can reach it via bad links).
  return <NotFound />;
}

export default function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <AppContent />
      </RealtimeProvider>
    </AuthProvider>
  );
}
