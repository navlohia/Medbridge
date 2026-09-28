import React from 'react';

const TILE_SIZES = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20'
};

const ICON_SIZES = {
  sm: 'w-4 h-4',
  md: 'w-[22px] h-[22px]',
  lg: 'w-8 h-8',
  xl: 'w-11 h-11'
};

/**
 * MedBridge brand mark — the "M-pulse" monogram. A bold geometric M drawn as
 * one continuous stroke; its center valley drops into a heartbeat spike in
 * teal, so the letter and the vital sign are the same shape. The favicon in
 * index.html mirrors this geometry exactly.
 */
export default function LogoMark({ size = 'md', className = '' }) {
  return (
    <div
      className={`${TILE_SIZES[size]} shrink-0 rounded-[30%] bg-gradient-to-br from-clinical-500 via-clinical-600 to-primary-800 flex items-center justify-center shadow-glow-teal ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" fill="none" className={`${ICON_SIZES[size]}`}>
        {/* Left + right strokes of the M */}
        <path
          d="M7 23 V10 L13 17 M19 17 L25 10 V23"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Center heartbeat valley */}
        <path
          d="M13 17 L16 24 L19 17"
          stroke="#5EEAD4"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
