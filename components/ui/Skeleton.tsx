import React from 'react';

// Kostra načítání ve tvaru obsahu, ne kolečko uprostřed.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`rounded-2xl bg-black/[0.05] animate-pulse ${className}`} />;
}

/** Kostra celé obrazovky: nadpis, karta, dvě dlaždice, karta. */
export function PageSkeleton({ tiles = 2 }: { tiles?: number }) {
  return (
    <div className="p-4 sm:p-6 space-y-5" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 rounded-full" />
        <Skeleton className="h-4 w-72 max-w-full rounded-full" />
      </div>
      <Skeleton className="h-28 rounded-[28px]" />
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))` }}>
        {Array.from({ length: tiles }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[28px]" />)}
      </div>
      <Skeleton className="h-40 rounded-[28px]" />
    </div>
  );
}

export default Skeleton;
