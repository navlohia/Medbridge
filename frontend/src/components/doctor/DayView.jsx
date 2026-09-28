import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock, RefreshCw, Inbox, ArrowRightLeft } from 'lucide-react';
import { api } from '../../api/client';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { SkeletonLine } from '../common/Skeleton';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';

function formatTime12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_STATUS_META = {
  requested: { label: 'Requested', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  reschedule_proposed: { label: 'Proposal open', variant: 'clinical' }
};

/**
 * Doctor Day View (Round 2 Phases 149–150): a picked day's booked slots in a
 * simple vertical timeline — same status-color/badge grammar as the rest of
 * the appointment surfaces, not a new component language.
 */
export default function DayView() {
  const [date, setDate] = useState(localToday());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getDoctorDay(date));
    } catch (err) {
      setError(err.message || 'Could not load the day view.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date]);

  return (
    <div className="bg-surface-card rounded-card shadow-subtle border border-surface-border overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-card bg-clinical-50 border border-clinical-200 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-clinical-600" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-sm text-primary-900">Day View</h3>
            <p className="text-[11px] text-primary-500">Your booked slots, at a glance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs py-2 px-3 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
          />
          <Button variant="ghost" size="sm" onClick={load} title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="space-y-2.5">
            <SkeletonLine className="h-12 w-full" />
            <SkeletonLine className="h-12 w-full" />
            <SkeletonLine className="h-12 w-full" />
          </div>
        ) : error ? (
          <ErrorState title="Could not load your day" description={error} onRetry={load} />
        ) : (data?.booked?.length === 0 && data?.incoming_proposals?.length === 0) ? (
          <EmptyState
            icon={Inbox}
            title={date === localToday() ? 'Nothing booked today' : 'Nothing booked this day'}
            description="Confirmed and requested appointments appear here in order."
          />
        ) : (
          <div className="space-y-2">
            {(data?.booked || []).map(b => {
              const meta = DAY_STATUS_META[b.status] || DAY_STATUS_META.requested;
              return (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-card border border-surface-border bg-surface-subtle/40">
                  <div className="w-16 shrink-0 text-center">
                    <div className="font-heading font-extrabold text-sm text-primary-900 tnum">
                      {formatTime12(b.appointment_time) || '—'}
                    </div>
                  </div>
                  <div className="w-px h-9 bg-surface-border shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-primary-900 truncate">{b.patient_name}</div>
                    <div className="text-xs text-primary-500 truncate">{b.reason || 'Clinical consultation'}</div>
                    {b.status === 'reschedule_proposed' && b.proposed_date && (
                      <div className="text-[11px] text-clinical-700 flex items-center gap-1 mt-0.5">
                        <ArrowRightLeft className="w-3 h-3" />
                        offered {b.proposed_date} {formatTime12(b.proposed_time)}
                      </div>
                    )}
                  </div>
                  <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                </div>
              );
            })}

            {(data?.incoming_proposals || []).map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-card border border-clinical-200/70 bg-clinical-50/50">
                <div className="w-16 shrink-0 text-center">
                  <div className="font-heading font-extrabold text-sm text-clinical-700 tnum">
                    {formatTime12(p.proposed_time) || '—'}
                  </div>
                </div>
                <div className="w-px h-9 bg-clinical-200 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-primary-900 truncate">{p.patient_name}</div>
                  <div className="text-[11px] text-primary-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    slot tentatively held for {p.patient_name} — awaiting their answer
                  </div>
                </div>
                <Badge variant="clinical" size="sm">Offered</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
