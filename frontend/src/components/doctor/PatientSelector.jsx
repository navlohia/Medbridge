import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Calendar, Activity, Pill, FlaskConical, Search, ChevronDown, User, Check, HeartPulse, UserPlus } from 'lucide-react';
import Badge from '../common/Badge';
import QuickAddPatientModal from './QuickAddPatientModal';

function initialsOf(name = '') {
  return name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

export default function PatientSelector({
  patients = [],
  selectedPatientId,
  onSelectPatient,
  historyData,
  onQuickAddCreated
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedPatient =
    patients.find(p => p.id === selectedPatientId) || patients[0] || null;

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      p => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    );
  }, [patients, query]);

  const selectPatient = (p) => {
    onSelectPatient(p.id);
    setQuery('');
    setOpen(false);
  };

  // Stats computed from the full loaded history (accurate, deduped)
  const visits = historyData?.visits || [];
  const visitsCount = visits.length;
  const lastVisit = visits[0];

  const activeMedsCount = useMemo(() => {
    const seen = new Set();
    for (const v of visits) {
      for (const rx of v.prescriptions || []) {
        seen.add(rx.medicine_id || rx.medicine_name);
      }
    }
    return seen.size;
  }, [visits]);

  const pendingLabsCount = useMemo(
    () =>
      visits.reduce(
        (acc, v) => acc + (v.lab_orders || []).filter(lo => lo.status === 'pending').length,
        0
      ),
    [visits]
  );

  const pendingRequestsCount = useMemo(
    () => (historyData?.appointments || []).filter(a => a.status === 'requested').length,
    [historyData]
  );

  return (
    <div className="bg-surface-card border border-surface-border rounded-card p-4 sm:p-5 shadow-subtle">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Searchable patient combobox */}
        <div className="flex-1 min-w-0" ref={containerRef}>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-primary-500">
              Active Patient
            </label>
            {/* Quick-add entry (Phase 133): fast walk-in registration */}
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-button border border-clinical-200 bg-clinical-50 text-clinical-700 hover:bg-clinical-100 font-semibold text-xs transition-med cursor-pointer shrink-0"
              title="Register a walk-in patient"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Patient</span>
            </button>
          </div>
          <div className="relative w-full sm:max-w-md">
            <div className="flex items-center gap-2 bg-surface-subtle border border-surface-border rounded-button px-3 py-2 focus-within:ring-2 focus-within:ring-clinical-500 focus-within:bg-white transition-med">
              {selectedPatient && !open ? (
                <>
                  <div className="w-7 h-7 rounded-full bg-clinical-50 border border-clinical-200 flex items-center justify-center text-clinical-700 font-heading font-bold text-xs shrink-0">
                    {initialsOf(selectedPatient.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-semibold text-sm text-primary-900 leading-tight truncate">
                      {selectedPatient.name}
                    </div>
                    <div className="text-xs text-primary-500 truncate">{selectedPatient.email}</div>
                  </div>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 text-primary-400 shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setOpen(true)}
                    placeholder="Search patients by name or email..."
                    className="flex-1 bg-transparent text-xs font-medium text-primary-900 placeholder:text-primary-400 focus:outline-none min-w-0"
                  />
                </>
              )}
              <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="p-1 text-primary-400 hover:text-primary-700 rounded transition-med shrink-0"
                aria-label="Toggle patient list"
              >
                <ChevronDown className={`w-4 h-4 transition-med ${open ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {open && (
              <div className="absolute z-20 mt-1.5 w-full sm:max-w-md bg-surface-card border border-surface-border rounded-card shadow-modal overflow-hidden animate-fadeIn max-h-60 overflow-y-auto">
                {patients.length === 0 ? (
                  <div className="px-3 py-5 text-center">
                    <User className="w-6 h-6 text-primary-300 mx-auto mb-1.5" />
                    <div className="text-xs font-semibold text-primary-700">No patients registered</div>
                    <div className="text-xs text-primary-400 mt-0.5">
                      Use “Add Patient” to register a walk-in.
                    </div>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-primary-400 text-center">
                    No patients match “{query}”.
                  </div>
                ) : (
                  filtered.map(p => {
                    const isSelected = selectedPatient?.id === p.id;
                    const act = p.symptom_activity;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectPatient(p)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-med ${
                          isSelected ? 'bg-clinical-50/60' : 'hover:bg-surface-subtle'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-primary-700 font-heading font-bold text-xs shrink-0">
                          {initialsOf(p.name) || <User className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-heading font-semibold text-xs text-primary-900 truncate">
                            {p.name}
                          </div>
                          <div className="text-xs text-primary-500 truncate">{p.email}</div>
                        </div>
                        {act && (
                          <span
                            className={`hidden sm:inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                              act.max_severity <= 2
                                ? 'bg-success-bg text-success-text border-success-border'
                                : act.max_severity <= 3
                                  ? 'bg-warning-bg text-warning-text border-warning-border'
                                  : 'bg-danger-bg text-danger-text border-danger-border'
                            }`}
                            title={`${act.log_count} symptoms logged on ${act.log_date} — worst severity ${act.max_severity}/5`}
                          >
                            <HeartPulse className="w-3 h-3" />
                            logged {act.log_date.slice(5)}
                          </span>
                        )}
                        {isSelected && <Check className="w-4 h-4 text-clinical-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Clinical context summary — icon-led stats */}
        {selectedPatient && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3 border-t lg:border-t-0 lg:border-l border-surface-border pt-3 lg:pt-0 lg:pl-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Visits
              </span>
              <p className="font-heading font-extrabold text-lg text-primary-900 mt-0.5 tnum">
                {visitsCount}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400 flex items-center gap-1">
                <Pill className="w-3 h-3 text-clinical-600" /> Meds
              </span>
              <p className="font-heading font-extrabold text-lg text-primary-900 mt-0.5 tnum">
                {activeMedsCount}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400 flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-warning" /> Labs due
              </span>
              <p className="font-heading font-extrabold text-lg text-primary-900 mt-0.5 tnum">
                {pendingLabsCount}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400 flex items-center gap-1">
                <Activity className="w-3 h-3 text-primary-400" /> Last visit
              </span>
              <p className="font-heading font-bold text-sm text-primary-800 mt-0.5 truncate">
                {lastVisit ? lastVisit.visit_date : 'No records'}
              </p>
              {pendingRequestsCount > 0 && (
                <Badge variant="warning" size="sm" className="mt-1">
                  {pendingRequestsCount} appt request{pendingRequestsCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick-add modal (Block X) — success auto-selects via onQuickAddCreated */}
      <QuickAddPatientModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={(res) => {
          if (onQuickAddCreated) {
            onQuickAddCreated(res);
          } else {
            setQuickAddOpen(false);
          }
        }}
      />
    </div>
  );
}
