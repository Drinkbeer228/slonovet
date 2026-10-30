import type { BoardType } from '../domain/board';
import type { IconName } from '../ui/Icon';
import type { Glow } from '../ui/kit';

/**
 * Тип задачи — один вид на доске «Задачи» и на «Дежурстве»: цвет полоски слева, иконка, подпись.
 * Янтарный и коралловый сюда не берём — они только для состояний (срочно, просрочено, заказано).
 */
export const TASK_TYPE: Record<BoardType, { stripe: string; text: string; bar: string; glow: Glow; icon: IconName; label: string }> = {
  elephants: { stripe: 'border-l-teal', text: 'text-teal', bar: 'bg-teal', glow: 'teal', icon: 'syringe', label: 'Слоны' },
  work: { stripe: 'border-l-sky', text: 'text-sky', bar: 'bg-sky', glow: 'sky', icon: 'wrench', label: 'Работа' },
  purchases: { stripe: 'border-l-violet', text: 'text-violet', bar: 'bg-violet', glow: 'violet', icon: 'box', label: 'Закупка' },
};

export const taskType = (elephant: string): 'elephants' | 'work' => (elephant === 'work' ? 'work' : 'elephants');
