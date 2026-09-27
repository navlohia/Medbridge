import React, { useState } from 'react';
import { Calendar, Check, X, Inbox } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';

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

export default function AppointmentRequests({ requests = [], onStatusChange }) {
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

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
      <div className="px-5 py-3.5 border-b border-surface-border flex items-center justify-between bg-surface-subtle/50">
        <div className="flex items-center gap-2">
          <h3 className="font-heading font-bold text-sm text-primary-900 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-clinical-600" />
            Appointment Requests
          </h3>
          <Badge variant={requests.length > 0 ? 'warning' : 'subtle'} size="sm">
            {requests.length} pending
          </Badge>
        </div>
      </div>

      <div className="p-5">
        {requests.length === 0 ? (
          <div className="text-center py-8 px-4 border border-dashed border-surface-border rounded-card">
            <div className="w-10 h-10 rounded-full bg-surface-subtle border border-surface-border mx-auto flex items-center justify-center text-primary-400 mb-2.5">
              <Calendar className="w-5 h-5" />
            </div>
            <h4 className="font-heading font-semibold text-sm text-primary-800">No pending requests</h4>
            <p className="text-xs text-primary-500 mt-1 max-w-xs mx-auto">
              When a patient requests an appointment, it will appear here for you to confirm or decline.
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
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-card border border-warning-border bg-warning-bg/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-card bg-white border border-warning-border flex items-center justify-center text-warning shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-bold text-sm text-primary-900">
                        {req.patient_name}
                      </span>
                      <span className="text-[11px] text-primary-400">{timeAgo(req.created_at)}</span>
                    </div>
                    <p className="text-xs text-primary-600">
                      Prefers <span className="font-semibold text-primary-800">{req.appointment_date}</span>
                      {req.reason ? <> — {req.reason}</> : null}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handle(req.id, 'confirmed')}
                    disabled={busyId === req.id}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handle(req.id, 'cancelled')}
                    disabled={busyId === req.id}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
