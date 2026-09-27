import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Calendar, Activity, Pill, FlaskConical, Search, ChevronDown, User, Check } from 'lucide-react';
import Badge from '../common/Badge';

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
  historyData
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
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
    <div className="bg-surface-card border border-surface-border rounded-card p-4 sm:p-5 shadow-subtle mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Searchable patient combobox */}
        <div className="flex-1 min-w-0" ref={containerRef}>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-primary-500 mb-1.5">
            Active Clinical Patient
          </label>
          <div className="relative w-full sm:max-w-md">
            <div className="flex items-center gap-2 bg-surface-subtle border border-surface-border rounded-button px-3 py-2 focus-within:ring-2 focus-within:ring-clinical-500 focus-within:bg-white transition-med">
              {selectedPatient && !open ? (
                <>
                  <div className="w-7 h-7 rounded-full bg-clinical-50 border border-clinical-200 flex items-center justify-center text-clinical-700 font-heading font-bold text-[11px] shrink-0">
                    {initialsOf(selectedPatient.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-semibold text-sm text-primary-900 leading-tight truncate">
                      {selectedPatient.name}
                    </div>
                    <div className="text-[11px] text-primary-500 truncate">{selectedPatient.email}</div>
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
                    <div className="text-[11px] text-primary-400 mt-0.5">
                      Patients will appear here once accounts are seeded.
                    </div>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-primary-400 text-center">
                    No patients match “{query}”.
                  </div>
                ) : (
                  filtered.map(p => {
                    const isSelected = selectedPatient?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectPatient(p)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-med ${
                          isSelected ? 'bg-clinical-50/60' : 'hover:bg-surface-subtle'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-primary-700 font-heading font-bold text-[11px] shrink-0">
                          {initialsOf(p.name) || <User className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-heading font-semibold text-xs text-primary-900 truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-primary-500 truncate">{p.email}</div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-clinical-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Clinical context summary */}
        {selectedPatient && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t lg:border-t-0 lg:border-l border-surface-border pt-3 lg:pt-0 lg:pl-5">
            <div>
              <span className="text-[11px] text-primary-400 font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Past Visits
              </span>
              <p className="font-heading font-bold text-sm text-primary-900 mt-0.5">
                {visitsCount} {visitsCount === 1 ? 'Visit' : 'Visits'}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-primary-400 font-medium flex items-center gap-1">
                <Pill className="w-3 h-3 text-clinical-600" /> Active Meds
              </span>
              <p className="font-heading font-bold text-sm text-primary-900 mt-0.5">
                {activeMedsCount} {activeMedsCount === 1 ? 'Medication' : 'Medications'}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-primary-400 font-medium flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-primary-400" /> Pending Labs
              </span>
              <p className="font-heading font-bold text-sm text-primary-900 mt-0.5">
                {pendingLabsCount}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-primary-400 font-medium flex items-center gap-1">
                <Activity className="w-3 h-3 text-primary-400" /> Last Visit
              </span>
              <p className="font-heading font-semibold text-xs text-primary-800 mt-0.5 truncate">
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
    </div>
  );
}
