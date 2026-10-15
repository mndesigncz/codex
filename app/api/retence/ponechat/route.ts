import { NextResponse } from 'next/server';
import { overTokenPonechani } from '@/lib/retence';
import { ponechatUcet } from '@/lib/retenceDb';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';

export const dynamic = 'force-dynamic';

// Odkaz „Ponechat účet“ z upozornění před anonymizací neaktivního hosta (retence, balík G).
// Mění stav i přes GET schválně: skener odkazů v poště, který odkaz „otevře“, účet jen ponechá —
// to je bezpečný směr (nic se nesmaže). Podpis v odkazu váže na jednoho uživatele. Výsledek
// ukáže stránka /retence/ponechat (bez tokenu v adrese).

const kam = (req: Request, stav: string) => NextResponse.redirect(new URL(`/retence/ponechat?stav=${stav}`, req.url), 303);

export async function GET(req: Request) {
  const gate = await hit(`retence-ponechat:${klientIp(req.headers)}`, 30, 3600);
  if (!gate.ok) return kam(req, 'limit');
  const id = overTokenPonechani(new URL(req.url).searchParams.get('t'));
  if (!id) return kam(req, 'neplatny');
  if (!(await ponechatUcet(id))) return kam(req, 'nenalezen');
  return kam(req, 'ok');
}
