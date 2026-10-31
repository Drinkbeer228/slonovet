import type { BoardType } from '../domain/board';
import { Icon } from '../ui/Icon';
import { TASK_TYPE } from './taskType';

/** Плашка типа задачи: иконка и слово на тонировке цвета типа — тип читается словом, а не цветом. */
export function TypePill({ type }: { type: BoardType }) {
  const t = TASK_TYPE[type];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-extrabold leading-none ${t.pill}`}>
      <Icon name={t.icon} size={13} stroke={2.2} />
      {t.label}
    </span>
  );
}
