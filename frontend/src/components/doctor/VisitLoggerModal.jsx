import React, { useState, useEffect, useMemo } from 'react';
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
  Search
} from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ConflictBanner from '../common/ConflictBanner';

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
  const [labOrders, setLabOrders] = useState([]);
  const [nextAppointmentDate, setNextAppointmentDate] = useState('');
  const [appointmentReason, setAppointmentReason] = useState('Routine clinical follow-up');

  // Conflict + submission state
  const [conflictWarnings, setConflictWarnings] = useState([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // Load catalogs + reset form when opened
  useEffect(() => {
    if (!isOpen) return;

    setSelectedDiagnosisId('');
    setDiagnosisSearch('');
    setNotes('');
    setPrescriptions([]);
    setMedicineSearch('');
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

  // Filtered catalogs
  const filteredDiagnoses = useMemo(
    () =>
      diagnoses.filter(
        d =>
          d.name.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
          (d.symptoms || '').toLowerCase().includes(diagnosisSearch.toLowerCase())
      ),
    [diagnoses, diagnosisSearch]
  );

  const filteredMedicines = useMemo(() => {
    const q = medicineSearch.trim().toLowerCase();
    const list = q
      ? allMedicines.filter(
          m =>
            m.name.toLowerCase().includes(q) ||
            (m.composition || '').toLowerCase().includes(q) ||
            (m.therapeutic_class || '').toLowerCase().includes(q)
        )
      : allMedicines;
    return list.slice(0, 40);
  }, [allMedicines, medicineSearch]);

  const selectedDiagnosis = diagnoses.find(d => d.id === selectedDiagnosisId) || null;

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

  const sectionLabel = "text-xs font-bold uppercase tracking-wider text-primary-700 flex items-center gap-1.5";
  const inputCls =
    'w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 text-primary-900';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon={Stethoscope}
      title="Log New Clinical Visit"
      subtitle={`Patient: ${patient?.name || ''} (${patient?.email || ''})`}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-primary-500">
            {checkingConflicts ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking interactions…
              </span>
            ) : conflictWarnings.length > 0 ? (
              <span className="text-warning flex items-center gap-1 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                {conflictWarnings.length} interaction notice{conflictWarnings.length > 1 ? 's' : ''} reviewed
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
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
                  <span>Recording Visit…</span>
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

      {/* 1. Diagnosis */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={sectionLabel}>
            <Stethoscope className="w-4 h-4 text-clinical-600" />
            1. Primary Clinical Diagnosis <span className="text-danger">*</span>
          </label>
          <span className="text-[11px] text-primary-500">Searchable catalog</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Type to filter diagnoses…"
            value={diagnosisSearch}
            onChange={(e) => setDiagnosisSearch(e.target.value)}
            className={inputCls}
          />
          <select
            value={selectedDiagnosisId}
            onChange={(e) => setSelectedDiagnosisId(e.target.value)}
            className={`${inputCls} bg-white font-medium`}
            required
          >
            <option value="">
              -- Choose Diagnosis ({filteredDiagnoses.length} available) --
            </option>
            {filteredDiagnoses.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {selectedDiagnosis && (
          <div className="p-3 rounded-card bg-surface-subtle border border-surface-border text-xs space-y-1">
            <div className="font-semibold text-primary-800">{selectedDiagnosis.name}</div>
            <p className="text-primary-600 leading-relaxed">{selectedDiagnosis.description}</p>
            {selectedDiagnosis.precautions && (
              <div className="text-[11px] text-primary-500 pt-1">
                <span className="font-semibold text-primary-700">Clinical Guidelines: </span>
                {selectedDiagnosis.precautions}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Prescriptions */}
      <div className="space-y-3 pt-4 border-t border-surface-border">
        <div className="flex items-center justify-between">
          <label className={sectionLabel}>
            <Pill className="w-4 h-4 text-clinical-600" />
            2. Prescribe Medications ({prescriptions.length})
          </label>
          <span className="text-[11px] text-primary-500">
            {medicineSearch
              ? `${filteredMedicines.length} match${filteredMedicines.length === 1 ? '' : 'es'}`
              : 'Type below to search 200+ medicines'}
          </span>
        </div>

        {/* Searchable medicine picker */}
        <div className="relative">
          <div className="flex items-center gap-2 bg-surface-subtle border border-surface-border rounded-button px-3 py-2 focus-within:ring-2 focus-within:ring-clinical-500 focus-within:bg-white transition-med">
            <Search className="w-4 h-4 text-primary-400 shrink-0" />
            <input
              type="text"
              value={medicineSearch}
              onChange={(e) => setMedicineSearch(e.target.value)}
              placeholder="Search medicine by name, composition, or class…"
              className="flex-1 bg-transparent text-xs font-medium text-primary-900 placeholder:text-primary-400 focus:outline-none min-w-0"
            />
          </div>

          {medicineSearch.trim() !== '' && (
            <div className="absolute z-20 mt-1.5 w-full bg-surface-card border border-surface-border rounded-card shadow-modal overflow-hidden animate-fadeIn max-h-52 overflow-y-auto">
              {filteredMedicines.length === 0 ? (
                <div className="px-3 py-4 text-xs text-primary-400 text-center">
                  No medicines match “{medicineSearch}”.
                </div>
              ) : (
                filteredMedicines.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleAddPrescription(m.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-subtle transition-med"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-primary-900 truncate">{m.name}</div>
                      <div className="text-[11px] text-primary-500 truncate">{m.composition}</div>
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-clinical-50 text-clinical-800 border border-clinical-200 shrink-0">
                      {m.therapeutic_class}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Conflict warnings */}
        <ConflictBanner warnings={conflictWarnings} />

        {/* Selected prescriptions */}
        {prescriptions.length === 0 ? (
          <div className="p-3 text-center border border-dashed border-surface-border rounded-card text-xs text-primary-400 bg-surface-base">
            No medications added yet. Search above, then click a result to add it with dosage and duration.
          </div>
        ) : (
          <div className="space-y-2.5">
            {prescriptions.map((rx, idx) => (
              <div
                key={rx.medicine_id}
                className="p-3 rounded-card border border-surface-border bg-white shadow-subtle space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-heading font-semibold text-xs text-primary-900 truncate">
                      {rx.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-clinical-50 text-clinical-800 border border-clinical-200 font-medium shrink-0">
                      {rx.therapeutic_class}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePrescription(idx)}
                    className="text-primary-400 hover:text-danger p-1 rounded transition-med"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-primary-500 font-medium block mb-1">
                      Dosage Instructions
                    </label>
                    <input
                      type="text"
                      value={rx.dosage}
                      onChange={(e) => handleUpdatePrescription(idx, 'dosage', e.target.value)}
                      placeholder="e.g. 500mg once daily with breakfast"
                      className="w-full text-xs py-1.5 px-2.5 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-1 focus:ring-clinical-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-primary-500 font-medium block mb-1">
                      Duration
                    </label>
                    <input
                      type="text"
                      value={rx.duration}
                      onChange={(e) => handleUpdatePrescription(idx, 'duration', e.target.value)}
                      placeholder="e.g. 30 days"
                      className="w-full text-xs py-1.5 px-2.5 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-1 focus:ring-clinical-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Lab orders */}
      <div className="space-y-3 pt-4 border-t border-surface-border">
        <div className="flex items-center justify-between">
          <label className={sectionLabel}>
            <FlaskConical className="w-4 h-4 text-clinical-600" />
            3. Order Diagnostic Lab Tests ({labOrders.length})
          </label>
          <span className="text-[11px] text-primary-500">Standard test panels</span>
        </div>

        <select
          onChange={(e) => {
            handleAddLabOrder(e.target.value);
            e.target.value = '';
          }}
          defaultValue=""
          className={`${inputCls} cursor-pointer`}
        >
          <option value="" disabled>
            + Add Lab Test (Fasting Glucose, HbA1c, BP, etc.)…
          </option>
          {labTests.map(t => (
            <option key={t.id} value={t.test_name}>
              {t.test_name} [Normal: {t.normal_low} - {t.normal_high} {t.unit}]
            </option>
          ))}
        </select>

        {labOrders.length > 0 && (
          <div className="space-y-2">
            {labOrders.map((lo, idx) => (
              <div
                key={lo.test_name}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-surface-subtle rounded-button border border-surface-border text-xs"
              >
                <span className="font-semibold text-primary-900">{lo.test_name}</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-primary-500">Due:</span>
                    <input
                      type="date"
                      value={lo.scheduled_date}
                      onChange={(e) => handleUpdateLabOrder(idx, 'scheduled_date', e.target.value)}
                      className="bg-white border border-surface-border rounded-button px-2 py-1 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveLabOrder(idx)}
                    className="text-primary-400 hover:text-danger p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Follow-up + notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-surface-border">
        <div>
          <label className={`${sectionLabel} mb-1.5`}>
            <Calendar className="w-4 h-4 text-clinical-600" />
            4. Schedule Next Appointment
          </label>
          <input
            type="date"
            min={todayStr}
            value={nextAppointmentDate}
            onChange={(e) => setNextAppointmentDate(e.target.value)}
            className={inputCls}
          />
          <input
            type="text"
            placeholder="Reason (e.g. Metabolic review)"
            value={appointmentReason}
            onChange={(e) => setAppointmentReason(e.target.value)}
            className="w-full text-xs py-1.5 px-3 mt-2 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-1 focus:ring-clinical-500"
          />
        </div>

        <div>
          <label className={`${sectionLabel} mb-1.5`}>
            <FileText className="w-4 h-4 text-clinical-600" />
            5. Clinical Progress Notes
          </label>
          <textarea
            rows={3}
            placeholder="Document clinical observations, symptom response, examination findings…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs p-2.5 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}
