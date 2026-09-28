import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Loader2, AlertCircle, Thermometer, Weight, Heart, HeartPulse, Droplet, Gauge, Droplets, Layers, ShieldPlus } from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { vitalIcon } from '../../utils/iconMap';

// Compact chip labels for the picker grid
const SHORT_LABELS = {
  'Fasting Blood Sugar': 'Blood Sugar',
  'Systolic BP': 'Systolic',
  'Diastolic BP': 'Diastolic',
  'Body Temperature': 'Temp',
  'Heart Rate': 'Pulse',
  'Hemoglobin (Male)': 'Hemoglobin',
  'Hemoglobin (Female)': 'Hemoglobin',
  'Total Cholesterol': 'Cholesterol',
  'WBC Count': 'WBC'
};
const shortLabel = (name) => SHORT_LABELS[name] || name;

export default function VitalLoggerModal({ isOpen, onClose, onVitalLogged }) {
  const [labTests, setLabTests] = useState([]);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // Vital metrics available for logging: standard home metrics first, then
  // any other lab-test panel (HbA1c, cholesterol, WBC...). Hemoglobin
  // variants are kept but rarely relevant for home logging.
  const HOME_FIRST = ['Weight', 'Fasting Blood Sugar', 'Systolic BP', 'Diastolic BP', 'Body Temperature', 'Heart Rate', 'HbA1c'];
  const orderedTests = [...labTests].sort((a, b) => {
    const ia = HOME_FIRST.indexOf(a.test_name);
    const ib = HOME_FIRST.indexOf(b.test_name);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // Which options exist in the reference catalog; standard options not in it
  // are appended so Body Temperature/Heart Rate still loggable.
  const options = React.useMemo(() => {
    const inCatalog = new Set(orderedTests.map(t => t.test_name));
    const extras = [
      { test_name: 'Body Temperature', unit: '°F', normal_low: 97.8, normal_high: 99.1 },
      { test_name: 'Heart Rate', unit: 'bpm', normal_low: 60, normal_high: 100 }
    ].filter(e => !inCatalog.has(e.test_name));
    return [...orderedTests, ...extras];
  }, [orderedTests]);

  const current = options.find(o => o.test_name === label) || options[0];

  useEffect(() => {
    if (!isOpen) return;
    setValue('');
    setError(null);
    setLogDate(todayStr);

    let cancelled = false;
    api.getLabTests()
      .then(tests => {
        if (cancelled) return;
        setLabTests(tests);
        if (tests.length > 0) {
          setLabel(prev => (tests.some(t => t.test_name === prev) ? prev : 'Weight'));
        }
      })
      .catch(err => {
        console.error('Failed to load lab tests:', err);
        if (!cancelled) setError('Could not load measurement types. Using standard options.');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const num = parseFloat(value);
    if (!value || isNaN(num)) {
      setError('Please enter a valid numeric reading.');
      return;
    }
    if (current) {
      // Loose plausibility guard: reject values wildly outside the normal band
      // (3x the span beyond either edge) — data entry slips, not clinical outliers.
      const span = (current.normal_high - current.normal_low) || 1;
      if (num < current.normal_low - span * 3 || num > current.normal_high + span * 3) {
        setError(`That value looks implausible for ${current.test_name} (typical range ${current.normal_low}–${current.normal_high} ${current.unit}). Please double-check.`);
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.createSelfLog({
        log_type: 'vital',
        label: current.test_name,
        value: String(num),
        unit: current.unit,
        log_date: logDate
      });

      const completed = result.completed_lab_orders || [];
      if (onVitalLogged) {
        onVitalLogged({
          message:
            completed.length > 0
              ? `${current.test_name} logged. Matching lab order marked complete.`
              : `${current.test_name} logged successfully.`,
          type: 'success'
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to log vital reading:', err);
      setError(err.message || 'Failed to submit reading.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const CurrentIcon = current ? vitalIcon(current.test_name) : Activity;
  const numValue = parseFloat(value);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      icon={Activity}
      title="Record Vital Reading"
      subtitle="Document your home measurement"
      footer={
        <div className="flex items-center justify-between gap-2">
          {current && (
            <span className="text-xs text-primary-400 flex items-center gap-1.5 min-w-0">
              <CurrentIcon className="w-3.5 h-3.5 text-clinical-600 shrink-0" />
              <span className="truncate">Normal {current.normal_low}–{current.normal_high} {current.unit}</span>
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || value === ''}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Reading</span>
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

      {/* Metric picker — icon chips, typeable-looking targets instead of a select */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-primary-500 mb-2">
          What did you measure?
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {options.map(o => {
            const Icon = vitalIcon(o.test_name);
            const active = current?.test_name === o.test_name;
            return (
              <button
                key={o.test_name}
                type="button"
                onClick={() => setLabel(o.test_name)}
                className={`flex flex-col items-center gap-1 px-1.5 py-2.5 rounded-card border text-center transition-med cursor-pointer ${
                  active
                    ? 'border-clinical-500 bg-clinical-50 ring-1 ring-clinical-500 shadow-subtle'
                    : 'border-surface-border bg-surface-subtle/50 hover:bg-white hover:border-primary-300'
                }`}
                title={`${o.test_name} (${o.unit})`}
              >
                <Icon className={`w-[18px] h-[18px] ${active ? 'text-clinical-600' : 'text-primary-400'}`} />
                <span className={`text-[10px] font-semibold leading-tight ${active ? 'text-clinical-800' : 'text-primary-600'}`}>
                  {shortLabel(o.test_name)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Value entry — big numeric field with live range meter */}
      <div>
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <label className="text-xs font-semibold text-primary-700 flex items-center gap-1.5">
            <CurrentIcon className="w-3.5 h-3.5 text-clinical-600" />
            {current?.test_name} ({current?.unit || ''})
          </label>
          {current && (
            <span className="text-xs text-primary-500">
              Normal: <span className="font-mono text-primary-700 tnum">{current.normal_low}–{current.normal_high} {current.unit}</span>
            </span>
          )}
        </div>
        <div className="relative">
          <input
            type="number"
            step="any"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={current ? `e.g. ${((current.normal_low + current.normal_high) / 2).toFixed(current.normal_high % 1 !== 0 ? 1 : 0)}` : 'Enter reading'}
            className="w-full text-lg py-3 px-4 bg-white border border-surface-border rounded-button focus:outline-none focus:border-clinical-400 focus:ring-2 focus:ring-clinical-500/20 font-mono font-bold tnum transition-med"
          />
          <span className="absolute right-4 top-3.5 text-sm font-semibold text-primary-400">
            {current?.unit}
          </span>
        </div>
        {current && value !== '' && !isNaN(numValue) && current.normal_high > current.normal_low && (
          <div className="mt-2.5">
            {/* Range meter */}
            <div className="relative h-1.5 rounded-full bg-gradient-to-r from-warning-bg via-success-bg to-danger-bg border border-surface-border overflow-hidden">
              <div
                className="absolute top-0 bottom-0 w-[3px] bg-primary-900 rounded-full transition-all shadow-[0_0_0_1px_rgba(248,250,252,0.8)]"
                style={{
                  left: `${Math.min(100, Math.max(0, ((numValue - current.normal_low) / (current.normal_high - current.normal_low)) * 100))}%`
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-primary-400 mt-1 font-medium tnum">
              <span>{current.normal_low}</span>
              <span
                className={`font-bold ${
                  numValue < current.normal_low
                    ? 'text-warning'
                    : numValue > current.normal_high
                    ? 'text-warning'
                    : 'text-success'
                }`}
              >
                {numValue} —{' '}
                {numValue < current.normal_low
                  ? 'below normal range'
                  : numValue > current.normal_high
                  ? 'above normal range'
                  : 'within normal range'}
              </span>
              <span>{current.normal_high}</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-primary-700 mb-1">
          Measurement Date
        </label>
        <input
          type="date"
          max={todayStr}
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
          className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
        />
        <p className="mt-1.5 text-xs text-primary-400">
          Logging a result for a pending lab test (within two weeks of its due date) marks that order complete automatically.
        </p>
      </div>
    </Modal>
  );
}
