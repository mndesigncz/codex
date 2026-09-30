'use client';

import React from 'react';
import { ErrorState } from './ErrorState';
import { useT } from '@/lib/i18n/client';

// Pojistka kolem každé obrazovky.
//
// Jedna komponenta, která si sáhne na `d.tables.length` dřív, než data
// dorazila, dokáže bez tohohle shodit celou aplikaci na bílou stránku
// s anglickou hláškou „Application error". Po ní člověk neví, jestli
// přišel o rozdělanou uzávěrku. Tady se chyba zastaví u jedné sekce:
// zbytek aplikace — menu, dock, přepínání obrazovek — žije dál.
//
// `resetKey` se mění při přepnutí obrazovky, takže spadlá sekce se
// sama vrátí do pořádku, jakmile z ní člověk odejde a zase přijde.

type Props = {
  children: React.ReactNode;
  resetKey?: string | number;
  /** Oblast, která se nenačetla (už přeložený název): titulek „{oblast} se nenačetla". */
  oblast?: string;
  /** Záložka, která se nenačetla (už přeložený název): titulek „{zalozka}: tahle část se nenačetla". */
  zalozka?: string;
};
type State = { error: Error | null };

/** Obsah chybové karty: třída nemůže použít hook, takže překládá tahle malá komponenta. */
function ChybaSekce({ oblast, zalozka, detail, onRetry }: { oblast?: string; zalozka?: string; detail: string; onRetry: () => void }) {
  const t = useT('spolecne');
  return (
    <div className="px-6 py-4 w-full max-w-3xl mx-auto">
      <div className="card">
        <ErrorState
          title={zalozka ? t('{zalozka}: tahle část se nenačetla', { zalozka }) : oblast ? t('{oblast} se nenačetla', { oblast }) : t('Tahle část se nenačetla')}
          hint={t('Ostatní části aplikace fungují dál. Zkus to načíst znovu — rozdělaná práce jinde zůstává.')}
          onRetry={onRetry}
          detail={detail}
        />
      </div>
    </div>
  );
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    // Do konzole, ať to jde dohledat; uživateli stačí česká věta níž.
    console.error('[Managero] sekce spadla:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ChybaSekce oblast={this.props.oblast} zalozka={this.props.zalozka} detail={this.state.error.message} onRetry={() => this.setState({ error: null })} />;
  }
}

export default ErrorBoundary;
