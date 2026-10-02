// Akce nad seznamem kampaní: duplikovat, posunout v pořadí, změnit stav.
import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { duplikujKampan, kampanTymu, nastavStav, presunKampan } from '@/lib/stampsAdmin';
import { STAVY } from '@/lib/stampsPlan';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const STAV_TEXT: Record<string, string> = { active: 'běží', draft: 'koncept', paused: 'pozastavena', archived: 'v archivu' };

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('vernost.kampane');
  if (jeOdpoved(ctx)) return ctx;
  const u = { id: ctx.meId, team_id: ctx.teamId };
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná kampaň' }, { status: 400 });
  const c = await kampanTymu(u.team_id, id);
  if (!c) return NextResponse.json({ error: 'Kampaň nenalezena' }, { status: 404 });
  const akce = String(b.action ?? '');
  if (akce === 'duplicate') {
    const novy = await duplikujKampan(u.team_id, id);
    if (!novy) return NextResponse.json({ error: 'Kampaň nenalezena' }, { status: 404 });
    audit(u.team_id, u.id, 'client.stamps.duplicate', 'client', novy, `${c.name} → kopie jako koncept`);
    return NextResponse.json({ ok: true, id: novy });
  }
  if (akce === 'move') {
    const smer = b.dir === 'up' ? 'up' : b.dir === 'down' ? 'down' : null;
    if (!smer) return NextResponse.json({ error: 'Směr je „up“ nebo „down“.' }, { status: 400 });
    const posunuto = await presunKampan(u.team_id, id, smer);
    if (!posunuto) return NextResponse.json({ error: smer === 'up' ? 'Kartička už je první.' : 'Kartička už je poslední.' }, { status: 409 });
    audit(u.team_id, u.id, 'client.stamps.move', 'client', id, `${c.name} ${smer === 'up' ? 'výš' : 'níž'}`);
    return NextResponse.json({ ok: true });
  }
  if (akce === 'status') {
    const stav = String(b.status ?? '');
    if (!(STAVY as string[]).includes(stav)) return NextResponse.json({ error: 'Neznámý stav kampaně.' }, { status: 400 });
    if (stav === 'active' && c.rule_type === 'products' && !c.stamp_items.length) {
      return NextResponse.json({ error: 'Než kartičku spustíš, vyber položky, za které se razítko připisuje.' }, { status: 400 });
    }
    await nastavStav(u.team_id, id, stav as any);
    audit(u.team_id, u.id, 'client.stamps.status', 'client', id, `${c.name}: ${STAV_TEXT[stav]}`);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Neznámá akce' }, { status: 400 });
}
