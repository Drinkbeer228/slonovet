import { useMemo } from 'react';
import { BADGES, keeperStats } from '../domain/achievements';
import type { CurrentUser } from '../domain/types';
import { useRows } from '../lib/store';
import { Card, Empty, Section } from '../ui/kit';

/** Мои достижения: личные значки кипера, без рейтинга и сравнения с коллегами. */
export function RatingScreen({ user }: { user: CurrentUser }) {
  const shifts = useRows('shifts');
  const notes = useRows('notes');
  const marks = useRows('request_marks');
  const stats = useMemo(() => keeperStats(shifts, notes, marks), [shifts, notes, marks]);
  const me = stats.find((k) => k.id === user.id);
  const got = me ? BADGES.filter((b) => b.progress(me)[0] >= b.progress(me)[1]) : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 px-1 text-[26px] font-extrabold tracking-tight">Мои достижения</h1>
      {!me ? (
        <Empty>Значки копятся за дежурства — появятся после первого.</Empty>
      ) : (
        <Section title="Значки" aside={`${got.length} из ${BADGES.length}`}>
          <div className="grid grid-cols-2 gap-2">
            {BADGES.map((badge) => {
              const [v, need] = badge.progress(me);
              const done = got.includes(badge);
              return (
                <Card key={badge.key} className={`flex flex-col gap-1.5 p-3 ${done ? 'ring-1 ring-teal/50' : ''}`}>
                  <span className={`text-[28px] leading-none ${done ? '' : 'opacity-30 grayscale'}`}>{badge.icon}</span>
                  <span className={`text-[14px] font-extrabold ${done ? '' : 'text-muted'}`}>{badge.title}</span>
                  <span className="text-[12px] font-semibold leading-snug text-muted">{badge.text}</span>
                  {!done && (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                        <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.min(100, (v / need) * 100)}%` }} />
                      </span>
                      <span className="text-[11px] font-bold text-faint">
                        {Math.min(v, need)}/{need}
                      </span>
                    </span>
                  )}
                </Card>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
