import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Shared modal primitive: overlay + panel + header + scrollable body + footer.
 * Sizes per frontend/DESIGN_TOKENS.md: sm (max-w-md), md (max-w-xl), lg (max-w-4xl).
 */
const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-4xl'
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon = null,
  size = 'md',
  footer = null,
  children
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-primary-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div
        className={`bg-surface-card border border-surface-border rounded-card shadow-modal w-full ${SIZES[size] || SIZES.md} max-h-[92vh] flex flex-col overflow-hidden animate-fadeIn`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between bg-surface-subtle/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="w-9 h-9 rounded-card bg-clinical-50 border border-clinical-200 flex items-center justify-center text-clinical-600 shrink-0">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-heading font-bold text-base text-primary-900 leading-tight truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-primary-500 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-primary-400 hover:text-primary-800 hover:bg-surface-subtle rounded-button transition-med shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-3.5 border-t border-surface-border bg-surface-subtle/80 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
