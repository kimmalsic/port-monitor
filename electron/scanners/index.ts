import { platform } from 'node:process';
import type { PortEntry } from '../../shared/types';
import { scanLinuxPorts } from './linux';
import { scanWindowsPorts } from './windows';
import { scanWslPorts } from './wsl';
import { scanMacPorts } from './mac';

export async function scanAllPorts(options: { includeWsl: boolean }): Promise<{
  ports: PortEntry[];
  errors: string[];
}> {
  const errors: string[] = [];

  if (platform === 'win32') {
    const tasks: Promise<PortEntry[]>[] = [
      scanWindowsPorts().catch((e: Error) => {
        errors.push(`windows: ${e.message}`);
        return [] as PortEntry[];
      }),
    ];
    if (options.includeWsl) {
      tasks.push(
        scanWslPorts().catch((e: Error) => {
          errors.push(`wsl: ${e.message}`);
          return [] as PortEntry[];
        }),
      );
    }
    const results = await Promise.all(tasks);
    return { ports: dedupe(results.flat()), errors };
  }

  if (platform === 'darwin') {
    try {
      return { ports: dedupe(await scanMacPorts()), errors };
    } catch (e) {
      errors.push(`macos: ${(e as Error).message}`);
      return { ports: [], errors };
    }
  }

  if (platform === 'linux') {
    try {
      return { ports: dedupe(await scanLinuxPorts()), errors };
    } catch (e) {
      errors.push(`linux: ${(e as Error).message}`);
      return { ports: [], errors };
    }
  }

  errors.push(`unsupported platform: ${platform}`);
  return { ports: [], errors };
}

function dedupe(entries: PortEntry[]): PortEntry[] {
  const seen = new Set<string>();
  const out: PortEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}
