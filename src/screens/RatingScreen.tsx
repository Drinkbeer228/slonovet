import { useMemo, useState } from 'react';
import { BADGES, BOARDS, MIN_SHIFTS, keeperStats, type KeeperStats } from '../domain/achievements';
import type { CurrentUser } from '../domain/types';
import { useRows } from '../lib/store';
import { plural, shortDate } from '../lib/dates';
import { Card, Empty, Section, Segmented } from '../ui/kit';

const earned = (k: KeeperStats) => BADGES.filter((b) => {
  const [v, need] = b.progress(k);
  return v >= need && (b.key !== 'sniper' || k.urineOk + k.urineMiss >= 30);
});

export function RatingScreen({ user }: { user: CurrentUser }) {
  const shifts = useRows('shifts');
  const notes = useRows('notes');
  const marks = useRows('request_marks');
  const stats = useMemo(() => keeperStats(shifts, notes, marks), [shifts, notes, marks]);
  const [board, setBoard] = useState(BOARDS[0].key);
  const b = BOARDS.find((x) => x.key === board)!;
  const me = stats.find((k) => k.id === user.id);
  const ranked = stats.filter((k) => k.shifts >= MIN_SHIFTS).sort((x, y) => b.value(y) - b.value(x));
  const newbies = stats.filter((k) => k.shifts < MIN_SHIFTS);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 px-1 text-[26px] font-extrabold tracking-tight">Рейтинг и ачивки</h1>

      {me && (
        <Section title="Мои ачивки" aside={`${earned(me).length} из ${BADGES.length}`}>
          <div className="grid grid-cols-2 gap-2">
            {BADGES.map((badge) => {
              const [v, need] = badge.progress(me);
              const got = earned(me).includes(badge);
              return (
                <Card key={badge.key} className={`flex flex-col gap-1.5 p-3 ${got ? 'ring-1 ring-teal/50' : ''}`}>
                  <span className={`text-[28px] leading-none ${got ? '' : 'opacity-30 grayscale'}`}>{badge.icon}</span>
                  <span className={`text-[14px] font-extrabold ${got ? '' : 'text-muted'}`}>{badge.title}</span>
                  <span className="text-[12px] font-semibold leading-snug text-muted">{badge.text}</span>
                  {!got && (
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

      <Section title="Рейтинг" aside="на одно дежурство">
        <Segmented label="Что сравниваем" value={board} onChange={setBoard} options={BOARDS.map((x) => ({ value: x.key, label: x.label }))} />
        <p className="m-0 px-1 text-[12px] font-semibold text-muted">
          {b.hint[0].toUpperCase() + b.hint.slice(1)}. Считаем на одно дежурство, поэтому стаж не важен. В рейтинге — от {MIN_SHIFTS} дежурств.
        </p>
        {ranked.length === 0 ? (
          <Empty>Пока ни у кого нет {MIN_SHIFTS} дежурств</Empty>
        ) : (
          <Card className="divide-y divide-surface2 overflow-hidden">
            {ranked.map((k, i) => (
              <div key={k.id} className={`flex items-center gap-3 px-4 py-3 ${k.id === user.id ? 'bg-teal/5' : ''}`}>
                <span className={`w-6 text-center text-[17px] font-extrabold ${i === 0 ? 'text-amber' : 'text-muted'}`}>{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-bold">
                    {k.name}
                    <span className="ml-1.5 text-[14px]">{earned(k).map((x) => x.icon).join('')}</span>
                  </span>
                  <span className="text-[12px] font-semibold text-muted">
                    {k.shifts} {plural(k.shifts, 'дежурство', 'дежурства', 'дежурств')} · с {shortDate(k.since)}
                  </span>
                </span>
                <span className="text-[18px] font-extrabold">{b.format(b.value(k))}</span>
              </div>
            ))}
          </Card>
        )}
        {newbies.length > 0 && (
          <p className="m-0 px-1 text-[12px] font-semibold text-muted">
            Пока мало дежурств: {newbies.map((k) => `${k.name} (${k.shifts})`).join(', ')}
          </p>
        )}
      </Section>
    </div>
  );
}
