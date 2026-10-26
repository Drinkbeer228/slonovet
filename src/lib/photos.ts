import { PreviewError, getPreviewRole } from './preview';
import { useEffect, useState } from 'react';
import { idbAll, idbDelete, idbGet, idbPut } from './idb';
import { getClient } from './supabase';

/** Фото сначала сохраняются на устройстве, в облако уходят при синхронизации. */

interface BlobEntry {
  path: string;
  blob: Blob;
  uploaded: boolean;
  /** когда ушло на сервер — через 30 дней копию на телефоне удаляем, фото остаётся на сервере */
  uploaded_at?: string;
  /** сколько раз не приняли и почему — фото пробует снова, но остальное не ждёт */
  tries?: number;
  error?: string;
}

/** Сколько дней держать на телефоне уже отправленные фото (для показа без сети). */
const KEEP_DAYS = 30;

const objectUrls = new Map<string, string>();
const signedUrls = new Map<string, { url: string; exp: number }>();

// ~150–250 КБ на фото: в бесплатные 1 ГБ Supabase влезает несколько тысяч
export async function compressImage(file: File, max = 1280, quality = 0.72): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality));
}

export async function savePhoto(file: File, folder: string, id: string): Promise<string> {
  if (getPreviewRole()) throw new PreviewError();
  const blob = await compressImage(file);
  const path = `${folder}/${id}.jpg`;
  await idbPut('blobs', { path, blob, uploaded: false } satisfies BlobEntry);
  return path;
}

/**
 * Отправить фото, которые ещё на телефоне. Каждое — само по себе: фото, которое сервер не принял,
 * не останавливает ни остальные фото, ни отправку записей (повтор — при следующей синхронизации).
 */
export async function uploadPendingPhotos(): Promise<{ sent: number; failed: number; error: string | null }> {
  const client = getClient();
  if (!client) return { sent: 0, failed: 0, error: null };
  const all = await idbAll<BlobEntry>('blobs');
  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const e of all.filter((x) => !x.uploaded)) {
    let message: string | null = null;
    try {
      const { error } = await client.storage.from('photos').upload(e.path, e.blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) message = error.message;
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    if (message) {
      failed++;
      lastError = message;
      await idbPut('blobs', { ...e, tries: (e.tries ?? 0) + 1, error: message });
      if (!navigator.onLine) break;
      continue;
    }
    await idbPut('blobs', { path: e.path, blob: e.blob, uploaded: true, uploaded_at: new Date().toISOString() } satisfies BlobEntry);
    sent++;
  }
  await pruneUploaded(all);
  return { sent, failed, error: lastError };
}

/** Убрать с телефона отправленные фото старше KEEP_DAYS дней: они есть на сервере, место на телефоне не бесконечно. */
async function pruneUploaded(all: BlobEntry[]) {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const e of all) {
    if (!e.uploaded) continue;
    if (!e.uploaded_at) {
      // отправлено до того, как стали помнить время, — отсчёт с сегодняшнего дня
      await idbPut('blobs', { ...e, uploaded_at: new Date().toISOString() });
    } else if (Date.parse(e.uploaded_at) < cutoff) {
      await idbDelete('blobs', e.path);
      const u = objectUrls.get(e.path);
      if (u) {
        URL.revokeObjectURL(u);
        objectUrls.delete(e.path);
      }
    }
  }
}

async function resolveUrl(path: string): Promise<string | null> {
  const local = objectUrls.get(path);
  if (local) return local;
  const entry = await idbGet<BlobEntry>('blobs', path);
  if (entry) {
    const u = URL.createObjectURL(entry.blob);
    objectUrls.set(path, u);
    return u;
  }
  const cached = signedUrls.get(path);
  if (cached && cached.exp > Date.now()) return cached.url;
  const client = getClient();
  if (!client) return null;
  const { data } = await client.storage.from('photos').createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  signedUrls.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

export function usePhotoUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path) resolveUrl(path).then((u) => alive && setUrl(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}
