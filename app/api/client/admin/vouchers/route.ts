// Dárkové poukazy: seznam s hledáním a stránkováním, detail s historií, založení (i dávka do 100 kusů),
// zrušení, úprava platnosti a poznámky, vrácení omylem uplatněné částky a export CSV.
// Oprávnění: poukazy.zobrazit (čtení; detail i poukazy.uplatnit), poukazy.spravovat (vytvářet, rušit, upravovat, exportovat kódy).
// Uplatnění částky je zvlášť v ./redeem (poukazy.uplatnit, to má i obsluha).

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { menaPodniku } from '@/lib/menaPodniku';
import { pragueToday } from '@/lib/pragueTime';
import { celaCastka, hodnotyDavky, jeDatum, poukazyCsv, normalizujLimity, normalizujNastaveniPoukazu, overNovouPlatnost, idPoukazu, DUVOD_TEXT, MAX_DAVKA } from '@/lib/poukazy';
import { overSablonu } from '@/lib/poukazySablony';
import { overRozsahExportu, mesicniCsv, pohybyCsv } from '@/lib/poukazyUcetni';
import { emailObdarovaneho, vzkazDarce } from '@/lib/poukazyEmail';
import { hit } from '@/lib/rateLimit';
import { seznamPoukazu, poukazPodleId, historiePoukazu, vytvorPoukazy, zrusPoukaz, upravPoukaz, vratPoukaz, ulozLimity, nactiLimity } from '@/lib/poukazyDb';
import { prehledPoukazu, prodlouzPoukazy, nahledProdlouzeni, odesliPoukaz } from '@/lib/poukazyPrehledDb';
import {
  nactiNastaveniPoukazu, ulozNastaveniPoukazu, poukazBezBodu, priradPoukaz, jmenoClena, pripisBodyZaNakup, pohybyProExport, souhrnProExport, zmenVzhled,
} from '@/lib/poukazyHostDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const id = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };
const nedostupne = (e: unknown) => { console.error('[poukazy]', e); return NextResponse.json({ error: 'Poukazy se teď nepodařilo načíst. Zkus to za chvíli.' }, { status: 500 }); };

export async function GET(req: NextRequest) {
  // Detail jednoho poukazu smí i obsluha, která poukazy jen uplatňuje (našla ho podle kódu); seznam jen kdo je smí vidět.
  const ctx = await pozaduj(['poukazy.zobrazit', 'poukazy.uplatnit']);
  if (jeOdpoved(ctx)) return ctx;
  const u = req.nextUrl.searchParams;
  const dnes = pragueToday();
  const jeden = id(u.get('id'));
  if (!jeden && !ctx.role.opravneni.has('poukazy.zobrazit')) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
  try {
    if (jeden) {
      const poukaz = await poukazPodleId(ctx.teamId, jeden, dnes);
      if (!poukaz) return NextResponse.json({ error: 'Poukaz nenalezen.' }, { status: 404 });
      // Jména členů (majitel a kupující) jen správci; obsluha, která poukaz uplatňuje, je nepotřebuje.
      const sprava = ctx.role.opravneni.has('poukazy.spravovat');
      const clen = sprava && poukaz.customer_id ? await jmenoClena(ctx.teamId, poukaz.customer_id) : null;
      const kupujici = sprava && poukaz.buyer_customer_id ? await jmenoClena(ctx.teamId, poukaz.buyer_customer_id) : null;
      return NextResponse.json({ poukaz, historie: await historiePoukazu(ctx.teamId, jeden), limity: await nactiLimity(ctx.teamId), clen, kupujici });
    }
    // Přehled závazku a měsíců (jen správci: jsou to čísla o penězích podniku).
    if (u.get('prehled') === '1') {
      if (!ctx.role.opravneni.has('poukazy.spravovat')) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
      return NextResponse.json({ ...(await prehledPoukazu(ctx.teamId, dnes)), dnes, nastaveni: await nactiNastaveniPoukazu(ctx.teamId), poukazBezBodu: await poukazBezBodu(ctx.teamId) });
    }
    // Export pro účetnictví: měsíční souhrn nebo deník pohybů za rozsah měsíců (jen správci, jsou to čísla o penězích).
    if (u.get('export') === 'mesice' || u.get('export') === 'pohyby') {
      if (!ctx.role.opravneni.has('poukazy.spravovat')) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
      const r = overRozsahExportu(u.get('od'), u.get('do'), dnes.slice(0, 7));
      if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: 400 });
      let telo: string;
      if (u.get('export') === 'mesice') { const s = await souhrnProExport(ctx.teamId, r.od, r.do); telo = mesicniCsv(s.radky, s.mena); }
      else telo = pohybyCsv(await pohybyProExport(ctx.teamId, r.od, r.do));
      return new NextResponse(telo, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="poukazy-${u.get('export')}-${r.od}-${r.do}.csv"`, 'Cache-Control': 'private, no-store' },
      });
    }
    // Náhled hromadného prodloužení: kolik poukazů a na kolik peněz by se dotklo.
    if (u.get('nahled') === 'prodlouzeni') {
      if (!ctx.role.opravneni.has('poukazy.spravovat')) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
      const novy = overNovouPlatnost(u.get('novy'), dnes);
      const doDne = u.get('doDne');
      if (!novy.ok) return NextResponse.json({ error: novy.chyba }, { status: 400 });
      if (!jeDatum(doDne)) return NextResponse.json({ error: 'Vyber, kterým poukazům končí platnost.' }, { status: 400 });
      return NextResponse.json(await nahledProdlouzeni(ctx.teamId, dnes, novy.datum, doDne, u.get('propadle') === '1'));
    }
    if (u.get('export') === 'csv') {
      // Export nese všechny kódy najednou, a kdo kód zná, může s ním platit: jen správce.
      if (!ctx.role.opravneni.has('poukazy.spravovat')) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
      const { poukazy } = await seznamPoukazu(ctx.teamId, { q: u.get('q') ?? '', stav: u.get('stav') ?? '', vse: true }, dnes);
      return new NextResponse(poukazyCsv(poukazy, dnes), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="poukazy-${dnes}.csv"`, 'Cache-Control': 'private, no-store' },
      });
    }
    const r = await seznamPoukazu(ctx.teamId, { q: u.get('q') ?? '', stav: u.get('stav') ?? '', strana: Number(u.get('strana')) || 1, naStranu: Number(u.get('naStranu')) || 25 }, dnes);
    return NextResponse.json({ ...r, currency: (await menaPodniku(ctx.teamId)).currency, dnes });
  } catch (e) { return nedostupne(e); }
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('poukazy.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const dnes = pragueToday();
  const pocet = b.count == null ? 1 : Math.round(Number(b.count));
  if (!Number.isInteger(pocet) || pocet < 1 || pocet > MAX_DAVKA) return NextResponse.json({ error: `Počet poukazů je 1 až ${MAX_DAVKA}.` }, { status: 400 });
  const hodnoty = hodnotyDavky(b.values ?? b.value, pocet);
  if (!hodnoty) return NextResponse.json({ error: 'Hodnota poukazu je celé číslo větší než nula (nejvýš 1 000 000).' }, { status: 400 });
  let validUntil: string | null = null;
  if (b.validUntil) {
    if (!jeDatum(b.validUntil)) return NextResponse.json({ error: 'Platnost má být datum.' }, { status: 400 });
    if (b.validUntil < dnes) return NextResponse.json({ error: 'Platnost poukazu nemůže být v minulosti.' }, { status: 400 });
    validUntil = b.validUntil;
  }
  const vzhled = overSablonu(b.design);
  if (!vzhled.ok) return NextResponse.json({ error: vzhled.chyba }, { status: 400 });
  // Host v aplikaci: majitel poukazu a kupující (dostane body). Musí být členem tohoto podniku.
  const hostId = (v: unknown) => (v == null || v === '' ? null : id(v));
  const customerId = hostId(b.customerId), buyerCustomerId = hostId(b.buyerCustomerId);
  if ((b.customerId != null && b.customerId !== '' && !customerId) || (b.buyerCustomerId != null && b.buyerCustomerId !== '' && !buyerCustomerId)) return NextResponse.json({ error: 'Vyber hosta ze seznamu členů.' }, { status: 400 });
  if (customerId && pocet > 1) return NextResponse.json({ error: 'Dávku poukazů nejde přiřadit jednomu hostovi. Zakládej je po jednom.' }, { status: 400 });
  try {
    for (const h of [customerId, buyerCustomerId]) if (h && (await jmenoClena(ctx.teamId, h)) == null) return NextResponse.json({ error: 'Tenhle host není členem podniku.' }, { status: 404 });
    const mena = (await menaPodniku(ctx.teamId)).currency;
    const poukazy = await vytvorPoukazy(ctx.teamId, ctx.meId, mena, { hodnoty, validUntil, recipient: b.recipient, buyer: b.buyer, note: b.note, design: vzhled.id, customerId, buyerCustomerId }, dnes);
    // Body za nákup: kupující člen je dostane za každý poukaz. Selhání bodů poukaz nezruší (poukaz už existuje a platí).
    let body = 0;
    for (const p of poukazy) { try { body += await pripisBodyZaNakup(ctx.teamId, p); } catch (e) { console.error('[poukazy] body za nákup', e); } }
    return NextResponse.json({ ok: true, poukazy, body });
  } catch (e: any) {
    console.error('[poukazy] vytvoření', e);
    return NextResponse.json({ error: 'Poukazy se nepodařilo založit. Zkus to znovu.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('poukazy.spravovat');
  if (jeOdpoved(ctx)) return ctx;
  const b = await req.json().catch(() => ({}));
  const dnes = pragueToday();
  const poukazId = id(b.id);
  // Hromadné prodloužení a nastavení nepatří jednomu poukazu; ostatní akce ano.
  if (!poukazId && b.action !== 'extend' && b.action !== 'limits' && b.action !== 'settings') return NextResponse.json({ error: 'Chybí poukaz.' }, { status: 400 });
  try {
    if (b.action === 'void' && poukazId) {
      const p = await zrusPoukaz(ctx.teamId, ctx.meId, poukazId, dnes, b.note);
      if (!p) return NextResponse.json({ error: 'Poukaz nenalezen.' }, { status: 404 });
      return NextResponse.json({ ok: true, poukaz: p });
    }
    // Hromadné prodloužení: vybraná id, nebo všem, kterým platnost končí do určitého dne. Jeden příkaz v databázi.
    if (b.action === 'extend') {
      const novy = overNovouPlatnost(b.validUntil, dnes);
      if (!novy.ok) return NextResponse.json({ error: novy.chyba }, { status: 400 });
      let rozsah: { ids: number[] } | { doDne: string; vcetnePropadlych: boolean };
      if (b.ids != null) {
        const ids = idPoukazu(b.ids);
        if (!ids) return NextResponse.json({ error: 'Vyber poukazy k prodloužení (nejvýš 500).' }, { status: 400 });
        rozsah = { ids };
      } else {
        if (!jeDatum(b.doDne)) return NextResponse.json({ error: 'Vyber, kterým poukazům končí platnost.' }, { status: 400 });
        rozsah = { doDne: b.doDne, vcetnePropadlych: b.includeExpired === true };
      }
      return NextResponse.json({ ok: true, ...(await prodlouzPoukazy(ctx.teamId, ctx.meId, dnes, novy.datum, rozsah)) });
    }
    if (b.action === 'limits') {
      const l = normalizujLimity(b.min, b.max);
      if (!l.ok) return NextResponse.json({ error: l.chyba }, { status: 400 });
      if (!(await ulozLimity(ctx.teamId, ctx.meId, l.limity))) return NextResponse.json({ error: 'Podnik nemá zapnutého klienta.' }, { status: 404 });
      return NextResponse.json({ ok: true, limity: l.limity });
    }
    if (b.action === 'settings') {
      const n = normalizujNastaveniPoukazu(b.minBill, b.pointsPer100);
      if (!n.ok) return NextResponse.json({ error: n.chyba }, { status: 400 });
      if (!(await ulozNastaveniPoukazu(ctx.teamId, ctx.meId, n.nastaveni))) return NextResponse.json({ error: 'Podnik nemá zapnutého klienta.' }, { status: 404 });
      return NextResponse.json({ ok: true, nastaveni: n.nastaveni });
    }
    if (b.action === 'assign' && poukazId) {
      const hostovi = b.customerId == null || b.customerId === '' ? null : id(b.customerId);
      if (b.customerId != null && b.customerId !== '' && !hostovi) return NextResponse.json({ error: 'Vyber hosta ze seznamu členů.' }, { status: 400 });
      const r = await priradPoukaz(ctx.teamId, ctx.meId, poukazId, hostovi, dnes);
      if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: r.status });
      return NextResponse.json({ ok: true, poukaz: r.poukaz });
    }
    if (b.action === 'design' && poukazId) {
      const v = overSablonu(b.design);
      if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 400 });
      const p = await zmenVzhled(ctx.teamId, ctx.meId, poukazId, v.id, dnes);
      if (!p) return NextResponse.json({ error: 'Poukaz nenalezen, nebo je zrušený.' }, { status: 404 });
      return NextResponse.json({ ok: true, poukaz: p });
    }
    if (b.action === 'send') {
      const email = emailObdarovaneho(b.email);
      if (!email) return NextResponse.json({ error: 'Zadej platný e-mail obdarovaného.' }, { status: 400 });
      const brana = await hit(`poukaz-email:${ctx.teamId}:${ctx.meId}`, 30, 60 * 60);
      if (!brana.ok) return NextResponse.json({ error: 'Moc odeslaných e-mailů za hodinu. Zkus to za chvíli.' }, { status: 429 });
      if (!poukazId) return NextResponse.json({ error: 'Chybí poukaz.' }, { status: 400 });
      const r = await odesliPoukaz(ctx.teamId, ctx.meId, poukazId, email, vzkazDarce(b.message), dnes);
      if (!r.ok) return NextResponse.json({ error: r.chyba }, { status: r.status });
      return NextResponse.json({ ok: true, poukaz: await poukazPodleId(ctx.teamId, poukazId, dnes) });
    }
    if (!poukazId) return NextResponse.json({ error: 'Chybí poukaz.' }, { status: 400 });
    if (b.action === 'refund') {
      const castka = celaCastka(b.amount);
      if (castka == null) return NextResponse.json({ error: DUVOD_TEXT.necela }, { status: 400 });
      const r = await vratPoukaz(ctx.teamId, ctx.meId, poukazId, castka, { note: b.note, ref: b.ref, dnes });
      if (!r.ok) return NextResponse.json({ error: r.duvod === 'souboh' ? 'Poukaz se mezitím změnil. Načti ho znovu.' : DUVOD_TEXT[r.duvod] }, { status: r.duvod === 'nenalezen' ? 404 : 409 });
      return NextResponse.json({ ok: true, poukaz: r.poukaz });
    }
    const zmeny: { validUntil?: string | null; note?: string | null; recipient?: string | null; buyer?: string | null } = {};
    if ('validUntil' in b) {
      if (b.validUntil) {
        if (!jeDatum(b.validUntil)) return NextResponse.json({ error: 'Platnost má být datum.' }, { status: 400 });
        if (b.validUntil < dnes) return NextResponse.json({ error: 'Platnost poukazu nemůže být v minulosti.' }, { status: 400 });
        zmeny.validUntil = b.validUntil;
      } else zmeny.validUntil = null;
    }
    if ('note' in b) zmeny.note = b.note;
    if ('recipient' in b) zmeny.recipient = b.recipient;
    if ('buyer' in b) zmeny.buyer = b.buyer;
    if (!Object.keys(zmeny).length) return NextResponse.json({ error: 'Není co měnit.' }, { status: 400 });
    const p = await upravPoukaz(ctx.teamId, ctx.meId, poukazId, zmeny, dnes);
    if (!p) return NextResponse.json({ error: 'Poukaz nenalezen, nebo je zrušený.' }, { status: 404 });
    return NextResponse.json({ ok: true, poukaz: p });
  } catch (e) { return nedostupne(e); }
}
