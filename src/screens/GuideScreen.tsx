import { useState } from 'react';
import { GUIDE } from '../domain/guide';
import { Button, Card, Section, Segmented } from '../ui/kit';
import { startTour } from './Tour';
import { WhyList } from './common/Why';

export function GuideScreen() {
  const [part, setPart] = useState<'guide' | 'why'>('guide');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Справка</h1>
        <Button icon="question" onClick={startTour}>
          Подсказки
        </Button>
      </div>
      <Segmented
        label="Раздел"
        value={part}
        onChange={setPart}
        options={[
          { value: 'guide', label: 'Справка' },
          { value: 'why', label: 'Почему так?' },
        ]}
      />
      {part === 'why' && <WhyList />}
      {part === 'guide' &&
        GUIDE.map((s) => (
          <Section key={s.id} title={s.title} id={s.id}>
            <Card className="divide-y divide-surface2 overflow-hidden">
              {s.items.map((it, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  {it.head && <span className="w-[92px] shrink-0 text-[14px] font-extrabold text-teal">{it.head}</span>}
                  <span className="text-[15px] leading-snug text-ink2">{it.text}</span>
                </div>
              ))}
            </Card>
            {s.note && <p className="m-0 px-1 text-[12px] font-semibold text-muted">{s.note}</p>}
          </Section>
        ))}
    </div>
  );
}
