import React, { useEffect, useState } from 'react';
import { AlertCircle, Clock, RefreshCw, Sunrise, Sun, Inbox } from 'lucide-react';
import { api } from '../../api/client';
import Button from '../common/Button';
import { useAnyRealtimeEvent } from '../../realtime/RealtimeProvider';

/**
 * Shared live availability grid (Round 2 Block XI, Phases 140–142, 147).
 * One component powers both the patient booking flow and the doctor's
 * Propose-Reschedule picker — same visual language everywhere.
 */
export default function SlotGrid({ doctorId, date, selectedTime, onSelect, refreshKey = 0 }) {
  const [slots, setSlots] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasHours, setHasHours] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.getAvailability(doctorId, date);
      setSlots(res.slots || []);
      setHasHours(res.has_hours !== false);
    } catch (err) {
      if (!silent) setError(err.message || 'Could not load availability.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (doctorId && date) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, date, refreshKey]);

  // P32: the "updates live" claim is now true — appointment events for THIS
  // doctor silently refresh the grid (no skeleton; old slots stay until the
  // new availability lands). Slot just taken elsewhere flips to "Booked".
  useAnyRealtimeEvent((ev) => {
    if (
      (ev.type === 'appointment.requested' || ev.type === 'appointment.updated') &&
      ev.doctor_id === doctorId &&
      doctorId && date
    ) {
      load(true);
    }
  });

  const formatTime12 = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
  };

  if (!doctorId || !date) return null;

  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 rounded-button bg-surface-subtle animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 space-y-3">
        <AlertCircle className="w-6 h-6 text-danger mx-auto" />
        <p className="text-xs text-primary-500 max-w-xs mx-auto">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => load()}>
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try again</span>
        </Button>
      </div>
    );
  }

  if (!hasHours || !slots || slots.length === 0) {
    return (
      <div className="text-center py-6 space-y-2 border border-dashed border-surface-border rounded-card">
        <Inbox className="w-6 h-6 text-primary-300 mx-auto" />
        <p className="text-sm font-bold text-primary-800">No clinic hours that day</p>
        <p className="text-xs text-primary-500 max-w-xs mx-auto">
          This doctor isn't seeing patients on this weekday — try another date.
        </p>
      </div>
    );
  }
  const allTaken = slots.every(s => !s.available);

  if (allTaken) {
    return (
      <div className="text-center py-6 space-y-2 border border-dashed border-surface-border rounded-card">
        <Clock className="w-6 h-6 text-warning mx-auto" />
        <p className="text-sm font-bold text-primary-800">Fully booked</p>
        <p className="text-xs text-primary-500 max-w-xs mx-auto">
          Every slot on this day is taken — please pick a different date.
        </p>
      </div>
    );
  }

  const morning = slots.filter(s => parseInt(s.time.split(':')[0], 10) < 12);
  const afternoon = slots.filter(s => parseInt(s.time.split(':')[0], 10) >= 12);

  const Group = ({ label, icon: Icon, list }) => list.length === 0 ? null : (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-400 mb-1.5">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {list.map(s => {
          const isSelected = selectedTime === s.time;
          return (
            <button
              key={s.time}
              type="button"
              disabled={!s.available}
              onClick={() => onSelect && onSelect(s.time)}
              title={s.available ? `Book ${formatTime12(s.time)}` : 'Already booked'}
              className={`h-10 rounded-button text-xs font-semibold border transition-med tnum ${
                isSelected
                  ? 'bg-clinical-600 text-white border-clinical-600 shadow-subtle scale-105'
                  : s.available
                    ? 'bg-white border-surface-border text-primary-800 hover:border-clinical-500 hover:bg-clinical-50 hover:shadow-glow-teal cursor-pointer'
                    : 'bg-surface-subtle border-surface-border text-primary-300 cursor-not-allowed line-through decoration-1'
              }`}
            >
              {formatTime12(s.time)}
              {!s.available && (
                <span className="block text-[8px] font-bold uppercase tracking-wide text-primary-300">
                  Booked
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <Group label="Morning" icon={Sunrise} list={morning} />
      <Group label="Afternoon" icon={Sun} list={afternoon} />
    </div>
  );
}
