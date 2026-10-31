import { roadMode } from '../../domain/road';
import { useRows } from '../../lib/store';
import { relDate, localDay, timeOf } from '../../lib/dates';
import { Plate, GlowIcon } from '../../ui/kit';

/** Плашка «В дороге»: всем видно, что рацион дорожный — каши отменены, овощи вечером, сено и вода вволю. */
export function RoadBanner() {
  const mode = roadMode(useRows('move_items'));
  if (!mode.on) return null;
  return (
    <Plate glow="amber" className="flex items-start gap-3 p-3.5">
      <GlowIcon glow="amber" icon="truck" />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-extrabold text-amber-fg">В дороге</span>
        <span className="text-[13px] font-semibold text-ink2">Каши и зерносмесь отменены · овощи вечером по расписанию · сено и вода вволю</span>
        {mode.since && (
          <span className="text-[12px] font-semibold text-muted">
            с {relDate(localDay(mode.since))} {timeOf(mode.since)}
            {mode.by ? ` · включил ${mode.by}` : ''}
          </span>
        )}
      </span>
    </Plate>
  );
}
