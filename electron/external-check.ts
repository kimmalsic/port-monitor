import type { ExternalCheckResult } from '../shared/types';

const PUBLIC_IP_ENDPOINTS = ['https://api.ipify.org', 'https://ifconfig.me/ip'];
const PORT_CHECK_ENDPOINT = 'https://portchecker.io/api/v1/query';

async function fetchText(url: string, init?: RequestInit, timeoutMs = 6000): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  return { status: res.status, text };
}

async function getPublicIp(): Promise<string | null> {
  for (const url of PUBLIC_IP_ENDPOINTS) {
    try {
      const { status, text } = await fetchText(url, undefined, 4000);
      if (status === 200 && text.trim()) return text.trim();
    } catch {
      // try next endpoint
    }
  }
  return null;
}

export async function checkExternalPort(port: number): Promise<ExternalCheckResult> {
  const startedAt = Date.now();
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      port,
      reachable: false,
      publicIp: null,
      latencyMs: null,
      error: 'invalid port',
      checkedAt: startedAt,
    };
  }

  const publicIp = await getPublicIp();
  if (!publicIp) {
    return {
      port,
      reachable: false,
      publicIp: null,
      latencyMs: null,
      error: 'cannot resolve public IP',
      checkedAt: startedAt,
    };
  }

  try {
    const { status, text } = await fetchText(PORT_CHECK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: publicIp, port }),
    });
    const latencyMs = Date.now() - startedAt;
    if (status !== 200) {
      return {
        port,
        reachable: false,
        publicIp,
        latencyMs,
        error: `checker status ${status}`,
        checkedAt: startedAt,
      };
    }
    let reachable: boolean;
    try {
      const json = JSON.parse(text);
      reachable = json.open === true || json.status === 'open' || json.reachable === true;
    } catch {
      reachable = /"(open|reachable)"\s*:\s*true/i.test(text);
    }
    return { port, reachable, publicIp, latencyMs, error: null, checkedAt: startedAt };
  } catch (e) {
    return {
      port,
      reachable: false,
      publicIp,
      latencyMs: Date.now() - startedAt,
      error: (e as Error).message,
      checkedAt: startedAt,
    };
  }
}
