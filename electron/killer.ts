import { platform } from 'node:process';
import type { KillResult, KillTarget } from '../shared/types';
import { isSafeWslDistroName, runCommand } from './util';

export async function killProcess(pid: number, target: KillTarget): Promise<KillResult> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return { ok: false, message: 'invalid pid' };
  }

  const force = target.force === true;

  if (target.source === 'wsl') {
    if (!target.wslDistro || !isSafeWslDistroName(target.wslDistro)) {
      return { ok: false, message: 'invalid wsl distro' };
    }
    return run('wsl.exe', [
      '-d',
      target.wslDistro,
      '--',
      'kill',
      force ? '-9' : '-15',
      String(pid),
    ]);
  }

  if (platform === 'win32') {
    const args = ['/PID', String(pid)];
    if (force) args.push('/F');
    return run('taskkill', args);
  }

  return run('kill', [force ? '-9' : '-15', String(pid)]);
}

async function run(cmd: string, args: string[]): Promise<KillResult> {
  const { stderr, code, error } = await runCommand(cmd, args);
  if (error) return { ok: false, message: error.message };
  return code === 0
    ? { ok: true, message: 'killed' }
    : { ok: false, message: stderr.trim() || `exit ${code}` };
}
