import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429 ? t('login.tooMany') : t('login.invalid'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          {t('app.title')}
        </div>
        <h1>{t('login.title')}</h1>
        <label className="field">
          <span>{t('login.password')}</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || !password}>
          {t('login.submit')}
        </button>
      </form>
    </div>
  );
}
