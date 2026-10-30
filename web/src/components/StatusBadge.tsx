import type { PrinterStatus } from '@bambu/shared';
import { useTranslation } from 'react-i18next';

/** Shows the connection problem if there is one, otherwise the job state. */
export function StatusBadge({ status }: { status?: PrinterStatus }) {
  const { t } = useTranslation();
  if (!status || status.connection !== 'online') {
    const conn = status?.connection ?? 'connecting';
    return (
      <span className={`badge conn-${conn}`} title={status?.connectionError}>
        {t(`conn.${conn}`)}
      </span>
    );
  }
  return <span className={`badge job-${status.job.toLowerCase()}`}>{t(`job.${status.job}`)}</span>;
}
