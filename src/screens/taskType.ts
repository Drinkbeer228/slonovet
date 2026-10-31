import type { BoardType } from '../domain/board';
import type { IconName } from '../ui/Icon';
import type { Glow } from '../ui/kit';

/**
 * Тип задачи — один вид на доске «Задачи» и на «Дежурстве»: плашка со словом (иконка + «Слоны / Работа / Закупка»).
 * Свечение плиты для типа не используем — оно отвлекает от текста и само по себе ничего не говорит.
 * Янтарный и коралловый сюда не берём — они только для состояний (срочно, просрочено, заказано).
 */
export const TASK_TYPE: Record<BoardType, { text: string; bar: string; glow: Glow; pill: string; icon: IconName; label: string }> = {
  elephants: { text: 'text-teal', bar: 'bg-teal', glow: 'teal', pill: 'bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-teal-fg', icon: 'syringe', label: 'Слоны' },
  work: { text: 'text-sky', bar: 'bg-sky', glow: 'sky', pill: 'bg-[color-mix(in_srgb,var(--color-sky)_var(--tint),transparent)] text-sky-fg', icon: 'wrench', label: 'Работа' },
  purchases: { text: 'text-violet', bar: 'bg-violet', glow: 'violet', pill: 'bg-[color-mix(in_srgb,var(--color-violet)_var(--tint),transparent)] text-violet-fg', icon: 'box', label: 'Закупка' },
};

export const taskType = (elephant: string): 'elephants' | 'work' => (elephant === 'work' ? 'work' : 'elephants');
