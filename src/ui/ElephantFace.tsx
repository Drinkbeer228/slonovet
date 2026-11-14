import type { ElephantName } from '../domain/types';

/**
 * Лицо слонихи — круг с первой буквой и индивидуальным цветным кольцом.
 * У каждой свой спокойный оттенок кромки — различать с первого взгляда, не путая с цветами состояния.
 */
const RING: Record<ElephantName, string> = {
  Претти: 'color-mix(in srgb, var(--color-sky) 55%, transparent)',
  Марго: 'color-mix(in srgb, var(--color-violet) 55%, transparent)',
  Одри: 'color-mix(in srgb, var(--color-teal) 55%, transparent)',
};

export function ElephantFace({ name, size = 36, className = '' }: { name: ElephantName; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${RING[name]}, var(--shadow-key)` }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface2 font-extrabold text-ink ${className}`}
    >
      <span style={{ fontSize: Math.round(size * 0.45) }}>{name[0]}</span>
    </span>
  );
}
