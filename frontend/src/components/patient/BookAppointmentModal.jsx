import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';

export default function BookAppointmentModal({ isOpen, onClose, onBooked }) {
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!isOpen) return;
    setDoctorId('');
    setDate('');
    setReason('');
    setError(null);

    let cancelled = false;
    api
      .getDoctors()
      .then(list => {
        if (cancelled) return;
        setDoctors(list);
        if (list.length > 0) setDoctorId(list[0].id);
      })
      .catch(err => {
        console.error('Failed to load doctors:', err);
        if (!cancelled) setError('Could not load the doctor list. Please try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!doctorId) {
      setError('Please choose a doctor.');
      return;
    }
    if (!date) {
      setError('Please pick a preferred date.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.requestAppointment({
        doctor_id: doctorId,
        appointment_date: date,
        reason: reason.trim() || null
      });
      if (onBooked) onBooked(result.appointment);
      onClose();
    } catch (err) {
      console.error('Failed to book appointment:', err);
      setError(err.message || 'Failed to submit your request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      icon={Calendar}
      title="Book Appointment"
      subtitle="Request a time with your clinician"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !doctorId || !date}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sending…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Request Appointment</span>
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
          Doctor <span className="text-danger">*</span>
        </label>
        {doctors.length === 0 ? (
          <div className="p-3 text-xs text-primary-400 border border-dashed border-surface-border rounded-card text-center">
            No doctors available.
          </div>
        ) : (
          <div className="space-y-2">
            {doctors.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDoctorId(d.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-card border text-left transition-med cursor-pointer ${
                  doctorId === d.id
                    ? 'border-clinical-500 bg-clinical-50/60 ring-1 ring-clinical-500'
                    : 'border-surface-border bg-surface-subtle/50 hover:bg-white'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-clinical-50 border border-clinical-200 flex items-center justify-center text-clinical-700 shrink-0">
                  <Calendar className="w-4 h-4" />
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

      <div>
        <label className="block text-xs font-semibold text-primary-700 mb-1">
          Preferred Date <span className="text-danger">*</span>
        </label>
        <input
          type="date"
          min={todayStr}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
        />
      </div>

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

      <p className="text-[11px] text-primary-400">
        Your request will appear as “Requested” until the doctor confirms it.
      </p>
    </Modal>
  );
}
