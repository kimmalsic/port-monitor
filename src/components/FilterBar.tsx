import { memo } from 'react';
import { useAppStore } from '../store';

function FilterBarBase() {
  const settings = useAppStore((s) => s.settings);
  const patchSettings = useAppStore((s) => s.patchSettings);

  if (!settings) return null;
  const { listenOnly, query } = settings.filters;

  return (
    <div className="no-drag flex flex-col gap-1.5 px-2 py-1.5 bg-bg-elev/60 border-b border-black/40">
      <input
        type="text"
        placeholder="search port / process"
        value={query}
        onChange={(e) =>
          patchSettings({ filters: { ...settings.filters, query: e.target.value } })
        }
        className="bg-bg-row text-fg text-xs rounded px-2 py-1 outline-none border border-transparent focus:border-accent/60 placeholder:text-muted/70"
      />
      <div className="flex items-center gap-2 text-[11px]">
        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={listenOnly}
            onChange={(e) =>
              patchSettings({
                filters: { ...settings.filters, listenOnly: e.target.checked },
              })
            }
            className="accent-accent"
          />
          <span className="text-muted">LISTEN only</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={settings.includeWsl}
            onChange={(e) => patchSettings({ includeWsl: e.target.checked })}
            className="accent-accent"
          />
          <span className="text-muted">WSL</span>
        </label>
      </div>
    </div>
  );
}

export const FilterBar = memo(FilterBarBase);
