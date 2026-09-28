import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Calendar,
  CalendarClock,
  Pill,
  FlaskConical,
  FileText,
  Activity,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Stethoscope,
  Clock,
  Plus,
  Thermometer,
  MessageSquarePlus,
  MessageCircle,
  Loader2,
  Quote,
  CheckCircle2
} from 'lucide-react';
import { api } from '../../api/client';
import Badge from '../common/Badge';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';
import { symptomIcon, vitalIcon } from '../../utils/iconMap';

const APPOINTMENT_STATUS_META = {
  requested: { label: 'Requested', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  reschedule_proposed: { label: 'Reschedule proposed', variant: 'clinical' }
};

function formatApptTime12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// Severity scale 1–5 (legacy 1–10 rows mapped) — matches the patient journal
const SEVERITY = {
  dots: [1, 2, 3, 4, 5],
  tone: (v, isLegacy) => {
    const sev = isLegacy ? v / 2 : v;
    if (sev <= 2) return { color: 'bg-success', text: 'text-success-text', label: 'Mild' };
    if (sev <= 3) return { color: 'bg-warning', text: 'text-warning-text', label: 'Moderate' };
    return { color: 'bg-danger', text: 'text-danger-text', label: 'Severe' };
  }
};

function severityDots(value, unit) {
  const isLegacy = (unit || '') === '/10';
  const filled = isLegacy
    ? Math.min(5, Math.ceil((parseFloat(value) || 0) / 2))
    : Math.min(5, Math.max(1, Math.round(parseFloat(value) || 0)));
  return { filled, tone: SEVERITY.tone(parseFloat(value) || 0, isLegacy) };
}

function initialsOf(name = '') {
  return (name || '')
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const then = new Date(String(dateStr).replace(' ', 'T'));
  if (isNaN(then.getTime())) return '';
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Group symptom logs into entries. New entries share entry_id; legacy rows
 * (pre-grouping) become singleton entries so nothing is lost.
 */
function groupSymptomEntries(symptomLogs) {
  const byKey = new Map();
  const entries = [];
  for (const log of symptomLogs) {
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
}

/** One guidance comment row (doctor avatar bubble). */
function CommentRow({ comment }) {
  const initials = initialsOf(comment.doctor_name) || 'DR';
  return (
    <div className="flex items-start gap-2.5 animate-fadeIn">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-clinical-600 to-primary-800 flex items-center justify-center text-white text-[10px] font-heading font-bold shrink-0 shadow-subtle">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-heading font-bold text-xs text-primary-900">
            {comment.doctor_name}
          </span>
          <span className="text-[10px] font-semibold text-clinical-700 uppercase tracking-wider">
            Guidance
          </span>
          <span className="text-[10px] text-primary-400">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="mt-0.5 text-xs text-primary-700 leading-relaxed">{comment.comment}</p>
      </div>
    </div>
  );
}

/** Inline composer for adding guidance to one entry. */
function CommentComposer({ entryId, patientName, onAdded, onCancel }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.focus();
  }, []);

  const submit = async () => {
    const t = text.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.addSymptomComment(entryId, t);
      onAdded(res.comment);
    } catch (err) {
      console.error('Failed to add guidance:', err);
      setError(err.message || 'Could not save your note.');
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2.5 animate-fadeIn">
      <div className="flex items-start gap-2">
        <MessageSquarePlus className="w-4 h-4 text-clinical-600 mt-2.5 shrink-0" />
        <textarea
          ref={ref}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={`Reassure or advise ${patientName || 'the patient'} about this entry…`}
          className="w-full text-xs p-2.5 bg-white border border-clinical-200 rounded-card focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none leading-relaxed"
        />
      </div>
      <div className="flex items-center justify-between mt-1.5 pl-7 gap-2">
        <span className="text-[10px] text-primary-400">
          The patient sees this on their journal entry • ⌘/Ctrl + ↵ to send
        </span>
        <div className="flex items-center gap-2">
          {error && <span className="text-[10px] text-danger-text font-medium">{error}</span>}
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!text.trim() || submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sending…</span>
              </>
            ) : (
              <>
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Add Guidance</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Expandable guidance thread on a symptom entry. */
function GuidanceThread({ entry, comments, onCommentAdded }) {
  const [composing, setComposing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasComments = comments.length > 0;
  const visible = expanded ? comments : comments.slice(0, 1);

  return (
    <div className="mt-3 rounded-card border border-clinical-200/70 bg-clinical-50/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-clinical-800 flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5" />
          Care team guidance
        </span>
        {hasComments && (
          <span className="text-[10px] font-bold text-clinical-700 tnum">
            {comments.length} note{comments.length > 1 ? 's' : ''}
          </span>
        )}
        {!hasComments && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="text-[10px] font-bold uppercase tracking-wider text-clinical-700 hover:text-clinical-800 flex items-center gap-1 cursor-pointer transition-med"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Reply to this entry
          </button>
        )}
      </div>

      {visible.map(c => <CommentRow key={c.id} comment={c} />)}
      {!expanded && comments.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[10px] font-bold text-clinical-700 hover:text-clinical-800 cursor-pointer"
        >
          View {comments.length - 1} more note{comments.length - 1 > 1 ? 's' : ''} ↓
        </button>
      )}

      {composing ? (
        <CommentComposer
          entryId={entry.key}
          onAdded={(c) => {
            onCommentAdded(entry.key, c);
            setComposing(false);
          }}
          onCancel={() => setComposing(false)}
        />
      ) : (
        hasComments && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="text-[10px] font-semibold text-clinical-700/80 hover:text-clinical-800 flex items-center gap-1 cursor-pointer transition-med"
          >
            <MessageSquarePlus className="w-3 h-3" />
            Add another note
          </button>
        )
      )}
    </div>
  );
}

export default function PatientTimeline({ historyData, onOpenLogVisit, focusTab }) {
  // focusTab: parent may request a tab (e.g. the journal nudge opens 'self_logs')
  const [activeTab, setActiveTab] = useState(focusTab || 'visits'); // 'visits' | 'self_logs' | 'appointments'
  useEffect(() => {
    if (focusTab) setActiveTab(focusTab);
  }, [focusTab]);
  const [expandedVisitId, setExpandedVisitId] = useState(null);
  const [commentsByEntry, setCommentsByEntry] = useState({});

  // Sync comment map from server history (fresh after each load)
  useEffect(() => {
    setCommentsByEntry(historyData?.symptom_comments_by_entry || {});
  }, [historyData]);

  const handleCommentAdded = (entryKey, comment) => {
    setCommentsByEntry(prev => ({
      ...prev,
      [entryKey]: [...(prev[entryKey] || []), comment]
    }));
  };

  const visits = historyData?.visits || [];
  const selfLogs = historyData?.self_logs || [];
  const appointments = historyData?.appointments || [];

  const vitalLogs = useMemo(
    () => selfLogs.filter(l => l.log_type === 'vital'),
    [selfLogs]
  );
  const symptomEntries = useMemo(
    () => groupSymptomEntries(selfLogs.filter(l => l.log_type === 'symptom')),
    [selfLogs]
  );

  // Entries awaiting guidance — surfaced in the tab badge
  const needsReviewCount = useMemo(
    () => symptomEntries.filter(e => !(commentsByEntry[e.key] || []).length).length,
    [symptomEntries, commentsByEntry]
  );

  // Upcoming (>= today) first, then most recent
  const sortedAppointments = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const upcoming = appointments
      .filter(a => a.appointment_date >= today && a.status !== 'cancelled')
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
    const rest = appointments
      .filter(a => !(a.appointment_date >= today && a.status !== 'cancelled'))
      .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date));
    return [...upcoming, ...rest];
  }, [appointments]);

  const pendingRequests = appointments.filter(a => a.status === 'requested').length;

  return (
    <div className="bg-surface-card border border-surface-border rounded-card shadow-subtle overflow-hidden">
      {/* Tab Navigation Header */}
      <div className="border-b border-surface-border px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-primary-100/70 border border-primary-200/60 rounded-full p-1 overflow-x-auto max-w-full">
          {[
            { id: 'visits', label: 'Visits', count: visits.length, icon: Stethoscope },
            { id: 'self_logs', label: 'Symptom Journal', count: symptomEntries.length, icon: HeartPulse, alerts: needsReviewCount },
            { id: 'appointments', label: 'Appointments', count: appointments.length, icon: Calendar }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isSeverity = tab.id === 'self_logs';
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-heading font-semibold transition-med flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? isSeverity
                      ? 'bg-clinical-600 text-white shadow-subtle'
                      : 'bg-white text-primary-900 shadow-subtle'
                    : 'text-primary-500 hover:text-primary-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? (isSeverity ? 'text-white' : 'text-clinical-600') : 'text-primary-400'}`} />
                <span>{tab.label}</span>
                {tab.alerts > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-px rounded-full tnum animate-pulseSoft ${
                      isActive ? 'bg-white/25 text-white' : 'bg-warning text-white'
                    }`}
                    title={`${tab.alerts} journal ${tab.alerts === 1 ? 'entry' : 'entries'} awaiting your guidance`}
                  >
                    {tab.alerts}
                  </span>
                )}
                {tab.id === 'appointments' && pendingRequests > 0 && (
                  <span className="bg-warning text-white text-[9px] font-bold px-1.5 py-px rounded-full animate-pulseSoft">
                    {pendingRequests}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Button variant="primary" size="sm" onClick={onOpenLogVisit}>
          <Plus className="w-3.5 h-3.5" />
          <span>Log New Visit</span>
        </Button>
      </div>

      {/* Tab 1: Clinical Visits — severity-spine timeline */}
      {activeTab === 'visits' && (
        <div className="p-5">
          {visits.length === 0 ? (
            <EmptyState
              title="No clinical visits recorded"
              description="No past visits have been logged for this patient yet. Document the initial encounter to start the record."
              action={
                <Button variant="primary" onClick={onOpenLogVisit}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Initial Visit</span>
                </Button>
              }
            />
          ) : (
            <div className="relative pl-8 space-y-7">
              {/* Base rail */}
              <div className="absolute left-[11px] top-3 bottom-3 w-1 bg-primary-100 rounded-full" />

              {visits.map((visit, index) => {
                const isExpanded = expandedVisitId === visit.id || index === 0;

                return (
                  <div key={visit.id} className="relative">
                    {/* Node on the spine */}
                    <div className="absolute -left-8 top-2 w-[27px] flex justify-center">
                      <div
                        className={`w-[18px] h-[18px] rounded-full ring-4 ring-surface-card ${
                          index === 0 ? 'bg-clinical-600' : 'bg-primary-300'
                        }`}
                      />
                    </div>

                    {/* Visit header — flat type, no nested card */}
                    <button
                      onClick={() => setExpandedVisitId(isExpanded ? null : visit.id)}
                      className="w-full flex items-center justify-between gap-3 text-left group cursor-pointer"
                    >
                      <div className="flex items-baseline gap-2.5 flex-wrap min-w-0">
                        <h4 className="font-heading font-extrabold text-base text-primary-900 group-hover:text-clinical-700 transition-med">
                          {visit.visit_date}
                        </h4>
                        <span className="text-xs text-primary-500 truncate">
                          {visit.doctor_name}
                        </span>
                        <Badge variant="clinical" size="sm">{visit.diagnosis_name}</Badge>
                        {index === 0 && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-clinical-100 text-clinical-800">
                            Latest
                          </span>
                        )}
                      </div>
                      <span className="text-primary-400 group-hover:text-clinical-600 transition-med shrink-0 p-1">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-4 animate-fadeIn">
                        {/* Diagnosis summary + notes — quiet quote blocks, not boxes-in-boxes */}
                        {visit.diagnosis_desc && (
                          <p className="text-xs text-primary-700 border-l-2 border-clinical-300 pl-3 leading-relaxed max-w-3xl">
                            <span className="font-bold text-primary-900">Condition summary: </span>
                            {visit.diagnosis_desc}
                          </p>
                        )}
                        {visit.notes && (
                          <p className="text-xs text-primary-700 border-l-2 border-primary-200 pl-3 leading-relaxed max-w-3xl">
                            <span className="font-bold text-primary-900 flex items-center gap-1.5 mb-0.5">
                              <FileText className="w-3.5 h-3.5 text-primary-400" />
                              Clinical notes
                            </span>
                            {visit.notes}
                          </p>
                        )}

                        {/* Prescriptions — icon rows */}
                        {visit.prescriptions && visit.prescriptions.length > 0 && (
                          <div>
                            <h5 className="text-xs uppercase tracking-wider font-bold text-primary-400 flex items-center gap-1.5 mb-2">
                              <Pill className="w-3.5 h-3.5 text-clinical-600" />
                              Prescribed medicines ({visit.prescriptions.length})
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-2.5">
                              {visit.prescriptions.map((rx) => (
                                <div key={rx.id} className="flex items-start gap-2.5 min-w-0">
                                  <div className="w-8 h-8 rounded-card bg-clinical-50 border border-clinical-200 flex items-center justify-center text-clinical-600 shrink-0">
                                    <Pill className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-heading font-bold text-xs text-primary-900">
                                        {rx.medicine_name}
                                      </span>
                                      <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-primary-100 text-primary-600">
                                        {rx.therapeutic_class}
                                      </span>
                                    </div>
                                    <p className="text-xs text-primary-500 truncate">
                                      {rx.dosage} · {rx.duration}
                                    </p>
                                    <p className="text-[10px] text-primary-400 truncate">{rx.composition}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Lab orders — chips with status color */}
                        {visit.lab_orders && visit.lab_orders.length > 0 && (
                          <div>
                            <h5 className="text-xs uppercase tracking-wider font-bold text-primary-400 flex items-center gap-1.5 mb-2">
                              <FlaskConical className="w-3.5 h-3.5 text-primary-500" />
                              Lab orders ({visit.lab_orders.length})
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {visit.lab_orders.map((lo) => (
                                <div
                                  key={lo.id}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-button border text-xs ${
                                    lo.status === 'completed'
                                      ? 'bg-success-bg border-success-border text-success-text'
                                      : 'bg-warning-bg border-warning-border text-warning-text'
                                  }`}
                                >
                                  <FlaskConical className="w-3.5 h-3.5 shrink-0" />
                                  <span className="font-semibold">{lo.test_name}</span>
                                  <span className="text-[10px] opacity-70">
                                    {lo.status === 'completed' ? '✓ Completed' : `Due ${lo.scheduled_date}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Symptom Journal — grouped entries + guidance threads */}
      {activeTab === 'self_logs' && (
        <div className="p-5 space-y-7">
          {selfLogs.length === 0 ? (
            <EmptyState
              title="No self-reported logs"
              description="The patient has not logged any home vitals or symptoms yet."
            />
          ) : (
            <>
              {/* Grouped symptom entries — severity-spine, same language as the patient journal */}
              <section>
                {/* Compact journal toolbar — mirrors the patient-side bar */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface-subtle/50 border border-surface-border/70 rounded-card px-3.5 py-2.5 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-card bg-gradient-to-br from-clinical-500 to-clinical-700 flex items-center justify-center text-white shadow-subtle shrink-0">
                      <HeartPulse className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-heading font-bold text-xs text-primary-900 leading-tight">Symptom journal</div>
                      <div className="text-[11px] text-primary-500">
                        {symptomEntries.length} {symptomEntries.length === 1 ? 'entry' : 'entries'} · {vitalLogs.length} vital {vitalLogs.length === 1 ? 'reading' : 'readings'}
                      </div>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {needsReviewCount > 0 ? (
                      <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-warning-bg text-warning-text border border-warning-border">
                        {needsReviewCount} awaiting guidance
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-success-bg text-success-text border border-success-border flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        All reviewed
                      </span>
                    )}
                  </div>
                </div>

                {symptomEntries.length === 0 ? (
                  <p className="text-xs text-primary-400 border border-dashed border-surface-border rounded-card p-4 text-center">
                    No symptom entries recorded by the patient yet.
                  </p>
                ) : (
                  <div className="relative pl-8 space-y-6">
                    <div className="absolute left-[11px] top-2 bottom-2 w-1 bg-primary-100 rounded-full" />

                    {symptomEntries.map(entry => {
                      const sevOf = (s) => severityDots(s.value, s.unit);
                      const maxSev = Math.max(
                        ...entry.symptoms.map(s => {
                          const v = parseFloat(s.value) || 0;
                          return (s.unit || '') === '/10' ? v / 2 : v;
                        })
                      );
                      const spineColor = maxSev <= 2 ? 'bg-success' : maxSev <= 3 ? 'bg-warning' : 'bg-danger';
                      const temp = entry.symptoms.find(s => s.label?.toLowerCase().includes('fever'))
                        ? selfLogs.find(l => l.log_type === 'vital' && l.entry_id === entry.key && l.label === 'Body Temperature')
                        : null;
                      const comments = commentsByEntry[entry.key] || [];
                      const needsGuidance = comments.length === 0;

                      return (
                        <div key={entry.key} className="relative">
                          <div className="absolute -left-8 top-1.5 w-[27px] flex justify-center">
                            <div className={`w-4 h-4 rounded-full ring-4 ring-surface-card ${spineColor}`} />
                          </div>

                          <div className="flex items-baseline gap-2.5 flex-wrap">
                            <h5 className="font-heading font-extrabold text-sm text-primary-900">
                              {new Date(entry.log_date + 'T00:00:00').toLocaleDateString('en-US', {
                                weekday: 'short', month: 'short', day: 'numeric'
                              })}
                            </h5>
                            {entry.duration && (
                              <span className="text-xs font-semibold text-primary-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                felt for {entry.duration.toLowerCase()}
                              </span>
                            )}
                            {entry.symptoms.length > 1 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-600 tnum">
                                {entry.symptoms.length} symptoms
                              </span>
                            )}
                            {needsGuidance && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-warning-bg text-warning-text border border-warning-border animate-pulseSoft">
                                Awaiting reply
                              </span>
                            )}
                          </div>

                          {/* Symptom rows: icon + name + dot scale */}
                          <div className="mt-2.5 space-y-2">
                            {entry.symptoms.map(s => {
                              const SIcon = symptomIcon(s.label);
                              const { filled, tone } = sevOf(s);
                              return (
                                <div key={s.id} className="flex items-center gap-3">
                                  <SIcon className="w-4 h-4 text-clinical-600 shrink-0" />
                                  <span className="text-xs font-semibold text-primary-800 w-36 sm:w-52 truncate shrink-0">
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

                          {temp && (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-warning-text">
                              <Thermometer className="w-3.5 h-3.5 text-warning" />
                              {temp.value} {temp.unit || '°F'} temperature
                            </div>
                          )}
                          {entry.notes && (
                            <p className="mt-2 text-xs text-primary-600 border-l-2 border-primary-200 pl-3 leading-relaxed max-w-2xl flex items-start gap-1.5">
                              <Quote className="w-3 h-3 text-primary-300 mt-0.5 shrink-0 rotate-180" />
                              <span>{entry.notes}</span>
                            </p>
                          )}

                          {/* Doctor guidance thread + composer */}
                          <GuidanceThread
                            entry={entry}
                            comments={comments}
                            onCommentAdded={handleCommentAdded}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Vitals — icon rows with range status */}
              <section>
                <h4 className="text-xs uppercase tracking-wider font-bold text-primary-400 flex items-center gap-1.5 mb-3">
                  <Activity className="w-3.5 h-3.5 text-clinical-600" />
                  Vitals ({vitalLogs.length})
                </h4>
                {vitalLogs.length === 0 ? (
                  <p className="text-xs text-primary-400 border border-dashed border-surface-border rounded-card p-4 text-center">
                    No home vital readings logged yet.
                  </p>
                ) : (
                  <div className="divide-y divide-surface-subtle border border-surface-border rounded-card overflow-hidden">
                    {vitalLogs.slice(0, 12).map((log) => {
                      const VIcon = vitalIcon(log.label);
                      const numVal = parseFloat(log.value);
                      let status = null;
                      if (log.normal_low !== null && log.normal_high !== null && !isNaN(numVal)) {
                        if (numVal < log.normal_low) status = { label: 'Low', cls: 'text-warning-text bg-warning-bg border-warning-border' };
                        else if (numVal > log.normal_high) status = { label: 'Elevated', cls: 'text-danger-text bg-danger-bg border-danger-border' };
                        else status = { label: 'In range', cls: 'text-success-text bg-success-bg border-success-border' };
                      }
                      return (
                        <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-surface-subtle/60 transition-med">
                          <div className="w-8 h-8 rounded-card bg-primary-100 border border-primary-200 flex items-center justify-center text-clinical-700 shrink-0">
                            <VIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-primary-900">{log.label}</div>
                            <div className="text-[10px] text-primary-400">{log.log_date}</div>
                          </div>
                          <div className="font-mono font-bold text-sm text-primary-900 tnum shrink-0">
                            {log.value} <span className="text-[10px] font-medium text-primary-400">{log.unit || ''}</span>
                          </div>
                          <div className="hidden md:block text-[10px] font-mono text-primary-400 tnum w-28 text-right shrink-0">
                            {log.normal_low !== null && log.normal_high !== null
                              ? `${log.normal_low}–${log.normal_high}`
                              : '—'}
                          </div>
                          {status ? (
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${status.cls} shrink-0`}>
                              {status.label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-primary-400 shrink-0">Self-reported</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* Tab 3: Appointments */}
      {activeTab === 'appointments' && (
        <div className="p-5">
          {sortedAppointments.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No appointments on record"
              description="Upcoming and past appointments — whether scheduled during a visit or requested by the patient — will appear here."
            />
          ) : (
            <div className="space-y-2.5">
              {sortedAppointments.map(a => {
                const meta = APPOINTMENT_STATUS_META[a.status] || APPOINTMENT_STATUS_META.confirmed;
                const today = new Date().toISOString().split('T')[0];
                const isUpcoming = a.appointment_date >= today && a.status !== 'cancelled';
                const isReschedule = a.status === 'reschedule_proposed';
                return (
                  <div
                    key={a.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-card border bg-white transition-med shadow-subtle ${
                      isReschedule
                        ? 'border-l-4 border-l-clinical-600 border-y-surface-border border-r-surface-border ring-1 ring-clinical-200'
                        : isUpcoming
                          ? 'border-l-4 border-l-clinical-600 border-y-surface-border border-r-surface-border'
                          : 'border-surface-border'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 rounded-card flex flex-col items-center justify-center leading-none shrink-0 border ${
                        isUpcoming || isReschedule
                          ? 'bg-clinical-50 border-clinical-200 text-clinical-700'
                          : 'bg-surface-subtle border-surface-border text-primary-400'
                      }`}>
                        <span className="text-[8px] font-bold uppercase tracking-wide">
                          {new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                        <span className="font-heading font-extrabold text-base tnum">
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
                              {formatApptTime12(a.appointment_time)}
                            </span>
                          )}
                          {isUpcoming && !isReschedule && (
                            <Badge variant="clinical" size="sm">Upcoming</Badge>
                          )}
                        </div>
                        <p className="text-xs text-primary-500 truncate mt-0.5">{a.reason || 'Clinical consultation'}</p>
                        {isReschedule && a.proposed_date && (
                          <div className="mt-1.5 text-[11px] font-semibold text-clinical-700 flex items-center gap-1.5 flex-wrap">
                            <CalendarClock className="w-3.5 h-3.5" />
                            <span>offered: {a.proposed_date}{a.proposed_time ? ` ${formatApptTime12(a.proposed_time)}` : ''}</span>
                            {a.proposed_reason && <span className="italic font-normal text-primary-500">“{a.proposed_reason}”</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant={meta.variant} size="md">{meta.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
