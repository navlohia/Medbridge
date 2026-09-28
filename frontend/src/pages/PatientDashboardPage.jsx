import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import Navbar from '../components/common/Navbar';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Toast from '../components/common/Toast';
import RemindersBar, { getSeenMeds, markMedSeen } from '../components/common/RemindersBar';
import VitalsChart from '../components/patient/VitalsChart';
import MedicineDetailModal from '../components/patient/MedicineDetailModal';
import VitalLoggerModal from '../components/patient/VitalLoggerModal';
import SymptomLoggerModal from '../components/patient/SymptomLoggerModal';
import BookAppointmentModal from '../components/patient/BookAppointmentModal';
import LabReportUploadModal from '../components/patient/LabReportUploadModal';
import LabReportHistory from '../components/patient/LabReportHistory';
import PatientHistoryTimeline from '../components/patient/PatientHistoryTimeline';
import { SkeletonCard, SkeletonLine } from '../components/common/Skeleton';
import EmptyState from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import {
  Calendar,
  CalendarClock,
  Pill,
  FlaskConical,
  Activity,
  HeartPulse,
  Sparkles,
  ChevronRight,
  Plus,
  FileText,
  TrendingUp as TrendsIcon,
  ArrowRight,
  Thermometer,
  CalendarPlus,
  MessageCircle,
  FileScan,
  Check,
  X
} from 'lucide-react';
import { vitalIcon, labTestIcon, symptomIcon } from '../utils/iconMap';

const APPOINTMENT_STATUS_META = {
  requested: { label: 'Requested', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  reschedule_proposed: { label: 'Reschedule proposed', variant: 'clinical' }
};

// 12-hour time formatting, consistent across every new surface (Phase 152)
function formatApptTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// Severity scale used across the journal: 1–5 (legacy 1–10 rows are mapped)
const SEVERITY = {
  dots: [1, 2, 3, 4, 5],
  tone: (v, isLegacy) => {
    const sev = isLegacy ? v / 2 : v; // legacy 1–10 → 1–5
    if (sev <= 2) return { color: 'bg-success', text: 'text-success-text', soft: 'bg-success-bg border-success-border', label: 'Mild' };
    if (sev <= 3) return { color: 'bg-warning', text: 'text-warning-text', soft: 'bg-warning-bg border-warning-border', label: 'Moderate' };
    return { color: 'bg-danger', text: 'text-danger-text', soft: 'bg-danger-bg border-danger-border', label: 'Severe' };
  }
};

function inRange(value, low, high) {
  const v = parseFloat(value);
  if (isNaN(v) || low === null || low === undefined || high === null || high === undefined) return null;
  if (v < low) return 'low';
  if (v > high) return 'high';
  return 'in';
}

function severityDots(value, unit) {
  const isLegacy = (unit || '') === '/10';
  const filled = isLegacy
    ? Math.min(5, Math.ceil((parseFloat(value) || 0) / 2))
    : Math.min(5, Math.max(1, Math.round(parseFloat(value) || 0)));
  return { filled, tone: SEVERITY.tone(parseFloat(value) || 0, isLegacy), isLegacy };
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'trends', label: 'Trends', icon: TrendsIcon },
  { id: 'symptoms', label: 'Symptoms', icon: HeartPulse },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'history', label: 'History', icon: FileText }
];

export default function PatientDashboardPage() {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toast, setToast] = useState(null);

  // Active view tab: 'overview' | 'trends' | 'symptoms' | 'appointments' | 'history'
  const [activeTab, setActiveTab] = useState('overview');

  // Modals state
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [isVitalModalOpen, setIsVitalModalOpen] = useState(false);
  const [isSymptomModalOpen, setIsSymptomModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isLabUploadOpen, setIsLabUploadOpen] = useState(false);
  const [myAppointments, setMyAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const loadPatientData = async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [dash, hist] = await Promise.all([
        api.getPatientDashboard(user.id),
        api.getPatientHistory(user.id)
      ]);
      setDashboardData(dash);
      setHistoryData(hist);
    } catch (err) {
      console.error('Failed to load patient dashboard:', err);
      setLoadError(err.message || 'Could not load your health data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatientData();
  }, [user?.id, refreshTrigger]);

  const loadAppointments = async () => {
    if (!user?.id) return;
    setAppointmentsLoading(true);
    setAppointmentsError(null);
    try {
      const list = await api.getMyAppointments();
      setMyAppointments(list);
    } catch (err) {
      console.error('Failed to load appointments:', err);
      setAppointmentsError(err.message || 'Could not load your appointments.');
    } finally {
      setAppointmentsLoading(false);
    }
  };

  // Block XI Phases 145–146: patient accept/decline of a doctor's reschedule
  const [respondBusy, setRespondBusy] = useState(null);
  const respondToReschedule = async (id, accept) => {
    setRespondBusy(id);
    try {
      const res = await api.respondReschedule(id, accept);
      triggerRefresh(res.message || (accept ? 'Reschedule accepted.' : 'Reschedule declined.'), 'success');
    } catch (err) {
      triggerRefresh(err.message || 'Could not respond to the reschedule.', 'danger');
    } finally {
      setRespondBusy(null);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, [user?.id, refreshTrigger]);

  const triggerRefresh = (message = null, type = 'success') => {
    if (message) {
      setToast({ message, type });
      setTimeout(() => setToast(null), 7000);
    }
    setRefreshTrigger(prev => prev + 1);
  };

  const nextAppointment = dashboardData?.next_appointment;
  const pendingLabs = dashboardData?.pending_labs || [];
  const activeMedicines = dashboardData?.active_medicines || [];
  const recentVitals = dashboardData?.recent_vitals || [];

  const symptomEntries = useMemo(() => {
    const logs = (historyData?.self_logs || []).filter(l => l.log_type === 'symptom');
    const byKey = new Map();
    const entries = [];
    for (const log of logs) {
      const key = log.entry_id || `solo_${log.id}`;
      if (!byKey.has(key)) {
        const entry = {
          key,
          log_date: log.log_date,
          created_at: log.created_at,
          duration: log.duration || null,
          notes: log.notes || null,
          symptoms: []
        };
        byKey.set(key, entry);
        entries.push(entry);
      }
      byKey.get(key).symptoms.push(log);
    }
    entries.sort(
      (a, b) =>
        (b.log_date || '').localeCompare(a.log_date || '') ||
        (b.created_at || '').localeCompare(a.created_at || '')
    );
    return entries;
  }, [historyData]);

  // Vitals referenced by fever temp rows inside symptom entries
  const entryVitals = useMemo(
    () => (historyData?.self_logs || []).filter(l => l.log_type === 'vital' && l.entry_id),
    [historyData]
  );

  // Doctor guidance threads keyed by journal entry
  const guidanceByEntry = historyData?.symptom_comments_by_entry || {};
  const guidanceCount = useMemo(
    () => Object.values(guidanceByEntry).reduce((a, list) => a + list.length, 0),
    [historyData]
  );

  const apptStatus = nextAppointment?.status || (nextAppointment ? 'confirmed' : null);
  const apptMeta = apptStatus ? APPOINTMENT_STATUS_META[apptStatus] || APPOINTMENT_STATUS_META.confirmed : null;

  // Journal stats
  const journalStats = useMemo(() => {
    if (symptomEntries.length === 0) return null;
    const symptomCount = symptomEntries.reduce((a, e) => a + e.symptoms.length, 0);
    const labelCounts = {};
    let worst = null;
    for (const e of symptomEntries) {
      for (const s of e.symptoms) {
        labelCounts[s.label] = (labelCounts[s.label] || 0) + 1;
        const sev = parseFloat(s.value) || 0;
        const norm = (s.unit || '') === '/10' ? sev / 2 : sev;
        if (!worst || norm > worst.norm) worst = { norm, label: s.label, date: e.log_date };
      }
    }
    const topSymptom = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0];
    return { entries: symptomEntries.length, symptomCount, topSymptom, worst };
  }, [symptomEntries]);

  // Days until next appointment (for hero band)
  const daysToAppt = useMemo(() => {
    if (!nextAppointment || nextAppointment.status === 'cancelled') return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(nextAppointment.appointment_date + 'T00:00:00');
    const d = Math.round((target - today) / 86400000);
    return d >= 0 ? d : null;
  }, [nextAppointment]);

  // Reminders: seen-medicine tracking refreshes when history changes
  const [seenMedsVersion, setSeenMedsVersion] = useState(0);
  useEffect(() => {
    setSeenMedsVersion(v => v + 1);
  }, [selectedMedicine]);
  const seenMeds = useMemo(() => {
    seenMedsVersion;
    return getSeenMeds();
  }, [seenMedsVersion, activeMedicines]);
  const unseenMedsCount = activeMedicines.filter(m => !seenMeds.has(m.id)).length;

  // Round 2 Phase 193: uploaded reports still pending review surface as a reminder
  const [pendingReportCount, setPendingReportCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api.getLabReports()
      .then(list => {
        if (!cancelled) setPendingReportCount((list || []).filter(u => u.status === 'pending_review').length);
      })
      .catch(() => { /* reminder is best-effort */ });
    return () => { cancelled = true; };
  }, [refreshTrigger]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-surface-base">
      <Navbar />

      {/* ============ HERO BANNER ============ */}
      {!loadError && (
        <div className="bg-gradient-to-br from-primary-900 via-primary-850 to-clinical-900 text-white relative overflow-hidden">
          {/* brand texture: grid + teal glow accent */}
          <div className="hero-grid absolute inset-0 pointer-events-none" />
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(60%_85%_at_82%_0%,rgba(94,234,212,0.13),transparent_62%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-clinical-300">
                {today}
              </p>
              <h1 className="font-heading font-extrabold text-2xl sm:text-3xl mt-1 tracking-tight">
                Hello, {user?.name?.split(' ')[0] || 'there'}
              </h1>
                <p className="text-sm text-primary-200 mt-1 max-w-lg">
                  {daysToAppt !== null && daysToAppt <= 7 ? (
                    <>Your next visit is <span className="font-bold text-white">{daysToAppt === 0 ? 'today' : daysToAppt === 1 ? 'tomorrow' : `in ${daysToAppt} days`}</span> with {nextAppointment.doctor_name}.</>
                  ) : pendingLabs.length > 0 ? (
                    <>You have <span className="font-bold text-white">{pendingLabs.length} lab test{pendingLabs.length > 1 ? 's' : ''}</span> waiting on results.</>
                  ) : (
                    'Everything on track. Keep logging how you feel.'
                  )}
                </p>
              </div>

              {/* Primary action: symptoms first — it's the thing patients use most */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setIsSymptomModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-button bg-clinical-500 hover:bg-clinical-400 text-primary-950 font-heading font-bold text-sm shadow-modal hover:shadow-glow-teal-lg transition-med cursor-pointer"
                >
                  <HeartPulse className="w-4 h-4" strokeWidth={2.4} />
                  <span>Log how you feel</span>
                </button>
                <button
                  onClick={() => setIsVitalModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-button bg-white/10 hover:bg-white/20 border border-white/20 text-white font-heading font-semibold text-sm backdrop-blur-sm transition-med cursor-pointer"
                >
                  <Activity className="w-4 h-4" />
                  <span>Vitals</span>
                </button>
              </div>
            </div>

            {/* Inline stat strip — no boxes, just numbers */}
            <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-y-4">
              {[
                { label: 'Active medicines', value: activeMedicines.length, tab: 'overview', icon: Pill },
                { label: 'Pending labs', value: pendingLabs.length, tab: 'overview', icon: FlaskConical },
                { label: 'Journal entries', value: symptomEntries.length, tab: 'symptoms', icon: HeartPulse },
                {
                  label: 'Next appointment',
                  value: nextAppointment ? (daysToAppt === null ? '—' : daysToAppt === 0 ? 'Today' : `${daysToAppt}d`) : 'None',
                  tab: 'appointments',
                  icon: Calendar
                }
              ].map(stat => {
                const Icon = stat.icon;
                return (
                  <button
                    key={stat.label}
                    onClick={() => setActiveTab(stat.tab)}
                    className="text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-clinical-300 shrink-0" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary-300">
                        {stat.label}
                      </span>
                    </div>
                    <div className="font-heading font-extrabold text-2xl sm:text-3xl text-white group-hover:text-clinical-300 transition-med tnum mt-0.5">
                      {stat.value}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Full-page load failure */}
        {loadError && (
          <ErrorState
            title="Could not load your health portal"
            description={loadError}
            onRetry={loadPatientData}
          />
        )}

        {/* Post-action toast */}
        {toast && (
          <Toast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />
        )}

        {/* Reminders */}
        {!loadError && (
          <RemindersBar
            nextAppointment={nextAppointment}
            pendingLabs={pendingLabs}
            unseenMedsCount={unseenMedsCount}
            pendingLabReports={pendingReportCount}
            onLogLabResult={() => setIsVitalModalOpen(true)}
            onOpenMedicines={() => setActiveTab('overview')}
            onOpenLabReports={() => setIsLabUploadOpen(true)}
          />
        )}

        {/* ============ SEGMENTED TAB BAR ============ */}
        {!loadError && (
          <div className="sticky top-16 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-1 bg-surface-base/90 backdrop-blur-sm">
            <div className="inline-flex items-center gap-1 bg-primary-100/70 border border-primary-200/60 rounded-full p-1 shadow-subtle overflow-x-auto max-w-full">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const isSymptoms = tab.id === 'symptoms';
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative px-4 py-2 font-heading font-semibold text-xs rounded-full transition-med flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      isActive
                        ? isSymptoms
                          ? 'bg-clinical-600 text-white shadow-subtle'
                          : 'bg-white text-primary-900 shadow-subtle'
                        : 'text-primary-500 hover:text-primary-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? (isSymptoms ? 'text-white' : 'text-clinical-600') : 'text-primary-400'}`} />
                    <span>{tab.label}</span>
                    {isSymptoms && symptomEntries.length > 0 && (
                      <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-px rounded-full tnum ${
                        isActive ? 'bg-white/25 text-white' : 'bg-clinical-100 text-clinical-800 animate-pulseSoft'
                      }`}>
                        {symptomEntries.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 1: OVERVIEW ================= */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {loading ? (
              <>
                <SkeletonCard className="h-24" />
                <SkeletonCard className="h-48" />
              </>
            ) : (
              <>
                {/* Appointment band */}
                {nextAppointment && (
                  <div className="bg-gradient-to-r from-clinical-700 to-clinical-600 rounded-card p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-card">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-card bg-white/15 border border-white/20 flex flex-col items-center justify-center leading-none shrink-0">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-clinical-100">Appt</span>
                        <span className="text-[9px] font-bold text-clinical-100 mt-px">{nextAppointment.appointment_date.slice(5)}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-extrabold text-lg">{nextAppointment.appointment_date}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            apptStatus === 'requested'
                              ? 'bg-white/20 border-white/30 text-white'
                              : 'bg-clinical-100 border-clinical-200 text-clinical-800'
                          }`}>
                            {apptMeta?.label}
                          </span>
                        </div>
                        <p className="text-xs text-clinical-100 mt-0.5 truncate">
                          {nextAppointment.reason || 'Clinical consultation'} • {nextAppointment.doctor_name}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('appointments')}
                      className="inline-flex items-center gap-1 text-xs font-bold text-white hover:text-clinical-100 transition-med shrink-0 cursor-pointer"
                    >
                      Manage <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Pending labs — flat rows, no nested boxes; upload entry point (Phase 161) */}
                {pendingLabs.length > 0 && (
                  <div className="bg-surface-card rounded-card p-5 shadow-subtle border-l-4 border-warning">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-heading font-bold text-sm text-primary-900 flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-warning" />
                        Waiting on results ({pendingLabs.length})
                      </h3>
                      <Button variant="primary" size="sm" onClick={() => setIsLabUploadOpen(true)}>
                        <FileScan className="w-3.5 h-3.5" />
                        <span>Upload report photo</span>
                      </Button>
                    </div>
                    <div className="divide-y divide-surface-subtle">
                      {pendingLabs.map(lo => {
                        const LabIcon = labTestIcon(lo.test_name);
                        return (
                          <div key={lo.id} className="flex items-center justify-between gap-3 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-card bg-warning-bg border border-warning-border flex items-center justify-center shrink-0">
                                <LabIcon className="w-4 h-4 text-warning" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-sm font-bold text-primary-900">{lo.test_name}</span>
                                <span className="text-xs text-primary-400 block">Due {lo.scheduled_date}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setIsLabUploadOpen(true)}>
                                Upload photo
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => setIsVitalModalOpen(true)}>
                                Log result
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Upload history — appears once the first upload exists (Phase 168) */}
                <LabReportHistory refreshKey={refreshTrigger} />

                {/* Active medicines — clean list, no card-in-card */}
                <div className="bg-surface-card rounded-card p-5 shadow-subtle">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-heading font-bold text-sm text-primary-900 flex items-center gap-2">
                      <Pill className="w-4 h-4 text-clinical-600" />
                      Your medicines ({activeMedicines.length})
                    </h3>
                    <span className="text-xs font-medium text-primary-400">Tap any for a plain-language guide</span>
                  </div>

                  {activeMedicines.length === 0 ? (
                    <EmptyState
                      icon={Pill}
                      title="No active prescriptions"
                      description="You do not currently have any active medications prescribed."
                    />
                  ) : (
                    <div className="divide-y divide-surface-subtle">
                      {activeMedicines.map(med => (
                        <button
                          key={med.id}
                          onClick={() => {
                            markMedSeen(med.id);
                            setSelectedMedicine(med);
                          }}
                          className="w-full flex items-center gap-4 py-4 text-left hover:bg-clinical-50/40 -mx-2 px-2 rounded-button transition-med group cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-card bg-clinical-50 border border-clinical-200 flex items-center justify-center text-clinical-600 shrink-0 group-hover:shadow-glow-teal transition-med">
                            <Pill className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-heading font-bold text-sm text-primary-900 group-hover:text-clinical-700 transition-med">
                                {med.name}
                              </span>
                              {!seenMeds.has(med.id) && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-warning-bg text-warning-text border border-warning-border">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-primary-500 mt-0.5 line-clamp-1">
                              {med.dosage} · {med.duration}
                            </p>
                          </div>
                          <span className="hidden md:block max-w-[280px] text-xs text-primary-400 italic line-clamp-2 shrink-0">
                            {med.plain_explanation}
                          </span>
                          <ChevronRight className="w-4 h-4 text-primary-300 group-hover:text-clinical-600 group-hover:translate-x-0.5 transition-med shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Latest readings — big numbers, minimal chrome */}
                <div className="bg-surface-card rounded-card p-5 shadow-subtle">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-heading font-bold text-sm text-primary-900 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-clinical-600" />
                      Latest readings
                    </h3>
                    <button
                      onClick={() => setActiveTab('trends')}
                      className="text-xs font-semibold text-clinical-600 hover:text-clinical-700 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Full trends</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {recentVitals.length === 0 ? (
                    <EmptyState
                      icon={Activity}
                      title="No vital readings yet"
                      description="Log your first home measurement to see it here and in your trend graph."
                      action={
                        <Button variant="primary" onClick={() => setIsVitalModalOpen(true)}>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Log First Reading</span>
                        </Button>
                      }
                    />
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-5">
                      {recentVitals.slice(0, 6).map(v => {
                        const status = inRange(v.value, v.normal_low, v.normal_high);
                        const accent =
                          status === 'in' ? 'bg-success' : status === 'low' || status === 'high' ? 'bg-warning' : 'bg-primary-300';
                        const VIcon = vitalIcon(v.label);
                        return (
                          <div key={v.id} className={`border-l-2 ${accent} pl-3`}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-primary-400 truncate flex items-center gap-1">
                              <VIcon className="w-3 h-3 shrink-0" />
                              {v.label}
                            </div>
                            <div className="font-heading font-extrabold text-xl text-primary-900 mt-0.5 leading-none">
                              {v.value}
                              <span className="text-xs font-semibold text-primary-400 ml-1">{v.unit || ''}</span>
                            </div>
                            <div className="text-[10px] text-primary-400 mt-1">{v.log_date}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= TAB 2: TRENDS ================= */}
        {activeTab === 'trends' && (
          <div className="space-y-5">
            <VitalsChart
              patientId={user?.id}
              onOpenLogVital={() => setIsVitalModalOpen(true)}
              refreshTrigger={refreshTrigger}
            />

            <div className="bg-surface-card rounded-card p-5 shadow-subtle">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-heading font-bold text-sm text-primary-900">
                  Recent vitals history
                </h4>
                <Button variant="secondary" size="sm" onClick={() => setIsVitalModalOpen(true)}>
                  <Plus className="w-3.5 h-3.5" /> <span>Add Reading</span>
                </Button>
              </div>

              {loading ? (
                <div className="space-y-2">
                  <SkeletonLine className="h-8 w-full" />
                  <SkeletonLine className="h-8 w-full" />
                  <SkeletonLine className="h-8 w-full" />
                </div>
              ) : recentVitals.length === 0 ? (
                <EmptyState
                  title="No vital readings logged yet"
                  description="Use the button above to record your first home measurement."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-surface-border font-heading font-semibold text-primary-400 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Metric</th>
                        <th className="px-3 py-2.5">Value</th>
                        <th className="px-3 py-2.5">Normal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-subtle">
                      {recentVitals.map(v => {
                        const VIcon = vitalIcon(v.label);
                        return (
                          <tr key={v.id} className="hover:bg-surface-subtle/60 transition-med">
                            <td className="px-3 py-2.5 font-medium text-primary-900">{v.log_date}</td>
                            <td className="px-3 py-2.5 font-semibold text-primary-800">
                              <span className="flex items-center gap-1.5">
                                <VIcon className="w-3.5 h-3.5 text-clinical-600 shrink-0" />
                                {v.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold text-primary-900 tnum">
                              {v.value} <span className="font-normal text-primary-400">{v.unit || ''}</span>
                            </td>
                            <td className="px-3 py-2.5 text-primary-400 font-mono tnum">
                              {v.normal_low !== null && v.normal_high !== null
                                ? `${v.normal_low}–${v.normal_high}`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: SYMPTOM JOURNAL — flagship ================= */}
        {activeTab === 'symptoms' && (
          <div className="space-y-5">
            {/* Journal toolbar — compact command bar (replaced the big banner) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface-card rounded-card border border-surface-border shadow-subtle px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-card bg-gradient-to-br from-clinical-500 to-clinical-700 flex items-center justify-center text-white shadow-subtle shrink-0">
                  <HeartPulse className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading font-bold text-sm text-primary-900 leading-tight">Symptom Journal</h2>
                  <p className="text-[11px] text-primary-500 truncate">
                    {journalStats
                      ? `${journalStats.entries} ${journalStats.entries === 1 ? 'entry' : 'entries'} · ${journalStats.symptomCount} symptoms tracked${journalStats.topSymptom ? ` · most: ${journalStats.topSymptom[0]}` : ''}`
                      : 'Rate each symptom 1–5 — your doctor reads every entry.'}
                  </p>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2.5 flex-wrap">
                {guidanceCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-clinical-50 text-clinical-800 border border-clinical-200">
                    <MessageCircle className="w-3.5 h-3.5" />
                    {guidanceCount} doctor {guidanceCount === 1 ? 'reply' : 'replies'}
                  </span>
                )}
                <div className="hidden md:flex items-center gap-1" title="Severity scale: mild → severe">
                  {SEVERITY.dots.map(n => (
                    <span key={n} className={`w-2 h-2 rounded-full ${SEVERITY.tone(n).color}`} />
                  ))}
                </div>
                <Button variant="primary" onClick={() => setIsSymptomModalOpen(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log how you feel</span>
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                <SkeletonCard className="h-28" />
                <SkeletonCard className="h-28" />
              </div>
            ) : symptomEntries.length === 0 ? (
              <EmptyState
                icon={HeartPulse}
                title="Your journal is empty"
                description="The first entry takes 30 seconds — pick a symptom, rate it, done. Your doctor sees everything you log."
                action={
                  <Button variant="primary" onClick={() => setIsSymptomModalOpen(true)}>
                    Log your first entry
                  </Button>
                }
              />
            ) : (
              <>
                {/* Severity-spine timeline */}
                <div className="relative pl-7 sm:pl-9 space-y-5">
                  {/* The spine: colored segments per entry rendered by node; base rail light */}
                  <div className="absolute left-[9px] sm:left-[13px] top-2 bottom-2 w-1 bg-primary-100 rounded-full" />

                  {symptomEntries.map(entry => {
                    const sevOf = (s) => {
                      const v = parseFloat(s.value) || 0;
                      const isLegacy = (s.unit || '') === '/10';
                      return { norm: isLegacy ? v / 2 : v, ...severityDots(s.value, s.unit) };
                    };
                    const maxSev = Math.max(...entry.symptoms.map(s => sevOf(s).norm));
                    const spineColor = maxSev <= 2 ? 'bg-success' : maxSev <= 3 ? 'bg-warning' : 'bg-danger';
                    const temp = entryVitals.find(
                      v => v.label === 'Body Temperature' && v.entry_id === entry.key
                    );

                    return (
                      <div key={entry.key} className="relative">
                        {/* Node on the spine, colored by severity */}
                        <div className={`absolute -left-7 sm:-left-9 top-1.5 w-[19px] sm:w-[27px] flex justify-center`}>
                          <div className={`w-4 h-4 rounded-full ring-4 ring-surface-base ${spineColor}`} />
                        </div>

                        {/* Date heading — no card, just type */}
                        <div className="flex items-baseline gap-2.5 flex-wrap">
                          <h4 className="font-heading font-extrabold text-base text-primary-900">
                            {new Date(entry.log_date + 'T00:00:00').toLocaleDateString('en-US', {
                              weekday: 'short', month: 'short', day: 'numeric'
                            })}
                          </h4>
                          <span className="text-xs font-semibold text-primary-400">
                            {entry.duration ? `felt for ${entry.duration.toLowerCase()}` : ''}
                          </span>
                          {entry.symptoms.length > 1 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-600">
                              {entry.symptoms.length} symptoms
                            </span>
                          )}
                        </div>

                        {/* Symptom rows: name + dot-scale */}
                        <div className="mt-2 space-y-1.5">
                          {entry.symptoms.map(s => {
                            const { filled, tone } = sevOf(s);
                            const SIcon = symptomIcon(s.label);
                            return (
                              <div key={s.id} className="flex items-center gap-3">
                                <SIcon className={`w-4 h-4 shrink-0 ${tone.text}`} />
                                <span className="text-sm font-semibold text-primary-800 w-40 sm:w-56 truncate shrink-0">
                                  {s.label}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  {SEVERITY.dots.map(n => (
                                    <span
                                      key={n}
                                      className={`w-2.5 h-2.5 rounded-full ${n <= filled ? tone.color : 'bg-primary-200'}`}
                                    />
                                  ))}
                                </div>
                                <span className={`text-xs font-bold uppercase tracking-wider ${tone.text} hidden sm:inline`}>
                                  {tone.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Fever temp + notes, minimal */}
                        {temp && (
                          <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-warning-text">
                            <Thermometer className="w-3.5 h-3.5 text-warning" />
                            {temp.value} {temp.unit || '°F'} temperature
                          </div>
                        )}
                        {entry.notes && (
                          <p className="mt-2 text-xs text-primary-500 border-l-2 border-primary-200 pl-3 leading-relaxed max-w-2xl">
                            {entry.notes}
                          </p>
                        )}

                        {/* Doctor guidance — the reply loop that makes logging worthwhile */}
                        {(guidanceByEntry[entry.key] || []).length > 0 && (
                          <div className="mt-3 rounded-card border border-clinical-200/70 bg-clinical-50/50 p-3.5 space-y-2.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-clinical-800 flex items-center gap-1.5">
                              <MessageCircle className="w-3.5 h-3.5" />
                              Your doctor's guidance
                            </span>
                            {(guidanceByEntry[entry.key] || []).map(c => (
                              <div key={c.id} className="flex items-start gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-clinical-600 to-primary-800 flex items-center justify-center text-white text-[10px] font-heading font-bold shrink-0 shadow-subtle">
                                  DR
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="font-heading font-bold text-xs text-primary-900">{c.doctor_name}</span>
                                    <span className="text-[10px] text-primary-400">{c.doctor_specialization || ''}</span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-primary-700 leading-relaxed">{c.comment}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= TAB 4: APPOINTMENTS ================= */}
        {activeTab === 'appointments' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-heading font-extrabold text-lg text-primary-950">My Appointments</h3>
                <p className="text-xs text-primary-500 mt-0.5">
                  Requested times show as “Requested” until your doctor confirms them.
                </p>
              </div>
              <Button variant="primary" onClick={() => setIsBookingModalOpen(true)}>
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>Book Appointment</span>
              </Button>
            </div>

            {appointmentsLoading ? (
              <div className="space-y-3">
                <SkeletonCard className="h-20" />
                <SkeletonCard className="h-20" />
              </div>
            ) : appointmentsError ? (
              <ErrorState
                title="Could not load appointments"
                description={appointmentsError}
                onRetry={loadAppointments}
              />
            ) : myAppointments.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No appointments yet"
                description="Book a time with your clinician — your request will appear here with its status."
                action={
                  <Button variant="primary" onClick={() => setIsBookingModalOpen(true)}>
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span>Book First Appointment</span>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {myAppointments.map(a => {
                  const meta = APPOINTMENT_STATUS_META[a.status] || APPOINTMENT_STATUS_META.confirmed;
                  const todayStr = new Date().toISOString().split('T')[0];
                  const isUpcoming = a.appointment_date >= todayStr && a.status !== 'cancelled';
                  const isReschedule = a.status === 'reschedule_proposed';
                  return (
                    <div
                      key={a.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-card border bg-surface-card shadow-subtle ${
                        isReschedule
                          ? 'border-l-4 border-l-clinical-600 border-y-surface-border border-r-surface-border ring-1 ring-clinical-200'
                          : isUpcoming
                            ? 'border-l-4 border-l-clinical-600 border-y-surface-border border-r-surface-border'
                            : 'border-surface-border'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-11 h-11 rounded-card flex flex-col items-center justify-center leading-none shrink-0 border ${
                          isUpcoming || isReschedule
                            ? 'bg-clinical-50 border-clinical-200 text-clinical-700'
                            : 'bg-surface-subtle border-surface-border text-primary-400'
                        }`}>
                          <span className="text-[8px] font-bold uppercase tracking-wide">
                            {new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                          </span>
                          <span className="font-heading font-extrabold text-base">
                            {a.appointment_date.slice(8)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-heading font-bold text-sm text-primary-900">
                              {new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-US', {
                                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                              })}
                            </span>
                            {a.appointment_time && (
                              <span className="text-xs font-bold text-clinical-700 font-mono tnum">
                                {formatApptTime(a.appointment_time)}
                              </span>
                            )}
                            {isUpcoming && !isReschedule && <Badge variant="clinical" size="sm">Upcoming</Badge>}
                          </div>
                          <p className="text-xs text-primary-500 truncate mt-0.5">
                            {a.reason || 'Clinical consultation'} • {a.doctor_name}
                          </p>

                          {/* Reschedule proposal: original vs offered, side by side (Phase 145) */}
                          {isReschedule && a.proposed_date && (
                            <div className="mt-2.5 p-3 rounded-card bg-clinical-50/60 border border-clinical-200/70 space-y-2">
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-clinical-800">
                                <CalendarClock className="w-3.5 h-3.5" />
                                {a.doctor_name} proposed a new time
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="px-2 py-1 rounded-button bg-white border border-surface-border text-primary-500 line-through decoration-1 tnum">
                                  {a.appointment_date}{a.appointment_time ? ` ${formatApptTime(a.appointment_time)}` : ''}
                                </span>
                                <ChevronRight className="w-3.5 h-3.5 text-clinical-600" />
                                <span className="px-2 py-1 rounded-button bg-clinical-600 text-white font-bold tnum">
                                  {a.proposed_date}{a.proposed_time ? ` ${formatApptTime(a.proposed_time)}` : ''}
                                </span>
                              </div>
                              {a.proposed_reason && (
                                <p className="text-[11px] text-primary-600 italic">“{a.proposed_reason}”</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                        <Badge variant={meta.variant} size="md">{meta.label}</Badge>
                        {isReschedule && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={respondBusy === a.id}
                              onClick={() => respondToReschedule(a.id, true)}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Accept</span>
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={respondBusy === a.id}
                              onClick={() => respondToReschedule(a.id, false)}
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Decline</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: MEDICAL HISTORY ================= */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-extrabold text-lg text-primary-950">Medical History</h3>
                <p className="text-xs text-primary-500 mt-0.5">
                  Past visits, doctor notes, and prescriptions in plain language.
                </p>
              </div>
            </div>

            <PatientHistoryTimeline
              visits={historyData?.visits || []}
              onSelectMedicine={(med) => setSelectedMedicine(med)}
            />
          </div>
        )}

        {/* Modals */}
        <MedicineDetailModal
          isOpen={Boolean(selectedMedicine)}
          onClose={() => setSelectedMedicine(null)}
          medicine={selectedMedicine}
          onOpened={(med) => markMedSeen(med?.id)}
        />

        <VitalLoggerModal
          isOpen={isVitalModalOpen}
          onClose={() => setIsVitalModalOpen(false)}
          onVitalLogged={(feedback) => triggerRefresh(feedback?.message || null, feedback?.type || 'success')}
        />

        <SymptomLoggerModal
          isOpen={isSymptomModalOpen}
          onClose={() => setIsSymptomModalOpen(false)}
          onSymptomLogged={(feedback) => triggerRefresh(feedback?.message || null, feedback?.type || 'success')}
        />

        {/* Booking modal */}
        <BookAppointmentModal
          isOpen={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          onBooked={() => triggerRefresh('Appointment requested. Your doctor will confirm shortly.', 'success')}
        />

        {/* Lab report upload + AI review (Block XII) */}
        <LabReportUploadModal
          isOpen={isLabUploadOpen}
          onClose={() => setIsLabUploadOpen(false)}
          onConfirmed={(res) => {
            const matched = res.matched_order_count || 0;
            triggerRefresh(
              matched > 0
                ? `${res.message} Matched ${matched} pending lab order${matched > 1 ? 's' : ''} automatically.`
                : res.message,
              'success'
            );
          }}
        />
      </main>
    </div>
  );
}
