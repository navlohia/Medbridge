import React from 'react';
import { Calendar, FlaskConical, Pill, X, ChevronRight } from 'lucide-react';

const SEEN_MEDS_KEY = 'medbridge_seen_meds';

export function getSeenMeds() {
  try {
    const raw = localStorage.getItem(SEEN_MEDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markMedSeen(medicineId) {
  try {
    const seen = getSeenMeds();
    seen.add(medicineId);
    localStorage.setItem(SEEN_MEDS_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable — reminders degrade gracefully */
  }
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

export function countUnseenMeds(activeMedicines = []) {
  const seen = getSeenMeds();
  return activeMedicines.filter(m => !seen.has(m.id)).length;
}

/**
 * Dismissible reminder banners shown above the patient tab bar.
 * onGotoLab(tabId) lets reminders navigate; onDismiss uses sessionStorage.
 */
export default function RemindersBar({
  nextAppointment = null,
  pendingLabs = [],
  unseenMedsCount = 0,
  onBookAppointment = null,
  onLogLabResult = null,
  onOpenMedicines = null
}) {
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem('medbridge_dismissed_reminders') || '[]'));
    } catch {
      return new Set();
    }
  });

  const dismiss = (key) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(key);
      try {
        sessionStorage.setItem('medbridge_dismissed_reminders', JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const reminders = [];

  // 1. Upcoming appointment within 7 days
  if (nextAppointment && nextAppointment.status !== 'cancelled') {
    const days = daysUntil(nextAppointment.appointment_date);
    if (days >= 0 && days <= 7) {
      reminders.push({
        key: 'appointment',
        icon: Calendar,
        tone: 'clinical',
        title:
          days === 0
            ? 'Your appointment is today'
            : days === 1
            ? 'Your appointment is tomorrow'
            : `Appointment in ${days} days`,
        body: `${nextAppointment.appointment_date} — ${nextAppointment.reason || 'Clinical consultation'} with ${nextAppointment.doctor_name}`,
        action: null
      });
    }
  }

  // 2. Pending lab orders
  if (pendingLabs.length > 0) {
    const earliest = pendingLabs.reduce(
      (min, l) => (l.scheduled_date < min ? l.scheduled_date : min),
      pendingLabs[0].scheduled_date
    );
    reminders.push({
      key: 'labs',
      icon: FlaskConical,
      tone: 'warning',
      title: `${pendingLabs.length} pending lab test${pendingLabs.length > 1 ? 's' : ''}`,
      body: `Next due ${earliest}. Log your result and the order is marked complete automatically.`,
      action: onLogLabResult ? { label: 'Log result', onClick: onLogLabResult } : null
    });
  }

  // 3. Newly prescribed, not yet viewed medicines
  if (unseenMedsCount > 0) {
    reminders.push({
      key: 'meds',
      icon: Pill,
      tone: 'clinical',
      title: `${unseenMedsCount} new medicine${unseenMedsCount > 1 ? 's' : ''} to review`,
      body: 'Open each one to read a plain-language guide on what it does and possible side effects.',
      action: onOpenMedicines ? { label: 'Review', onClick: onOpenMedicines } : null
    });
  }

  const visible = reminders.filter(r => !dismissed.has(r.key));
  if (visible.length === 0) return null;

  const toneStyles = {
    clinical: 'bg-clinical-50 border-clinical-200 text-clinical-900',
    warning: 'bg-warning-bg border-warning-border text-warning-text'
  };
  const toneIcon = {
    clinical: 'bg-clinical-100 border-clinical-200 text-clinical-700',
    warning: 'bg-white border-warning-border text-warning'
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 min-w-0">
      {visible.map(r => {
        const Icon = r.icon;
        return (
          <div
            key={r.key}
            className={`flex-1 min-w-0 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-card border animate-fadeIn ${toneStyles[r.tone]}`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Icon className={`w-4 h-4 shrink-0 ${r.tone === 'warning' ? 'text-warning' : 'text-clinical-700'}`} />
              <div className="min-w-0">
                <div className="text-xs font-bold leading-tight truncate">{r.title}</div>
                <div className="text-[11px] opacity-75 truncate">{r.body}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {r.action && (
                <button
                  onClick={r.action.onClick}
                  className="text-[11px] font-bold inline-flex items-center gap-0.5 hover:underline cursor-pointer whitespace-nowrap"
                >
                  {r.action.label}
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => dismiss(r.key)}
                className="p-0.5 opacity-40 hover:opacity-100 transition-med"
                aria-label="Dismiss reminder"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
