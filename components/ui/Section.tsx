import React from 'react';
import { Icon } from '../Icons';

// Nadpis sekce uvnitř obrazovky: titulek vlevo, jedna akce vpravo. Jedna
// velikost pro celou aplikaci (h2 = 18 px semibold) — dřív jich bylo devět.

export function Section({ title, hint, action, icon, children, className = '', id }: {
  title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; icon?: string;
  children?: React.ReactNode; className?: string; id?: string;
}) {
  return (
    <section aria-labelledby={id} className={`space-y-3 ${className}`}>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 id={id} className="t-section flex items-center gap-2">
            {icon && <Icon name={icon} size={17} className="shrink-0 text-black/40" />}
            {title}
          </h2>
          {hint && <p className="t-meta mt-0.5 text-pretty">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export default Section;
