import { PreviewError, getPreviewRole } from './preview';
import { useEffect, useState } from 'react';
import { idbAll, idbGet, idbPut } from './idb';
import { getClient } from './supabase';

/** Фото сначала сохраняются на устройстве, в облако уходят при синхронизации. */

interface BlobEntry {
  path: string;
  blob: Blob;
  uploaded: boolean;
}

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

export async function uploadPendingPhotos(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const all = await idbAll<BlobEntry>('blobs');
  let n = 0;
  for (const e of all.filter((x) => !x.uploaded)) {
    const { error } = await client.storage.from('photos').upload(e.path, e.blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    await idbPut('blobs', { ...e, uploaded: true });
    n++;
  }
  return n;
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
