import { useEffect, useState } from 'react';
import { profileFor, type PrinterCommand, type Tray } from '@bambu/shared';
import { useTranslation } from 'react-i18next';
import { useLive } from '../api/live';
import { CameraView } from '../components/CameraView';
import { FanControl, SpeedControl, Switch, TempControl } from '../components/Controls';
import { FilamentDialog, FilamentPanel } from '../components/Filament';
import { StatusBadge } from '../components/StatusBadge';
import { formatDuration, formatEta, formatTemp, isActiveJob } from '../lib/format';
import { href } from '../lib/useHashRoute';

export function PrinterDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const { printers, statuses, send } = useLive();
  const [editTray, setEditTray] = useState<Tray | null>(null);

  const printer = printers?.find((p) => p.id === id);
  const missing = printers !== null && !printer;

  useEffect(() => {
    if (missing) window.location.hash = href.overview;
  }, [missing]);

  if (!printers) return <p className="muted">{t('common.loading')}</p>;
  if (!printer) return null;

  const s = statuses[id];
  const profile = profileFor(printer.model);
  const offline = !s || s.connection !== 'online';
  const run = (cmd: PrinterCommand) => send(id, cmd);
  const active = s && isActiveJob(s.job);

  return (
    <div className="detail">
      <div className="detail-head">
        <a className="back" href={href.overview} aria-label={t('common.back')}>
          ←
        </a>
        <h1>{printer.name}</h1>
        <span className="muted">{profile.label}</span>
        <StatusBadge status={s} />
        <span className="spacer" />
        {s?.wifiSignal && (
          <span className="muted small">
            {t('printer.wifi')} {s.wifiSignal}
          </span>
        )}
        <button
          className="icon-btn"
          title={t('printer.refresh')}
          disabled={offline}
          onClick={() => run({ type: 'refresh' })}
        >
          ↻
        </button>
      </div>

      <div className="detail-grid">
        <section className="col-main">
          <CameraView printer={printer} mode="stream" />

          <div className="card job">
            {active ? (
              <>
                <div className="row-between">
                  <div className="file" title={s.fileName}>
                    {s.fileName}
                  </div>
                  <span className="big-num">{Math.round(s.progress)}%</span>
                </div>
                <div className="progress large">
                  <span style={{ width: `${s.progress}%` }} />
                </div>
                <dl className="job-facts">
                  {s.layer !== null && s.totalLayers !== null && (
                    <div>
                      <dt>{t('printer.layer', { layer: s.layer, total: s.totalLayers })}</dt>
                    </div>
                  )}
                  <div>
                    <dt>{t('printer.remaining')}</dt>
                    <dd>{formatDuration(s.remainingMinutes)}</dd>
                  </div>
                  <div>
                    <dt>{t('printer.eta')}</dt>
                    <dd>{formatEta(s.remainingMinutes, i18n.language)}</dd>
                  </div>
                </dl>
                <div className="actions">
                  {s.job === 'PAUSE' ? (
                    <button
                      className="primary"
                      disabled={offline}
                      onClick={() => run({ type: 'resume' })}
                    >
                      {t('printer.resume')}
                    </button>
                  ) : (
                    <button
                      disabled={offline || s.job !== 'RUNNING'}
                      onClick={() => run({ type: 'pause' })}
                    >
                      {t('printer.pause')}
                    </button>
                  )}
                  <button
                    className="danger"
                    disabled={offline}
                    onClick={() =>
                      window.confirm(t('printer.stopConfirm')) && run({ type: 'stop' })
                    }
                  >
                    {t('printer.stop')}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">
                {s ? t(`job.${s.job}`) + ' · ' : ''}
                {t('printer.noJob')}
              </p>
            )}
          </div>

          {s && s.hms.length > 0 && (
            <div className="card hms">
              <h3>{t('hms.title')}</h3>
              <ul>
                {s.hms.map((h) => (
                  <li key={h.code}>
                    <code>{h.code}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="col-side">
          <div className="card">
            <h3>{t('temp.title')}</h3>
            <div className="temps">
              <TempControl
                label={t('temp.nozzle')}
                current={s?.nozzleTemp ?? null}
                target={s?.nozzleTarget ?? null}
                max={profile.maxNozzle}
                presets={[220, 250]}
                disabled={offline}
                onSet={(value) => run({ type: 'nozzleTemp', value })}
              />
              <TempControl
                label={t('temp.bed')}
                current={s?.bedTemp ?? null}
                target={s?.bedTarget ?? null}
                max={profile.maxBed}
                presets={[55, 70].filter((v) => v <= profile.maxBed)}
                disabled={offline}
                onSet={(value) => run({ type: 'bedTemp', value })}
              />
            </div>
            {s?.chamberTemp !== null && s?.chamberTemp !== undefined && (
              <div className="row-between muted chamber">
                <span>{t('temp.chamber')}</span>
                <b>{formatTemp(s.chamberTemp)}</b>
              </div>
            )}
          </div>

          <div className="card">
            <div className="row-between">
              <h3>{t('speed.title')}</h3>
              <Switch
                label={t('light.title')}
                checked={s?.light ?? null}
                disabled={offline}
                onSet={(on) => run({ type: 'light', on })}
              />
            </div>
            <SpeedControl
              value={s?.speedLevel ?? null}
              disabled={offline}
              onSet={(level) => run({ type: 'speed', level })}
            />
          </div>

          <div className="card">
            <h3>{t('fan.title')}</h3>
            {(['part', 'aux', 'chamber'] as const)
              .filter((fan) => profile.fans[fan])
              .map((fan) => (
                <FanControl
                  key={fan}
                  label={t(`fan.${fan}`)}
                  value={s?.fans[fan] ?? null}
                  disabled={offline}
                  onSet={(percent) => run({ type: 'fan', fan, percent })}
                />
              ))}
          </div>

          <div className="card">
            <h3>{t('filament.title')}</h3>
            {s ? <FilamentPanel status={s} onEdit={setEditTray} /> : <p className="muted">–</p>}
          </div>
        </section>
      </div>

      {editTray && (
        <FilamentDialog
          tray={editTray}
          profile={profile}
          onClose={() => setEditTray(null)}
          onSave={(v) =>
            run({ type: 'filament', amsId: editTray.amsId, trayId: editTray.trayId, ...v })
          }
        />
      )}
    </div>
  );
}
