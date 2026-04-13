import { memo } from 'react';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface Props {
  corner: Corner;
  className?: string;
}

// Outer rectangle = screen; inner filled rectangle = window's snap position.
function SnapIconBase({ corner, className }: Props) {
  const inner = {
    tl: { x: 3, y: 3 },
    tr: { x: 9, y: 3 },
    bl: { x: 3, y: 9 },
    br: { x: 9, y: 9 },
  }[corner];
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x={inner.x} y={inner.y} width="4" height="4" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export const SnapIcon = memo(SnapIconBase);
