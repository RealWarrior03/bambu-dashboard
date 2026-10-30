import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PrinterCommand, PrinterInfo, PrinterStatus, ServerMessage } from '@bambu/shared';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from './client';

interface LiveState {
  printers: PrinterInfo[] | null;
  statuses: Record<string, PrinterStatus>;
  socketConnected: boolean;
  reloadPrinters: () => Promise<void>;
  send: (id: string, cmd: PrinterCommand) => Promise<boolean>;
  toast: string | null;
}

const LiveContext = createContext<LiveState | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [printers, setPrinters] = useState<PrinterInfo[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PrinterStatus>>({});
  const [socketConnected, setSocketConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reloadPrinters = useCallback(async () => {
    setPrinters(await api.printers());
  }, []);

  useEffect(() => {
    api.printers().then(setPrinters, () => {});
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: number | undefined;
    let attempt = 0;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/ws`);
      ws.onopen = () => {
        attempt = 0;
        setSocketConnected(true);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.type === 'snapshot') setStatuses(msg.statuses);
        else if (msg.type === 'status') setStatuses((prev) => ({ ...prev, [msg.id]: msg.status }));
        else if (msg.type === 'printers') reloadPrinters().catch(() => {});
      };
      ws.onclose = () => {
        setSocketConnected(false);
        if (closed) return;
        attempt += 1;
        retry = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(retry);
      ws?.close();
    };
  }, [reloadPrinters]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const send = useCallback(
    async (id: string, cmd: PrinterCommand) => {
      try {
        await api.command(id, cmd);
        return true;
      } catch (err) {
        const code = err instanceof ApiError ? err.code : String(err);
        setToast(t(`errors.${code}`, { defaultValue: t('errors.generic', { msg: code }) }));
        return false;
      }
    },
    [t],
  );

  const value = useMemo(
    () => ({ printers, statuses, socketConnected, reloadPrinters, send, toast }),
    [printers, statuses, socketConnected, reloadPrinters, send, toast],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveState {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive outside LiveProvider');
  return ctx;
}
