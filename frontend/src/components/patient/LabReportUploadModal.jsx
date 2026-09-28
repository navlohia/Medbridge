import React, { useEffect, useRef, useState } from 'react';
import {
  FileScan, Upload, X, Check, Plus, AlertCircle, Loader2, Info, Trash2, Image as ImageIcon
} from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import Button from '../common/Button';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png'];

function formatTime12(hhmm) { /* unused guard */ return ''; }

/**
 * Patient lab-report upload + AI-assisted review (Round 2 Block XII,
 * Phases 162–167, 169–170). Mirrors the app's "the system suggests, the human
 * decides" philosophy: nothing saves until the patient confirms the rows.
 */
export default function LabReportUploadModal({ isOpen, onClose, onConfirmed }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [upload, setUpload] = useState(null); // { id, rows, needs_manual_entry, ai_notice, report_date }
  const [rows, setRows] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setPreviewUrl(null);
      setUpload(null);
      setRows([]);
      setError(null);
      setConfirmResult(null);
      setDragOver(false);
    }
  }, [isOpen]);

  const acceptFile = (f) => {
    setError(null);
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      setError('Only JPG or PNG photos are supported (PDF is not supported yet).');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('That photo is too large (over 5 MB) — try a smaller or cropped photo.');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const startUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
      });
      const res = await api.uploadLabReport(base64, file.type);
      setUpload(res.upload);
      setRows((res.upload.rows || []).map(r => ({ ...r, include: true })));
    } catch (err) {
      setError(err.message || 'Upload failed — please try again.');
    } finally {
      setUploading(false);
    }
  };

  const updateRow = (idx, patch) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows(prev => [...prev, { test_name: '', value: '', unit: '', reference_range: null, confidence: null, include: true, manual: true }]);
  };

  const removeRow = (idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const confirm = async () => {
    const included = rows.filter(r => r.include && r.test_name.trim() && String(r.value).trim() !== '');
    if (included.length === 0) {
      setError('Add at least one test with a name and value before saving.');
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const res = await api.confirmLabReport(
        upload.id,
        included.map(r => ({ test_name: r.test_name, value: r.value, unit: r.unit || null })),
        upload.report_date || null
      );
      setConfirmResult(res);
      if (onConfirmed) onConfirmed(res);
    } catch (err) {
      setError(err.message || 'Could not save the results.');
    } finally {
      setConfirming(false);
    }
  };

  const discard = async () => {
    try {
      await api.discardLabReport(upload.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not discard the upload.');
    }
  };

  const hasPendingRows = rows.some(r => r.include && r.test_name.trim() && String(r.value).trim() !== '');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      icon={FileScan}
      title={confirmResult ? 'Results saved' : upload ? 'Review extracted values' : 'Upload Lab Report'}
      subtitle={confirmResult ? 'Your record is updated' : 'Photo of your report — you approve everything before it saves'}
      footer={
        confirmResult ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>Done</Button>
          </div>
        ) : upload ? (
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={discard} disabled={confirming}>
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard upload</span>
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary-400 tnum">
                {rows.filter(r => r.include).length} row{rows.filter(r => r.include).length === 1 ? '' : 's'} to save
              </span>
              <Button variant="primary" onClick={confirm} disabled={confirming || !hasPendingRows}>
                {confirming ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save to my record</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={uploading}>Cancel</Button>
            <Button variant="primary" onClick={startUpload} disabled={!file || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Reading your report…</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Read my report</span>
                </>
              )}
            </Button>
          </div>
        )
      }
    >
      {error && (
        <div className="p-2.5 bg-danger-bg border border-danger-border rounded-card text-xs text-danger-text flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: pick + preview */}
      {!upload && !confirmResult && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); acceptFile(e.dataTransfer.files?.[0]); }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-card p-6 text-center transition-med ${
              dragOver ? 'border-clinical-500 bg-clinical-50/60' : 'border-surface-border hover:border-clinical-400 hover:bg-surface-subtle/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
            {previewUrl ? (
              <div className="space-y-2">
                <img src={previewUrl} alt="Report preview" className="mx-auto max-h-44 rounded-card border border-surface-border" />
                <p className="text-xs font-semibold text-primary-700">{file?.name}</p>
                <p className="text-[11px] text-primary-400">Click to choose a different photo</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Upload className="w-7 h-7 text-clinical-600 mx-auto" />
                <p className="text-sm font-bold text-primary-900">Drop a photo here, or click to browse</p>
                <p className="text-xs text-primary-400">JPG or PNG, up to 5 MB — PDF is not supported yet</p>
              </div>
            )}
          </div>
          {uploading && (
            <div className="flex items-center gap-2.5 p-3 rounded-card bg-clinical-50/60 border border-clinical-200/70 text-xs text-clinical-800">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Reading your report — pulling out test names, values, and units…</span>
            </div>
          )}
        </div>
      )}

      {/* Step 2: review/edit rows — nothing saved until confirm */}
      {upload && !confirmResult && (
        <div className="space-y-3">
          {upload.needs_manual_entry && (
            <div className="p-3 rounded-card bg-warning-bg border border-warning-border text-xs text-warning-text flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-px" />
              <span>{upload.ai_notice || 'We could not read this report automatically. Enter the values below.'}</span>
            </div>
          )}

          {rows.length === 0 && (
            <div className="text-center py-5 border border-dashed border-surface-border rounded-card">
              <ImageIcon className="w-6 h-6 text-primary-300 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-primary-800">No rows detected</p>
              <p className="text-xs text-primary-500 mt-0.5">Add each test below — it saves exactly like a manual entry.</p>
            </div>
          )}

          {rows.map((r, idx) => (
            <div key={idx} className={`p-3 rounded-card border ${r.include ? 'border-surface-border bg-white' : 'border-surface-border bg-surface-subtle/50 opacity-60'}`}>
              <div className="flex items-center gap-2 mb-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => updateRow(idx, { include: e.target.checked })}
                    className="accent-clinical-600"
                  />
                  Include
                </label>
                {r.confidence !== null && r.confidence !== undefined && r.confidence < 0.7 && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-warning-bg text-warning-text border border-warning-border">
                    Low confidence — double-check
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="ml-auto text-primary-300 hover:text-danger-text transition-med cursor-pointer"
                  title="Remove row"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={r.test_name}
                  onChange={(e) => updateRow(idx, { test_name: e.target.value })}
                  placeholder="Test name"
                  className="col-span-1 text-xs py-1.5 px-2.5 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
                />
                <input
                  type="text"
                  value={r.value}
                  onChange={(e) => updateRow(idx, { value: e.target.value })}
                  placeholder="Value"
                  className="text-xs py-1.5 px-2.5 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500 font-mono tnum"
                />
                <input
                  type="text"
                  value={r.unit || ''}
                  onChange={(e) => updateRow(idx, { unit: e.target.value })}
                  placeholder="Unit"
                  className="text-xs py-1.5 px-2.5 bg-surface-subtle border border-surface-border rounded-button focus:outline-none focus:ring-2 focus:ring-clinical-500"
                />
              </div>
              {r.reference_range && (
                <p className="text-[10px] text-primary-400 mt-1.5">Reference: {r.reference_range}</p>
              )}
            </div>
          ))}

          <Button variant="secondary" size="sm" onClick={addRow}>
            <Plus className="w-3.5 h-3.5" />
            <span>Add a row the scan missed</span>
          </Button>
        </div>
      )}

      {/* Step 3: confirm result */}
      {confirmResult && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-card bg-success-bg border border-success-border">
            <Check className="w-5 h-5 text-success-text shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-success-text">{confirmResult.message}</p>
              {confirmResult.matched_order_count > 0 && (
                <p className="text-xs text-primary-600 mt-1">
                  Matched to your pending lab order{confirmResult.matched_order_count > 1 ? 's' : ''} — marked completed automatically.
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            {confirmResult.written_rows?.map((w, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-button bg-surface-subtle/60 border border-surface-border text-xs">
                <span className="font-semibold text-primary-800">{w.test_name}</span>
                <span className="font-mono font-bold text-primary-900 tnum">{w.value} {w.unit || ''}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-primary-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-clinical-600" />
            Values appear on your Trends automatically — confirmed reports are permanent.
          </p>
        </div>
      )}
    </Modal>
  );
}
