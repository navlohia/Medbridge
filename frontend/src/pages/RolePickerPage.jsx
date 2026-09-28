import React, { useEffect, useState } from 'react';
import { navigate } from '../router';
import { Stethoscope, User, ShieldCheck, ArrowRight } from 'lucide-react';
import LogoMark from '../components/common/LogoMark';

/**
 * P14: "/" is a role picker with three large cards. Each goes to
 * /auth/{patient|doctor|admin}. Rendered only while signed out (App.jsx).
 */
const ROLES = [
  {
    id: 'patient',
    title: 'Patient',
    blurb: 'Track symptoms and vitals, book appointments, and follow your treatment plan.',
    icon: User,
    accent: 'bg-clinical-50 text-clinical-700 border-clinical-200',
    hover: 'hover:border-clinical-400 hover:shadow-card'
  },
  {
    id: 'doctor',
    title: 'Doctor',
    blurb: 'Review patient charts, document visits, confirm appointments, and give guidance.',
    icon: Stethoscope,
    accent: 'bg-primary-100 text-primary-800 border-primary-200',
    hover: 'hover:border-primary-500 hover:shadow-card'
  },
  {
    id: 'admin',
    title: 'Administrator',
    blurb: 'Manage clinic accounts and oversee appointment activity across the practice.',
    icon: ShieldCheck,
    accent: 'bg-primary-950/5 text-primary-950 border-primary-200',
    hover: 'hover:border-primary-500 hover:shadow-card'
  }
];

export default function RolePickerPage() {
  // P05: the api client drops the user here with a message when a session
  // expires or is revoked — show it once, then clear it. The read stays pure
  // (StrictMode double-invokes initializers); removal happens in the effect.
  const [notice] = useState(() => sessionStorage.getItem('medbridge_auth_notice'));

  useEffect(() => {
    if (notice) sessionStorage.removeItem('medbridge_auth_notice');
  }, [notice]);

  useEffect(() => {
    document.title = 'MedBridge — Choose your portal';
  }, []);

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(55%_60%_at_15%_0%,rgba(13,148,136,0.10),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(45%_55%_at_100%_100%,rgba(15,118,110,0.07),transparent_65%)]" />
        <div className="absolute inset-0 hero-grid opacity-60" style={{ maskImage: 'none', WebkitMaskImage: 'none' }} />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-3xl text-center relative">
        <div className="flex justify-center mb-4">
          <LogoMark size="lg" />
        </div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight">
          <span className="text-gradient-clinical">MedBridge</span>
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-primary-500 font-sans">
          Connected Clinical Records &amp; Patient Intelligence
        </p>
        <h2 className="mt-6 font-heading font-bold text-lg text-primary-900">Choose your portal</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-3xl px-4 sm:px-0 relative">
        {notice && (
          <div className="mb-4 p-3 bg-warning-bg border border-warning-border rounded-card text-xs text-warning-text font-medium">
            {notice}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {ROLES.map(({ id, title, blurb, icon: Icon, accent, hover }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(`/auth/${id}`)}
              className={`group text-left bg-white border border-surface-border rounded-xl p-5 space-y-3 shadow-subtle transition-med cursor-pointer ${hover}`}
            >
              <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${accent}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-heading font-bold text-sm text-primary-900 flex items-center gap-1">
                  {title}
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-clinical-600" />
                </div>
                <p className="mt-1 text-xs text-primary-500 leading-relaxed">{blurb}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-primary-400">
          Patients can create their own account. Doctor sign-up needs a clinic access code.
        </p>
      </div>
    </div>
  );
}
