import { useState } from 'react';
import type { Profile, Role } from '../../domain/types';
import type { Session } from '../../lib/auth';
import { getClient } from '../../lib/supabase';
import { PreviewError, getPreviewRole } from '../../lib/preview';
import { syncNow } from '../../lib/sync';
import { newId, put, useRows } from '../../lib/store';
import { Button, Card, Check, Chip, Field, KEY, Plate, ReadOnlyNote, Section, Sheet, inputCls, toast } from '../../ui/kit';
import { EDITORS, MANAGES, SEES_LOGINS } from '../../domain/access';
import { Icon } from '../../ui/Icon';

const ROLES: { value: Role; label: string }[] = [
  { value: 'keeper', label: 'Кипер' },
  { value: 'vet', label: 'Ветврач' },
  { value: 'director', label: 'Директор' },
  { value: 'manager', label: 'Администратор' },
  { value: 'admin', label: 'Системный админ' },
];


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

/** Слова для придумываемых паролей — латиницей, чтобы набирать на любой раскладке. */
const PASSWORD_WORDS = [
  'slon', 'hobot', 'biven', 'seno', 'vetka', 'manezh', 'kasha', 'oves', 'morkov', 'svekla', 'tykva', 'yabloko',
  'banan', 'arena', 'shater', 'baraban', 'kanat', 'fonar', 'kloun', 'akrobat', 'zhongler', 'tribuna', 'afisha', 'bilet',
];

/** Пароль из трёх слов и двух цифр, «seno-kloun-arena-47»: легко продиктовать, а подобрать — около 1,2 млн вариантов при 10 попытках в минуту (ограничение на сервере), то есть годы. */
function genPassword() {
  const rnd = (n: number) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const words = Array.from({ length: 3 }, () => PASSWORD_WORDS[rnd(PASSWORD_WORDS.length)]);
  return `${words.join('-')}-${String(rnd(90) + 10)}`;
}

export function UsersScreen({ session, role }: { session: Session; role: Role }) {
  const profiles = useRows('profiles');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const demo = session.mode === 'demo';
  // role — чьими глазами смотрим (у админа в «Посмотреть как» — чужая)
  const manages = MANAGES[role] ?? [];
  const seesLogins = SEES_LOGINS.includes(role);
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
            <Card className="divide-y divide-edge overflow-hidden">
              {list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!manages.includes(p.role)}
                  onClick={() => setEditing(p)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60"
                >
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-extrabold ${KEY}`}>{p.full_name.slice(0, 1)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`text-[15px] font-bold ${p.active ? '' : 'text-faint line-through'}`}>{p.full_name}</span>
                    {(seesLogins || !p.active || p.id === session.user.id) && (
                      <span className="text-[12px] font-semibold text-muted">
                        {[seesLogins && p.login, !p.active && 'отключён', p.id === session.user.id && 'это ты'].filter(Boolean).join(' · ')}
                      </span>
                    )}
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
          Почта не нужна: человек входит по логину и паролю, которые ты ему передашь. Забыл пароль — задай новый здесь.
        </p>
      )}
      <AddSheet open={adding} demo={demo} roles={roles} onClose={() => setAdding(false)} />
      <EditSheet profile={editing} demo={demo} roles={roles} selfId={session.user.id} seesLogins={seesLogins} onClose={() => setEditing(null)} />
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
          <p className="m-0 text-[15px] text-ink2">Передай эти данные для входа:</p>
          <Plate glow="teal" className="flex flex-col gap-1 p-4 text-[17px] font-bold">
            <span>
              Логин: <span className="text-teal-fg">{created.login}</span>
            </span>
            <span>
              Пароль: <span className="text-teal-fg">{created.password}</span>
            </span>
          </Plate>
          <p className="m-0 text-[13px] font-semibold text-muted">Пароль больше нигде не покажется — запиши.</p>
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
  seesLogins,
  onClose,
}: {
  profile: Profile | null;
  demo: boolean;
  roles: typeof ROLES;
  selfId: string;
  seesLogins: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('keeper');
  const [active, setActive] = useState(true);
  const [phone, setPhone] = useState('');
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
    setPhone(profile.phone ?? '');
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
      setError('Впиши имя');
      return;
    }
    const renamed = fullName !== profile.full_name;
    setBusy(true);
    setError(null);
    try {
      if (demo) {
        await put('profiles', { ...profile, full_name: fullName, role, active, phone: phone.trim() || null });
      } else {
        const phoneChanged = phone.trim() !== (profile.phone ?? '');
        if (renamed || role !== profile.role || active !== profile.active || phoneChanged) {
          await callAdmin({ action: 'update', id: profile.id, full_name: fullName, role, active: String(active), ...(phoneChanged ? { phone: phone.trim() } : {}) });
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
        <Field label="Имя" hint={seesLogins ? `логин для входа: ${profile.login} — не меняется` : 'логин для входа не меняется'}>
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
        {role === 'vet' && (
          <Field label="Телефон" hint="для кнопки «Позвонить врачу» при тревоге">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" placeholder="+7 900 000-00-00" />
          </Field>
        )}
        {!demo && (
          <Field label="Новый пароль" hint="оставь пустым, чтобы не менять">
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
                  Удалить {profile.full_name} насовсем? {seesLogins ? `Логин ${profile.login} освободится.` : ''} Его смены и записи в журнале останутся с именем.
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
