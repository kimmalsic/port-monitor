import { spawn } from 'node:child_process';

export interface RunOptions {
  encoding?: 'utf8' | 'utf16le';
  windowsHide?: boolean;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
  error: Error | null;
}

export function runCommand(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  const encoding = opts.encoding ?? 'utf8';
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: opts.windowsHide ?? true });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d: Buffer) => (stdout += d.toString(encoding)));
    p.stderr.on('data', (d: Buffer) => (stderr += d.toString(encoding)));
    p.on('error', (error) =>
      resolve({ stdout, stderr, code: -1, error }),
    );
    p.on('close', (code) =>
      resolve({ stdout, stderr, code: code ?? -1, error: null }),
    );
  });
}

export function isSafeWslDistroName(name: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(name);
}

export function portEntryKey(id: string): string {
  return id;
}
