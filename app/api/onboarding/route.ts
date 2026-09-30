import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { hit } from '@/lib/rateLimit';
import { teamPlanInfo } from '@/lib/planServer';
import { pocetClenu } from '@/lib/tenant';
import { verejnaHlaska } from '@/lib/verejnaChyba';
import { nactiPodnik, nactiStav, ulozStav } from '@/lib/pruvodce/stav';
import { bajtu, cistiOdpovedi, jeMalyDost, MAX_BAJTU, odeberKlice, slouciOdpovedi } from '@/lib/pruvodce/schema';
import { dalsiStav, jeKrok, STAVY, type Onboarding, type StavPruvodce } from '@/lib/pruvodce/typy';

export const dynamic = 'force-dynamic';

// Průvodce prvotním nastavením: stav a odpovědi. Smí ho vést jen vlastník
// podniku (teams.owner_id) — průvodce zakládá věci za celý podnik.
//
// GET vrací pro ostatní členy i pro podniky bez průvodce `stav: 'nedostupny'`
// se statusem 200, ne chybu: widget První kroky se ptá každého, kdo smí
// nastavení podniku, a 403 by mu ukázal „data se nenačetla".
// PUT je autosave po každém kroku: sloučí odpovědi po klíčích, nic nemaže.

const NEDOSTUPNY = { stav: 'nedostupny' as const };

export async function GET(request: Request) {
  const c = await pozaduj('podnik.nastaveni');
  if (jeOdpoved(c)) return c;
  const znovu = new URL(request.url).searchParams.get('znovu') === '1';
  try {
    const s = await nactiStav(c.teamId);
    // Před migrací a ne-vlastník: průvodce tu není. Starý podnik (NULL) ho nemá, dokud ho
    // vlastník sám nespustí („Spustit znovu"): pak dostane čistý záznam ve stavu `hotovo`,
    // ze kterého se první uložený krok přepne na rozpracované.
    if (!s.dostupne || s.vlastnikId !== c.meId) return NextResponse.json(NEDOSTUPNY);
    if (!s.onboarding && !znovu) return NextResponse.json(NEDOSTUPNY);
    const [podnik, plan] = await Promise.all([nactiPodnik(c.teamId), teamPlanInfo(c.teamId)]);
    let clenu = 0; let pozvanek = 0;
    try { clenu = await pocetClenu(c.teamId); } catch { /* jen informace */ }
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const [r] = await sql`SELECT COUNT(*)::int AS n FROM invitations WHERE team_id = ${c.teamId} AND status = 'pending'`;
      pozvanek = Number(r?.n ?? 0);
    } catch { /* jen informace */ }
    const { join_code, ...bezKodu } = podnik;
    const o: Onboarding = s.onboarding ?? { v: 1, stav: 'hotovo', odpovedi: {}, pouzito: {} };
    return NextResponse.json({
      stav: o.stav, krok: o.krok ?? null, odpovedi: o.odpovedi, pouzito: o.pouzito,
      podnik: bezKodu, plan: { effective: plan.effective },
      kod: join_code, pocty: { clenu, pozvanek },
    });
  } catch (e) {
    return NextResponse.json({ error: verejnaHlaska(e, 'Průvodce se nepodařilo načíst. Zkus to znovu.', 'onboarding GET') }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const c = await pozaduj('podnik.nastaveni');
  if (jeOdpoved(c)) return c;
  // Autosave po každém kroku: 120 za minutu je víc než kterýkoli člověk, skript ne.
  const g = await hit(`onboarding:${c.meId}`, 120, 60);
  if (!g.ok) {
    return NextResponse.json({ error: `Moc rychle za sebou. Zkus to znovu za ${g.retryAfter} s.` }, { status: 429, headers: { 'Retry-After': String(g.retryAfter) } });
  }
  const telo = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!telo || typeof telo !== 'object') return NextResponse.json({ error: 'Chybí data.' }, { status: 400 });
  // Hrubá pojistka dřív, než se cokoli čistí: obří tělo nemá smysl ani zpracovávat.
  if (bajtu(telo) > MAX_BAJTU * 2) return NextResponse.json({ error: 'Odpovědi jsou příliš dlouhé.' }, { status: 413 });
  const pozadovany = typeof telo.stav === 'string' && (STAVY as readonly string[]).includes(telo.stav) ? (telo.stav as StavPruvodce) : undefined;

  try {
    const s = await nactiStav(c.teamId);
    if (!s.dostupne) return NextResponse.json({ error: 'Průvodce pro tenhle podnik není k dispozici.' }, { status: 404 });
    if (s.vlastnikId !== c.meId) return NextResponse.json({ error: 'Průvodce nastavením smí vést jen vlastník podniku.' }, { status: 403 });
    // Podnik z doby před průvodcem ho má jen na výslovné „Spustit znovu" vlastníka (`znovu: true`).
    const dosavadni: Onboarding | null = s.onboarding ?? (telo.znovu === true ? { v: 1, stav: 'hotovo', odpovedi: {}, pouzito: {} } : null);
    if (!dosavadni) return NextResponse.json({ error: 'Průvodce pro tenhle podnik není k dispozici.' }, { status: 404 });
    let odpovedi = slouciOdpovedi(dosavadni.odpovedi, cistiOdpovedi(telo.odpovedi));
    odpovedi = odeberKlice(odpovedi, telo.odpovedi);
    const ted = new Date().toISOString();
    const novy: Onboarding = {
      ...dosavadni,
      // Návrat z `hotovo` na rozpracované smí jen výslovné „Spustit znovu"; autosave bez stavu hotový průvodce nevrací.
      stav: dalsiStav(dosavadni.stav, pozadovany),
      krok: jeKrok(telo.krok) ? telo.krok : dosavadni.krok,
      zacato: dosavadni.zacato ?? ted,
      upraveno: ted,
      odpovedi,
    };
    if (!jeMalyDost(novy)) return NextResponse.json({ error: 'Odpovědi jsou příliš dlouhé.' }, { status: 413 });
    const ulozeno = await ulozStav(c.teamId, novy);
    if (!ulozeno) return NextResponse.json({ error: 'Průvodce pro tenhle podnik zatím není k dispozici.' }, { status: 503 });
    return NextResponse.json({ ok: true, upraveno: ted, stav: novy.stav });
  } catch (e) {
    return NextResponse.json({ error: verejnaHlaska(e, 'Odpovědi se neuložily. Zkus to znovu.', 'onboarding PUT') }, { status: 500 });
  }
}
