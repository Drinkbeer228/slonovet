const PATHS = {
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  cloud: 'M17.5 19H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 11a4 4 0 0 1-1.5 8z',
  cloudOff: 'M17.5 19H7a5 5 0 0 1-1.6-9.7 M9.5 5.5A6 6 0 0 1 19 11a4 4 0 0 1 1.7 6.4 M3 3l18 18',
  shift: 'M7 4h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M9 4V2.5h6V4 M9 12l2 2 4-4 M9 18h6',
  bowl: 'M3 11h18a9 9 0 0 1-18 0z M8 7c0-2 2-2 2-4 M13 7c0-2 2-2 2-4',
  box: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z M3 7.5 12 12l9-4.5 M12 12v9',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5 M8 7h7',
  pulse: 'M3 12h4l3 8 4-16 3 8h4',
  message: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1 M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M22 20v-1a4 4 0 0 0-3-3.9 M16 4.2a3.5 3.5 0 0 1 0 6.6',
  user: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1 M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  logout: 'M15 3h4v18h-4 M10 17l5-5-5-5 M15 12H3',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  leaf: 'M5 19c8 0 14-6 14-14-8 0-14 6-14 14z M5 19l7-7',
  sparkle: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2 2 M16 16l2 2 M6 18l2-2 M16 8l2-2',
  puzzle: 'M10 4a2 2 0 1 1 4 0v2h4v4h-1.5a2 2 0 1 0 0 4H18v4h-4v-1.5a2 2 0 1 0-4 0V18H6v-4h1.5a2 2 0 1 0 0-4H6V6h4z',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  note: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 13h8 M8 17h5',
  truck: 'M2 6h12v10H2z M14 10h4l3 3v3h-7 M6 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  question: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17h.01',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5v1a3 3 0 0 0 3 3 M16 6h3v1a3 3 0 0 1-3 3 M12 13v4 M8 21h8 M10 17h4v4h-4z',
  key: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M12 10v11 M12 15h3 M12 18h2',
  syringe: 'M18 2l4 4 M17 7l-9.5 9.5-3-3L14 4 M4.5 16.5 2 22l5.5-2.5 M11 7l3 3 M8.5 9.5l3 3',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 2, className = '' }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
