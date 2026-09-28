import React, { useState } from 'react';
import { CalendarDays, Check, X, Inbox, Clock, CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import ProposeRescheduleModal from './ProposeRescheduleModal';

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const diffMs = Date.now() - then.getTime();
  if (isNaN(diffMs)) return '';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function formatTime12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export default function AppointmentRequests({ requests = [], onStatusChange, onRescheduleProposed }) {
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  const handle = async (id, status) => {
    setBusyId(id);
    setActionError(null);
    try {
      await onStatusChange(id, status);
    } catch (err) {
      setActionError(err.message || 'Could not update the request.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-surface-card border border-surface-border rounded-card shadow-subtle overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between bg-surface-subtle/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-card bg-warning-bg border border-warning-border flex items-center justify-center shrink-0">
            <Inbox className="w-4 h-4 text-warning" />
          </div>
          <h3 className="font-heading font-extrabold text-base text-primary-900">
            Appointment Requests
          </h3>
          <Badge variant={requests.length > 0 ? 'warning' : 'subtle'} size="md">
            {requests.length} pending
          </Badge>
        </div>
        {requests.length > 0 && (
          <span className="text-xs font-semibold text-warning hidden sm:block">
            Confirm, decline — or offer a better time
          </span>
        )}
      </div>

      <div className="p-5">
        {requests.length === 0 ? (
          <div className="text-center py-8 px-4 border border-dashed border-surface-border rounded-card">
            <div className="w-11 h-11 rounded-full bg-surface-subtle border border-surface-border mx-auto flex items-center justify-center text-primary-400 mb-3">
              <Inbox className="w-5 h-5" />
            </div>
            <h4 className="font-heading font-bold text-sm text-primary-800">Inbox zero</h4>
            <p className="text-xs text-primary-500 mt-1 max-w-xs mx-auto">
              When a patient requests an appointment, it lands here for you to confirm, decline, or reschedule.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {actionError && (
              <div className="p-2.5 bg-danger-bg border border-danger-border rounded-button text-xs text-danger-text">
                {actionError}
              </div>
            )}
            {requests.map(req => (
              <div
                key={req.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-card border border-warning-border bg-warning-bg/50 shadow-subtle animate-fadeIn"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-card bg-white border border-warning-border flex flex-col items-center justify-center leading-none shrink-0">
                    <span className="text-[8px] font-bold uppercase tracking-wide text-warning">Date</span>
                    <span className="font-heading font-extrabold text-xs text-warning-text">
                      {req.appointment_date?.slice(5)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-bold text-sm text-primary-900">
                        {req.patient_name}
                      </span>
                      {req.appointment_time && (
                        <span className="text-xs font-bold text-clinical-700 font-mono tnum">
                          {formatTime12(req.appointment_time)}
                        </span>
                      )}
                      <span className="text-xs text-primary-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(req.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-primary-600 mt-0.5">
                      Prefers <span className="font-bold text-primary-900">{req.appointment_date}</span>
                      {req.appointment_time ? <> at <span className="font-bold text-primary-900">{formatTime12(req.appointment_time)}</span></> : null}
                      {req.reason ? <> — {req.reason}</> : null}
                    </p>
                  </div>
                </div>

                {/* Three actions with real hierarchy (Phase 147/186): Confirm is
                    THE action, Propose is the clinical alternative, Decline is quiet */}
                <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => handle(req.id, 'confirmed')}
                      disabled={busyId === req.id}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => setRescheduleTarget(req)}
                      disabled={busyId === req.id}
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      <span>Propose Reschedule</span>
                    </Button>
                  </div>
                  <button
                    onClick={() => handle(req.id, 'cancelled')}
                    disabled={busyId === req.id}
                    className="self-end text-xs font-semibold text-primary-400 hover:text-danger-text transition-med cursor-pointer disabled:opacity-50"
                  >
                    Decline request
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProposeRescheduleModal
        isOpen={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        appointment={rescheduleTarget}
        onProposed={() => {
          // The proposal moves the row out of 'requested' — parent refreshes the panel
          if (onRescheduleProposed) onRescheduleProposed();
        }}
      />
    </div>
  );
}
