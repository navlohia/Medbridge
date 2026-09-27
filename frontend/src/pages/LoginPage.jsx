import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Stethoscope, User, Lock, Mail, ArrowRight, ShieldCheck, HeartPulse, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('doctor@medbridge.com');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message || 'Invalid credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const setDemoPersona = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('demo1234');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-surface-base flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-clinical-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Icon */}
        <div className="w-14 h-14 rounded-2xl bg-white border border-clinical-200/80 mx-auto flex items-center justify-center text-clinical-600 shadow-card mb-4">
          <HeartPulse className="w-8 h-8 stroke-[2.2]" />
        </div>

        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-primary-950 tracking-tight">
          MedBridge
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-primary-500 font-sans">
          Connected Clinical Records & Patient Intelligence
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-8 border border-surface-border rounded-xl shadow-card space-y-6">
          {/* Demo Persona Quick Selectors */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary-400 block">
              Quick Demo Personas (Click to Load)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDemoPersona('doctor@medbridge.com')}
                className={`p-2.5 rounded-lg border text-left transition-med flex flex-col justify-between ${
                  email === 'doctor@medbridge.com'
                    ? 'border-clinical-500 bg-clinical-50/60 ring-1 ring-clinical-500'
                    : 'border-surface-border bg-surface-subtle/50 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-clinical-700 font-bold text-xs">
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>Doctor</span>
                </div>
                <div className="text-[10px] text-primary-600 font-medium truncate mt-1">
                  Dr. Reed
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDemoPersona('patient1@medbridge.com')}
                className={`p-2.5 rounded-lg border text-left transition-med flex flex-col justify-between ${
                  email === 'patient1@medbridge.com'
                    ? 'border-clinical-500 bg-clinical-50/60 ring-1 ring-clinical-500'
                    : 'border-surface-border bg-surface-subtle/50 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-primary-800 font-bold text-xs">
                  <User className="w-3.5 h-3.5" />
                  <span>Patient 1</span>
                </div>
                <div className="text-[10px] text-primary-600 font-medium truncate mt-1">
                  Marcus Vance
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDemoPersona('patient2@medbridge.com')}
                className={`p-2.5 rounded-lg border text-left transition-med flex flex-col justify-between ${
                  email === 'patient2@medbridge.com'
                    ? 'border-clinical-500 bg-clinical-50/60 ring-1 ring-clinical-500'
                    : 'border-surface-border bg-surface-subtle/50 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-primary-800 font-bold text-xs">
                  <User className="w-3.5 h-3.5" />
                  <span>Patient 2</span>
                </div>
                <div className="text-[10px] text-primary-600 font-medium truncate mt-1">
                  Elena Rostova
                </div>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text font-medium">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-primary-700 mb-1">
                Account Email
              </label>
              <div className="relative rounded-button shadow-subtle">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-primary-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@medbridge.com"
                  className="block w-full pl-9 pr-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-primary-700 mb-1">
                Password
              </label>
              <div className="relative rounded-button shadow-subtle">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-primary-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="demo1234"
                  className="block w-full pl-9 pr-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-button shadow-subtle text-xs font-semibold text-white bg-clinical-600 hover:bg-clinical-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clinical-500 disabled:opacity-50 transition-med cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to EMR</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="pt-2 border-t border-surface-border text-center">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-primary-400">
              <ShieldCheck className="w-3.5 h-3.5 text-clinical-600" />
              <span>Role-gated clinical records • Localhost SQLite DB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
