import type { BoardType } from '../domain/board';
import type { IconName } from '../ui/Icon';
import type { Glow } from '../ui/kit';

/**
 * Тип задачи — один вид на доске «Задачи» и на «Дежурстве»: свечение плиты, иконка, подпись.
 * Янтарный и коралловый сюда не берём — они только для состояний (срочно, просрочено, заказано).
 */
export const TASK_TYPE: Record<BoardType, { text: string; bar: string; glow: Glow; icon: IconName; label: string }> = {
  elephants: { text: 'text-teal', bar: 'bg-teal', glow: 'teal', icon: 'syringe', label: 'Слоны' },
  work: { text: 'text-sky', bar: 'bg-sky', glow: 'sky', icon: 'wrench', label: 'Работа' },
  purchases: { text: 'text-violet', bar: 'bg-violet', glow: 'violet', icon: 'box', label: 'Закупка' },
};

export const taskType = (elephant: string): 'elephants' | 'work' => (elephant === 'work' ? 'work' : 'elephants');
