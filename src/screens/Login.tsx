import { useState } from 'react';
import { loginCloud, loginDemo } from '../lib/auth';
import { getServerConfig, isServerFromEnv, saveServerConfig } from '../lib/config';
import { resetClient } from '../lib/supabase';
import { Button, Card, Field, inputCls } from '../ui/kit';
import { Logo } from './Shell';

export function Login() {
  const [cfg, setCfg] = useState(getServerConfig());
  const [login, setLogin] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverOpen, setServerOpen] = useState(!cfg);
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.key ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await loginCloud(login, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-3">
        <Logo size={56} />
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">СлоноВет</h1>
      </div>

      {cfg && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Логин">
            <input
              className={inputCls}
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Пароль">
            <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          {error && <p className="m-0 text-[14px] font-bold text-coral">{error}</p>}
          <Button kind="primary" big full type="submit" disabled={busy || !login || !password}>
            {busy ? 'Входим…' : 'Войти'}
          </Button>
          {!navigator.onLine && <p className="m-0 text-center text-[13px] font-semibold text-muted">Для первого входа нужен интернет</p>}
        </form>
      )}

      {!isServerFromEnv() && (
        <Card className="flex flex-col gap-3 p-4">
          <button type="button" className="text-left text-[15px] font-bold" onClick={() => setServerOpen(!serverOpen)} aria-expanded={serverOpen}>
            {cfg ? 'Сервер подключён · изменить' : 'Подключить сервер Supabase'}
          </button>
          {serverOpen && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const next = url.trim() && key.trim() ? { url: url.trim().replace(/\/$/, ''), key: key.trim() } : null;
                saveServerConfig(next);
                resetClient();
                setCfg(next);
                setServerOpen(!next);
              }}
            >
              <Field label="Project URL">
                <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
              </Field>
              <Field label="anon public key">
                <input className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" />
              </Field>
              <Button kind="light" type="submit" full>
                Сохранить
              </Button>
            </form>
          )}
        </Card>
      )}

      {/* пример — только при разработке; на сайте входа без логина нет */}
      {import.meta.env.DEV && (showDemo ? (
        <div className="flex flex-col gap-2">
          <span className="px-1 text-center text-[13px] font-bold text-muted">Пример на выдуманных данных — ничего не сохраняется на сервер</span>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => loginDemo('keeper', 'Соколов')}>Кипер</Button>
            <Button onClick={() => loginDemo('vet', 'Иванова')}>Врач</Button>
            <Button onClick={() => loginDemo('director', 'Директор')}>Директор</Button>
            <Button onClick={() => loginDemo('admin', 'Администратор')}>Админ</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowDemo(true)} className="mx-auto h-11 px-3 text-[13px] font-bold text-faint underline">
          Посмотреть пример без входа
        </button>
      ))}
    </div>
  );
}
