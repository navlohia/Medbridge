import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { navigate } from '../router';
import { api } from '../api/client';
import { Mail, User, ArrowLeft, ArrowRight, Loader2, Stethoscope, ShieldCheck, KeyRound } from 'lucide-react';
import LogoMark from '../components/common/LogoMark';
import PasswordField from '../components/auth/PasswordField';

/**
 * P15/P16: per-role auth pages at /auth/{patient|doctor|admin}.
 * - Sign in for every role (POST /auth/login now carries {role}; a role
 *   mismatch returns the same generic 401 as a wrong password).
 * - "Create account" for patient and doctor; admin has no public sign-up but
 *   offers a one-time bootstrap form while the clinic has zero admins (P12).
 * - Registration returns a session, so the user lands straight in their portal.
 */

const ROLE_CONFIG = {
  patient: {
    title: 'Patient portal',
    icon: User,
    canRegister: true
  },
  doctor: {
    title: 'Clinician portal',
    icon: Stethoscope,
    canRegister: true
  },
  admin: {
    title: 'Administrator portal',
    icon: ShieldCheck,
    canRegister: false // one-time bootstrap only
  }
};

function readNotice() {
  // Pure read: StrictMode may invoke initializers twice, so the removal of the
  // stored notice happens in an effect, not here.
  return sessionStorage.getItem('medbridge_auth_notice');
}

export default function AuthPage({ role = 'patient' }) {
  const { login, applySession } = useAuth();
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.patient;

  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [notice, setNotice] = useState(readNotice);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Sign-in fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Registration fields
  const [name, setName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [accessCode, setAccessCode] = useState('');

  // Admin one-time bootstrap
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [adminCountKnown, setAdminCountKnown] = useState(false);

  useEffect(() => {
    if (notice) sessionStorage.removeItem('medbridge_auth_notice');
  }, [notice]);

  useEffect(() => {
    document.title = `MedBridge — ${cfg.title}`;
    if (role !== 'admin') return;
    let cancelled = false;
    api.adminExists()
      .then((d) => {
        if (!cancelled) {
          setBootstrapAvailable(!d.adminsExist);
          setAdminCountKnown(true);
        }
      })
      .catch(() => {
        if (!cancelled) setAdminCountKnown(true); // endpoint down → just hide bootstrap
      });
    return () => {
      cancelled = true;
    };
  }, [role, cfg.title]);

  const finish = (data) => {
    applySession(data);
    const home = { patient: '/patient', doctor: '/doctor', admin: '/admin' }[data.user.role] || '/';
    navigate(home, { replace: true });
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password, role);
    } catch (err) {
      setError(err.message || 'Invalid credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (role === 'patient') {
        const data = await api.registerPatient({
          name, email,
          password: regPassword,
          password_confirm: confirmPassword,
          dob,
          gender: gender || undefined,
          phone: phone || undefined
        });
        finish(data);
      } else {
        const data = await api.registerDoctor({
          name, email,
          password: regPassword,
          password_confirm: confirmPassword,
          specialization,
          access_code: accessCode
        });
        finish(data);
      }
    } catch (err) {
      setError(err.message || 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  const handleBootstrap = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api.registerAdminBootstrap({
        name, email,
        password: regPassword,
        password_confirm: confirmPassword,
        invite_code: accessCode
      });
      finish(data);
    } catch (err) {
      setError(err.message || 'Bootstrap failed.');
    } finally {
      setBusy(false);
    }
  };

  const showRegister = mode === 'register' && (role !== 'admin' || bootstrapAvailable);

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(55%_60%_at_15%_0%,rgba(13,148,136,0.10),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(45%_55%_at_100%_100%,rgba(15,118,110,0.07),transparent_65%)]" />
        <div className="absolute inset-0 hero-grid opacity-60" style={{ maskImage: 'none', WebkitMaskImage: 'none' }} />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative">
        <div className="flex justify-center mb-4">
          <LogoMark size="lg" />
        </div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight">
          <span className="text-gradient-clinical">MedBridge</span>
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-primary-500 font-sans">
          {cfg.title}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative">
        <div className="bg-white py-8 px-6 sm:px-8 border border-surface-border rounded-xl shadow-modal space-y-6">
          {notice && (
            <div className="p-3 bg-warning-bg border border-warning-border rounded-card text-xs text-warning-text font-medium">
              {notice}
            </div>
          )}
          {error && (
            <div className="p-3 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text font-medium">
              {error}
            </div>
          )}

          {/* ---------- SIGN IN ---------- */}
          {!showRegister && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="block text-xs font-semibold text-primary-700 mb-1">Account email</label>
                <div className="relative rounded-button shadow-subtle">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-primary-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="block w-full pl-9 pr-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                  />
                </div>
              </div>

              <PasswordField
                id="auth-password"
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                placeholder="Your password"
                showStrength={false}
              />

              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-button shadow-subtle text-xs font-semibold text-white bg-clinical-600 hover:bg-clinical-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clinical-500 disabled:opacity-50 transition-med cursor-pointer"
              >
                {busy ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Signing in…</span></>
                ) : (
                  <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              {(cfg.canRegister || (role === 'admin' && adminCountKnown && bootstrapAvailable)) && (
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(null); }}
                  className="w-full text-center text-xs text-clinical-700 font-semibold hover:text-clinical-800 cursor-pointer"
                >
                  {role === 'admin' ? 'Create the first administrator account' : 'Create account'}
                </button>
              )}
            </form>
          )}

          {/* ---------- REGISTER (patient / doctor) ---------- */}
          {showRegister && role !== 'admin' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-semibold text-primary-700 mb-1">Full name</label>
                <input
                  id="reg-name" type="text" required value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Jordan Miles"
                  className="block w-full px-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                />
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-xs font-semibold text-primary-700 mb-1">Email</label>
                <input
                  id="reg-email" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                  className="block w-full px-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                />
              </div>

              {role === 'patient' ? (
                <>
                  <div>
                    <label htmlFor="reg-dob" className="block text-xs font-semibold text-primary-700 mb-1">Date of birth</label>
                    <input
                      id="reg-dob" type="date" required value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="block w-full px-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reg-gender" className="block text-xs font-semibold text-primary-700 mb-1">Gender <span className="font-normal text-primary-400">(optional)</span></label>
                      <select
                        id="reg-gender" value={gender} onChange={(e) => setGender(e.target.value)}
                        className="block w-full px-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                      >
                        <option value="">Prefer not to say</option>
                        <option>Female</option>
                        <option>Male</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="reg-phone" className="block text-xs font-semibold text-primary-700 mb-1">Phone <span className="font-normal text-primary-400">(optional)</span></label>
                      <input
                        id="reg-phone" type="tel" value={phone}
                        onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0100"
                        className="block w-full px-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="reg-spec" className="block text-xs font-semibold text-primary-700 mb-1">Specialization</label>
                    <input
                      id="reg-spec" type="text" required value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)} placeholder="Cardiology"
                      className="block w-full px-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-code" className="block text-xs font-semibold text-primary-700 mb-1">Clinic access code</label>
                    <div className="relative rounded-button shadow-subtle">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-primary-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        id="reg-code" type="password" required value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)} placeholder="Provided by your clinic"
                        className="block w-full pl-9 pr-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                      />
                    </div>
                  </div>
                </>
              )}

              <PasswordField
                id="reg-password"
                label="Password"
                value={regPassword}
                onChange={setRegPassword}
                autoComplete="new-password"
              />
              <PasswordField
                id="reg-confirm"
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                confirmOf={regPassword}
                showStrength={false}
                autoComplete="new-password"
              />

              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-button shadow-subtle text-xs font-semibold text-white bg-clinical-600 hover:bg-clinical-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clinical-500 disabled:opacity-50 transition-med cursor-pointer"
              >
                {busy ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Creating account…</span></>
                ) : (
                  <><span>Create account</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); }}
                className="w-full text-center text-xs text-primary-500 hover:text-primary-700 cursor-pointer"
              >
                Already have an account? Sign in
              </button>
            </form>
          )}

          {/* ---------- ADMIN ONE-TIME BOOTSTRAP ---------- */}
          {showRegister && role === 'admin' && (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="p-3 bg-clinical-50 border border-clinical-200 rounded-card text-xs text-clinical-800">
                This clinic has no administrator yet. Create the first one with the admin invite code.
              </div>
              <div>
                <label htmlFor="boot-name" className="block text-xs font-semibold text-primary-700 mb-1">Full name</label>
                <input
                  id="boot-name" type="text" required value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Priya Nair"
                  className="block w-full px-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                />
              </div>
              <div>
                <label htmlFor="boot-email" className="block text-xs font-semibold text-primary-700 mb-1">Email</label>
                <input
                  id="boot-email" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="admin@medbridge.com"
                  className="block w-full px-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                />
              </div>
              <div>
                <label htmlFor="boot-code" className="block text-xs font-semibold text-primary-700 mb-1">Admin invite code</label>
                <input
                  id="boot-code" type="password" required value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)} placeholder="ADMIN-…"
                  className="block w-full px-3 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
                />
              </div>
              <PasswordField
                id="boot-password"
                label="Password"
                value={regPassword}
                onChange={setRegPassword}
                autoComplete="new-password"
              />
              <PasswordField
                id="boot-confirm"
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                confirmOf={regPassword}
                showStrength={false}
                autoComplete="new-password"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-button shadow-subtle text-xs font-semibold text-white bg-clinical-600 hover:bg-clinical-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-clinical-500 disabled:opacity-50 transition-med cursor-pointer"
              >
                {busy ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Creating admin…</span></>
                ) : (
                  <><span>Create admin account</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); }}
                className="w-full text-center text-xs text-primary-500 hover:text-primary-700 cursor-pointer"
              >
                Back to sign in
              </button>
            </form>
          )}

          {/* Back to role picker */}
          <div className="pt-2 border-t border-surface-border text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-600 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Choose a different role
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
