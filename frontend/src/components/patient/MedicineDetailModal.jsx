import React from 'react';
import { Pill, Sparkles, AlertCircle, ShieldCheck, Clock } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';

export default function MedicineDetailModal({ isOpen, onClose, medicine }) {
  if (!medicine) return null;

  // History-endpoint prescriptions use medicine_name/medicine_id; dashboard
  // prescriptions use name/id. Normalize both shapes here.
  const name = medicine.name || medicine.medicine_name || 'Medicine';
  const composition = medicine.composition || '—';
  const therapeuticClass = medicine.therapeutic_class || 'Prescription Medicine';
  const explanation =
    medicine.plain_explanation || medicine.uses_ai_generated || medicine.uses_static ||
    'Your clinician has prescribed this medicine as part of your care plan.';
  const sideEffects = medicine.side_effects ||
    'Mild nausea, headache, or gastrointestinal discomfort may occur. Contact your doctor if severe.';
  const hasRegimen = Boolean(medicine.dosage || medicine.duration);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      icon={Pill}
      title={name}
      subtitle={composition}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {/* Header badges (rendered inside body, under the title) */}
      <div className="-mt-1">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-clinical-100 text-clinical-800 border border-clinical-200">
          {therapeuticClass}
        </span>
      </div>

      {/* Plain-language explanation */}
      <div className="bg-clinical-50/60 border border-clinical-200/80 rounded-card p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-clinical-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-clinical-600" />
            What this medicine is for
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-clinical-100 text-clinical-800 border border-clinical-200 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-clinical-600" />
            Patient-Friendly Summary
          </span>
        </div>
        <p className="text-sm text-primary-800 leading-relaxed font-medium">
          {explanation}
        </p>
      </div>

      {/* Prescribed regimen */}
      {hasRegimen && (
        <div className="bg-surface-subtle rounded-card p-3.5 border border-surface-border text-xs space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wider text-primary-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary-600" />
            Your Prescribed Regimen
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <span className="text-primary-400 text-xs block">Instructions:</span>
              <span className="font-semibold text-primary-900">{medicine.dosage || 'As directed'}</span>
            </div>
            <div>
              <span className="text-primary-400 text-xs block">Prescribed Duration:</span>
              <span className="font-semibold text-primary-900">{medicine.duration || '—'}</span>
            </div>
            {medicine.visit_date && (
              <div className="col-span-2">
                <span className="text-primary-400 text-xs block">Prescribed On:</span>
                <span className="font-semibold text-primary-900">{medicine.visit_date}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Side effects */}
      <div className="space-y-1.5">
        <div className="text-xs font-bold uppercase tracking-wider text-primary-700 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-warning" />
          Possible Side Effects
        </div>
        <div className="p-3 bg-warning-bg rounded-card border border-warning-border text-xs text-warning-text leading-relaxed">
          {sideEffects}
        </div>
        <p className="text-xs text-primary-400 italic">
          Note: Most patients experience none or only mild effects. Do not stop taking your
          medication without consulting your physician.
        </p>
      </div>
    </Modal>
  );
}
