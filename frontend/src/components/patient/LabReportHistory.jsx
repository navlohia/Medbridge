import React, { useEffect, useState } from 'react';
import { FileScan, Trash2, Check, Clock, History } from 'lucide-react';
import { api } from '../../api/client';
import Badge from '../common/Badge';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';

/**
 * Upload history (Round 2 Phases 168): past lab-report uploads with status.
 * Pending rows can be discarded; confirmed rows are permanent.
 */
export default function LabReportHistory({ refreshKey = 0, onChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setError(null);
    try {
      setItems(await api.getLabReports());
    } catch (err) {
      setError(err.message || 'Could not load upload history.');
    }
  };

  useEffect(() => { load(); }, [refreshKey]);

  const discard = async (id) => {
    try {
      await api.discardLabReport(id);
      load();
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) {
    return <p className="text-xs text-danger-text">{error}</p>;
  }

  if (!items || items.length === 0) {
    return null; // section hidden entirely when there is no history yet
  }

  return (
    <div className="bg-surface-card rounded-card p-5 shadow-subtle">
      <h3 className="font-heading font-bold text-sm text-primary-900 flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-clinical-600" />
        Report uploads
      </h3>
      <div className="divide-y divide-surface-subtle">
        {items.map(u => (
          <div key={u.id} className="flex items-center gap-3 py-3">
            <div className="w-9 h-9 rounded-card bg-clinical-50 border border-clinical-200 flex items-center justify-center shrink-0">
              <FileScan className="w-4 h-4 text-clinical-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-primary-900">
                  {u.report_date || new Date(u.uploaded_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {u.status === 'confirmed' ? (
                  <Badge variant="success" size="sm"><Check className="w-3 h-3" /> Confirmed</Badge>
                ) : (
                  <Badge variant="warning" size="sm"><Clock className="w-3 h-3" /> Awaiting review</Badge>
                )}
              </div>
              <p className="text-[11px] text-primary-500 truncate mt-0.5">
                {u.row_count > 0 ? u.row_summary.join(' · ') : (u.needs_manual_entry ? 'Entered manually' : 'No rows')}
                {' · '}
                {u.row_count} row{u.row_count === 1 ? '' : 's'}
              </p>
            </div>
            {u.status === 'pending_review' && (
              <Button variant="ghost" size="sm" onClick={() => discard(u.id)} title="Discard this upload">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
