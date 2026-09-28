import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { navigate } from '../router';
import { api } from '../api/client';
import { ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';
import LogoMark from '../components/common/LogoMark';
import PasswordField from '../components/auth/PasswordField';

/**
 * P41: forced password change on first login for accounts created with a
 * temporary password (admin-created or doctor quick-add). Full-screen gate —
 * no portal access until the password is changed.
 */
export default function ForceChangePasswordPage() {
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.changePassword(current, next, confirm);
      // Flag is cleared server-side; refresh the local copy so the gate lifts.
      const updated = { ...user, must_change_password: false };
      sessionStorage.setItem('medbridge_user', JSON.stringify(updated));
      setDone(true);
      setTimeout(() => navigate('/patient', { replace: false }), 1200);
    } catch (err) {
      setError(err.message || 'Could not change the password.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(55%_60%_at_15%_0%,rgba(13,148,136,0.10),transparent_60%)]" />
        <div className="absolute inset-0 hero-grid opacity-60" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative">
        <div className="flex justify-center mb-4"><LogoMark size="lg" /></div>
        <h1 className="font-heading font-extrabold text-2xl tracking-tight text-gradient-clinical">MedBridge</h1>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative">
        <div className="bg-white py-8 px-6 sm:px-8 border border-surface-border rounded-xl shadow-modal space-y-5">
          {done ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-success-text mx-auto" />
              <p className="text-sm font-bold text-primary-900">Password updated</p>
              <p className="text-xs text-primary-500">Opening your portal…</p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 p-3 bg-warning-bg border border-warning-border rounded-card">
                <ShieldAlert className="w-5 h-5 text-warning-text shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-warning-text">Choose your own password</p>
                  <p className="text-[11px] text-warning-text mt-0.5">
                    Your account was created with a temporary password. Set a new one to continue
                    {user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={submit} className="space-y-4">
                <PasswordField
                  id="force-current"
                  label="Temporary password"
                  value={current}
                  onChange={setCurrent}
                  autoComplete="current-password"
                  showStrength={false}
                />
                <PasswordField
                  id="force-new"
                  label="New password"
                  value={next}
                  onChange={setNext}
                  autoComplete="new-password"
                />
                <PasswordField
                  id="force-confirm"
                  label="Confirm new password"
                  value={confirm}
                  onChange={setConfirm}
                  confirmOf={next}
                  showStrength={false}
                  autoComplete="new-password"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-button shadow-subtle text-xs font-semibold text-white bg-clinical-600 hover:bg-clinical-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clinical-500 disabled:opacity-50 transition-med cursor-pointer"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  <span>{busy ? 'Saving…' : 'Save password and continue'}</span>
                </button>
              </form>

              <button
                type="button"
                onClick={logout}
                className="w-full text-center text-xs text-primary-400 hover:text-primary-600 cursor-pointer"
              >
                Sign out instead
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
