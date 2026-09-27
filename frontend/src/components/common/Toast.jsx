import React from 'react';
import { CheckCircle, ShieldAlert, X } from 'lucide-react';

/**
 * Shared post-action feedback banner. type: 'success' | 'warning'.
 */
export default function Toast({ type = 'success', message, onDismiss }) {
  if (!message) return null;

  const isSuccess = type === 'success';

  return (
    <div
      className={`mb-4 p-3.5 rounded-card border text-xs font-semibold flex items-center justify-between animate-fadeIn shadow-subtle ${
        isSuccess
          ? 'bg-success-bg border-success-border text-success-text'
          : 'bg-warning-bg border-warning-border text-warning-text'
      }`}
    >
      <div className="flex items-center gap-2">
        {isSuccess ? (
          <CheckCircle className="w-4 h-4 text-success shrink-0" />
        ) : (
          <ShieldAlert className="w-4 h-4 text-warning shrink-0" />
        )}
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-primary-400 hover:text-primary-800 text-xs ml-4"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
