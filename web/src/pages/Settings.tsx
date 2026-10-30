import { useState, type FormEvent } from 'react';
import {
  MODEL_PROFILES,
  PRINTER_MODELS,
  detectModel,
  type CameraMode,
  type PrinterInfo,
  type PrinterInput,
  type PrinterModel,
} from '@bambu/shared';
import { useTranslation } from 'react-i18next';
import { api, ApiError, snapshotUrl } from '../api/client';
import { useLive } from '../api/live';
import { LANGUAGES } from '../i18n';
import { applyTheme, loadTheme, type Theme } from '../lib/theme';

export function Settings() {
  const { t } = useTranslation();
  const { printers, reloadPrinters } = useLive();
  const [editing, setEditing] = useState<PrinterInfo | 'new' | null>(null);

  const remove = async (p: PrinterInfo) => {
    if (!window.confirm(t('settings.deleteConfirm', { name: p.name }))) return;
    await api.deletePrinter(p.id);
    await reloadPrinters();
  };

  return (
    <div className="settings">
      <h1>{t('settings.title')}</h1>

      <section className="card">
        <div className="row-between">
          <h2>{t('settings.printers')}</h2>
          {editing === null && (
            <button className="primary" onClick={() => setEditing('new')}>
              {t('settings.add')}
            </button>
          )}
        </div>

        {editing === 'new' && (
          <PrinterForm
            onDone={async () => {
              setEditing(null);
              await reloadPrinters();
            }}
          />
        )}

        <ul className="printer-list">
          {printers?.map((p) =>
            editing !== 'new' && editing?.id === p.id ? (
              <li key={p.id}>
                <PrinterForm
                  printer={p}
                  onDone={async () => {
                    setEditing(null);
                    await reloadPrinters();
                  }}
                />
              </li>
            ) : (
              <li key={p.id} className="row-between">
                <div>
                  <b>{p.name}</b>
                  <div className="muted small">
                    {MODEL_PROFILES[p.model].label} · {p.host} · {p.serial}
                  </div>
                </div>
                <div className="actions">
                  <button onClick={() => setEditing(p)}>{t('settings.edit')}</button>
                  <button className="danger" onClick={() => remove(p)}>
                    {t('settings.delete')}
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      </section>

      <Appearance />
    </div>
  );
}

function Appearance() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>(loadTheme);
  return (
    <section className="card">
      <h2>{t('settings.appearance')}</h2>
      <div className="row">
        <label className="field">
          <span>{t('settings.language')}</span>
          <select
            value={i18n.resolvedLanguage}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('settings.theme')}</span>
          <select
            value={theme}
            onChange={(e) => {
              const value = e.target.value as Theme;
              setTheme(value);
              applyTheme(value);
            }}
          >
            <option value="auto">{t('settings.themeAuto')}</option>
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function PrinterForm({ printer, onDone }: { printer?: PrinterInfo; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(printer?.name ?? '');
  const [host, setHost] = useState(printer?.host ?? '');
  const [serial, setSerial] = useState(printer?.serial ?? '');
  const [accessCode, setAccessCode] = useState('');
  const [model, setModel] = useState<PrinterModel>(printer?.model ?? 'A1');
  const [cameraMode, setCameraMode] = useState<CameraMode>(printer?.camera.mode ?? 'printer');
  const [rtspUrl, setRtspUrl] = useState(printer?.camera.rtspUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{
    state: 'idle' | 'running' | 'ok' | 'failed';
    image?: string;
    msg?: string;
  }>({
    state: 'idle',
  });

  const input = (): PrinterInput => ({
    name,
    host,
    serial,
    accessCode: accessCode || undefined,
    model,
    camera: cameraMode === 'rtsp' ? { mode: 'rtsp', rtspUrl } : { mode: cameraMode },
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (printer) await api.updatePrinter(printer.id, input());
      else await api.createPrinter(input());
      onDone();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : String(err);
      setError(t(`errors.${code}`, { defaultValue: t('errors.generic', { msg: code }) }));
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTest({ state: 'running' });
    try {
      if (cameraMode === 'rtsp') {
        setTest({ state: 'ok', image: await api.testRtsp(rtspUrl) });
      } else if (printer) {
        const res = await fetch(snapshotUrl(printer.id, Date.now()));
        if (!res.ok)
          throw new ApiError(
            res.status,
            (await res.json().catch(() => ({}))).error ?? res.statusText,
          );
        setTest({ state: 'ok', image: URL.createObjectURL(await res.blob()) });
      }
    } catch (err) {
      setTest({ state: 'failed', msg: err instanceof ApiError ? err.code : String(err) });
    }
  };

  const usesLiveview = MODEL_PROFILES[model].camera === 'rtsp';

  return (
    <form className="printer-form" onSubmit={submit}>
      <p className="hint">{t('settings.hintLan')}</p>
      <div className="row">
        <label className="field">
          <span>{t('settings.name')}</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('settings.host')}</span>
          <input
            required
            value={host}
            placeholder="192.168.1.50"
            onChange={(e) => setHost(e.target.value)}
          />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>{t('settings.serial')}</span>
          <input
            required
            value={serial}
            onChange={(e) => setSerial(e.target.value.toUpperCase())}
            onBlur={() => {
              const detected = detectModel(serial);
              if (detected) setModel(detected);
            }}
          />
        </label>
        <label className="field">
          <span>{t('settings.accessCode')}</span>
          <input
            type="password"
            autoComplete="off"
            required={!printer?.hasAccessCode && host !== 'mock'}
            value={accessCode}
            placeholder={printer?.hasAccessCode ? t('settings.accessCodeKeep') : ''}
            onChange={(e) => setAccessCode(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t('settings.model')}</span>
          <select value={model} onChange={(e) => setModel(e.target.value as PrinterModel)}>
            {PRINTER_MODELS.map((m) => (
              <option key={m} value={m}>
                {MODEL_PROFILES[m].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="field">
        <legend>{t('settings.camera')}</legend>
        <div className="segmented">
          {(['printer', 'rtsp', 'none'] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              className={cameraMode === mode ? 'on' : ''}
              onClick={() => {
                setCameraMode(mode);
                setTest({ state: 'idle' });
              }}
            >
              {t(`settings.camera${mode[0].toUpperCase()}${mode.slice(1)}`)}
            </button>
          ))}
        </div>
        {cameraMode === 'printer' && usesLiveview && (
          <p className="hint">{t('settings.hintLiveview')}</p>
        )}
        {cameraMode === 'rtsp' && (
          <label className="field">
            <span>{t('settings.rtspUrl')}</span>
            <input
              required
              pattern="rtsps?://.+"
              value={rtspUrl}
              placeholder="rtsp://user:pass@192.168.1.60:554/stream1"
              onChange={(e) => setRtspUrl(e.target.value)}
            />
          </label>
        )}
        {cameraMode !== 'none' && (
          <div className="camera-test">
            <button
              type="button"
              disabled={test.state === 'running' || (cameraMode === 'rtsp' ? !rtspUrl : !printer)}
              onClick={runTest}
            >
              {test.state === 'running' ? t('settings.testing') : t('settings.test')}
            </button>
            {cameraMode === 'printer' && !printer && (
              <span className="muted small">{t('settings.testSaveFirst')}</span>
            )}
            {test.state === 'failed' && (
              <span className="error">{t('settings.testFailed', { msg: test.msg })}</span>
            )}
            {test.image && <img src={test.image} alt="" />}
          </div>
        )}
      </fieldset>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button className="primary" disabled={busy}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}
