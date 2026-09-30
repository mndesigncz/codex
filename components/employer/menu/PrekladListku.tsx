'use client';

import { Card, Field, Input } from '../../ui';
import { JAZYK_NAZEV, type Jazyk } from '@/lib/i18n/config';
import { nastavPreklad, type Preklady } from '@/lib/menu';

// Seznam pro překlad lístku do jednoho jazyka: deska, sekce a položky.
//
// Výchozí text stojí šedě (placeholder i řádek nad polem), prázdné pole znamená
// „použije se výchozí". Překládá se jen text: cena, vyprodáno, alergeny a pořadí
// se tady nemění, takže překlad nemůže rozbít nic, co hostovi říká pravdu.
// Ruční text je jediný zdroj (strojový překlad tlačítkem je později, plán §9 bod 7).

interface Polozka { name: string; description?: string | null; i18n?: Preklady<'name' | 'description'> }
interface Sekce { title: string; i18n?: Preklady<'title'>; items: Polozka[] }
interface Deska {
  eyebrow: string | null; title: string | null; note: string | null;
  i18n?: Preklady<'eyebrow' | 'title' | 'note'>;
  sections: Sekce[];
}

export default function PrekladListku({ deska, jazyk, upravit, zamceno, uid }: {
  deska: Deska;
  jazyk: Jazyk;
  /** Změna nad rozpracovanou kopií desky (označí neuložené změny). */
  upravit: (fn: (b: Deska) => void) => void;
  zamceno: boolean;
  uid: string;
}) {
  const nazev = JAZYK_NAZEV[jazyk];
  const hodnota = <K extends string>(p: Preklady<K> | undefined, pole: K) => (p?.[jazyk]?.[pole] as string | undefined) ?? '';

  return (
    <div className="space-y-4" lang={jazyk}>
      <Card className="space-y-3">
        <div>
          <h2 className="t-card">Překlad: {nazev}</h2>
          <p className="t-meta mt-1 text-pretty">Šedě je výchozí text. Nech pole prázdné, když se má použít výchozí.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${uid}-pt-nad`} label="Popisek nad nadpisem" hint={deska.eyebrow ? `Výchozí: ${deska.eyebrow}` : undefined}>
            <Input id={`${uid}-pt-nad`} value={hodnota(deska.i18n, 'eyebrow')} maxLength={80} disabled={zamceno} placeholder={deska.eyebrow ?? ''}
              onChange={(e) => upravit((b) => { b.i18n = nastavPreklad(b.i18n, jazyk, 'eyebrow', e.target.value); })} />
          </Field>
          <Field id={`${uid}-pt-titul`} label="Nadpis" hint={deska.title ? `Výchozí: ${deska.title}` : undefined}>
            <Input id={`${uid}-pt-titul`} value={hodnota(deska.i18n, 'title')} maxLength={80} disabled={zamceno} placeholder={deska.title ?? ''}
              onChange={(e) => upravit((b) => { b.i18n = nastavPreklad(b.i18n, jazyk, 'title', e.target.value); })} />
          </Field>
          <Field id={`${uid}-pt-pozn`} label="Poznámka v patičce" className="sm:col-span-2"
            hint={deska.note ? `Výchozí: ${deska.note}` : 'Bez poznámky se v patičce nic neukáže. Výchozí větu o alergenech přidá stránka sama.'}>
            <Input id={`${uid}-pt-pozn`} value={hodnota(deska.i18n, 'note')} maxLength={200} disabled={zamceno} placeholder={deska.note ?? ''}
              onChange={(e) => upravit((b) => { b.i18n = nastavPreklad(b.i18n, jazyk, 'note', e.target.value); })} />
          </Field>
        </div>
      </Card>

      {deska.sections.map((s, si) => (
        <Card key={(s as any).id ?? `nova-${si}`} as="section" aria-label={`Překlad sekce ${s.title || si + 1}`} className="space-y-3">
          <Field id={`${uid}-pt-s${si}`} label={`Sekce: ${s.title || 'bez názvu'}`}>
            <Input id={`${uid}-pt-s${si}`} value={hodnota(s.i18n, 'title')} maxLength={80} disabled={zamceno} placeholder={s.title}
              onChange={(e) => upravit((b) => { b.sections[si].i18n = nastavPreklad(b.sections[si].i18n, jazyk, 'title', e.target.value); })} />
          </Field>
          {s.items.length > 0 && (
            <ul className="list">
              {s.items.map((it, ii) => (
                <li key={(it as any).id ?? `nova-${ii}`} className="py-3 space-y-2">
                  <p className="text-[13px] text-black/55 truncate">{it.name || 'Položka bez názvu'}{it.description ? ` · ${it.description}` : ''}</p>
                  <Input value={hodnota(it.i18n, 'name')} maxLength={80} disabled={zamceno} placeholder={it.name || 'Název'}
                    aria-label={`Název v jazyce ${nazev}: ${it.name || 'nová položka'}`}
                    onChange={(e) => upravit((b) => { b.sections[si].items[ii].i18n = nastavPreklad(b.sections[si].items[ii].i18n, jazyk, 'name', e.target.value); })} />
                  {it.description ? (
                    <Input value={hodnota(it.i18n, 'description')} maxLength={200} disabled={zamceno} placeholder={it.description}
                      aria-label={`Popisek v jazyce ${nazev}: ${it.name || 'nová položka'}`}
                      onChange={(e) => upravit((b) => { b.sections[si].items[ii].i18n = nastavPreklad(b.sections[si].items[ii].i18n, jazyk, 'description', e.target.value); })} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
