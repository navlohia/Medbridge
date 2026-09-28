import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Stethoscope, User, LogOut, ArrowRightLeft, ShieldCheck } from 'lucide-react';
import LogoMark from './LogoMark';

export default function Navbar() {
  const { user, logout, login } = useAuth();

  const handleQuickSwitch = async (email) => {
    try {
      await login(email, 'demo1234');
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err) {
      console.error('Quick switch failed:', err);
    }
  };

  const roleChip = user?.role === 'doctor'
    ? { label: 'Clinician', cls: 'bg-clinical-100 text-clinical-800 border-clinical-200' }
    : user?.role === 'admin'
      ? { label: 'Admin', cls: 'bg-clinical-600 text-white border-clinical-600' }
      : { label: 'Patient', cls: 'bg-primary-100 text-primary-700 border-primary-200' };

  return (
    <header className="bg-surface-card border-b border-surface-border sticky top-0 z-30 shadow-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <LogoMark size="md" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-bold text-lg text-primary-900 tracking-tight">MedBridge</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-primary-100 text-primary-700">
                Local-First EMR
              </span>
            </div>
            <p className="text-xs text-primary-500 hidden sm:block">Connected Clinical Records & Patient Intelligence</p>
          </div>
        </div>

        {/* User context & Quick switcher */}
        {user && (
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Quick Demo Switcher Pills */}
            <div className="hidden lg:flex items-center gap-1.5 bg-surface-subtle p-1 rounded-button border border-surface-border text-xs">
              <span className="text-xs font-medium text-primary-500 px-2 flex items-center gap-1">
                <ArrowRightLeft className="w-3 h-3 text-primary-400" /> Demo Switch:
              </span>
              <button
                onClick={() => handleQuickSwitch('doctor@medbridge.com')}
                className={`px-2 py-1 rounded transition-med font-medium cursor-pointer ${
                  user.role === 'doctor'
                    ? 'bg-clinical-600 text-white shadow-subtle'
                    : 'text-primary-600 hover:text-primary-900 hover:bg-white'
                }`}
                title="Switch to Dr. Evelyn Reed"
              >
                Dr. Reed
              </button>
              <button
                onClick={() => handleQuickSwitch('patient1@medbridge.com')}
                className={`px-2 py-1 rounded transition-med font-medium cursor-pointer ${
                  user.role === 'patient' && user.email === 'patient1@medbridge.com'
                    ? 'bg-clinical-600 text-white shadow-subtle'
                    : 'text-primary-600 hover:text-primary-900 hover:bg-white'
                }`}
                title="Switch to Marcus Vance"
              >
                Marcus (Patient 1)
              </button>
              <button
                onClick={() => handleQuickSwitch('patient2@medbridge.com')}
                className={`px-2 py-1 rounded transition-med font-medium cursor-pointer ${
                  user.email === 'patient2@medbridge.com'
                    ? 'bg-clinical-600 text-white shadow-subtle'
                    : 'text-primary-600 hover:text-primary-900 hover:bg-white'
                }`}
                title="Switch to Elena Rostova"
              >
                Elena (Patient 2)
              </button>
              <button
                onClick={() => handleQuickSwitch('admin@medbridge.com')}
                className={`px-2 py-1 rounded transition-med font-medium cursor-pointer ${
                  user.role === 'admin'
                    ? 'bg-primary-950 text-white shadow-subtle'
                    : 'text-primary-600 hover:text-primary-900 hover:bg-white'
                }`}
                title="Switch to Priya Nair (Admin)"
              >
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Admin
                </span>
              </button>
            </div>

            {/* Current user badge */}
            <div className="flex items-center gap-2 pl-2 sm:border-l sm:border-surface-border">
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-heading font-semibold text-xs border border-primary-200">
                {user.role === 'doctor' ? (
                  <Stethoscope className="w-4 h-4 text-clinical-700" />
                ) : user.role === 'admin' ? (
                  <ShieldCheck className="w-4 h-4 text-primary-800" />
                ) : (
                  <User className="w-4 h-4 text-primary-700" />
                )}
              </div>
              <div className="text-left hidden md:block">
                <div className="text-xs font-semibold text-primary-900 flex items-center gap-1.5 leading-tight">
                  {user.name}
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${roleChip.cls}`}>
                    {roleChip.label}
                  </span>
                </div>
                <div className="text-xs text-primary-500 truncate max-w-[160px]">
                  {user.specialization || (user.role === 'admin' ? 'Administrator' : user.email)}
                </div>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              className="p-2 rounded-button text-primary-500 hover:text-primary-900 hover:bg-surface-subtle transition-med cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
