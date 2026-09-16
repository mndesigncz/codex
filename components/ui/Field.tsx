'use client';

import React from 'react';

// Formulářové pole Managera 2: popisek nad polem, nápověda pod ním, chyba
// červeně pod polem. Jedna podoba pole pro celou aplikaci (třída .field
// v globals.css) — dřív jich bylo osm kopií s různým odsazením.

export function Label({ htmlFor, children, className = '' }: { htmlFor?: string; children: React.ReactNode; className?: string }) {
  return <label htmlFor={htmlFor} className={`field-label ${className}`}>{children}</label>;
}

export function Field({ id, label, hint, error, children, className = '' }: {
  id?: string; label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {children}
      {error ? <p role="alert" className="mt-1.5 text-xs text-[var(--bad-ink)]">{error}</p>
        : hint ? <p className="mt-1.5 text-xs text-black/50">{hint}</p> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`field ${className}`} {...rest} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', children, ...rest }, ref) {
  return <select ref={ref} className={`field ${className}`} {...rest}>{children}</select>;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`field resize-none ${className}`} {...rest} />;
});

export default Field;
