import React from 'react';

/**
 * Shared button primitive. Variants/sizes per frontend/DESIGN_TOKENS.md.
 * Renders <button> by default; pass `as`="a" or spread props for links.
 */
const VARIANTS = {
  primary:
    'bg-gradient-to-b from-clinical-500 to-clinical-600 hover:from-clinical-400 hover:to-clinical-700 text-white shadow-subtle hover:shadow-glow-teal btn-lift',
  secondary:
    'bg-white border border-surface-border text-primary-800 hover:bg-surface-subtle',
  ghost: 'text-primary-600 hover:text-primary-900 hover:bg-surface-subtle',
  danger: 'bg-danger hover:bg-danger-text text-white'
};

const SIZES = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-xs px-4 py-2 gap-2'
};

export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-button font-semibold transition-med cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
