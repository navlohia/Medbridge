import React from 'react';
import { AlertTriangle, ShieldAlert, ArrowRight, Info } from 'lucide-react';

export default function ConflictBanner({ warnings = [], onDismiss }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="rounded-card border border-warning-border bg-warning-bg p-4 shadow-subtle mb-4 transition-med animate-fadeIn">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-card bg-warning-bg border border-warning-border flex items-center justify-center shrink-0 text-warning">
          <ShieldAlert className="w-5 h-5 stroke-[2]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs uppercase tracking-wider font-bold text-warning-text flex items-center gap-1.5">
              <span>Potential Pharmacological Conflict Detected</span>
              <span className="bg-warning-bg text-warning-text border border-warning-border text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                {warnings.length} {warnings.length === 1 ? 'Notice' : 'Notices'}
              </span>
            </h4>
            <span className="text-xs text-warning font-medium">Advisory Only • Non-Blocking</span>
          </div>

          <div className="mt-2 space-y-2">
            {warnings.map((w, idx) => (
              <div
                key={idx}                  className="bg-white/90 rounded-button p-2.5 border border-warning-border text-xs text-primary-800 space-y-1"
              >
                <div className="flex items-center gap-2 font-semibold text-warning-text">
                  <span className="text-primary-900">{w.new_medicine}</span>
                  <ArrowRight className="w-3 h-3 text-warning" />
                  <span className="text-primary-900">{w.active_medicine}</span>
                  {w.therapeutic_class && (
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-primary-100 text-primary-700 ml-auto">
                      {w.therapeutic_class}
                    </span>
                  )}
                </div>
                <p className="text-primary-700 leading-relaxed font-sans">{w.message}</p>
              </div>
            ))}
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-warning">
            <Info className="w-3.5 h-3.5 shrink-0 text-warning" />
            <span>
              Clinical discretion applies: The system permits saving if combination therapy or dose titration is clinically indicated.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
