import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Pill,
  FlaskConical,
  FileText,
  Activity,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Stethoscope,
  Clock,
  Plus
} from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';

const APPOINTMENT_STATUS_META = {
  requested: { label: 'Requested', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' }
};

function severityMeta(value) {
  const v = parseFloat(value);
  if (isNaN(v)) return { label: 'Reported', variant: 'subtle' };
  if (v <= 2) return { label: 'Mild', variant: 'success' };
  if (v <= 3.5) return { label: 'Moderate', variant: 'warning' };
  return { label: 'Severe', variant: 'danger' };
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

export default function PatientTimeline({ historyData, onOpenLogVisit }) {
  const [activeTab, setActiveTab] = useState('visits'); // 'visits' | 'self_logs' | 'appointments'
  const [expandedVisitId, setExpandedVisitId] = useState(null);

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
      <div className="border-b border-surface-border px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-primary-100/70 border border-primary-200/60 rounded-full p-1 overflow-x-auto max-w-full">
          {[
            { id: 'visits', label: 'Visits', count: visits.length, icon: Stethoscope },
            { id: 'self_logs', label: 'Self-Logs', count: selfLogs.length, icon: Activity },
            { id: 'appointments', label: 'Appointments', count: appointments.length, icon: Calendar }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-med flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-white text-primary-900 shadow-subtle'
                    : 'text-primary-500 hover:text-primary-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-clinical-600' : 'text-primary-400'}`} />
                <span>{tab.label}</span>
                <span className={`text-[10px] font-bold px-1.5 rounded-full ${
                  isActive ? 'bg-primary-100 text-primary-600' : 'bg-primary-100/80 text-primary-500'
                }`}>
                  {tab.count}
                </span>
                {tab.id === 'appointments' && pendingRequests > 0 && (
                  <span className="bg-warning text-white text-[9px] font-bold px-1.5 py-px rounded-full">
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

      {/* Tab 1: Clinical Visits */}
      {activeTab === 'visits' && (
        <div className="p-5">
          {visits.length === 0 ? (
            <EmptyState
              title="No clinical visits recorded"
              description="No past visits have been logged for this patient yet. Click below to document the initial encounter."
              action={
                <button
                  onClick={onOpenLogVisit}
                  className="px-3.5 py-2 rounded-button bg-clinical-600 hover:bg-clinical-700 text-white text-xs font-semibold"
                >
                  Log Initial Visit
                </button>
              }
            />
          ) : (
            <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-primary-200">
              {visits.map((visit, index) => {
                const isExpanded = expandedVisitId === visit.id || index === 0;

                return (
                  <div key={visit.id} className="relative group">
                    {/* Timeline node */}
                    <div
                      className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        index === 0
                          ? 'border-clinical-600 bg-clinical-50 text-clinical-600 ring-4 ring-clinical-50'
                          : 'border-primary-400 bg-white text-primary-500'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${index === 0 ? 'bg-clinical-600' : 'bg-primary-400'}`} />
                    </div>

                    {/* Visit card */}
                    <div className="border border-surface-border rounded-card bg-white p-4 hover:border-primary-300 transition-med">
                      {/* Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-subtle pb-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-heading font-bold text-sm text-primary-900">
                            {visit.visit_date}
                          </span>
                          <span className="text-xs text-primary-400">•</span>
                          <span className="text-xs font-medium text-primary-600">
                            Attending: {visit.doctor_name}
                          </span>
                          {index === 0 && (
                            <Badge variant="clinical" size="sm">Latest Encounter</Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="default" size="sm">
                            Diagnosis: {visit.diagnosis_name}
                          </Badge>
                          <button
                            onClick={() => setExpandedVisitId(isExpanded ? null : visit.id)}
                            className="p-1 text-primary-400 hover:text-primary-700 rounded"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Diagnosis & notes */}
                      <div className="mt-3 space-y-2">
                        {visit.diagnosis_desc && (
                          <p className="text-xs text-primary-600 leading-relaxed bg-surface-subtle/60 p-2.5 rounded-button border border-surface-border">
                            <span className="font-semibold text-primary-800">Condition Summary: </span>
                            {visit.diagnosis_desc}
                          </p>
                        )}
                        {visit.notes && (
                          <div className="text-xs text-primary-800 leading-relaxed bg-white p-2.5 rounded-button border border-primary-100">
                            <div className="font-semibold text-primary-900 flex items-center gap-1 mb-1">
                              <FileText className="w-3.5 h-3.5 text-primary-500" />
                              Clinical Progress Notes:
                            </div>
                            <p className="text-primary-700">{visit.notes}</p>
                          </div>
                        )}
                      </div>

                      {/* Prescriptions */}
                      {visit.prescriptions && visit.prescriptions.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-surface-subtle">
                          <h5 className="text-[11px] uppercase tracking-wider font-bold text-primary-500 flex items-center gap-1.5 mb-2">
                            <Pill className="w-3.5 h-3.5 text-clinical-600" />
                            Prescribed Medications ({visit.prescriptions.length})
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {visit.prescriptions.map((rx) => (
                              <div
                                key={rx.id}
                                className="bg-surface-subtle/60 rounded-button p-2.5 border border-surface-border flex flex-col justify-between"
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-1">
                                    <span className="font-heading font-semibold text-xs text-primary-900">
                                      {rx.medicine_name}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-clinical-50 text-clinical-800 border border-clinical-200 shrink-0 font-medium">
                                      {rx.therapeutic_class}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-primary-500 mt-0.5">{rx.composition}</p>
                                </div>
                                <div className="mt-2 pt-1.5 border-t border-surface-border/60 flex items-center justify-between text-[11px] text-primary-700 font-medium">
                                  <span>Dosage: {rx.dosage}</span>
                                  <span className="text-primary-500">{rx.duration}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Lab orders */}
                      {visit.lab_orders && visit.lab_orders.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-surface-subtle">
                          <h5 className="text-[11px] uppercase tracking-wider font-bold text-primary-500 flex items-center gap-1.5 mb-2">
                            <FlaskConical className="w-3.5 h-3.5 text-primary-500" />
                            Laboratory Diagnostic Orders ({visit.lab_orders.length})
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {visit.lab_orders.map((lo) => (
                              <div
                                key={lo.id}
                                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-button bg-white border border-surface-border text-xs"
                              >
                                <span className="font-medium text-primary-800">{lo.test_name}</span>
                                <span className="text-primary-400">•</span>
                                <span className="text-primary-500 text-[11px]">Due: {lo.scheduled_date}</span>
                                <Badge variant={lo.status === 'completed' ? 'success' : 'warning'} size="sm">
                                  {lo.status === 'completed' ? 'Completed' : 'Pending'}
                                </Badge>
                              </div>
                            ))}
                          </div>
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

      {/* Tab 2: Self-logs (grouped symptom entries + vitals) */}
      {activeTab === 'self_logs' && (
        <div className="p-5 space-y-6">
          {selfLogs.length === 0 ? (
            <EmptyState
              title="No self-reported logs"
              description="The patient has not logged any home vitals or symptoms yet."
            />
          ) : (
            <>
              {/* Grouped symptom entries */}
              <section>
                <h4 className="text-[11px] uppercase tracking-wider font-bold text-primary-500 flex items-center gap-1.5 mb-3">
                  <HeartPulse className="w-3.5 h-3.5 text-clinical-600" />
                  Symptom Entries ({symptomEntries.length})
                </h4>
                {symptomEntries.length === 0 ? (
                  <p className="text-xs text-primary-400 border border-dashed border-surface-border rounded-card p-4 text-center">
                    No symptom entries recorded by the patient yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {symptomEntries.map(entry => (
                      <div
                        key={entry.key}
                        className="border border-surface-border rounded-card bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-heading font-bold text-primary-900">{entry.log_date}</span>
                            {entry.symptoms.length > 1 && (
                              <Badge variant="subtle" size="sm">
                                {entry.symptoms.length} symptoms
                              </Badge>
                            )}
                          </div>
                          {entry.duration && (
                            <span className="text-[11px] text-primary-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Duration: {entry.duration}
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {entry.symptoms.map(s => {
                            const meta = severityMeta(s.value);
                            return (
                              <div
                                key={s.id}
                                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-button border border-surface-border bg-surface-subtle/50 text-xs"
                              >
                                <span className="font-semibold text-primary-900">{s.label}</span>
                                <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                              </div>
                            );
                          })}
                        </div>

                        {entry.notes && (
                          <p className="mt-2.5 text-[11px] text-primary-600 bg-surface-subtle/60 border border-surface-border rounded-button p-2 leading-relaxed">
                            <span className="font-semibold text-primary-800">Patient notes: </span>
                            {entry.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Vitals table */}
              <section>
                <h4 className="text-[11px] uppercase tracking-wider font-bold text-primary-500 flex items-center gap-1.5 mb-3">
                  <Activity className="w-3.5 h-3.5 text-clinical-600" />
                  Vitals ({vitalLogs.length})
                </h4>
                {vitalLogs.length === 0 ? (
                  <p className="text-xs text-primary-400 border border-dashed border-surface-border rounded-card p-4 text-center">
                    No home vital readings logged yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-surface-border rounded-card overflow-hidden">
                      <thead className="bg-surface-subtle border-b border-surface-border font-heading font-semibold text-primary-600 uppercase tracking-wider text-[11px]">
                        <tr>
                          <th className="px-4 py-3">Logged Date</th>
                          <th className="px-4 py-3">Metric</th>
                          <th className="px-4 py-3">Reported Value</th>
                          <th className="px-4 py-3">Reference Range</th>
                          <th className="px-4 py-3">Clinical Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border bg-white">
                        {vitalLogs.map((log) => {
                          const numVal = parseFloat(log.value);
                          let statusBadge = null;
                          if (log.normal_low !== null && log.normal_high !== null && !isNaN(numVal)) {
                            if (numVal < log.normal_low) {
                              statusBadge = <Badge variant="warning" size="sm">Below Normal</Badge>;
                            } else if (numVal > log.normal_high) {
                              statusBadge = <Badge variant="danger" size="sm">Elevated</Badge>;
                            } else {
                              statusBadge = <Badge variant="success" size="sm">In Range</Badge>;
                            }
                          }
                          return (
                            <tr key={log.id} className="hover:bg-surface-subtle transition-med">
                              <td className="px-4 py-2.5 font-medium text-primary-900">{log.log_date}</td>
                              <td className="px-4 py-2.5 font-semibold text-primary-800">{log.label}</td>
                              <td className="px-4 py-2.5 font-mono font-medium text-primary-900">
                                {log.value} {log.unit || ''}
                              </td>
                              <td className="px-4 py-2.5 text-primary-500 font-mono">
                                {log.normal_low !== null && log.normal_high !== null
                                  ? `${log.normal_low} - ${log.normal_high} ${log.unit || ''}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                {statusBadge || <span className="text-primary-400 text-xs">Self-reported</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
                return (
                  <div
                    key={a.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-card border bg-white transition-med ${
                      isUpcoming ? 'border-clinical-200' : 'border-surface-border'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-card flex items-center justify-center shrink-0 border ${
                        isUpcoming
                          ? 'bg-clinical-50 border-clinical-200 text-clinical-600'
                          : 'bg-surface-subtle border-surface-border text-primary-400'
                      }`}>
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-bold text-sm text-primary-900">
                            {a.appointment_date}
                          </span>
                          {isUpcoming && (
                            <Badge variant="clinical" size="sm">Upcoming</Badge>
                          )}
                        </div>
                        <p className="text-xs text-primary-600 truncate">{a.reason || 'Clinical consultation'}</p>
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
