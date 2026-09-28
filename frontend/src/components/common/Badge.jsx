import React from 'react';

export default function Badge({ children, variant = 'default', size = 'md', className = '' }) {
  const variantStyles = {
    default: 'bg-primary-100 text-primary-800 border-primary-200',
    clinical: 'bg-clinical-50 text-clinical-800 border-clinical-200',
    warning: 'bg-warning-bg text-warning-text border-warning-border',
    danger: 'bg-danger-bg text-danger-text border-danger-border',
    success: 'bg-success-bg text-success-text border-success-border',
    subtle: 'bg-surface-subtle text-primary-600 border-surface-border'
  };

  const sizeStyles = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-xs font-semibold px-2.5 py-1',
    xl: 'text-sm font-semibold px-3 py-1'
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium border ${variantStyles[variant] || variantStyles.default} ${sizeStyles[size] || sizeStyles.md} ${className}`}
    >
      {children}
    </span>
  );
}
