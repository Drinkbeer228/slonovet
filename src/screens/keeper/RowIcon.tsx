import { KEY } from '../../ui/kit';
import { Icon, type IconName } from '../../ui/Icon';

/** Иконка строки «За дежурство»: клавиша; сделанное — бирюзовое стекло с галочкой. */
export function RowIcon({ icon, done }: { icon: IconName; done?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
        done ? 'border-teal/40 bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-teal-fg shadow-(--shadow-key-on)' : `${KEY} text-ink2`
      }`}
    >
      <Icon name={done ? 'check' : icon} size={18} stroke={done ? 2.6 : 2} />
    </span>
  );
}
