import Store from 'electron-store';
import type { Settings } from '../shared/types';

const defaults: Settings = {
  window: { width: 280, height: 700, x: null, y: null, snap: 'tr' },
  pollIntervalMs: 1000,
  theme: 'dark',
  alwaysOnTop: true,
  startHidden: false,
  hotkey: 'CommandOrControl+Shift+P',
  autoHideOnBlur: false,
  includeWsl: true,
  filters: { listenOnly: true, query: '' },
};

export const store = new Store<Settings>({
  name: 'port-monitor-settings',
  defaults,
  clearInvalidConfig: true,
});

// Migrate legacy snap values: 'left' → 'tr's counterpart on the left.
(() => {
  const w = store.get('window');
  const legacy = w.snap as unknown as string;
  if (legacy === 'left') store.set('window', { ...w, snap: 'tl' });
  else if (legacy === 'right' || legacy === 'none') store.set('window', { ...w, snap: 'tr' });
})();

export function getWindowBounds() {
  return store.get('window');
}

export function setWindowBounds(partial: Partial<Settings['window']>) {
  store.set('window', { ...store.get('window'), ...partial });
}

export type { Settings };
