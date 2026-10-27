import { describe, expect, it } from 'vitest';
import { isStandalone, platform } from './install';

const win = (standaloneMedia: boolean, iosStandalone?: boolean) =>
  ({ navigator: { standalone: iosStandalone }, matchMedia: () => ({ matches: standaloneMedia }) }) as unknown as Window;
const nav = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints });

describe('установка на экран телефона', () => {
  it('открыто с иконки — по display-mode или по navigator.standalone (iPhone)', () => {
    expect(isStandalone(win(true))).toBe(true);
    expect(isStandalone(win(false, true))).toBe(true);
    expect(isStandalone(win(false))).toBe(false);
  });

  it('iPhone, iPad (в том числе «Macintosh» с тачскрином) и Android различаются', () => {
    expect(platform(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'))).toBe('ios');
    expect(platform(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5))).toBe('ios');
    expect(platform(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0))).toBe('other');
    expect(platform(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8)'))).toBe('android');
    expect(platform(nav('Mozilla/5.0 (X11; Linux x86_64) Firefox/158.0'))).toBe('other');
  });
});
