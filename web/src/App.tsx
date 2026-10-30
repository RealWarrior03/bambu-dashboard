import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api/client';
import { LiveProvider, useLive } from './api/live';
import { href, useHashRoute } from './lib/useHashRoute';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { PrinterDetail } from './pages/PrinterDetail';
import { Settings } from './pages/Settings';

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .session()
      .then((s) => setAuthenticated(s.authenticated))
      .catch(() => setAuthenticated(false));
    const onExpired = () => setAuthenticated(false);
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);

  if (authenticated === null) return <div className="splash" />;
  if (!authenticated) return <Login onSuccess={() => setAuthenticated(true)} />;
  return (
    <LiveProvider>
      <Shell onLogout={() => setAuthenticated(false)} />
    </LiveProvider>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const route = useHashRoute();
  const { socketConnected, toast } = useLive();

  useEffect(() => {
    document.title = t('app.title');
  }, [t]);

  const logout = async () => {
    await api.logout().catch(() => {});
    onLogout();
  };

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href={href.overview}>
          <span className="brand-mark" aria-hidden />
          {t('app.title')}
        </a>
        <nav>
          <a href={href.overview} aria-current={route.page !== 'settings' ? 'page' : undefined}>
            {t('nav.overview')}
          </a>
          <a href={href.settings} aria-current={route.page === 'settings' ? 'page' : undefined}>
            {t('nav.settings')}
          </a>
          <button className="link" onClick={logout}>
            {t('nav.logout')}
          </button>
        </nav>
        <span
          className={`live-dot ${socketConnected ? 'on' : ''}`}
          title={socketConnected ? t('conn.online') : t('conn.offline')}
        />
      </header>
      <main>
        {route.page === 'overview' && <Overview />}
        {route.page === 'printer' && <PrinterDetail id={route.id} />}
        {route.page === 'settings' && <Settings />}
      </main>
      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}
    </div>
  );
}
