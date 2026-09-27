import React from 'react';
import { Calendar, Stethoscope, Pill, FlaskConical, ChevronRight, FileText, CheckCircle2 } from 'lucide-react';
import Badge from '../common/Badge';
import EmptyState from '../common/EmptyState';

export default function PatientHistoryTimeline({ visits = [], onSelectMedicine }) {
  if (visits.length === 0) {
    return (
      <EmptyState
        title="No past clinical history"
        description="Your past medical encounters and prescriptions will appear here after your first consultation."
      />
    );
  }

  return (
    <div className="space-y-6">
      {visits.map((visit, index) => (
        <div
          key={visit.id}
          className="border border-surface-border rounded-card bg-surface-card p-5 shadow-subtle hover:border-primary-300 transition-med"
        >
          {/* Visit Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-subtle pb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-clinical-50 border border-clinical-200 flex items-center justify-center text-clinical-600">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="font-heading font-bold text-sm text-primary-900">
                  Consultation on {visit.visit_date}
                </span>
                <p className="text-[11px] text-primary-500">
                  Attending Physician: {visit.doctor_name} ({visit.doctor_specialization || 'Internal Medicine'})
                </p>
              </div>
            </div>

            <Badge variant="clinical" size="md">
              Diagnosis: {visit.diagnosis_name}
            </Badge>
          </div>

          {/* Condition Explanation in Plain Language */}
          <div className="mt-3.5 space-y-2">
            <div className="bg-clinical-50/50 p-3 rounded-lg border border-clinical-100 text-xs space-y-1">
              <span className="font-semibold text-clinical-950 block">About Your Diagnosis:</span>
              <p className="text-primary-700 leading-relaxed font-sans">
                {visit.diagnosis_desc || 'Clinical evaluation documented during this encounter.'}
              </p>
              {visit.diagnosis_precautions && (
                <div className="text-[11px] text-primary-600 pt-1">
                  <span className="font-semibold text-primary-800">Care Recommendations: </span>
                  {visit.diagnosis_precautions}
                </div>
              )}
            </div>

            {visit.notes && (
              <div className="bg-surface-subtle/80 p-3 rounded-lg border border-surface-border text-xs">
                <span className="font-semibold text-primary-800 flex items-center gap-1 mb-0.5">
                  <FileText className="w-3.5 h-3.5 text-primary-500" /> Doctor's Summary:
                </span>
                <p className="text-primary-700 leading-relaxed font-sans">{visit.notes}</p>
              </div>
            )}
          </div>

          {/* Prescriptions under this visit with plain language trigger */}
          {visit.prescriptions && visit.prescriptions.length > 0 && (
            <div className="mt-4 pt-3 border-t border-surface-subtle">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-xs uppercase tracking-wider font-bold text-primary-600 flex items-center gap-1.5">
                  <Pill className="w-3.5 h-3.5 text-clinical-600" />
                  Prescribed Medicines ({visit.prescriptions.length})
                </h5>
                <span className="text-[11px] text-clinical-600 font-medium hidden sm:inline">
                  Click any medicine to view plain-language guide
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {visit.prescriptions.map((rx) => (
                  <button
                    key={rx.id}
                    onClick={() => onSelectMedicine(rx)}
                    className="text-left bg-white hover:bg-clinical-50/40 p-3 rounded-lg border border-surface-border hover:border-clinical-300 transition-med group shadow-subtle flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-heading font-semibold text-xs text-primary-900 group-hover:text-clinical-700 transition-med">
                          {rx.medicine_name}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-primary-300 group-hover:text-clinical-600 shrink-0 mt-0.5" />
                      </div>
                      <p className="text-[11px] text-primary-500 font-mono mt-0.5">{rx.composition}</p>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-surface-subtle flex items-center justify-between text-[11px] text-primary-600">
                      <span className="font-medium text-primary-800">{rx.dosage}</span>
                      <span className="text-primary-400">{rx.duration}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ordered Lab Tests */}
          {visit.lab_orders && visit.lab_orders.length > 0 && (
            <div className="mt-4 pt-3 border-t border-surface-subtle">
              <h5 className="text-xs uppercase tracking-wider font-bold text-primary-600 flex items-center gap-1.5 mb-2">
                <FlaskConical className="w-3.5 h-3.5 text-primary-500" />
                Laboratory Diagnostic Orders
              </h5>
              <div className="flex flex-wrap gap-2">
                {visit.lab_orders.map((lo) => (
                  <div
                    key={lo.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-surface-border text-xs"
                  >
                    <span className="font-medium text-primary-900">{lo.test_name}</span>
                    <span className="text-primary-400">•</span>
                    <span className="text-primary-500 text-[11px]">Due: {lo.scheduled_date}</span>
                    <Badge variant={lo.status === 'completed' ? 'success' : 'warning'} size="sm">
                      {lo.status === 'completed' ? 'Completed' : 'Pending Lab'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
