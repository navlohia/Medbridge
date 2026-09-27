import React from 'react';
import { ServerCrash, RefreshCw } from 'lucide-react';

export default function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this content. Please try again.',
  onRetry = null
}) {
  return (
    <div className="text-center py-12 px-4 border border-danger-border rounded-card bg-danger-bg">
      <div className="w-12 h-12 rounded-full bg-white border border-danger-border mx-auto flex items-center justify-center text-danger mb-3">
        <ServerCrash className="w-6 h-6" />
      </div>
      <h3 className="font-heading font-semibold text-sm text-danger-text">{title}</h3>
      <p className="text-xs text-primary-600 max-w-sm mx-auto mt-1 leading-relaxed">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-button bg-white border border-surface-border text-xs font-semibold text-primary-800 hover:bg-surface-subtle transition-med cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}
