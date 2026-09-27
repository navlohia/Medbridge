import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DoctorDashboardPage from './pages/DoctorDashboardPage';
import PatientDashboardPage from './pages/PatientDashboardPage';
import { SkeletonLine } from './components/common/Skeleton';

function AppContent() {
  const { user, loading } = useAuth();

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

  if (!user) {
    return <LoginPage />;
  }

  if (user.role === 'doctor') {
    return <DoctorDashboardPage />;
  }

  return <PatientDashboardPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
