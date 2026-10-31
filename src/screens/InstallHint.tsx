import { useState, useSyncExternalStore } from 'react';
import { platform, promptInstall, useInstall, type Platform } from '../lib/install';
import { Button, KEY, Plate, Segmented, Sheet, toast, GlowIcon } from '../ui/kit';
import { Icon } from '../ui/Icon';

/**
 * Подсказки об установке включены снова (31.10): чёрный экран с иконки на iPhone — страница из памяти ссылалась на
 * удалённые файлы прошлой сборки. Теперь старые файлы не удаляются при выкладке, хранятся в памяти телефона,
 * а если файл всё же не загрузился — страница сама берёт свежую с сервера или показывает «Перезапустить» (index.html).
 * На iPhone push работает только с иконки на экране «Домой» — поэтому подсказка нужна.
 */
export const INSTALL_HINTS = true;

/* ---------- шторка с инструкцией: открывается из баннера и из меню ---------- */

let open = false;
const listeners = new Set<() => void>();
export function openInstallSheet() {
  open = true;
  listeners.forEach((l) => l());
}
function close() {
  open = false;
  listeners.forEach((l) => l());
}
const useOpen = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );

const WHY = 'Так данные на телефоне не сотрутся, приложение откроется с иконки в одно касание, и будут приходить уведомления.';

function Steps({ os }: { os: Platform }) {
  const step = (n: number, body: React.ReactNode) => (
    <li className="flex gap-3">
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-extrabold ${KEY}`}>{n}</span>
      <span className="pt-0.5 text-[15px] leading-snug">{body}</span>
    </li>
  );
  if (os === 'ios')
    return (
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {step(1, <>Открой slonovet.ru в <b>Safari</b> (в других браузерах на iPhone так нельзя).</>)}
        {step(
          2,
          <>
            Нажми «Поделиться» <Icon name="share" size={17} className="inline align-[-3px] text-teal" /> внизу экрана (в новых iOS — сначала «⋯»).
          </>,
        )}
        {step(3, <>Прокрути и выбери «На экран „Домой"».</>)}
        {step(4, <>Нажми «Добавить» и дальше открывай СлоноВет с иконки.</>)}
      </ol>
    );
  if (os === 'android')
    return (
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {step(1, <>Открой slonovet.ru в <b>Chrome</b>.</>)}
        {step(2, <>Нажми ⋮ справа вверху.</>)}
        {step(3, <>Выбери «Установить приложение» (или «Добавить на главный экран»).</>)}
      </ol>
    );
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {step(1, <>В Chrome или Edge нажми значок установки справа в адресной строке.</>)}
      {step(2, <>Или меню ⋮ → «Установить СлоноВет».</>)}
    </ol>
  );
}

/** Как поставить на экран телефона — для iPhone, Android и компьютера. Одна на всё приложение (в App). */
export function InstallSheet() {
  const isOpen = useOpen();
  const { canPrompt, installed } = useInstall();
  const [os, setOs] = useState<Platform>(() => platform());
  return (
    <Sheet open={isOpen} onClose={close} title="Установить на устройство">
      <div className="flex flex-col gap-5">
        {installed ? (
          <p className="m-0 text-[15px] text-ink2">Уже установлено — ты открыл СлоноВет с иконки.</p>
        ) : (
          <>
            <p className="m-0 text-[15px] leading-snug text-ink2">{WHY}</p>
            {canPrompt && (
              <Button
                kind="primary"
                big
                full
                icon="install"
                onClick={async () => {
                  if (await promptInstall()) toast('Установлено');
                  close();
                }}
              >
                Установить приложение
              </Button>
            )}
            <Segmented
              label="Телефон"
              value={os}
              onChange={setOs}
              options={[
                { value: 'ios', label: 'iPhone' },
                { value: 'android', label: 'Android' },
                { value: 'other', label: 'Компьютер' },
              ]}
            />
            <Steps os={os} />
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- плашка над содержимым: только в браузере, не с иконки ---------- */

const DISMISS_KEY = 'slonovet_install_dismissed';
const DISMISS_DAYS = 14;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Открыли сайт во вкладке браузера — предложить поставить на экран. «Не сейчас» прячет на 14 дней. */
export function InstallBanner() {
  const { canPrompt, installed } = useInstall();
  const [hidden, setHidden] = useState(dismissedRecently);
  if (!INSTALL_HINTS || installed || hidden) return null;
  const os = platform();
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* не запомнится — покажем в следующий раз */
    }
    setHidden(true);
  };
  return (
    <Plate glow="teal" className="mb-4 flex flex-col gap-2.5 p-3.5">
      <span className="flex gap-2.5">
        <GlowIcon glow="teal" icon="install" />
        <span className="flex flex-col gap-0.5">
          <span className="text-[14px] font-bold">Поставь СлоноВет на экран телефона</span>
          {os === 'ios' && !canPrompt ? (
            <span className="text-[13px] font-semibold leading-snug text-muted">
              В Safari: «Поделиться» <Icon name="share" size={14} className="inline align-[-2px] text-teal" /> внизу (или «⋯» → «Поделиться») → «На экран „Домой"». Данные не сотрутся, будут приходить уведомления.
            </span>
          ) : (
            <span className="text-[13px] font-semibold leading-snug text-muted">{WHY}</span>
          )}
        </span>
      </span>
      <div className="flex gap-2">
        {canPrompt ? (
          <Button kind="accent" icon="install" onClick={() => promptInstall()}>
            Установить приложение
          </Button>
        ) : (
          <Button onClick={openInstallSheet}>Как это сделать</Button>
        )}
        <Button onClick={dismiss}>Не сейчас</Button>
      </div>
    </Plate>
  );
}
