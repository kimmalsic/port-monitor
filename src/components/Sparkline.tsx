import { useEffect, useRef, memo } from 'react';
import { useAppStore } from '../store';

interface Props {
  data: number[] | undefined;
  width?: number;
  height?: number;
  cssVar?: string;
}

function readCssColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!v) return fallback;
  return `rgb(${v})`;
}

function SparklineBase({ data, width = 40, height = 12, cssVar = '--accent' }: Props) {
  const theme = useAppStore((s) => s.settings?.theme);
  const ref = useRef<HTMLCanvasElement>(null);
  const lastDrawnRef = useRef<{ data: number[] | undefined; w: number; h: number; color: string } | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const color = readCssColor(cssVar, 'rgb(94,234,212)');
    const last = lastDrawnRef.current;
    if (last && last.data === data && last.w === width && last.h === height && last.color === color) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const needsResize = c.width !== width * dpr || c.height !== height * dpr;
    if (needsResize) {
      c.width = width * dpr;
      c.height = height * dpr;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (needsResize) ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    lastDrawnRef.current = { data, w: width, h: height, color };
    if (!data || data.length < 2) return;

    const max = Math.max(1, ...data);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * (width - 1) + 0.5;
      const y = height - (data[i] / max) * (height - 2) - 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (data.length > 0) {
      const last = data[data.length - 1];
      const y = height - (last / max) * (height - 2) - 1;
      const x = width - 1.5;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [data, width, height, cssVar, theme]);

  return <canvas ref={ref} style={{ width, height }} />;
}

export const Sparkline = memo(SparklineBase);
