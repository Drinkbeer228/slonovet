import { useState } from 'react';
import { WHY, whyById, type WhyItem } from '../../domain/why';
import { Card, Section, Sheet } from '../../ui/kit';
import { Icon } from '../../ui/Icon';

function Answer({ item }: { item: WhyItem }) {
  return (
    <div className="flex flex-col gap-2">
      {item.a.map((p, i) => (
        <p key={i} className="m-0 text-[15px] leading-relaxed text-ink2">
          {p}
        </p>
      ))}
      {item.local && <p className="m-0 text-[12px] font-semibold text-muted">Местное правило.</p>}
      {item.source && <p className="m-0 text-[12px] font-semibold text-muted">Источник: {item.source}</p>}
    </div>
  );
}

/** Ссылка «почему?» рядом с делом — открывает ответ из «Почему так?» в Справке. */
export function WhyLink({ id, label = 'почему?' }: { id: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const item = whyById(id);
  if (!item) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="-my-1.5 inline-flex min-h-11 items-center gap-1 text-[13px] font-bold text-teal">
        <Icon name="question" size={16} />
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={item.q}>
        <Answer item={item} />
      </Sheet>
    </>
  );
}

/** Весь список вопросов — в «Справке». */
export function WhyList() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {WHY.map((g) => (
        <Section key={g.title} title={g.title}>
          <Card className="divide-y divide-surface2 overflow-hidden">
            {g.items.map((it) => {
              const on = open === it.id;
              return (
                <div key={it.id} id={`why-${it.id}`}>
                  <button
                    type="button"
                    aria-expanded={on}
                    onClick={() => setOpen(on ? null : it.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="flex-1 text-[15px] font-bold leading-snug">{it.q}</span>
                    <Icon name="down" size={18} className={`shrink-0 text-muted transition ${on ? 'rotate-180' : ''}`} />
                  </button>
                  {on && (
                    <div className="px-4 pb-4">
                      <Answer item={it} />
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </Section>
      ))}
    </>
  );
}
