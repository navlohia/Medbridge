import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

/**
 * P13: password input with show/hide toggle + strength hint.
 * Used by the /auth/* sign-in and create-account forms (P15).
 * Policy mirrors the backend: minimum 8 characters.
 */

const STRENGTH = [
  { label: 'Too short', cls: 'bg-danger-500', text: 'text-danger-text' },
  { label: 'Weak', cls: 'bg-danger-500', text: 'text-danger-text' },
  { label: 'Fair', cls: 'bg-warning-500', text: 'text-warning-text' },
  { label: 'Good', cls: 'bg-clinical-500', text: 'text-clinical-700' },
  { label: 'Strong', cls: 'bg-clinical-600', text: 'text-clinical-700' }
];

function scorePassword(pw) {
  if (!pw || pw.length < 8) return 0;
  let score = 1;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

export default function PasswordField({
  id,
  label = 'Password',
  value,
  onChange,
  autoComplete = 'new-password',
  placeholder = 'At least 8 characters',
  showStrength = true,
  required = true,
  confirmOf = null
}) {
  const [visible, setVisible] = useState(false);
  const score = useMemo(() => scorePassword(value), [value]);
  const strength = STRENGTH[score];

  const mismatch = confirmOf !== null && value !== confirmOf && value.length > 0;

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-primary-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative rounded-button shadow-subtle">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-primary-400">
          <Lock className="w-4 h-4" />
        </div>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={8}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={mismatch || undefined}
          className="block w-full pl-9 pr-10 py-2 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:bg-white text-primary-900 font-medium"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-primary-400 hover:text-primary-600 cursor-pointer"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-surface-border overflow-hidden">
            <div
              className={`h-full ${strength.cls} transition-all duration-200`}
              style={{ width: `${(score / 4) * 100}%` }}
            />
          </div>
          <span className={`text-[11px] font-medium ${strength.text}`}>{strength.label}</span>
        </div>
      )}

      {mismatch && (
        <p className="mt-1 text-[11px] text-danger-text">Passwords do not match</p>
      )}
    </div>
  );
}
