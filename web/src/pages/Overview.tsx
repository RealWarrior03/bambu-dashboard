import { useTranslation } from 'react-i18next';
import { useLive } from '../api/live';
import { CameraView } from '../components/CameraView';
import { StatusBadge } from '../components/StatusBadge';
import { formatDuration, formatTemp, isActiveJob } from '../lib/format';
import { href } from '../lib/useHashRoute';

export function Overview() {
  const { t } = useTranslation();
  const { printers, statuses } = useLive();

  if (!printers) return <p className="muted">{t('common.loading')}</p>;
  if (printers.length === 0) {
    return (
      <div className="empty-state card">
        <p>{t('overview.empty')}</p>
        <a className="button primary" href={href.settings}>
          {t('overview.addPrinter')}
        </a>
      </div>
    );
  }

  return (
    <div className="grid-cards">
      {printers.map((printer) => {
        const s = statuses[printer.id];
        const active = s && isActiveJob(s.job);
        return (
          <a key={printer.id} className="card printer-card" href={href.printer(printer.id)}>
            <CameraView printer={printer} mode="snapshot" />
            <div className="printer-card-body">
              <div className="row-between">
                <h2>{printer.name}</h2>
                <StatusBadge status={s} />
              </div>
              {active ? (
                <>
                  <div className="file" title={s.fileName}>
                    {s.fileName}
                  </div>
                  <div className="progress">
                    <span style={{ width: `${s.progress}%` }} />
                  </div>
                  <div className="row-between muted small">
                    <span>{Math.round(s.progress)}%</span>
                    <span>{formatDuration(s.remainingMinutes)}</span>
                  </div>
                </>
              ) : (
                <div className="muted small">{t('printer.noJob')}</div>
              )}
              <div className="stats">
                <span>
                  {t('temp.nozzle')} <b>{formatTemp(s?.nozzleTemp ?? null)}</b>
                </span>
                <span>
                  {t('temp.bed')} <b>{formatTemp(s?.bedTemp ?? null)}</b>
                </span>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
