import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerConfig } from './config';

let client: SupabaseClient | null = null;
let clientUrl = '';

export function getClient(): SupabaseClient | null {
  const cfg = getServerConfig();
  if (!cfg) return null;
  if (!client || clientUrl !== cfg.url) {
    client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'slonovet-auth' },
    });
    clientUrl = cfg.url;
  }
  return client;
}

export function resetClient() {
  client = null;
  clientUrl = '';
}
