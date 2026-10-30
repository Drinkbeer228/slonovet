import { useState } from 'react';
import { loginCloud, loginDemo } from '../lib/auth';
import { getServerConfig, isServerFromEnv, saveServerConfig } from '../lib/config';
import { resetClient } from '../lib/supabase';
import { Button, Card, Field, inputCls } from '../ui/kit';
import { Logo } from './Shell';
import { Icon } from '../ui/Icon';

const LAST_LOGIN = 'slonovet_last_login';
const readLastLogin = () => {
  try {
    return localStorage.getItem(LAST_LOGIN) ?? '';
  } catch {
    return '';
  }
};

/**
 * Сервер не ответил за 45 с (нет связи, мобильный интернет режет сайт) — сказать об этом, а не крутить «Входим…» вечно.
 * С запасом: каждый запрос сам обрывается через 20 с, и вход может ждать один такой повисший запрос.
 */
const LOGIN_TIMEOUT = 45_000;

export function Login() {
  const [cfg, setCfg] = useState(getServerConfig());
  const [login, setLogin] = useState(readLastLogin);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [forgot, setForgot] = useState(false);
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
      await Promise.race([
        loginCloud(login, password),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Сервер не отвечает. Проверьте интернет — подойдёт любой Wi‑Fi — и попробуйте ещё раз.')), LOGIN_TIMEOUT)),
      ]);
      try {
        localStorage.setItem(LAST_LOGIN, login.trim().toLowerCase());
      } catch {
        /* не запомним — введёте ещё раз */
      }
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
              id="login"
              className={inputCls}
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              enterKeyHint="next"
              required
            />
          </Field>
          <Field label="Пароль">
            <div className="relative">
              <input
                id="password"
                className={`${inputCls} pr-14`}
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="current-password"
                enterKeyHint="go"
                required
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
                aria-pressed={show}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted"
              >
                <Icon name={show ? 'eyeOff' : 'eye'} size={20} />
              </button>
            </div>
          </Field>
          {caps && <p className="-mt-2 m-0 px-1 text-[13px] font-semibold text-amber-fg">Включён Caps Lock</p>}
          {error && (
            <p role="alert" className="m-0 text-[14px] font-bold text-coral-fg">
              {error}
            </p>
          )}
          <Button kind="accent" big full type="submit" disabled={busy || !login || !password}>
            {busy ? 'Входим…' : 'Войти'}
          </Button>
          {!navigator.onLine && <p className="m-0 text-center text-[13px] font-semibold text-muted">Для первого входа нужен интернет</p>}
          <button type="button" onClick={() => setForgot(!forgot)} aria-expanded={forgot} className="mx-auto min-h-11 py-2 text-[14px] font-bold text-teal">
            Забыли пароль?
          </button>
          {forgot && (
            <p className="m-0 -mt-2 text-center text-[13px] font-semibold leading-snug text-muted">
              Попросите директора или администратора: меню → «Персонал» → вы → новый пароль. Почта не нужна.
            </p>
          )}
        </form>
      )}

      {!isServerFromEnv() && (
        <Card className="flex flex-col gap-3 p-4">
          <button type="button" className="min-h-11 text-left text-[15px] font-bold" onClick={() => setServerOpen(!serverOpen)} aria-expanded={serverOpen}>
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
