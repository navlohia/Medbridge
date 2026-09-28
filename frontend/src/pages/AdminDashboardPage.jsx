import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePath, navigate, pathSegment } from '../router';
import { api } from '../api/client';
import Navbar from '../components/common/Navbar';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Toast from '../components/common/Toast';
import EmptyState from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import { SkeletonCard, SkeletonLine } from '../components/common/Skeleton';
import {
  LayoutDashboard, Stethoscope, Users, CalendarDays, Search, Plus, Copy, Check,
  ShieldCheck, ShieldOff, UserPlus, Inbox, Activity, FlaskConical
} from 'lucide-react';

/* ---------------------------------- utils ---------------------------------- */

function initialsOf(name = '') {
  return name.replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const APPOINTMENT_STATUS_META = {
  requested: { label: 'Requested', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  reschedule_proposed: { label: 'Reschedule proposed', variant: 'clinical' }
};

const NAV = [
  { id: null, label: 'Overview', icon: LayoutDashboard },
  { id: 'doctors', label: 'Doctors', icon: Stethoscope },
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'appointments', label: 'Appointments', icon: CalendarDays }
];

/* ------------------------------ shared modals ------------------------------ */

function TempPasswordSuccess({ name, email, password, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-card bg-success-bg border border-success-border">
        <Check className="w-5 h-5 text-success-text shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-success-text">{name}'s account is ready.</p>
          <p className="text-xs text-primary-600 mt-0.5">
            This temporary password is shown <span className="font-bold">only once</span>. Copy it now and hand it over securely.
          </p>
        </div>
      </div>
      <div className="p-4 rounded-card border border-surface-border bg-surface-subtle/60 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary-500">Sign-in email</span>
          <span className="text-sm font-semibold text-primary-900 font-mono">{email}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary-500">Temporary password</span>
          <span className="text-sm font-bold text-primary-900 font-mono">{password}</span>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={copy}>
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy password'}</span>
        </Button>
        <Button variant="primary" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

function AddDoctorModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', specialization: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setForm({ name: '', email: '', specialization: '' });
      setError(null);
      setCreated(null);
    }
  }, [isOpen]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.createAdminDoctor(form);
      setCreated({ name: res.user.name, email: res.user.email, password: res.temp_password });
      onCreated(res);
    } catch (err) {
      setError(err.message || 'Could not create the doctor account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen} onClose={onClose} size="sm" icon={Stethoscope}
      title="Add Doctor" subtitle="Creates a real, immediately usable account"
      footer={
        created ? null : (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={busy || !form.name || !form.email || !form.specialization}>
              <Plus className="w-3.5 h-3.5" />
              <span>{busy ? 'Creating…' : 'Create Doctor'}</span>
            </Button>
          </div>
        )
      }
    >
      {error && (
        <div className="p-2.5 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text">{error}</div>
      )}
      {created ? (
        <TempPasswordSuccess {...created} onDone={onClose} />
      ) : (
        <div className="space-y-3">
          {[
            { key: 'name', label: 'Full name', placeholder: 'Dr. Jordan Blake, MD', type: 'text' },
            { key: 'email', label: 'Email', placeholder: 'dr.blake@medbridge.com', type: 'email' },
            { key: 'specialization', label: 'Specialization', placeholder: 'Cardiology', type: 'text' }
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-primary-700 mb-1">
                {f.label} <span className="text-danger">*</span>
              </label>
              <input
                type={f.type}
                value={form[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          ))}
          <p className="text-xs text-primary-400">
            A temporary password is generated automatically — there is no self-signup in MedBridge.
          </p>
        </div>
      )}
    </Modal>
  );
}

function AddPatientModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', dob: '', gender: '', phone: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setForm({ name: '', email: '', dob: '', gender: '', phone: '' });
      setError(null);
      setCreated(null);
    }
  }, [isOpen]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.createAdminPatient({
        name: form.name, email: form.email, dob: form.dob,
        gender: form.gender || undefined, phone: form.phone || undefined
      });
      setCreated({ name: res.user.name, email: res.user.email, password: res.temp_password });
      onCreated(res);
    } catch (err) {
      setError(err.message || 'Could not create the patient account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen} onClose={onClose} size="sm" icon={UserPlus}
      title="Add Patient" subtitle="Creates a real, immediately usable account"
      footer={
        created ? null : (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={busy || !form.name || !form.email || !form.dob}>
              <Plus className="w-3.5 h-3.5" />
              <span>{busy ? 'Creating…' : 'Create Patient'}</span>
            </Button>
          </div>
        )
      }
    >
      {error && (
        <div className="p-2.5 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text">{error}</div>
      )}
      {created ? (
        <TempPasswordSuccess {...created} onDone={onClose} />
      ) : (
        <div className="space-y-3">
          {[
            { key: 'name', label: 'Full name', placeholder: 'Jamie Rivera', type: 'text' },
            { key: 'email', label: 'Email', placeholder: 'jamie@example.com', type: 'email' }
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-primary-700 mb-1">
                {f.label} <span className="text-danger">*</span>
              </label>
              <input
                type={f.type}
                value={form[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="block text-xs font-semibold text-primary-700 mb-1">Gender</label>
              <select
                value={form.gender}
                onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}
                className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
              >
                <option value="">Optional…</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-1">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="Optional"
              className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
            />
          </div>
          <p className="text-xs text-primary-400">
            A temporary password is generated automatically and shown once after creation.
          </p>
        </div>
      )}
    </Modal>
  );
}

function DeactivateDialog({ target, onConfirm, onClose, busy }) {
  const activating = target?.nextActive === true;
  return (
    <Modal
      isOpen={Boolean(target)} onClose={onClose} size="sm"
      icon={activating ? ShieldCheck : ShieldOff}
      title={activating ? 'Reactivate account' : 'Deactivate account'}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant={activating ? 'primary' : 'danger'}
            onClick={() => onConfirm(target)}
            disabled={busy}
          >
            {activating ? 'Reactivate' : 'Deactivate'}
          </Button>
        </div>
      }
    >
      {activating ? (
        <p className="text-sm text-primary-700">
          <span className="font-bold">{target?.name}</span> will be able to sign in again immediately. Their history was never touched.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-primary-700">
            <span className="font-bold">{target?.name}</span> will no longer be able to sign in.
          </p>
          <div className="p-3 rounded-card bg-surface-subtle border border-surface-border text-xs text-primary-600 space-y-1">
            <p className="font-semibold text-primary-800">What this does NOT do:</p>
            <p>• No visits, prescriptions, or journal entries are deleted or edited.</p>
            <p>• Their full clinical history stays visible to clinicians.</p>
            <p>• You can reactivate the account at any time.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* --------------------------------- tables --------------------------------- */

function AccountRow({ user, onToggle, onRequestToggle }) {
  const active = user.is_active === 1;
  return (
    <tr className="hover:bg-surface-subtle/60 transition-med">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-primary-700 font-heading font-bold text-xs shrink-0">
            {initialsOf(user.name) || '?'}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-primary-900 truncate">{user.name}</div>
            <div className="text-xs text-primary-500 truncate">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-primary-600">{user.specialization || user.gender || '—'}</td>
      <td className="px-4 py-3 text-xs text-primary-500 font-mono tnum">{user.visit_count ?? 0}</td>
      <td className="px-4 py-3">
        <Badge variant={active ? 'success' : 'danger'} size="sm">
          {active ? 'Active' : 'Inactive'}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant={active ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => onRequestToggle({ ...user, nextActive: !active })}
        >
          {active ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          <span>{active ? 'Deactivate' : 'Reactivate'}</span>
        </Button>
      </td>
    </tr>
  );
}

function AccountTable({ rows, columns, emptyState, search, renderRow }) {
  if (rows.length === 0) {
    return search
      ? (
        <EmptyState
          icon={Search}
          title={`No results for “${search}”`}
          description="Try a different name, email, or specialization."
        />
      )
      : emptyState;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="border-b border-surface-border bg-surface-subtle/50">
          <tr className="font-heading font-semibold text-primary-500 uppercase tracking-wider text-[10px]">
            {columns.map(c => <th key={c} className="px-4 py-2.5">{c}</th>)}
            <th className="px-4 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-subtle">
          {rows.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------- the page -------------------------------- */

const TABS = ['overview', 'doctors', 'patients', 'appointments'];

export default function AdminDashboardPage() {
  const path = usePath();
  const segment = pathSegment(path, 1);
  const tab = TABS.includes(segment) ? segment : 'overview';

  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Doctors
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [doctorsError, setDoctorsError] = useState(null);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [addDoctorOpen, setAddDoctorOpen] = useState(false);

  // Patients
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [addPatientOpen, setAddPatientOpen] = useState(false);

  // Appointments
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState(null);
  const [apptStatusFilter, setApptStatusFilter] = useState('');
  const [apptDateFilter, setApptDateFilter] = useState('');

  // Deactivate confirm
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 7000);
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      setStats(await api.getAdminStats());
    } catch (err) {
      setStatsError(err.message || 'Could not load stats.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    setDoctorsError(null);
    try {
      setDoctors(await api.getAdminDoctors());
    } catch (err) {
      setDoctorsError(err.message || 'Could not load doctors.');
    } finally {
      setDoctorsLoading(false);
    }
  }, []);

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true);
    setPatientsError(null);
    try {
      setPatients(await api.getAdminPatients());
    } catch (err) {
      setPatientsError(err.message || 'Could not load patients.');
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  const loadAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    setAppointmentsError(null);
    try {
      setAppointments(await api.getAdminAppointments({
        status: apptStatusFilter || undefined,
        date: apptDateFilter || undefined
      }));
    } catch (err) {
      setAppointmentsError(err.message || 'Could not load appointments.');
    } finally {
      setAppointmentsLoading(false);
    }
  }, [apptStatusFilter, apptDateFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    if (tab === 'doctors') loadDoctors();
    if (tab === 'patients') loadPatients();
    if (tab === 'appointments') loadAppointments();
  }, [tab, loadDoctors, loadPatients, loadAppointments]);

  const handleToggle = async (target) => {
    setToggleBusy(true);
    try {
      const res = await api.setAccountStatus(target.id, target.nextActive);
      showToast(res.message || 'Account updated.');
      setToggleTarget(null);
      loadDoctors();
      loadPatients();
      loadStats();
    } catch (err) {
      showToast(err.message || 'Could not update the account.', 'danger');
    } finally {
      setToggleBusy(false);
    }
  };

  const filteredDoctors = useMemo(() => {
    const q = doctorSearch.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      (d.specialization || '').toLowerCase().includes(q)
    );
  }, [doctors, doctorSearch]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(p =>
      p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    );
  }, [patients, patientSearch]);

  const statCards = stats ? [
    { label: 'Doctors', value: stats.doctors, icon: Stethoscope },
    { label: 'Patients', value: stats.patients, icon: Users },
    { label: "Today's appointments", value: stats.appointments_today, icon: CalendarDays },
    { label: 'Pending requests', value: stats.pending_requests, icon: Inbox },
    { label: 'Lab reports to review', value: stats.pending_lab_reviews, icon: FlaskConical },
    { label: 'Inactive accounts', value: stats.inactive_accounts, icon: ShieldOff }
  ] : [];

  return (
    <div className="min-h-screen bg-surface-base">
      <Navbar />

      {/* Calm workspace header — deliberately not the gradient hero used by the
          clinical dashboards: admin is an operations surface (Phase 103/122). */}
      <div className="bg-surface-card border-b border-surface-border shadow-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-card bg-primary-950 flex items-center justify-center text-white shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-heading font-extrabold text-xl text-primary-950 tracking-tight">
                Admin Console
              </h1>
              <p className="text-xs text-primary-500">
                Accounts and oversight only — clinical records stay append-only and untouched.
              </p>
            </div>
          </div>

          {/* Segmented pill nav (same pattern as the patient tab bar) */}
          <div className="mt-4 pb-3 flex items-center gap-1 overflow-x-auto">
            {NAV.map(n => {
              const Icon = n.icon;
              const isActive = tab === n.id;
              return (
                <button
                  key={n.label}
                  onClick={() => navigate(n.id ? `/admin/${n.id}` : '/admin')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 font-heading font-semibold text-xs rounded-full transition-med whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-primary-950 text-white shadow-subtle'
                      : 'text-primary-500 hover:text-primary-900 hover:bg-surface-subtle'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-clinical-300' : ''}`} />
                  <span>{n.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {toast && <Toast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />}

        {/* ============================ OVERVIEW ============================ */}
        {tab === 'overview' && (
          statsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} className="h-24" />)}
            </div>
          ) : statsError ? (
            <ErrorState title="Could not load overview" description={statsError} onRetry={loadStats} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {statCards.map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="bg-surface-card rounded-card border border-surface-border shadow-subtle p-4">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-400">
                      <Icon className="w-3.5 h-3.5 text-clinical-600 shrink-0" />
                      <span className="truncate">{card.label}</span>
                    </div>
                    <div className="font-heading font-extrabold text-2xl text-primary-900 mt-1.5 tnum">
                      {card.value}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ============================ DOCTORS ============================ */}
        {tab === 'doctors' && (
          <div className="bg-surface-card rounded-card border border-surface-border shadow-subtle overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-heading font-bold text-base text-primary-900">
                Doctors <span className="text-primary-400 font-sans font-semibold">({filteredDoctors.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-primary-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={doctorSearch}
                    onChange={e => setDoctorSearch(e.target.value)}
                    placeholder="Search name, email, specialty…"
                    className="pl-8 pr-3 py-2 w-56 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>
                <Button variant="primary" onClick={() => setAddDoctorOpen(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Doctor</span>
                </Button>
              </div>
            </div>

            {doctorsLoading ? (
              <div className="p-5 space-y-2">
                <SkeletonLine className="h-10 w-full" />
                <SkeletonLine className="h-10 w-full" />
                <SkeletonLine className="h-10 w-full" />
              </div>
            ) : doctorsError ? (
              <div className="p-5">
                <ErrorState title="Could not load doctors" description={doctorsError} onRetry={loadDoctors} />
              </div>
            ) : (
              <AccountTable
                rows={filteredDoctors}
                search={doctorSearch}
                columns={['Doctor', 'Specialization', 'Visits', 'Status']}
                emptyState={
                  <EmptyState
                    icon={Stethoscope}
                    title="No doctors yet"
                    description="Add your first doctor — they become bookable by patients immediately."
                    action={<Button variant="primary" onClick={() => setAddDoctorOpen(true)}><Plus className="w-3.5 h-3.5" /><span>Add Doctor</span></Button>}
                  />
                }
                renderRow={user => (
                  <AccountRow key={user.id} user={user} onToggle={handleToggle} onRequestToggle={setToggleTarget} />
                )}
              />
            )}
          </div>
        )}

        {/* ============================ PATIENTS ============================ */}
        {tab === 'patients' && (
          <div className="bg-surface-card rounded-card border border-surface-border shadow-subtle overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-heading font-bold text-base text-primary-900">
                Patients <span className="text-primary-400 font-sans font-semibold">({filteredPatients.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-primary-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={e => setPatientSearch(e.target.value)}
                    placeholder="Search name or email…"
                    className="pl-8 pr-3 py-2 w-56 text-xs bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>
                <Button variant="primary" onClick={() => setAddPatientOpen(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Patient</span>
                </Button>
              </div>
            </div>

            {patientsLoading ? (
              <div className="p-5 space-y-2">
                <SkeletonLine className="h-10 w-full" />
                <SkeletonLine className="h-10 w-full" />
                <SkeletonLine className="h-10 w-full" />
              </div>
            ) : patientsError ? (
              <div className="p-5">
                <ErrorState title="Could not load patients" description={patientsError} onRetry={loadPatients} />
              </div>
            ) : (
              <AccountTable
                rows={filteredPatients}
                search={patientSearch}
                columns={['Patient', 'Details', 'Visits', 'Status']}
                emptyState={
                  <EmptyState
                    icon={Users}
                    title="No patients yet"
                    description="Add a patient account, or let doctors quick-add walk-ins from their dashboard."
                    action={<Button variant="primary" onClick={() => setAddPatientOpen(true)}><Plus className="w-3.5 h-3.5" /><span>Add Patient</span></Button>}
                  />
                }
                renderRow={user => (
                  <AccountRow key={user.id} user={user} onToggle={handleToggle} onRequestToggle={setToggleTarget} />
                )}
              />
            )}
          </div>
        )}

        {/* ========================== APPOINTMENTS ========================== */}
        {tab === 'appointments' && (
          <div className="bg-surface-card rounded-card border border-surface-border shadow-subtle overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-heading font-bold text-base text-primary-900">All appointments</h3>
                <p className="text-xs text-primary-500">Read-only oversight — scheduling actions live with clinicians and patients.</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={apptStatusFilter}
                  onChange={e => setApptStatusFilter(e.target.value)}
                  className="text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
                >
                  <option value="">Any status</option>
                  <option value="requested">Requested</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="reschedule_proposed">Reschedule proposed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <input
                  type="date"
                  value={apptDateFilter}
                  onChange={e => setApptDateFilter(e.target.value)}
                  className="text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
                />
              </div>
            </div>

            {appointmentsLoading ? (
              <div className="p-5 space-y-2">
                <SkeletonLine className="h-10 w-full" />
                <SkeletonLine className="h-10 w-full" />
              </div>
            ) : appointmentsError ? (
              <div className="p-5">
                <ErrorState title="Could not load appointments" description={appointmentsError} onRetry={loadAppointments} />
              </div>
            ) : appointments.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={CalendarDays}
                  title="No appointments match"
                  description={apptStatusFilter || apptDateFilter
                    ? 'Try clearing the status or date filter.'
                    : 'Once patients book times with doctors, they appear here for oversight.'}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-surface-border bg-surface-subtle/50">
                    <tr className="font-heading font-semibold text-primary-500 uppercase tracking-wider text-[10px]">
                      <th className="px-4 py-2.5">Patient</th>
                      <th className="px-4 py-2.5">Doctor</th>
                      <th className="px-4 py-2.5">When</th>
                      <th className="px-4 py-2.5">Reason</th>
                      <th className="px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-subtle">
                    {appointments.map(a => {
                      const meta = APPOINTMENT_STATUS_META[a.status] || APPOINTMENT_STATUS_META.requested;
                      return (
                        <tr key={a.id} className="hover:bg-surface-subtle/60 transition-med">
                          <td className="px-4 py-3 text-sm font-semibold text-primary-900">{a.patient_name}</td>
                          <td className="px-4 py-3 text-xs text-primary-600">{a.doctor_name}</td>
                          <td className="px-4 py-3 text-xs text-primary-700">
                            <span className="font-semibold">{formatDate(a.appointment_date)}</span>
                            {a.appointment_time && <span className="text-primary-400"> · {formatTime(a.appointment_time)}</span>}
                            {a.status === 'reschedule_proposed' && a.proposed_date && (
                              <span className="block text-[11px] text-clinical-700 mt-0.5">
                                offered: {formatDate(a.proposed_date)} · {formatTime(a.proposed_time)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-primary-500 max-w-[220px] truncate">{a.reason || '—'}</td>
                          <td className="px-4 py-3"><Badge variant={meta.variant} size="sm">{meta.label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      <AddDoctorModal
        isOpen={addDoctorOpen}
        onClose={() => setAddDoctorOpen(false)}
        onCreated={() => { loadDoctors(); loadStats(); showToast('Doctor account created — share the temporary password now.'); }}
      />
      <AddPatientModal
        isOpen={addPatientOpen}
        onClose={() => setAddPatientOpen(false)}
        onCreated={() => { loadPatients(); loadStats(); showToast('Patient account created — share the temporary password now.'); }}
      />
      <DeactivateDialog
        target={toggleTarget}
        busy={toggleBusy}
        onConfirm={handleToggle}
        onClose={() => setToggleTarget(null)}
      />
    </div>
  );
}
