import React from 'react';

export function SkeletonLine({ className = 'h-4 w-full' }) {
  return <div className={`skeleton-shimmer rounded ${className}`} />;
}

export function SkeletonCard({ className = 'h-32 w-full' }) {
  return (
    <div className={`border border-surface-border bg-white rounded-card p-4 space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <SkeletonLine className="h-4 w-1/3" />
        <SkeletonLine className="h-4 w-16" />
      </div>
      <SkeletonLine className="h-3 w-4/5" />
      <SkeletonLine className="h-3 w-1/2" />
    </div>
  );
}

export function SkeletonTimeline() {
  return (
    <div className="space-y-4">
      <SkeletonCard className="h-28" />
      <SkeletonCard className="h-36" />
      <SkeletonCard className="h-28" />
    </div>
  );
}

export function SkeletonChart({ className = 'h-72 w-full' }) {
  return (
    <div className={`border border-surface-border bg-white rounded-card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <SkeletonLine className="h-4 w-1/4" />
        <SkeletonLine className="h-8 w-40" />
      </div>
      <div className="skeleton-shimmer rounded-card h-full w-full min-h-[10rem]" />
    </div>
  );
}
