/** Логин превращается в адрес вида login@slonovet.local — настоящая почта не нужна.
 *  Должен совпадать с LOGIN_DOMAIN в supabase/functions/admin-users/index.ts */
export const LOGIN_DOMAIN = 'slonovet.local';

const SERVER_KEY = 'slonovet_server';

export interface ServerConfig {
  url: string;
  key: string;
}

export function getServerConfig(): ServerConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) return { url, key };
  try {
    const saved = localStorage.getItem(SERVER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ServerConfig;
      if (parsed.url && parsed.key) return parsed;
    }
  } catch {
    /* нет доступа к хранилищу */
  }
  return null;
}

export function saveServerConfig(cfg: ServerConfig | null) {
  try {
    if (cfg) localStorage.setItem(SERVER_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    /* ignore */
  }
}

export function isServerFromEnv() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
