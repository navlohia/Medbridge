import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CalendarPlus, Check, ChevronRight, AlertCircle, Loader2, Clock, Info } from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SlotGrid from '../appointments/SlotGrid';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Patient booking (Round 2 Phases 139–143): Doctor → Date → Time as three clear
 * steps. Submits with a real slot; a lost race (409) refreshes the grid in
 * place with a clear "just taken" message instead of a generic error.
 */
export default function BookAppointmentModal({ isOpen, onClose, onBooked }) {
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [slotNotice, setSlotNotice] = useState(null);
  const [gridKey, setGridKey] = useState(0);
  const todayStr = localToday();

  useEffect(() => {
    if (!isOpen) return;
    setDoctorId('');
    setDate('');
    setTime('');
    setReason('');
    setError(null);
    setSlotNotice(null);

    let cancelled = false;
    api
      .getDoctors()
      .then(list => {
        if (cancelled) return;
        setDoctors(list);
      })
      .catch(err => {
        console.error('Failed to load doctors:', err);
        if (!cancelled) setError('Could not load the doctor list. Please try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const selectedDoctor = doctors.find(d => d.id === doctorId);

  const step = useMemo(() => {
    if (!doctorId) return 1;
    if (!date) return 2;
    return 3;
  }, [doctorId, date]);

  const handleSubmit = async () => {
    if (!doctorId || !date || !time) {
      setError('Pick a doctor, a date, and an open time slot.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSlotNotice(null);
    try {
      const result = await api.requestAppointment({
        doctor_id: doctorId,
        appointment_date: date,
        appointment_time: time,
        reason: reason.trim() || null
      });
      if (onBooked) onBooked(result.appointment);
      onClose();
    } catch (err) {
      if (err.status === 409) {
        // Race-safe: refresh the grid in place + explain (Phase 143)
        setSlotNotice(err.message || 'That time was just booked — pick another slot.');
        setTime('');
        setGridKey(k => k + 1);
      } else {
        setError(err.message || 'Failed to submit your request.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      icon={CalendarPlus}
      title="Book Appointment"
      subtitle="Doctor → Date → Time — live availability"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-primary-500">
            {selectedDoctor && date && time ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-primary-700">
                <Clock className="w-3.5 h-3.5 text-clinical-600" />
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {' · '}
                {formatTime12(time)}
                {' with '}
                {selectedDoctor.name.replace(/^Dr\.?\s*/i, 'Dr. ')}
              </span>
            ) : (
              'Your request appears as “Requested” until the doctor confirms.'
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={isSubmitting || !doctorId || !date || !time}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Booking…</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Request Appointment</span>
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      {error && (
        <div className="p-2.5 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Doctor */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${doctorId ? 'bg-success text-white' : 'bg-clinical-600 text-white'}`}>1</span>
          <label className="text-xs font-bold uppercase tracking-wider text-primary-500">Choose your doctor</label>
          {step > 1 && <Check className="w-3.5 h-3.5 text-success" />}
        </div>
        {doctors.length === 0 ? (
          <div className="p-3 text-xs text-primary-400 border border-dashed border-surface-border rounded-card text-center">
            No active doctors available right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {doctors.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  if (doctorId !== d.id) { setDoctorId(d.id); setTime(''); setSlotNotice(null); }
                }}
                className={`flex items-center gap-2.5 p-2.5 rounded-card border text-left transition-med cursor-pointer ${
                  doctorId === d.id
                    ? 'border-clinical-500 bg-clinical-50/60 ring-1 ring-clinical-500'
                    : 'border-surface-border bg-surface-subtle/50 hover:bg-white'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-clinical-500 to-primary-800 flex items-center justify-center text-white font-heading font-bold text-xs shrink-0 shadow-subtle">
                  {d.name.replace(/^Dr\.?\s*/i, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0">
                  <div className="font-heading font-semibold text-xs text-primary-900 truncate">
                    {d.name}
                  </div>
                  <div className="text-[11px] text-primary-500 truncate">
                    {d.specialization || d.email}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 2: Date */}
      {doctorId && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${date ? 'bg-success text-white' : 'bg-clinical-600 text-white'}`}>2</span>
            <label className="text-xs font-bold uppercase tracking-wider text-primary-500">Pick a date</label>
            {step > 2 && <Check className="w-3.5 h-3.5 text-success" />}
          </div>
          <input
            type="date"
            min={todayStr}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setTime('');
              setSlotNotice(null);
            }}
            className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 sm:max-w-[220px]"
          />
        </div>
      )}

      {/* Step 3: live time grid */}
      {doctorId && date && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${time ? 'bg-success text-white' : 'bg-clinical-600 text-white'}`}>3</span>
            <label className="text-xs font-bold uppercase tracking-wider text-primary-500">Choose an open time</label>
          </div>

          {slotNotice && (
            <div className="mb-3 p-2.5 bg-warning-bg border border-warning-border rounded-card text-xs text-warning-text flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>{slotNotice} The grid below is refreshed.</span>
            </div>
          )}

          <SlotGrid
            doctorId={doctorId}
            date={date}
            selectedTime={time}
            onSelect={(t) => { setTime(t); setSlotNotice(null); }}
            refreshKey={gridKey}
          />

          <p className="mt-2.5 text-[11px] text-primary-400 flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            Greyed-out times are already taken — availability updates live as other patients book.
          </p>

          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-1">
              Reason (optional)
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Follow-up on lab results, medication review…"
              className="w-full text-xs p-2.5 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
