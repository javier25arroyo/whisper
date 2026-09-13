/** Glifos de sol para la identidad "Dos Soles" (ver MASTER.md). Deliberadamente sin el
 * patrón de rayos del Kyokujitsu-ki: el sol JA es una curva de amanecer minimalista, el
 * sol ES es un disco con rayos cortos y simétricos (glifo de sol genérico, no una bandera). */

export function SunWarmIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="12"
          y1="3.5"
          x2="12"
          y2="1.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </svg>
  );
}

export function SunDawnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 15a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="4" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="5.5" y1="7.5" x2="7" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="18.5" y1="7.5" x2="17" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SunToggleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="12"
          y1="3"
          x2="12"
          y2="1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </svg>
  );
}

export function MoonToggleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
