import React, { useEffect, useState } from 'react';
import { FileScan, Trash2, Check, Clock, History, Image as ImageIcon, X } from 'lucide-react';
import { api } from '../../api/client';
import Badge from '../common/Badge';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';

/**
 * Upload history (Round 2 Phases 168) + P20 authenticated image viewer.
 * Images load via fetch -> blob URL with the caller's Authorization header —
 * the old public /uploads static mount is gone.
 */
export default function LabReportHistory({ refreshKey = 0, onChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [viewer, setViewer] = useState(null); // { id, url, loading, failed }

  const load = async () => {
    setError(null);
    try {
      setItems(await api.getLabReports());
    } catch (err) {
      setError(err.message || 'Could not load upload history.');
    }
  };

  useEffect(() => { load(); }, [refreshKey]);

  // Revoke the blob URL when the viewer closes/unmounts
  useEffect(() => () => {
    if (viewer?.url) URL.revokeObjectURL(viewer.url);
  }, [viewer]);

  const openImage = async (report) => {
    if (viewer?.url) URL.revokeObjectURL(viewer.url);
    setViewer({ id: report.id, url: null, loading: true, failed: false });
    try {
      const res = await fetch(report.image_url, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('medbridge_token')}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      setViewer({ id: report.id, url: URL.createObjectURL(blob), loading: false, failed: false });
    } catch {
      setViewer({ id: report.id, url: null, loading: false, failed: true });
    }
  };

  const closeViewer = () => {
    if (viewer?.url) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  };

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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openImage(u)}
              title="View report image"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </Button>
            {u.status === 'pending_review' && (
              <Button variant="ghost" size="sm" onClick={() => discard(u.id)} title="Discard this upload">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {viewer && (
        <div
          className="fixed inset-0 z-50 bg-primary-950/60 flex items-center justify-center p-4"
          onClick={closeViewer}
        >
          <div
            className="bg-white rounded-card shadow-modal max-w-2xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary-900">Lab report image</span>
              <button
                type="button"
                onClick={closeViewer}
                aria-label="Close image viewer"
                className="p-1 text-primary-400 hover:text-primary-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {viewer.loading && <p className="text-xs text-primary-500">Loading image…</p>}
            {viewer.failed && (
              <p className="text-xs text-danger-text">Could not load the image. Try again later.</p>
            )}
            {viewer.url && (
              <img
                src={viewer.url}
                alt="Lab report"
                className="mx-auto max-h-[70vh] rounded-card border border-surface-border"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
