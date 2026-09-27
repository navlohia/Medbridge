import React from 'react';
import { FolderOpen } from 'lucide-react';

export default function EmptyState({
  icon: Icon = FolderOpen,
  title = 'No records found',
  description = 'There are no entries recorded yet for this category.',
  action = null
}) {
  return (
    <div className="text-center py-12 px-4 border border-dashed border-surface-border rounded-card bg-surface-base">
      <div className="w-12 h-12 rounded-full bg-surface-subtle border border-surface-border mx-auto flex items-center justify-center text-primary-400 mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="font-heading font-semibold text-sm text-primary-800">{title}</h3>
      <p className="text-xs text-primary-500 max-w-sm mx-auto mt-1 leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
