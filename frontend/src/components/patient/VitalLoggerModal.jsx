import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';

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
  const HOME_FIRST = ['Fasting Blood Sugar', 'Systolic BP', 'Diastolic BP', 'Body Temperature', 'Heart Rate', 'HbA1c'];
  const orderedTests = [...labTests].sort((a, b) => {
    const ia = HOME_FIRST.indexOf(a.test_name);
    const ib = HOME_FIRST.indexOf(b.test_name);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // Which options exist in the reference catalog; standard options not in it
  // are appended so Blood Temperature/Heart Rate still loggable.
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
          setLabel(prev => (tests.some(t => t.test_name === prev) ? prev : 'Fasting Blood Sugar'));
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      icon={Activity}
      title="Record Vital Reading"
      subtitle="Document your home measurement"
      footer={
        <div className="flex items-center justify-end gap-2">
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
      }
    >
      {error && (
        <div className="p-2.5 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text flex items-center gap-2 -mt-1">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-primary-700 mb-1">
          Measurement Type
        </label>
        <select
          value={current?.test_name || ''}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 font-medium text-primary-900 cursor-pointer"
        >
          {options.map(v => (
            <option key={v.test_name} value={v.test_name}>
              {v.test_name} ({v.unit})
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1 gap-2">
          <label className="text-xs font-semibold text-primary-700">
            Value ({current?.unit || ''})
          </label>
          {current && (
            <span className="text-[11px] text-primary-500">
              Normal: <span className="font-mono text-primary-700">{current.normal_low}–{current.normal_high} {current.unit}</span>
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
            className="w-full text-sm py-2 px-3 bg-white border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 font-mono font-medium"
          />
          <span className="absolute right-3 top-2 text-xs font-medium text-primary-400">
            {current?.unit}
          </span>
        </div>
        {current && value !== '' && !isNaN(parseFloat(value)) && (
          <p className="mt-1.5 text-[11px]">
            {parseFloat(value) < current.normal_low && (
              <span className="text-warning font-medium">Below the normal range for this metric.</span>
            )}
            {parseFloat(value) > current.normal_high && (
              <span className="text-warning font-medium">Above the normal range for this metric.</span>
            )}
            {parseFloat(value) >= current.normal_low && parseFloat(value) <= current.normal_high && (
              <span className="text-success font-medium">Within the normal range.</span>
            )}
          </p>
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
        <p className="mt-1.5 text-[11px] text-primary-400">
          Logging a result for a pending lab test (within two weeks of its due date) marks that order complete automatically.
        </p>
      </div>
    </Modal>
  );
}
