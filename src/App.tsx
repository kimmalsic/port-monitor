import { useEffect } from 'react';
import { useAppStore } from './store';
import { TitleBar } from './components/TitleBar';
import { FilterBar } from './components/FilterBar';
import { PortList } from './components/PortList';
import { StatusBar } from './components/StatusBar';
import { Toaster } from './components/Toaster';

export default function App() {
  const setSettings = useAppStore((s) => s.setSettings);
  const setPorts = useAppStore((s) => s.setPorts);
  const settings = useAppStore((s) => s.settings);
  const theme = settings?.theme ?? 'dark';

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const s = await window.portMonitor.getSettings();
      if (mounted) setSettings(s);
    })();
    const offPorts = window.portMonitor.onPorts((p) => {
      setPorts(p.ports, p.scannedAt, p.error);
    });
    const offSettings = window.portMonitor.onSettings(setSettings);
    return () => {
      mounted = false;
      offPorts();
      offSettings();
    };
  }, [setSettings, setPorts]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', theme === 'dark');
    root.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  return (
    <div className="relative flex flex-col h-full">
      {settings ? (
        <>
          <TitleBar />
          <FilterBar />
          <PortList />
          <StatusBar />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-muted">loading…</div>
      )}
      <Toaster />
    </div>
  );
}
