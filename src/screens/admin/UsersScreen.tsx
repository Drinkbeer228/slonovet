import { useState } from 'react';
import type { Profile, Role } from '../../domain/types';
import type { Session } from '../../lib/auth';
import { getClient } from '../../lib/supabase';
import { PreviewError, getPreviewRole } from '../../lib/preview';
import { syncNow } from '../../lib/sync';
import { newId, put, useRows } from '../../lib/store';
import { Button, Card, Check, Chip, Field, ReadOnlyNote, Section, Sheet, inputCls, toast } from '../../ui/kit';
import { EDITORS } from '../../domain/access';
import { Icon } from '../../ui/Icon';

const ROLES: { value: Role; label: string }[] = [
  { value: 'keeper', label: 'Кипер' },
  { value: 'vet', label: 'Ветврач' },
  { value: 'director', label: 'Директор' },
  { value: 'manager', label: 'Администратор' },
  { value: 'admin', label: 'Системный админ' },
];

/** С кем может работать роль. Должно совпадать с MANAGES в supabase/functions/admin-users. */
const MANAGES: Partial<Record<Role, Role[]>> = {
  admin: ['keeper', 'vet', 'director', 'manager', 'admin'],
  director: ['keeper', 'vet', 'director', 'manager'],
  manager: ['keeper', 'vet'],
};

async function callAdmin(body: Record<string, string>) {
  if (getPreviewRole()) throw new PreviewError();
  const client = getClient();
  if (!client) throw new Error('Сервер не подключён');
  const { data, error } = await client.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = ((await ctx.json()) as { error?: string }).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return data as { id?: string };
}

function genPassword() {
  const words = ['слон', 'хобот', 'бивень', 'сено', 'ветка', 'манеж', 'каша'];
  const tr: Record<string, string> = { слон: 'slon', хобот: 'hobot', бивень: 'biven', сено: 'seno', ветка: 'vetka', манеж: 'manezh', каша: 'kasha' };
  const w = words[Math.floor(Math.random() * words.length)];
  return `${tr[w]}${Math.floor(1000 + Math.random() * 9000)}`;
}

export function UsersScreen({ session }: { session: Session }) {
  const profiles = useRows('profiles');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const demo = session.mode === 'demo';
  const manages = MANAGES[session.user.role] ?? [];
  const roles = ROLES.filter((r) => manages.includes(r.value));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3 px-1">
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Персонал</h1>
          {manages.length > 0 && (
            <Button kind="primary" icon="plus" onClick={() => setAdding(true)}>
              Добавить
            </Button>
          )}
        </div>
        {manages.length === 0 && <ReadOnlyNote who={EDITORS.users.who} />}
      </header>
      {ROLES.map((r) => {
        const list = profiles.filter((p) => p.role === r.value).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'));
        if (!list.length) return null;
        return (
          <Section key={r.value} title={r.label}>
            <Card className="divide-y divide-surface2 overflow-hidden">
              {list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!manages.includes(p.role)}
                  onClick={() => setEditing(p)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-[14px] font-extrabold">{p.full_name.slice(0, 1)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`text-[15px] font-bold ${p.active ? '' : 'text-faint line-through'}`}>{p.full_name}</span>
                    <span className="text-[12px] font-semibold text-muted">
                      {p.login}
                      {!p.active && ' · отключён'}
                      {p.id === session.user.id && ' · это вы'}
                    </span>
                  </span>
                  <Icon name="next" size={18} className="text-muted" />
                </button>
              ))}
            </Card>
          </Section>
        );
      })}
      {manages.length > 0 && (
        <p className="m-0 px-1 text-[13px] font-semibold leading-relaxed text-muted">
          Почта не нужна: человек входит по логину и паролю, которые вы ему передадите. Забыл пароль — задайте новый здесь.
        </p>
      )}
      <AddSheet open={adding} demo={demo} roles={roles} onClose={() => setAdding(false)} />
      <EditSheet profile={editing} demo={demo} roles={roles} selfId={session.user.id} onClose={() => setEditing(null)} />
    </div>
  );
}

function AddSheet({ open, demo, roles, onClose }: { open: boolean; demo: boolean; roles: typeof ROLES; onClose: () => void }) {
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [role, setRole] = useState<Role>('keeper');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null);

  const reset = () => {
    setName('');
    setLogin('');
    setPassword(genPassword());
    setRole('keeper');
    setError(null);
    setCreated(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    const clean = login.trim().toLowerCase();
    try {
      if (!/^[a-z0-9._-]{2,32}$/.test(clean)) throw new Error('Логин: латиница, цифры, точка или дефис');
      if (password.length < 8) throw new Error('Пароль минимум 8 символов');
      if (demo) {
        await put('profiles', { id: newId(), login: clean, full_name: name.trim() || clean, role, active: true });
      } else {
        await callAdmin({ action: 'create', login: clean, password, full_name: name.trim() || clean, role });
        await syncNow();
      }
      setCreated({ login: clean, password });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={created ? 'Готово' : 'Новый человек'}
      footer={
        created ? (
          <Button kind="primary" big full onClick={close}>
            Понятно
          </Button>
        ) : (
          <Button kind="primary" big full disabled={busy || !login || !name} onClick={submit}>
            {busy ? 'Создаём…' : 'Создать'}
          </Button>
        )
      }
    >
      {created ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[15px] text-ink2">Передайте эти данные для входа:</p>
          <Card className="flex flex-col gap-1 p-4 text-[17px] font-bold">
            <span>
              Логин: <span className="text-teal">{created.login}</span>
            </span>
            <span>
              Пароль: <span className="text-teal">{created.password}</span>
            </span>
          </Card>
          <p className="m-0 text-[13px] font-semibold text-muted">Пароль больше нигде не покажется — запишите.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Имя или фамилия">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Соколов" />
          </Field>
          <Field label="Логин" hint="латиницей, например sokolov">
            <input className={inputCls} value={login} onChange={(e) => setLogin(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          </Field>
          <Field label="Пароль">
            <div className="flex gap-2">
              <input className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoCapitalize="none" />
              <Button icon="refresh" onClick={() => setPassword(genPassword())} className="shrink-0">
                <span className="sr-only">Новый пароль</span>
              </Button>
            </div>
          </Field>
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[14px] font-bold text-muted">Роль</span>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <Chip key={r.value} on={role === r.value} onClick={() => setRole(r.value)}>
                  {r.label}
                </Chip>
              ))}
            </div>
          </div>
          {error && <p className="m-0 text-[14px] font-bold text-coral">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

function EditSheet({
  profile,
  demo,
  roles,
  selfId,
  onClose,
}: {
  profile: Profile | null;
  demo: boolean;
  roles: typeof ROLES;
  selfId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('keeper');
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (profile && loadedFor !== profile.id) {
    setLoadedFor(profile.id);
    setName(profile.full_name);
    setRole(profile.role);
    setActive(profile.active);
    setPassword('');
    setError(null);
    setConfirmDelete(false);
  }
  if (!profile) return null;
  const self = profile.id === selfId;

  const close = () => {
    setLoadedFor(null);
    onClose();
  };

  const save = async () => {
    const fullName = name.trim().replace(/\s+/g, ' ');
    if (!fullName) {
      setError('Впишите имя');
      return;
    }
    const renamed = fullName !== profile.full_name;
    setBusy(true);
    setError(null);
    try {
      if (demo) {
        await put('profiles', { ...profile, full_name: fullName, role, active });
      } else {
        if (renamed || role !== profile.role || active !== profile.active) {
          await callAdmin({ action: 'update', id: profile.id, full_name: fullName, role, active: String(active) });
        }
        if (password) await callAdmin({ action: 'password', id: profile.id, password });
        await syncNow();
      }
      toast(password ? `Новый пароль: ${password}` : 'Сохранено');
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    setError(null);
    try {
      if (demo) await put('profiles', { ...profile, deleted: true });
      else {
        // галочку «Отключить» могли поставить без «Сохранить» — сервер удаляет только отключённых
        if (profile.active) await callAdmin({ action: 'update', id: profile.id, active: 'false' });
        await callAdmin({ action: 'delete', id: profile.id });
        await syncNow();
      }
      toast(`${profile.full_name} удалён`);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={close}
      title={profile.full_name}
      footer={
        <Button kind="primary" big full disabled={busy} onClick={save}>
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {/* имя — как его видят в журнале и сменах; логин для входа не меняется */}
        <Field label="Имя" hint={`логин для входа: ${profile.login} — не меняется`}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Роль</span>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <Chip key={r.value} on={role === r.value} onClick={() => !self && setRole(r.value)}>
                {r.label}
              </Chip>
            ))}
          </div>
        </div>
        {!demo && (
          <Field label="Новый пароль" hint="оставьте пустым, чтобы не менять">
            <div className="flex gap-2">
              <input className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoCapitalize="none" />
              <Button icon="refresh" onClick={() => setPassword(genPassword())} className="shrink-0">
                <span className="sr-only">Придумать пароль</span>
              </Button>
            </div>
          </Field>
        )}
        {!self && (
          <Card className="overflow-hidden">
            <Check
              on={!active}
              label="Отключить доступ"
              sub="человек не сможет войти, его записи останутся"
              onChange={(v) => {
                setActive(!v);
                if (v === false) setConfirmDelete(false);
              }}
            />
          </Card>
        )}
        {!self && !active && (
          // удалить можно только отключённого: случайно стереть работающего человека нельзя
          <div className="flex flex-col gap-2">
            {confirmDelete ? (
              <>
                <p className="m-0 px-1 text-[14px] font-semibold text-ink2">
                  Удалить {profile.full_name} насовсем? Логин {profile.login} освободится. Его смены и записи в журнале останутся с именем.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => setConfirmDelete(false)}>Отмена</Button>
                  <Button kind="danger" disabled={busy} onClick={del}>
                    Удалить
                  </Button>
                </div>
              </>
            ) : (
              <Button icon="trash" onClick={() => setConfirmDelete(true)}>
                Удалить насовсем
              </Button>
            )}
          </div>
        )}
        {error && <p className="m-0 text-[14px] font-bold text-coral">{error}</p>}
      </div>
    </Sheet>
  );
}
