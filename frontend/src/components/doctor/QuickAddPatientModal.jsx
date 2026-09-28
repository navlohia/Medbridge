import React, { useEffect, useState } from 'react';
import { UserPlus, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';

/**
 * Doctor quick-add (Round 2 Block X, Phases 133–136): a fast walk-in
 * registration reachable from PatientSelector. Deliberately lighter than the
 * admin version — name, email, DOB only. Same shared backend utility as
 * admin-create, so behavior is identical everywhere accounts are born.
 */
export default function QuickAddPatientModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', dob: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({ name: '', email: '', dob: '' });
      setError(null);
      setCreated(null);
      setCopied(false);
    }
  }, [isOpen]);

  const submit = async () => {
    setError(null);

    // Inline validation matching the existing form-validation language
    if (form.name.trim().length < 2) {
      setError('Please enter the patient\u2019s full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!form.dob) {
      setError('Date of birth is required.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.quickAddPatient({
        name: form.name.trim(),
        email: form.email.trim(),
        dob: form.dob
      });
      setCreated(res);
      if (onCreated) onCreated(res);
    } catch (err) {
      setError(err.message || 'Could not register the patient.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.temp_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      icon={UserPlus}
      title="Quick-Add Patient"
      subtitle="Register a walk-in in under 30 seconds"
      footer={
        created ? null : (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Registering…</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register Patient</span>
                </>
              )}
            </Button>
          </div>
        )
      }
    >
      {error && (
        <div className="p-2.5 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {created ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-card bg-success-bg border border-success-border">
            <Check className="w-5 h-5 text-success-text shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-success-text">{created.user.name} is registered and selected.</p>
              <p className="text-xs text-primary-600 mt-0.5">
                Hand over the temporary password now — it is shown <span className="font-bold">only once</span>.
              </p>
            </div>
          </div>
          <div className="p-4 rounded-card border border-surface-border bg-surface-subtle/60 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary-500">Sign-in email</span>
              <span className="text-sm font-semibold text-primary-900 font-mono">{created.user.email}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary-500">Temporary password</span>
              <span className="text-sm font-bold text-primary-900 font-mono">{created.temp_password}</span>
            </div>
          </div>
          <p className="text-xs text-primary-500 italic bg-surface-subtle/60 border border-surface-border rounded-card p-3">
            “{created.handoff_message}”
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={copy}>
              {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy password'}</span>
            </Button>
            <Button variant="primary" onClick={onClose}>Start Visit</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-1">
              Full name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Jordan Miles"
              className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-1">
              Email <span className="text-danger">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              placeholder="patient@example.com"
              className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-1">
              Date of birth <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              value={form.dob}
              onChange={e => setForm(prev => ({ ...prev, dob: e.target.value }))}
              className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
            />
          </div>
          <p className="text-xs text-primary-400">
            A temporary password is generated automatically — the patient changes it after first sign-in.
          </p>
        </div>
      )}
    </Modal>
  );
}
