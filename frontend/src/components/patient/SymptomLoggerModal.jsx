import React, { useMemo, useState } from 'react';
import {
  X,
  HeartPulse,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Search,
  Thermometer,
  Plus
} from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';

const COMMON_SYMPTOMS = [
  'Fever',
  'Fatigue / Low Energy',
  'Shortness of Breath / Wheezing',
  'Headache / Migraine',
  'Acid Reflux / Heartburn',
  'Nausea / Stomach Upset',
  'Dizziness / Lightheadedness',
  'Joint / Muscle Pain',
  'Skin Rash / Itching',
  'Excessive Thirst / Frequent Urination',
  'Cough / Chest Congestion'
];

const DURATION_OPTIONS = [
  { value: 'Today', hint: 'Started today' },
  { value: '2-3 days', hint: 'A couple of days' },
  { value: 'A week+', hint: 'A week or longer' }
];

const SEVERITY_LEVELS = [
  { value: 1, label: '1', name: 'Very mild' },
  { value: 2, label: '2', name: 'Mild' },
  { value: 3, label: '3', name: 'Moderate' },
  { value: 4, label: '4', name: 'Severe' },
  { value: 5, label: '5', name: 'Very severe' }
];

function severityTone(sev) {
  if (sev <= 2) return { text: 'text-success-text', bg: 'bg-success-bg', border: 'border-success-border', name: 'Mild' };
  if (sev <= 3) return { text: 'text-warning-text', bg: 'bg-warning-bg', border: 'border-warning-border', name: 'Moderate' };
  return { text: 'text-danger-text', bg: 'bg-danger-bg', border: 'border-danger-border', name: 'Severe' };
}

export default function SymptomLoggerModal({ isOpen, onClose, onSymptomLogged }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]); // [{ label, severity }]
  const [severityDraft, setSeverityDraft] = useState(3);
  const [duration, setDuration] = useState('Today');
  const [temperature, setTemperature] = useState('');
  const [notes, setNotes] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredSymptoms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COMMON_SYMPTOMS;
    return COMMON_SYMPTOMS.filter(s => s.toLowerCase().includes(q));
  }, [search]);

  const hasFever = selected.some(s => s.label.toLowerCase().includes('fever'));

  const toggleSymptom = (label) => {
    setSelected(prev => {
      if (prev.some(s => s.label === label)) {
        return prev.filter(s => s.label !== label);
      }
      return [...prev, { label, severity: severityDraft }];
    });
  };

  const setSeverityFor = (label, severity) => {
    setSelected(prev => prev.map(s => (s.label === label ? { ...s, severity } : s)));
  };

  const removeSymptom = (label) => {
    setSelected(prev => prev.filter(s => s.label !== label));
  };

  const resetForm = () => {
    setSearch('');
    setSelected([]);
    setSeverityDraft(3);
    setDuration('Today');
    setTemperature('');
    setNotes('');
    setEntryDate(todayStr);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selected.length === 0) {
      setError('Select at least one symptom.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.createSymptomEntry({
        entry_date: entryDate,
        duration,
        notes: notes.trim() || null,
        symptoms: selected,
        fever_temperature: hasFever && temperature !== '' ? temperature : undefined
      });

      const labNote =
        result.completed_lab_orders && result.completed_lab_orders.length > 0
          ? ' Lab order auto-completed.'
          : '';
      if (onSymptomLogged) {
        onSymptomLogged({
          message: `Logged ${selected.length} symptom${selected.length > 1 ? 's' : ''}.${labNote}`,
          type: 'success'
        });
      }
      resetForm();
      onClose();
    } catch (err) {
      console.error('Failed to log symptom entry:', err);
      setError(err.message || 'Failed to submit symptom log.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-primary-500 mb-1.5';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      icon={HeartPulse}
      title="How are you feeling today?"
      subtitle="Pick one or more symptoms — rate each separately"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-primary-400">
            {selected.length === 0
              ? 'Nothing selected yet'
              : `${selected.length} symptom${selected.length > 1 ? 's' : ''} ready`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={isSubmitting || selected.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Entry</span>
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      {error && (
        <div className="p-2.5 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text flex items-center gap-2 -mt-1">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1 — Symptoms */}
      <div className="space-y-2.5">
        <label className={labelCls}>1 · What are you feeling?</label>

        <div className="flex items-center gap-2 bg-surface-subtle border border-surface-border rounded-button px-3 py-2.5 focus-within:ring-2 focus-within:ring-clinical-500 focus-within:bg-white transition-med">
          <Search className="w-4 h-4 text-primary-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symptoms…"
            className="flex-1 bg-transparent text-sm font-medium text-primary-900 placeholder:text-primary-400 focus:outline-none min-w-0"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-primary-400 hover:text-primary-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Selected symptoms as editable rows */}
        {selected.length > 0 && (
          <div className="space-y-2 pt-1">
            {selected.map(s => {
              const tone = severityTone(s.severity);
              const level = SEVERITY_LEVELS.find(l => l.value === s.severity);
              return (
                <div
                  key={s.label}
                  className={`p-3 rounded-card border ${tone.border} ${tone.bg} animate-fadeIn`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-heading font-bold text-sm text-primary-900">
                      {s.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSymptom(s.label)}
                      className="text-primary-400 hover:text-danger p-1 rounded transition-med cursor-pointer"
                      title="Remove symptom"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Big severity buttons */}
                  <div className="flex items-center gap-1.5">
                    {SEVERITY_LEVELS.map(l => {
                      const active = s.severity === l.value;
                      return (
                        <button
                          key={l.value}
                          type="button"
                          onClick={() => setSeverityFor(s.label, l.value)}
                          title={l.name}
                          className={`flex-1 h-9 rounded-button text-xs font-bold border transition-med cursor-pointer ${
                            active
                              ? l.value <= 2
                                ? 'bg-success text-white border-success'
                                : l.value === 3
                                ? 'bg-warning text-white border-warning'
                                : 'bg-danger text-white border-danger'
                              : 'bg-white/70 text-primary-500 border-transparent hover:border-primary-300'
                          }`}
                        >
                          {l.label}
                        </button>
                      );
                    })}
                    <span className={`ml-2 text-[10px] font-bold uppercase tracking-wider w-20 text-right ${tone.text}`}>
                      {level?.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Picker list */}
        <div className="max-h-44 overflow-y-auto border border-surface-border rounded-card divide-y divide-surface-subtle">
          {filteredSymptoms.length === 0 ? (
            <div className="px-3 py-5 text-xs text-primary-400 text-center">
              No symptoms match “{search}”.
            </div>
          ) : (
            filteredSymptoms.map(symptom => {
              const isSelected = selected.some(s => s.label === symptom);
              return (
                <button
                  key={symptom}
                  type="button"
                  onClick={() => toggleSymptom(symptom)}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition-med cursor-pointer ${
                    isSelected ? 'bg-clinical-50/70 font-semibold text-clinical-800' : 'hover:bg-surface-subtle text-primary-700'
                  }`}
                >
                  <span className="font-medium">{symptom}</span>
                  {isSelected ? (
                    <CheckCircle2 className="w-4 h-4 text-clinical-600 shrink-0" />
                  ) : (
                    <Plus className="w-4 h-4 text-primary-300 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Step 2 — Duration */}
      <div className="space-y-2.5">
        <label className={labelCls}>2 · How long have you felt this way?</label>
        <div className="grid grid-cols-3 gap-2">
          {DURATION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDuration(opt.value)}
              className={`p-3 rounded-card border text-center transition-med cursor-pointer ${
                duration === opt.value
                  ? 'border-clinical-500 bg-clinical-50 ring-1 ring-clinical-500'
                  : 'border-surface-border bg-surface-subtle/50 hover:bg-white'
              }`}
            >
              <div className={`text-sm font-bold ${duration === opt.value ? 'text-clinical-800' : 'text-primary-800'}`}>
                {opt.value}
              </div>
              <div className="text-[10px] text-primary-400 mt-0.5">{opt.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Fever temperature */}
      {hasFever && (
        <div className="p-3.5 rounded-card border border-warning-border bg-warning-bg space-y-1.5 animate-fadeIn">
          <label className="text-xs font-bold text-warning-text flex items-center gap-1.5">
            <Thermometer className="w-4 h-4" />
            Fever detected — add your temperature
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="90"
              max="110"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="e.g. 100.4"
              className="w-full text-base py-2.5 px-3 bg-white border border-warning-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 font-mono font-bold"
            />
            <span className="absolute right-3 top-2.5 text-xs font-semibold text-primary-400">°F</span>
          </div>
          <p className="text-[11px] text-warning">
            Optional but useful — it's saved as a vital and shows in your trend chart.
          </p>
        </div>
      )}

      {/* Notes + date */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className={labelCls}>3 · Anything else? (optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Triggers, what helps, what makes it worse…"
            className="w-full text-sm p-2.5 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
          />
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            max={todayStr}
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full text-xs py-2.5 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
          />
        </div>
      </div>
    </Modal>
  );
}
