import type { PrinterCommand, PrinterInfo, PrinterInput } from '@bambu/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && url !== '/api/login')
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  session: () => request<{ authenticated: boolean }>('GET', '/api/session'),
  login: (password: string) =>
    request<{ authenticated: boolean }>('POST', '/api/login', { password }),
  logout: () => request<{ authenticated: boolean }>('POST', '/api/logout'),
  printers: () => request<PrinterInfo[]>('GET', '/api/printers'),
  createPrinter: (input: PrinterInput) => request<PrinterInfo>('POST', '/api/printers', input),
  updatePrinter: (id: string, input: PrinterInput) =>
    request<PrinterInfo>('PUT', `/api/printers/${id}`, input),
  deletePrinter: (id: string) => request<{ ok: true }>('DELETE', `/api/printers/${id}`),
  command: (id: string, cmd: PrinterCommand) =>
    request<{ ok: true }>('POST', `/api/printers/${id}/command`, cmd),
  async testRtsp(rtspUrl: string): Promise<string> {
    const res = await fetch('/api/camera/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rtspUrl }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data.error ?? res.statusText);
    }
    return URL.createObjectURL(await res.blob());
  },
};

export const cameraUrl = (id: string) => `/api/printers/${id}/camera.mjpeg`;
export const snapshotUrl = (id: string, t: number) => `/api/printers/${id}/camera.jpg?t=${t}`;
