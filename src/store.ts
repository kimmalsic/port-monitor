import { create } from 'zustand';
import type { PortEntry, Settings, ExternalCheckResult } from './types';

export type ExternalState =
  | { status: 'pending'; startedAt: number }
  | { status: 'done'; result: ExternalCheckResult };

const HISTORY_SAMPLES = 60;
const NEW_BADGE_MS = 3000;
const FLASH_MS = 500;

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  expiresAt: number;
}

interface State {
  ports: PortEntry[];
  scannedAt: number;
  error: string | null;
  settings: Settings | null;
  external: Record<number, ExternalState>;
  expandedIds: Set<string>;
  firstSeenAt: Map<string, number>;
  flashAt: Map<string, number>;
  connections: Map<number, number>;
  history: Map<number, number[]>;
  toasts: Toast[];
  setPorts: (ports: PortEntry[], scannedAt: number, error: string | null) => void;
  setSettings: (s: Settings) => void;
  patchSettings: (patch: Partial<Settings>) => Promise<void>;
  startExternalCheck: (port: number) => void;
  finishExternalCheck: (result: ExternalCheckResult) => void;
  toggleExpanded: (id: string) => void;
  pushToast: (kind: ToastKind, message: string, durationMs?: number) => void;
  dismissToast: (id: number) => void;
}

export const useAppStore = create<State>((set) => ({
  ports: [],
  scannedAt: 0,
  error: null,
  settings: null,
  external: {},
  expandedIds: new Set<string>(),
  firstSeenAt: new Map(),
  flashAt: new Map(),
  connections: new Map(),
  history: new Map(),
  toasts: [],
  setPorts: (nextPorts, scannedAt, error) =>
    set((s) => {
      const now = Date.now();
      const prevById = new Map(s.ports.map((p) => [p.id, p]));

      const firstSeenAt = new Map<string, number>();
      for (const p of nextPorts) {
        const existing = s.firstSeenAt.get(p.id);
        if (existing !== undefined) {
          if (now - existing < NEW_BADGE_MS) firstSeenAt.set(p.id, existing);
        } else if (!prevById.has(p.id)) {
          firstSeenAt.set(p.id, now);
        }
      }

      const flashAt = new Map<string, number>();
      for (const p of nextPorts) {
        const prev = prevById.get(p.id);
        const changed =
          prev &&
          (prev.state !== p.state ||
            prev.pid !== p.pid ||
            prev.remoteAddress !== p.remoteAddress ||
            prev.remotePort !== p.remotePort);
        if (changed) {
          flashAt.set(p.id, now);
        } else {
          const existing = s.flashAt.get(p.id);
          if (existing !== undefined && now - existing < FLASH_MS) flashAt.set(p.id, existing);
        }
      }

      const connections = new Map<number, number>();
      for (const p of nextPorts) {
        if (p.state === 'ESTABLISHED') {
          connections.set(p.localPort, (connections.get(p.localPort) ?? 0) + 1);
        }
      }

      const activePorts = new Set<number>();
      for (const p of nextPorts) activePorts.add(p.localPort);
      const history = new Map<number, number[]>();
      for (const lp of activePorts) {
        const prev = s.history.get(lp) ?? [];
        const current = connections.get(lp) ?? 0;
        // Once the buffer is full of zeros, an all-zero tick produces an
        // identical array — reuse ref so PortRow/Sparkline memo can bail.
        if (prev.length >= HISTORY_SAMPLES && current === 0 && prev[0] === 0) {
          history.set(lp, prev);
        } else {
          const next = prev.length >= HISTORY_SAMPLES ? prev.slice(1) : prev.slice();
          next.push(current);
          history.set(lp, next);
        }
      }

      return { ports: nextPorts, scannedAt, error, firstSeenAt, flashAt, connections, history };
    }),
  setSettings: (settings) => set({ settings }),
  patchSettings: async (patch) => {
    const next = await window.portMonitor.setSettings(patch);
    set({ settings: next });
  },
  startExternalCheck: (port) =>
    set((s) => ({
      external: { ...s.external, [port]: { status: 'pending', startedAt: Date.now() } },
    })),
  finishExternalCheck: (result) =>
    set((s) => ({
      external: { ...s.external, [result.port]: { status: 'done', result } },
    })),
  toggleExpanded: (id) =>
    set((s) => {
      const next = new Set(s.expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedIds: next };
    }),
  pushToast: (kind, message, durationMs = 2500) => {
    const id = Date.now() + Math.random();
    const expiresAt = Date.now() + durationMs;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, expiresAt }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
