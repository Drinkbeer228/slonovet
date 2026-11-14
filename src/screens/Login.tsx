import { useState } from 'react';
import { DEMO_PERSONAS, type DemoPersona, loginCloud, loginDemoPersona } from '../lib/auth';
import { getServerConfig, isServerFromEnv, saveServerConfig } from '../lib/config';
import { resetClient } from '../lib/supabase';
import { Button, Card, Field, Plate, inputCls } from '../ui/kit';
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

const PERSONA_LIST: DemoPersona[] = ['keeper', 'vet', 'observer'];

export function Login() {
  const [cfg, setCfg] = useState(getServerConfig());
  const [login, setLogin] = useState(readLastLogin);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.key ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await Promise.race([
        loginCloud(login, password),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Сервер не отвечает. Проверь интернет — подойдёт любой Wi‑Fi — и попробуй ещё раз.')), LOGIN_TIMEOUT)),
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
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}logo.webp`} alt="" width={180} height={180} className="h-[180px] w-[180px] rounded-[40px] shadow-(--shadow-plate)" />
        <h1 className="sr-only">СлоноВет — Полевой пост</h1>
      </div>

      <Plate glow="teal" className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[16px] font-extrabold text-teal-fg">Демо-режим полевого поста</span>
          <span className="text-[13px] font-semibold leading-snug text-muted">
            Открыть учебную базу мониторинга слонов без подключения к серверу (готовая смена, рацион и ветеринарный контроль):
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {PERSONA_LIST.map((p) => (
            <Button key={p} kind={p === 'keeper' ? 'accent' : 'ghost'} full onClick={() => loginDemoPersona(p)}>
              Войти как: {DEMO_PERSONAS[p].label}
            </Button>
          ))}
        </div>
      </Plate>

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
            Забыл пароль?
          </button>
          {forgot && (
            <p className="m-0 -mt-2 text-center text-[13px] font-semibold leading-snug text-muted">
              Попроси того, кто ведёт «Персонал», задать новый пароль: меню → «Персонал» → твоё имя. Почта не нужна.
            </p>
          )}
        </form>
      )}

      {!isServerFromEnv() && (
        <Card className="flex flex-col gap-3 p-4">
          <button type="button" className="min-h-11 text-left text-[15px] font-bold" onClick={() => setServerOpen(!serverOpen)} aria-expanded={serverOpen}>
            {cfg ? 'Сервер подключён · изменить' : 'Подключить рабочий сервер Supabase'}
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
    </div>
  );
}
