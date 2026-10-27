// Hodnocení směny jako celku v ukázce (/api/hodnoceni-smeny) — stejný tvar jako skutečná routa,
// výpočty z lib/hodnoceniSmeny (skupiny směn dne, vstup okna, pohled člena). Jen v paměti.

import { chyba, ok, type Obsluha } from '../typy';
import { KDO_JSEM, LIDE, clen } from '../data/lide';
import { posunDen } from '../cas';
import type { DemoStav } from '../stav';
import { mojeRole } from './zaklad';
import { normalizujVstup, proClena, skupinySmen, type HodnoceniProClena } from '@/lib/hodnoceniSmeny';

export interface HodnoceniSmenyDemo {
  id: number; den: string; klic: string; nazev: string | null; od: string | null; do: string | null; hvezdy: number;
  dobre: string | null; kritika: string | null; stitky: Record<string, 'plus' | 'minus'>; kNaprave: boolean; foto: string | null;
  osadka: number[]; videli: number[]; body: { id: number; body: number; poznamka: string | null }[];
  kdo: string | null; upraveno: string | null;
}

/** Hodnocení v ukázce; první volání založí ukázkové hodnocení včerejší ranní směny (pochvala i kritika). */
export function hodnoceniUkazky(s: DemoStav): HodnoceniSmenyDemo[] {
  if (!s.hodnoceniSmen) {
    const vcera = posunDen(s.dnes, -1);
    const sk = skupinySmen(s.smeny.filter(x => x.date === vcera).map(x => ({ employeeId: x.employeeId, jmeno: clen(x.employeeId).name, od: x.startTime, do: x.endTime, nazev: x.type })));
    const prvni = sk[0];
    const osadka = Array.from(new Set([...(prvni?.lide ?? []).map(l => l.id), KDO_JSEM.zamestnanec]));
    s.hodnoceniSmen = [{
      id: 1, den: vcera, klic: prvni?.klic ?? 'den', nazev: prvni?.nazev ?? null, od: prvni?.od ?? null, do: prvni?.do ?? null, hvezdy: 4,
      dobre: 'Ranní nával jste zvládli bez front, hosté chválili kávu.', kritika: 'Na konci směny zůstal neumytý mlýnek a prázdné mléko v lednici.',
      stitky: { rychlost: 'plus', hoste: 'plus', cistota: 'minus' }, kNaprave: false, foto: null,
      osadka, videli: [], body: osadka.map((id, i) => ({ id, body: i === 0 ? 5 : 3, poznamka: null })),
      kdo: clen(KDO_JSEM.vedeni).name, upraveno: `${vcera}T20:30:00Z`,
    }];
  }
  return s.hodnoceniSmen as HodnoceniSmenyDemo[];
}

/** Pohled člena pro /api/rewards (z bodů jen jeho). */
export function smenyClena(s: DemoStav, kdo: number): (HodnoceniProClena & { den: string })[] {
  return hodnoceniUkazky(s).map(h => proClena(h, kdo)).filter((x): x is HodnoceniProClena => !!x)
    .sort((a, b) => b.den.localeCompare(a.den));
}

export const hodnoceniSmeny: Obsluha = (p, k) => {
  if (p.cesta !== '/api/hodnoceni-smeny') return undefined;
  const s = k.stav;
  const meId = KDO_JSEM[s.role];
  const opr = new Set(mojeRole(s).opravneni);
  const vse = hodnoceniUkazky(s);

  if (p.metoda === 'GET' && p.q.get('moje') === '1') return ok({ hodnoceni: smenyClena(s, meId) });
  if (p.metoda === 'POST' && p.telo?.videno === true) {
    for (const h of vse) if (h.osadka.includes(meId) && !h.videli.includes(meId)) h.videli.push(meId);
    return ok({ ok: true });
  }
  if (!opr.has('hodnoceni.zobrazit')) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
  const smi = opr.has('hodnoceni.hodnotit');

  if (p.metoda === 'GET') {
    const den = p.q.get('den');
    if (den) {
      const sk = skupinySmen(s.smeny.filter(x => x.date === den).map(x => ({ employeeId: x.employeeId, jmeno: clen(x.employeeId).name, avatar: clen(x.employeeId).avatar, od: x.startTime, do: x.endTime, nazev: x.type })));
      const dne = vse.filter(h => h.den === den);
      for (const h of dne) if (!sk.some(x => x.klic === h.klic)) sk.push({ klic: h.klic, nazev: h.nazev, od: h.od, do: h.do, lide: h.osadka.map(id => ({ id, jmeno: clen(id).name, avatar: clen(id).avatar })) });
      return ok({ den, skupiny: sk, hodnoceni: dne, smiHodnotit: smi, pripominat: s.hodnoceniPripominat === true,
        clenove: LIDE.filter(l => l.role !== 'kiosk').map(l => ({ id: l.id, jmeno: l.name, avatar: l.avatar })) });
    }
    const od = p.q.get('od') ?? s.dnes, doo = p.q.get('do') ?? od;
    return ok({ od, do: doo, hodnoceni: vse.filter(h => h.den >= od && h.den <= doo), smiHodnotit: smi });
  }
  if (!smi) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
  if (p.metoda === 'PATCH') {
    s.hodnoceniPripominat = p.telo?.pripominat === true;
    return ok({ ok: true, pripominat: s.hodnoceniPripominat });
  }
  if (p.metoda === 'DELETE') {
    const id = Number(p.q.get('id'));
    s.hodnoceniSmen = vse.filter(h => h.id !== id);
    return ok({ ok: true });
  }
  const n = normalizujVstup(p.telo);
  if (!n.ok) return chyba(n.chyba);
  const v = n.v;
  const predtim = vse.find(h => h.den === v.den && h.klic === v.klic) ?? null;
  const h: HodnoceniSmenyDemo = {
    id: predtim?.id ?? s.dalsiId++, den: v.den, klic: v.klic, nazev: v.nazev, od: v.od, do: v.do, hvezdy: v.hvezdy, dobre: v.dobre, kritika: v.kritika,
    stitky: v.stitky as Record<string, 'plus' | 'minus'>, kNaprave: v.kNaprave, foto: v.foto, osadka: v.osadka, videli: [], body: v.body,
    kdo: clen(meId).name, upraveno: new Date().toISOString(),
  };
  s.hodnoceniSmen = [...vse.filter(x => x !== predtim), h];
  k.hlas('smena-ohodnocena', { den: v.den, lidi: v.osadka.length, celaSmena: true });
  return ok({ ok: true, nove: !predtim, hodnoceni: h, zmeny: [] });
};
