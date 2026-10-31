import { useState } from 'react';
import type { ElephantName } from '../domain/types';

/**
 * Лицо слонихи — круг. Фото подменяется простым файлом: положить public/elephants/pretty.webp (margo, odri) —
 * и везде появится фото; пока файла нет — буква. Ничего больше менять не нужно.
 */
const FILE: Record<ElephantName, string> = { Претти: 'pretty', Марго: 'margo', Одри: 'odri' };
/** у каждой свой спокойный оттенок кромки — различать с первого взгляда, не путая с цветами состояния */
const RING: Record<ElephantName, string> = {
  Претти: 'color-mix(in srgb, var(--color-sky) 55%, transparent)',
  Марго: 'color-mix(in srgb, var(--color-violet) 55%, transparent)',
  Одри: 'color-mix(in srgb, var(--color-teal) 55%, transparent)',
};
const missing = new Set<string>();

export function ElephantFace({ name, size = 36, className = '' }: { name: ElephantName; size?: number; className?: string }) {
  const src = `/elephants/${FILE[name]}.webp`;
  const [broken, setBroken] = useState(missing.has(src));
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${RING[name]}, var(--shadow-key)` }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface2 font-extrabold text-ink ${className}`}
    >
      {broken ? (
        <span style={{ fontSize: Math.round(size * 0.45) }}>{name[0]}</span>
      ) : (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            missing.add(src);
            setBroken(true);
          }}
        />
      )}
    </span>
  );
}
