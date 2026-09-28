import React, { useEffect, useState } from 'react';
import { CalendarClock, Check, AlertCircle, Loader2, Info } from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SlotGrid from '../appointments/SlotGrid';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Doctor-initiated reschedule (Round 2 Phases 147–148): opens the SAME slot-grid
 * component used for booking, pre-filtered to this doctor, with an optional
 * short reason. Works from both 'requested' and 'confirmed' appointments.
 */
export default function ProposeRescheduleModal({ isOpen, onClose, appointment, onProposed }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const todayStr = localToday();

  useEffect(() => {
    if (isOpen) {
      setDate('');
      setTime('');
      setReason('');
      setError(null);
    }
  }, [isOpen, appointment?.id]);

  const submit = async () => {
    if (!appointment || !date || !time) {
      setError('Pick a new date and an open time slot.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.proposeReschedule(appointment.id, {
        proposed_date: date,
        proposed_time: time,
        proposed_reason: reason.trim() || null
      });
      if (onProposed) onProposed(res);
      onClose();
    } catch (err) {
      if (err.status === 409) {
        setError(err.message || 'That slot was just taken — pick another.');
        setTime('');
      } else {
        setError(err.message || 'Could not propose the reschedule.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!appointment) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      icon={CalendarClock}
      title="Propose Reschedule"
      subtitle={`${appointment.patient_name} — currently ${appointment.appointment_date}${appointment.appointment_time ? ` ${appointment.appointment_time}` : ''}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-primary-500">
            The patient sees both times and accepts or declines.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={busy || !date || !time}>
              {busy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Propose New Time</span>
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

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-primary-500 mb-1.5">
          New date
        </label>
        <input
          type="date"
          min={todayStr}
          value={date}
          onChange={(e) => { setDate(e.target.value); setTime(''); }}
          className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 sm:max-w-[220px]"
        />
      </div>

      {date && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-primary-500 mb-1.5">
            Open slots for {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </label>
          <SlotGrid
            doctorId={appointment.doctor_id || appointment.doctorId}
            date={date}
            selectedTime={time}
            onSelect={setTime}
          />
          <p className="mt-2.5 text-[11px] text-primary-400 flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            Your appointment's own current slot stays open for this proposal — other booked times are excluded.
          </p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-primary-700 mb-1">
          Short note to the patient (optional)
        </label>
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Clinic schedule shifted — would this work for you?"
          className="w-full text-xs p-2.5 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 resize-none"
        />
      </div>
    </Modal>
  );
}
