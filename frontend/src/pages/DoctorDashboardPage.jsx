import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import Navbar from '../components/common/Navbar';
import PatientSelector from '../components/doctor/PatientSelector';
import PatientTimeline from '../components/doctor/PatientTimeline';
import VisitLoggerModal from '../components/doctor/VisitLoggerModal';
import AppointmentRequests from '../components/doctor/AppointmentRequests';
import DayView from '../components/doctor/DayView';
import { SkeletonTimeline } from '../components/common/Skeleton';
import ErrorState from '../components/common/ErrorState';
import Toast from '../components/common/Toast';
import {
  Stethoscope,
  PlusCircle,
  Users,
  Inbox,
  Pill,
  ClipboardList,
  HeartPulse,
  MessageCircle,
  Thermometer
} from 'lucide-react';
import { symptomIcon } from '../utils/iconMap';

export default function DoctorDashboardPage() {
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [patientsError, setPatientsError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [recentNotification, setRecentNotification] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);

  // 1. Fetch patients list
  const loadPatients = async () => {
    setPatientsError(null);
    try {
      const list = await api.getPatients();
      setPatients(list);
      if (list.length > 0) {
        setSelectedPatientId(prev => {
          if (prev) return prev;
          const defaultPat = list.find(p => p.email === 'patient1@medbridge.com') || list[0];
          return defaultPat.id;
        });
      }
    } catch (err) {
      console.error('Failed to load patients:', err);
      setPatientsError(err.message || 'Could not load the patient list.');
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPendingRequests = async () => {
    try {
      const list = await api.getPendingAppointments();
      setPendingRequests(list);
    } catch (err) {
      console.error('Failed to load appointment requests:', err);
    }
  };

  useEffect(() => {
    loadPendingRequests();
  }, []);

  const handleRequestStatusChange = async (id, status) => {
    await api.setAppointmentStatus(id, status);
    setPendingRequests(prev => prev.filter(r => r.id !== id));
    setRecentNotification({
      type: 'success',
      message:
        status === 'confirmed'
          ? 'Appointment request confirmed. The patient can see the updated status.'
          : 'Appointment request declined. The patient can see the updated status.'
    });
    setTimeout(() => setRecentNotification(null), 7000);
  };

  // Block XI Phase 147: a proposal moved the row out of 'requested'
  const handleRescheduleProposed = () => {
    loadPendingRequests();
    setRecentNotification({
      type: 'success',
      message: 'Reschedule proposed — the patient will see both times and can accept or decline.'
    });
    setTimeout(() => setRecentNotification(null), 7000);
  };

  // 2. Fetch history for selected patient
  const loadPatientHistory = async (patientId) => {
    if (!patientId) return;
    setLoading(true);
    setHistoryError(null);
    try {
      const data = await api.getPatientHistory(patientId);
      setHistoryData(data);
    } catch (err) {
      console.error('Failed to load patient history:', err);
      setHistoryError(err.message || 'Could not load this patient’s history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      loadPatientHistory(selectedPatientId);
    }
  }, [selectedPatientId]);

  // Tab requested from the dashboard level (journal nudge → open the journal)
  const [timelineTab, setTimelineTab] = useState(null);

  // Block X Phase 135: after a quick-add, refresh the list and auto-select the
  // new patient — no reload. The modal stays open on its success screen until
  // the doctor clicks "Start Visit".
  const handleQuickAddCreated = (res) => {
    if (!res?.user) return;
    loadPatients();
    setSelectedPatientId(res.user.id);
    setRecentNotification({
      type: 'success',
      message: `${res.user.name} registered and selected. Hand over the temporary password, then document the visit.`
    });
    setTimeout(() => setRecentNotification(null), 7000);
  };

  const handleVisitLogged = (result) => {
    // Show notification if visit was saved with warnings
    if (result.conflict_warnings && result.conflict_warnings.length > 0) {
      setRecentNotification({
        type: 'warning',
        message: `Visit saved successfully. ${result.conflict_warnings.length} pharmacological conflict warning(s) were flagged and documented.`
      });
    } else {
      setRecentNotification({
        type: 'success',
        message: 'New clinical encounter, prescriptions, and lab orders saved successfully.'
      });
    }

    // Refresh history
    loadPatientHistory(selectedPatientId);

    // Auto-clear notification after 7s
    setTimeout(() => setRecentNotification(null), 7000);
  };

  const activePatient = patients.find(p => p.id === selectedPatientId) || patients[0];

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Quick counts for the hero strip
  const activeMedsCount = useMemo(() => {
    const seen = new Set();
    for (const v of historyData?.visits || []) {
      for (const rx of v.prescriptions || []) seen.add(rx.medicine_id || rx.medicine_name);
    }
    return seen.size;
  }, [historyData]);

  // Symptom journal signals — the newest entries, with guidance status
  const commentsByEntry = historyData?.symptom_comments_by_entry || {};

  // Phase 187: one glanceable signal instead of the old duplicated panel —
  // count journal entries that have no doctor guidance yet.
  const awaitingGuidanceCount = useMemo(() => {
    const logs = (historyData?.self_logs || []).filter(l => l.log_type === 'symptom');
    const keys = new Set(logs.map(l => l.entry_id || `solo_${l.id}`));
    let awaiting = 0;
    for (const key of keys) {
      if (!(commentsByEntry[key] || []).length) awaiting += 1;
    }
    return awaiting;
  }, [historyData, commentsByEntry]);
  const symptomSignals = useMemo(() => {
    const logs = (historyData?.self_logs || []).filter(l => l.log_type === 'symptom');
    const byKey = new Map();
    const entries = [];
    for (const log of logs) {
      const key = log.entry_id || `solo_${log.id}`;
      if (!byKey.has(key)) {
        byKey.set(key, { key, log_date: log.log_date, symptoms: [] });
        entries.push(byKey.get(key));
      }
      byKey.get(key).symptoms.push(log);
    }
    entries.sort((a, b) => (b.log_date || '').localeCompare(a.log_date || ''));
    return entries.slice(0, 3);
  }, [historyData]);

  const toneOf = (v, u) => {
    const sev = (u || '') === '/10' ? (parseFloat(v) || 0) / 2 : parseFloat(v) || 0;
    if (sev <= 2) return { chip: 'bg-success-bg text-success-text border-success-border', dot: 'bg-success' };
    if (sev <= 3) return { chip: 'bg-warning-bg text-warning-text border-warning-border', dot: 'bg-warning' };
    return { chip: 'bg-danger-bg text-danger-text border-danger-border', dot: 'bg-danger' };
  };

  // Total distinct journal entries (legacy singletons included)
  const journalEntryCount = useMemo(() => {
    const ids = new Set(
      (historyData?.self_logs || [])
        .filter(l => l.log_type === 'symptom')
        .map(l => l.entry_id || `solo_${l.id}`)
    );
    return ids.size;
  }, [historyData]);

  return (
    <div className="min-h-screen bg-surface-base">
      <Navbar />

      {/* ============ HERO BANNER — mirrors the patient dashboard identity ============ */}
      <div className="bg-gradient-to-br from-primary-900 via-primary-850 to-clinical-900 text-white relative overflow-hidden">
        {/* architectural grid + pulse motif — shared brand texture with the patient hero */}
        <div className="hero-grid absolute inset-0 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(60%_85%_at_82%_0%,rgba(94,234,212,0.13),transparent_62%)]" />
        <svg
          className="absolute right-0 bottom-0 h-24 w-[480px] opacity-[0.08] pointer-events-none"
          viewBox="0 0 300 120"
          fill="none"
          preserveAspectRatio="none"
        >
          <path
            d="M0 60 L40 60 L55 25 L75 95 L90 40 L110 60 L150 60 L165 15 L185 100 L200 45 L220 60 L300 60"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-clinical-300">
                {today}
              </p>
              <h1 className="font-heading font-extrabold text-2xl sm:text-3xl mt-1 tracking-tight">
                Clinician Workspace
              </h1>
              <p className="text-sm text-primary-200 mt-1 max-w-lg">
                {pendingRequests.length > 0 ? (
                  <>
                    <span className="font-bold text-white">{pendingRequests.length}</span> appointment
                    request{pendingRequests.length > 1 ? 's' : ''} waiting for your review.
                  </>
                ) : (
                  'Longitudinal EMR review, interaction guardrails & encounter documentation.'
                )}
              </p>
            </div>

            {/* Primary action: document a visit */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setIsVisitModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-button bg-clinical-500 hover:bg-clinical-400 text-primary-950 font-heading font-bold text-sm shadow-modal transition-med cursor-pointer"
              >
                <PlusCircle className="w-[18px] h-[18px]" strokeWidth={2.4} />
                <span>Document New Visit</span>
              </button>
            </div>
          </div>

          {/* Inline stat strip — same unboxed numerals as the patient side */}
          <div className="mt-7 grid grid-cols-2 sm:grid-cols-5 gap-y-4">
            {[
              { label: 'Patients', value: patients.length, icon: Users },
              { label: 'Journal entries', value: journalEntryCount, icon: HeartPulse },
              { label: 'Pending requests', value: pendingRequests.length, icon: Inbox },
              { label: 'Active meds', value: activeMedsCount, icon: Pill },
              {
                label: 'Latest visit',
                value: historyData?.visits?.[0]?.visit_date || 'None',
                icon: ClipboardList,
                small: true
              }
            ].map(stat => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="text-left">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-clinical-300 shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary-300">
                      {stat.label}
                    </span>
                  </div>
                  <div
                    className={`font-heading font-extrabold text-white mt-0.5 tnum ${
                      stat.small ? 'text-base sm:text-lg' : 'text-2xl sm:text-3xl'
                    }`}
                  >
                    {stat.value}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Toast / Notification Banner */}
        {recentNotification && (
          <Toast
            type={recentNotification.type}
            message={recentNotification.message}
            onDismiss={() => setRecentNotification(null)}
          />
        )}

        {/* Patient Switcher & Clinical Summary Bar */}
        <PatientSelector
          patients={patients}
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          historyData={historyData}
          onQuickAddCreated={handleQuickAddCreated}
        />

        {/* Appointment Requests Panel (Feature Spec 1, doctor side) */}
        <AppointmentRequests
          requests={pendingRequests}
          onStatusChange={handleRequestStatusChange}
          onRescheduleProposed={handleRescheduleProposed}
        />

        {/* Day View — booked slots for a picked day (Phase 149) */}
        <DayView />

        {/* Journal nudge (Phase 187): the journal tab owns the detail — the
            dashboard only surfaces the one signal that matters: unanswered entries */}
        {awaitingGuidanceCount > 0 && (
          <button
            onClick={() => setTimelineTab('self_logs')}
            className="w-full flex items-center gap-3 px-5 py-3.5 rounded-card border border-warning-border bg-warning-bg/40 hover:bg-warning-bg/60 transition-med text-left cursor-pointer shadow-subtle"
          >
            <MessageCircle className="w-4 h-4 text-warning shrink-0" />
            <span className="text-xs font-semibold text-warning-text flex-1 min-w-0 truncate">
              {awaitingGuidanceCount} journal entr{awaitingGuidanceCount === 1 ? 'y' : 'ies'} awaiting your guidance
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-warning shrink-0">
              Open journal
            </span>
          </button>
        )}

        {/* Patient list failure */}
        {patientsError && (
          <ErrorState
            title="Could not load patients"
            description={patientsError}
            onRetry={loadPatients}
          />
        )}

        {/* Medical History Timeline */}
        {loading ? (
          <SkeletonTimeline />
        ) : historyError ? (
          <ErrorState
            title="Could not load patient history"
            description={historyError}
            onRetry={() => loadPatientHistory(selectedPatientId)}
          />
        ) : (
          <PatientTimeline
            historyData={historyData}
            onOpenLogVisit={() => setIsVisitModalOpen(true)}
            focusTab={timelineTab}
          />
        )}

        {/* Log Visit Modal Flow */}
        <VisitLoggerModal
          isOpen={isVisitModalOpen}
          onClose={() => setIsVisitModalOpen(false)}
          patient={activePatient}
          onVisitLogged={handleVisitLogged}
        />
      </main>
    </div>
  );
}
