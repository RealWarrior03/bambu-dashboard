import { useEffect, useRef, useState } from 'react';
import type { PrinterInfo } from '@bambu/shared';
import { useTranslation } from 'react-i18next';
import { cameraUrl, snapshotUrl } from '../api/client';

interface Props {
  printer: PrinterInfo;
  /** "stream" shows live MJPEG, "snapshot" refreshes a still image every few seconds */
  mode: 'stream' | 'snapshot';
}

const SNAPSHOT_MS = 8000;

export function CameraView({ printer, mode }: Props) {
  const { t } = useTranslation();
  // Remember which source failed, so a changed camera setting starts fresh.
  const sourceKey = `${printer.id}|${printer.camera.mode}|${printer.camera.rtspUrl ?? ''}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const failed = failedKey === sourceKey;
  const setFailed = (value: boolean) => setFailedKey(value ? sourceKey : null);
  const [tick, setTick] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);
  const disabled = printer.camera.mode === 'none';
  const [fullscreen, setFullscreen] = useState(false);

  // Follows the real state, so leaving with Escape also resets the button.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (fullscreen) document.exitFullscreen?.();
    else ref.current?.requestFullscreen?.();
  };

  // Retry a failed stream every few seconds, and refresh snapshots periodically.
  useEffect(() => {
    if (disabled) return;
    if (mode === 'stream' && !failed) return;
    const timer = window.setInterval(() => setTick(Date.now()), failed ? 5000 : SNAPSHOT_MS);
    return () => window.clearInterval(timer);
  }, [disabled, mode, failed]);

  if (disabled) {
    return <div className="camera camera-empty">{t('camera.disabled')}</div>;
  }

  const src =
    mode === 'stream'
      ? `${cameraUrl(printer.id)}?r=${failed ? tick : 0}&k=${encodeURIComponent(sourceKey)}`
      : snapshotUrl(printer.id, tick);

  return (
    <div className="camera" ref={ref}>
      <img
        src={src}
        alt=""
        onLoad={() => setFailed(false)}
        onError={() => setFailed(true)}
        style={{ visibility: failed ? 'hidden' : 'visible' }}
      />
      {failed && <div className="camera-overlay">{t('camera.unavailable')}</div>}
      {mode === 'stream' && !failed && (
        <button
          className="camera-fullscreen icon-btn"
          title={fullscreen ? t('camera.exitFullscreen') : t('camera.fullscreen')}
          aria-label={fullscreen ? t('camera.exitFullscreen') : t('camera.fullscreen')}
          aria-pressed={fullscreen}
          onClick={toggleFullscreen}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d={
                fullscreen
                  ? 'M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6'
                  : 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6'
              }
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
