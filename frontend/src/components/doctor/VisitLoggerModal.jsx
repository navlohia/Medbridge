import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Stethoscope,
  Pill,
  FlaskConical,
  Calendar,
  FileText,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Search,
  X,
  User,
  NotebookPen
} from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ConflictBanner from '../common/ConflictBanner';

// Compact inline field used across the ledger rows — borderless until it
// matters, so rows read like a printed prescription, not a form dump.
const inlineField =
  'w-full text-xs py-1.5 px-2 bg-surface-subtle/60 border border-transparent rounded-md focus:outline-none focus:bg-white focus:border-clinical-300 focus:ring-2 focus:ring-clinical-500/20 text-primary-900 font-medium transition-med';
const sectionLabel =
  'text-[11px] font-bold uppercase tracking-[0.14em] text-primary-400 flex items-center gap-1.5 shrink-0';

export default function VisitLoggerModal({ isOpen, onClose, patient, onVisitLogged }) {
  const [diagnoses, setDiagnoses] = useState([]);
  const [allMedicines, setAllMedicines] = useState([]);
  const [labTests, setLabTests] = useState([]);

  // Form state
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState('');
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState([]);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [classFilter, setClassFilter] = useState(null);
  const [medPickerOpen, setMedPickerOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [labSearch, setLabSearch] = useState('');
  const [labOrders, setLabOrders] = useState([]);
  const [nextAppointmentDate, setNextAppointmentDate] = useState('');
  const [appointmentReason, setAppointmentReason] = useState('Routine clinical follow-up');

  // Conflict + submission state
  const [conflictWarnings, setConflictWarnings] = useState([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const listRef = useRef(null);
  const highlightRef = useRef(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // Load catalogs + reset form when opened
  useEffect(() => {
    if (!isOpen) return;

    setSelectedDiagnosisId('');
    setDiagnosisSearch('');
    setNotes('');
    setPrescriptions([]);
    setMedicineSearch('');
    setClassFilter(null);
    setLabSearch('');
    setLabOrders([]);
    setConflictWarnings([]);
    setSubmitError(null);
    setAppointmentReason('Routine clinical follow-up');

    const d = new Date();
    d.setDate(d.getDate() + 30);
    setNextAppointmentDate(d.toISOString().split('T')[0]);

    const loadCatalogs = async () => {
      try {
        const [diags, meds, labs] = await Promise.all([
          api.getDiagnoses(),
          api.getMedicines(),
          api.getLabTests()
        ]);
        setDiagnoses(diags);
        setAllMedicines(meds);
        setLabTests(labs);
      } catch (err) {
        console.error('Failed to load master catalogs:', err);
      }
    };
    loadCatalogs();
  }, [isOpen]);

  // Live conflict check whenever prescriptions change
  useEffect(() => {
    if (!patient?.id || prescriptions.length === 0) {
      setConflictWarnings([]);
      return undefined;
    }

    const medIds = prescriptions.map(p => p.medicine_id).filter(Boolean);
    if (medIds.length === 0) {
      setConflictWarnings([]);
      return undefined;
    }

    let isCurrent = true;
    setCheckingConflicts(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.checkConflicts(patient.id, medIds);
        if (isCurrent) setConflictWarnings(res.conflict_warnings || []);
      } catch (err) {
        console.error('Failed to check medicine conflicts:', err);
      } finally {
        if (isCurrent) setCheckingConflicts(false);
      }
    }, 250);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [prescriptions, patient?.id]);

  const filteredDiagnoses = useMemo(
    () =>
      diagnoses.filter(
        d =>
          d.name.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
          (d.symptoms || '').toLowerCase().includes(diagnosisSearch.toLowerCase())
      ),
    [diagnoses, diagnosisSearch]
  );

  // Full catalog is browsable with an empty query (letter-balanced seed means
  // the browse list spans the whole alphabet). Typing searches across name,
  // composition, and class.
  const filteredMedicines = useMemo(() => {
    let list = allMedicines;
    if (classFilter) list = list.filter(m => m.therapeutic_class === classFilter);
    const q = medicineSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        m =>
          m.name.toLowerCase().includes(q) ||
          (m.composition || '').toLowerCase().includes(q) ||
          (m.therapeutic_class || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allMedicines, medicineSearch, classFilter]);

  // Alphabet group headers in browse mode; flat match header in search mode
  const medGroups = useMemo(() => {
    if (medicineSearch.trim() !== '') return null;
    const groups = [];
    let current = null;
    for (const m of filteredMedicines) {
      const letter = (m.name[0] || '#').toUpperCase();
      if (!current || current.letter !== letter) {
        current = { letter, items: [] };
        groups.push(current);
      }
      current.items.push(m);
    }
    return groups;
  }, [filteredMedicines, medicineSearch]);

  // Top therapeutic classes for the quick-filter chips
  const topClasses = useMemo(() => {
    const counts = {};
    for (const m of allMedicines) {
      counts[m.therapeutic_class] = (counts[m.therapeutic_class] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([name, count]) => ({ name, count }));
  }, [allMedicines]);

  // Keep the keyboard highlight within bounds as the list changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [medicineSearch, classFilter]);

  useEffect(() => {
    if (highlightRef.current && medPickerOpen) {
      highlightRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx, medPickerOpen]);

  const filteredLabTests = useMemo(() => {
    const q = labSearch.trim().toLowerCase();
    if (!q) return labTests;
    return labTests.filter(
      t =>
        t.test_name.toLowerCase().includes(q) ||
        (t.unit || '').toLowerCase().includes(q)
    );
  }, [labTests, labSearch]);

  const selectedDiagnosis = diagnoses.find(d => d.id === selectedDiagnosisId) || null;

  // Flatten the visible dropdown list for keyboard navigation
  const flatMedList = useMemo(() => {
    if (medGroups) return medGroups.flatMap(g => g.items);
    return filteredMedicines;
  }, [medGroups, filteredMedicines]);

  // Prescription handlers
  const handleAddPrescription = (medId) => {
    if (!medId) return;
    if (prescriptions.some(p => p.medicine_id === medId)) return; // no duplicates
    const med = allMedicines.find(m => m.id === medId);
    if (!med) return;
    setPrescriptions(prev => [
      ...prev,
      {
        medicine_id: med.id,
        name: med.name,
        therapeutic_class: med.therapeutic_class,
        composition: med.composition,
        dosage: '1 tablet once daily after meals',
        duration: '30 days'
      }
    ]);
    setMedicineSearch('');
    setClassFilter(null);
    setMedPickerOpen(false);
  };

  const handleRemovePrescription = (index) =>
    setPrescriptions(prev => prev.filter((_, i) => i !== index));

  const handleUpdatePrescription = (index, field, value) =>
    setPrescriptions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });

  // Lab order handlers
  const handleAddLabOrder = (testName) => {
    if (!testName) return;
    if (labOrders.some(lo => lo.test_name === testName)) return;
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setLabOrders(prev => [
      ...prev,
      { test_name: testName, scheduled_date: d.toISOString().split('T')[0] }
    ]);
  };

  const handleRemoveLabOrder = (index) =>
    setLabOrders(prev => prev.filter((_, i) => i !== index));

  const handleUpdateLabOrder = (index, field, value) =>
    setLabOrders(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });

  // Submit (atomic save)
  const handleSubmitVisit = async () => {
    if (!selectedDiagnosisId) {
      setSubmitError('Please select a primary clinical diagnosis.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await api.createVisit({
        patient_id: patient.id,
        diagnosis_id: selectedDiagnosisId,
        notes: notes.trim(),
        prescriptions: prescriptions.map(p => ({
          medicine_id: p.medicine_id,
          dosage: p.dosage,
          duration: p.duration
        })),
        lab_orders: labOrders.map(lo => ({
          test_name: lo.test_name,
          scheduled_date: lo.scheduled_date
        })),
        next_appointment_date: nextAppointmentDate || null,
        appointment_reason: appointmentReason || 'Follow-up'
      });

      if (onVisitLogged) onVisitLogged(result);
      onClose();
    } catch (err) {
      console.error('Visit logging failed:', err);
      setSubmitError(err.message || 'Failed to record visit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const patientInitials = (patient?.name || '')
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  // Reusable dropdown row renderer
  const renderMedRow = (m) => {
    const flatIdx = flatMedList.findIndex(x => x.id === m.id);
    const isHighlighted = flatIdx === highlightIdx;
    return (
      <button
        key={m.id}
        type="button"
        ref={isHighlighted ? highlightRef : null}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setHighlightIdx(flatIdx)}
        onClick={() => handleAddPrescription(m.id)}
        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2 text-left transition-med ${
          isHighlighted ? 'bg-clinical-50' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-primary-900 truncate">{m.name}</div>
          <div className="text-[11px] text-primary-500 truncate">{m.composition}</div>
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-600 border border-primary-200/70 shrink-0">
          {m.therapeutic_class}
        </span>
      </button>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon={NotebookPen}
      title="Log New Clinical Visit"
      subtitle="Prescription composer"
      footer={
        <div className="flex items-center justify-between gap-3">
          {/* Document summary — like the totals line on a real Rx */}
          <div className="text-xs text-primary-500 flex items-center gap-3 min-w-0">
            <span className="font-semibold text-primary-700 whitespace-nowrap">
              ℞ {prescriptions.length} med{prescriptions.length === 1 ? '' : 's'}
              {' · '}
              {labOrders.length} lab{labOrders.length === 1 ? '' : 's'}
            </span>
            {checkingConflicts ? (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> checking interactions…
              </span>
            ) : conflictWarnings.length > 0 ? (
              <span className="text-warning flex items-center gap-1 font-medium whitespace-nowrap">
                <AlertTriangle className="w-3.5 h-3.5" />
                {conflictWarnings.length} interaction notice{conflictWarnings.length > 1 ? 's' : ''}
              </span>
            ) : prescriptions.length > 0 ? (
              <span className="text-success flex items-center gap-1 font-medium whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5" /> interactions clear
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitVisit}
              disabled={isSubmitting || !selectedDiagnosisId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Full Clinical Visit</span>
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      {submitError && (
        <div className="p-3 bg-danger-bg border border-danger-border rounded-card text-xs font-medium text-danger-text flex items-center gap-2 -mt-1">
          <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* ============ Document header line — patient + encounter meta ============ */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 border-b border-surface-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-clinical-500 to-primary-800 flex items-center justify-center text-white text-[11px] font-heading font-bold shrink-0 shadow-subtle">
            {patientInitials || <User className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="font-heading font-bold text-sm text-primary-900 leading-tight truncate">
              {patient?.name || '—'}
            </div>
            <div className="text-[11px] text-primary-500 truncate">{patient?.email || ''}</div>
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[11px] font-semibold text-primary-700 tnum">{todayStr}</div>
          <div className="text-[10px] text-primary-400 uppercase tracking-wider">New encounter</div>
        </div>
      </div>

      {/* ============ 1 · Diagnosis — single command line ============ */}
      <div className="py-4 border-b border-surface-border space-y-2.5">
        <div className="flex items-center justify-between">
          <span className={sectionLabel}>
            <Stethoscope className="w-3.5 h-3.5 text-clinical-600" />
            Diagnosis <span className="text-danger">*</span>
          </span>
          <span className="text-[11px] text-primary-400">{diagnoses.length} conditions in catalog</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            type="text"
            placeholder="Filter conditions…"
            value={diagnosisSearch}
            onChange={(e) => setDiagnosisSearch(e.target.value)}
            className="w-full text-xs py-2 px-3 bg-surface-subtle/60 border border-transparent rounded-md focus:outline-none focus:bg-white focus:border-clinical-300 focus:ring-2 focus:ring-clinical-500/20 text-primary-900 transition-med placeholder:text-primary-300"
          />
          <select
            value={selectedDiagnosisId}
            onChange={(e) => setSelectedDiagnosisId(e.target.value)}
            className="w-full text-xs py-2 px-3 bg-surface-subtle/60 border border-transparent rounded-md focus:outline-none focus:bg-white focus:border-clinical-300 focus:ring-2 focus:ring-clinical-500/20 text-primary-900 font-semibold transition-med cursor-pointer"
            required
          >
            <option value="">
              Select diagnosis ({filteredDiagnoses.length} available)
            </option>
            {filteredDiagnoses.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {selectedDiagnosis && (
          <div className="flex items-start gap-2 text-[11px] text-primary-600 leading-relaxed animate-fadeIn">
            <span className="w-1 self-stretch bg-clinical-400 rounded-full shrink-0" />
            <span className="min-w-0">
              <span className="font-bold text-primary-800">{selectedDiagnosis.name}. </span>
              {selectedDiagnosis.description}
              {selectedDiagnosis.precautions && (
                <span className="block mt-0.5 text-primary-400">
                  <span className="font-semibold text-clinical-700">Guidelines: </span>
                  {selectedDiagnosis.precautions}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* ============ 2 · ℞ Medications — the ledger ============ */}
      <div className="py-4 border-b border-surface-border space-y-3">
        <div className="flex items-center justify-between">
          <span className={sectionLabel}>
            <Pill className="w-3.5 h-3.5 text-clinical-600" />
            Medications
            {prescriptions.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-clinical-600 text-white text-[10px] font-bold tnum">
                {prescriptions.length}
              </span>
            )}
          </span>
          <span className="text-[11px] text-primary-400">
            {medicineSearch.trim()
              ? `${filteredMedicines.length} match${filteredMedicines.length === 1 ? '' : 'es'}`
              : `${allMedicines.length} medicines · ⌫ to search`}
          </span>
        </div>

        {/* Search + quick class chips */}
        <div className="relative">
          <div className="flex items-center gap-2 bg-surface-subtle/60 border border-transparent rounded-md px-3 py-2 focus-within:bg-white focus-within:border-clinical-300 focus-within:ring-2 focus-within:ring-clinical-500/20 transition-med">
            <Search className="w-3.5 h-3.5 text-primary-400 shrink-0" />
            <input
              type="text"
              value={medicineSearch}
              onChange={(e) => setMedicineSearch(e.target.value)}
              onFocus={() => setMedPickerOpen(true)}
              onBlur={() => setTimeout(() => setMedPickerOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (flatMedList.length) setHighlightIdx(i => Math.min(i + 1, flatMedList.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (flatMedList.length) setHighlightIdx(i => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (flatMedList.length) handleAddPrescription(flatMedList[Math.min(highlightIdx, flatMedList.length - 1)].id);
                } else if (e.key === 'Escape') {
                  e.stopPropagation(); // clear the search, don't dismiss the whole modal
                  setMedicineSearch('');
                  setMedPickerOpen(false);
                }
              }}
              placeholder="Search all medicines by name, composition, or class…"
              className="flex-1 bg-transparent text-xs font-medium text-primary-900 placeholder:text-primary-300 focus:outline-none min-w-0"
            />
            {medicineSearch && (
              <button
                type="button"
                onClick={() => setMedicineSearch('')}
                className="text-primary-300 hover:text-primary-700 cursor-pointer"
                aria-label="Clear medicine search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {medPickerOpen && (
            <div
              ref={listRef}
              className="absolute z-20 mt-1.5 w-full bg-surface-card border border-surface-border rounded-card shadow-modal overflow-hidden animate-fadeIn max-h-80 overflow-y-auto"
            >
              {filteredMedicines.length === 0 ? (
                <div className="px-3.5 py-5 text-xs text-primary-400 text-center">
                  No medicines match “{medicineSearch}”{classFilter ? ` in ${classFilter}` : ''}.
                </div>
              ) : (
                <>
                  {/* Mode header */}
                  {medicineSearch.trim() !== '' ? (
                    <div className="px-3.5 py-1.5 text-[11px] font-semibold text-primary-500 bg-primary-50/70 border-b border-surface-border sticky top-0 z-10">
                      {filteredMedicines.length} medicine{filteredMedicines.length === 1 ? '' : 's'} match — Enter adds the highlighted one
                    </div>
                  ) : (
                    <div className="px-3.5 py-1.5 text-[11px] font-semibold text-primary-500 bg-primary-50/70 border-b border-surface-border sticky top-0 z-10 flex items-center justify-between">
                      <span>Browse full catalog</span>
                      <span className="text-primary-300 font-medium">↑↓ navigate · Enter adds</span>
                    </div>
                  )}

                  {medGroups
                    ? medGroups.map(group => (
                        <div key={group.letter}>
                          <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-300 bg-surface-subtle/50 border-b border-surface-border/60 sticky top-[30px] z-10">
                            {group.letter}
                            <span className="ml-1.5 text-primary-200 tnum">{group.items.length}</span>
                          </div>
                          {group.items.map(renderMedRow)}
                        </div>
                      ))
                    : filteredMedicines.map(renderMedRow)}
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick class filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setClassFilter(null)}
            className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-med cursor-pointer ${
              classFilter === null
                ? 'bg-primary-900 text-white border-primary-900'
                : 'bg-white text-primary-500 border-surface-border hover:border-primary-300'
            }`}
          >
            All
          </button>
          {topClasses.map(c => (
            <button
              key={c.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setClassFilter(classFilter === c.name ? null : c.name)}
              className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-med cursor-pointer ${
                classFilter === c.name
                  ? 'bg-clinical-600 text-white border-clinical-600'
                  : 'bg-white text-primary-500 border-surface-border hover:border-clinical-300 hover:text-clinical-700'
              }`}
            >
              {c.name} <span className="opacity-60 tnum">{c.count}</span>
            </button>
          ))}
        </div>

        <ConflictBanner warnings={conflictWarnings} />

        {/* Selected prescriptions — numbered ledger rows */}
        {prescriptions.length === 0 ? (
          <p className="text-[11px] text-primary-300 px-1 py-1 flex items-center gap-1.5">
            <Pill className="w-3.5 h-3.5" />
            Nothing prescribed yet — search above and press Enter, or click a result.
          </p>
        ) : (
          <div className="border border-surface-border rounded-card overflow-hidden divide-y divide-surface-border">
            {prescriptions.map((rx, idx) => (
              <div
                key={rx.medicine_id}
                className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 px-3.5 py-2.5 bg-white hover:bg-surface-subtle/40 transition-med group"
              >
                <span className="hidden lg:block font-mono text-[11px] font-bold text-clinical-600/70 w-6 shrink-0 tnum">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-primary-900 truncate">{rx.name}</div>
                  <div className="text-[10px] text-primary-400 truncate">{rx.composition}</div>
                </div>
                <span className="hidden xl:inline text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-500 border border-primary-200/70 shrink-0">
                  {rx.therapeutic_class}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    value={rx.dosage}
                    onChange={(e) => handleUpdatePrescription(idx, 'dosage', e.target.value)}
                    placeholder="Dosage…"
                    title="Dosage instructions"
                    className={`${inlineField} w-full lg:w-56`}
                  />
                  <input
                    type="text"
                    value={rx.duration}
                    onChange={(e) => handleUpdatePrescription(idx, 'duration', e.target.value)}
                    placeholder="Duration…"
                    title="Duration"
                    className={`${inlineField} w-20 lg:w-24`}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePrescription(idx)}
                    className="text-primary-300 hover:text-danger p-1.5 rounded-md hover:bg-danger-bg transition-med cursor-pointer shrink-0"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ 3 · Lab tests — checklist ============ */}
      <div className="py-4 border-b border-surface-border space-y-3">
        <div className="flex items-center justify-between">
          <span className={sectionLabel}>
            <FlaskConical className="w-3.5 h-3.5 text-clinical-600" />
            Lab tests
            {labOrders.length > 0 && (
              <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-clinical-600 text-white text-[10px] font-bold tnum">
                {labOrders.length}
              </span>
            )}
          </span>
          <span className="text-[11px] text-primary-400">ordered tests auto-complete when the patient logs a result</span>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 bg-surface-subtle/60 border border-transparent rounded-md px-3 py-2 focus-within:bg-white focus-within:border-clinical-300 focus-within:ring-2 focus-within:ring-clinical-500/20 transition-med">
            <Search className="w-3.5 h-3.5 text-primary-400 shrink-0" />
            <input
              type="text"
              value={labSearch}
              onChange={(e) => setLabSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredLabTests.length > 0) {
                  e.preventDefault();
                  handleAddLabOrder(filteredLabTests[0].test_name);
                  setLabSearch('');
                } else if (e.key === 'Escape' && labSearch) {
                  e.stopPropagation(); // clear the search, don't dismiss the modal
                  setLabSearch('');
                }
              }}
              placeholder="Search lab tests (e.g. glucose, HbA1c, cholesterol)…"
              className="flex-1 bg-transparent text-xs font-medium text-primary-900 placeholder:text-primary-300 focus:outline-none min-w-0"
            />
            {labSearch && (
              <button
                type="button"
                onClick={() => setLabSearch('')}
                className="text-primary-300 hover:text-primary-700 cursor-pointer"
                aria-label="Clear lab test search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {labSearch.trim() !== '' && (
            <div className="absolute z-20 mt-1.5 w-full bg-surface-card border border-surface-border rounded-card shadow-modal overflow-hidden animate-fadeIn max-h-52 overflow-y-auto">
              {filteredLabTests.length === 0 ? (
                <div className="px-3.5 py-4 text-xs text-primary-400 text-center">
                  No lab tests match “{labSearch}”.
                </div>
              ) : (
                filteredLabTests.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      handleAddLabOrder(t.test_name);
                      setLabSearch('');
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left transition-med ${i === 0 ? 'bg-clinical-50' : 'hover:bg-surface-subtle'}`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-primary-900 truncate">{t.test_name}</div>
                      <div className="text-[11px] text-primary-500">
                        Normal: {t.normal_low} – {t.normal_high} {t.unit}
                      </div>
                    </div>
                    {i === 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-600 border border-primary-200 shrink-0">
                        Enter ↵
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {labOrders.length > 0 && (
          <div className="border border-surface-border rounded-card overflow-hidden divide-y divide-surface-border">
            {labOrders.map((lo, idx) => (
              <div
                key={lo.test_name}
                className="flex items-center gap-3 px-3.5 py-2 bg-white hover:bg-surface-subtle/40 transition-med"
              >
                <FlaskConical className="w-3.5 h-3.5 text-primary-300 shrink-0" />
                <span className="text-xs font-bold text-primary-900 min-w-0 flex-1 truncate">{lo.test_name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-400">Due</span>
                  <input
                    type="date"
                    value={lo.scheduled_date}
                    onChange={(e) => handleUpdateLabOrder(idx, 'scheduled_date', e.target.value)}
                    className={inlineField}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveLabOrder(idx)}
                  className="text-primary-300 hover:text-danger p-1.5 rounded-md hover:bg-danger-bg transition-med cursor-pointer shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ 4 · Follow-up & notes ============ */}
      <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <span className={sectionLabel}>
            <Calendar className="w-3.5 h-3.5 text-clinical-600" />
            Next appointment
          </span>
          <input
            type="date"
            min={todayStr}
            value={nextAppointmentDate}
            onChange={(e) => setNextAppointmentDate(e.target.value)}
            className="w-full text-xs py-2 px-3 bg-surface-subtle/60 border border-transparent rounded-md focus:outline-none focus:bg-white focus:border-clinical-300 focus:ring-2 focus:ring-clinical-500/20 text-primary-900 font-medium transition-med"
          />
          <input
            type="text"
            placeholder="Reason (e.g. Metabolic review)"
            value={appointmentReason}
            onChange={(e) => setAppointmentReason(e.target.value)}
            className="w-full text-xs py-1.5 px-3 bg-surface-subtle/60 border border-transparent rounded-md focus:outline-none focus:bg-white focus:border-clinical-300 focus:ring-2 focus:ring-clinical-500/20 text-primary-900 transition-med placeholder:text-primary-300"
          />
        </div>

        <div className="space-y-2">
          <span className={sectionLabel}>
            <FileText className="w-3.5 h-3.5 text-clinical-600" />
            Clinical notes
          </span>
          <textarea
            rows={3}
            placeholder="Observations, symptom response, examination findings…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs p-2.5 bg-surface-subtle/60 border border-transparent rounded-md focus:outline-none focus:bg-white focus:border-clinical-300 focus:ring-2 focus:ring-clinical-500/20 resize-none text-primary-900 transition-med placeholder:text-primary-300 leading-relaxed"
          />
        </div>
      </div>
    </Modal>
  );
}
