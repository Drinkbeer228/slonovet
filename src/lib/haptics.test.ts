// Виброотклик: где браузер умеет — вибрирует нужным рисунком, где нет (iPhone) или сломалось — молча.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptics } from './haptics';

const nav = navigator as unknown as { vibrate?: unknown };
const original = Object.getOwnPropertyDescriptor(nav, 'vibrate');
afterEach(() => {
  if (original) Object.defineProperty(nav, 'vibrate', original);
  else delete nav.vibrate;
});

describe('виброотклик', () => {
  it('Android: щелчок и двойной отклик — своими рисунками', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(nav, 'vibrate', { value: vibrate, configurable: true });
    haptics.tap();
    haptics.success();
    expect(vibrate.mock.calls).toEqual([[12], [[15, 30, 15]]]);
  });

  it('iPhone (вибрации нет) — без ошибок', () => {
    delete nav.vibrate;
    expect('vibrate' in navigator).toBe(false);
    expect(() => haptics.success()).not.toThrow();
  });

  it('вибрация бросила ошибку — нажатие не ломается', () => {
    Object.defineProperty(nav, 'vibrate', { value: () => { throw new Error('нельзя'); }, configurable: true });
    expect(() => haptics.error()).not.toThrow();
  });
});
