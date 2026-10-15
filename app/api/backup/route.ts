import { NextResponse } from 'next/server';
import { checkCron } from '@/lib/cronAuth';
import { neon } from '@neondatabase/serverless';
import { sendBackupEmail, odkazovyZaklad } from '@/lib/email';
import { pragueToday } from '@/lib/pragueTime';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { cestaOdkazuZalohy, podepisOdkazZalohy, PLATNOST_ODKAZU_DNI } from '@/lib/pravni/zalohaOdkaz';
import { poDavkach } from '@/lib/cronDavky';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Denní záloha (Vercel Cron): každému, kdo má v podniku oprávnění data.zaloha,
// přijde e-mail s ODKAZEM ke stažení zálohy toho podniku — ne příloha.
//
// Dřív šla celá záloha jako nešifrovaná příloha: soukromé zprávy, sazby a mzdy
// ležely ve schránkách (a v jejich zálohách, přeposlaných zprávách…) bez jakékoli
// kontroly přístupu. Teď odkaz nese jen podepsané číslo podniku s platností
// 7 dní (lib/pravni/zalohaOdkaz.ts) a /api/backup/stahnout navíc chce přihlášení
// člověka s data.zaloha v tom podniku; zálohu skládá až v tu chvíli a nikde ji
// neukládá. Odejde-li člověk z podniku nebo přijde o oprávnění, starý odkaz mu
// už nic nevydá.
//
// Chráněno: Vercel Cron posílá `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const gate = checkCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const tajemstvi = process.env.NEXTAUTH_SECRET;
  if (!podepisOdkazZalohy(1, tajemstvi)) {
    // Bez tajemství nejde odkaz podepsat ani ověřit — posílat nepodepsaný by bylo horší než nic.
    console.error('backup: NEXTAUTH_SECRET chybí nebo je krátký — odkazy na zálohu se neposílají.');
    return NextResponse.json({ ok: false, error: 'Záloha není nakonfigurovaná (chybí NEXTAUTH_SECRET).' }, { status: 503 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const teams = await sql`SELECT id, name FROM teams ORDER BY id`;
    const den = pragueToday();
    const zaklad = odkazovyZaklad();

    let sent = 0, failed = 0, teamsNotified = 0;
    // Selhání u jednoho podniku nesmí shodit ostatní — proto try po podnicích.
    const problems: string[] = [];
    // Po dávkách (lib/cronDavky): pět podniků souběžně, s hlídáním času.
    const zpracujPodnik = async (team: any): Promise<void> => {
      try {
        const ids = await clenoveSOpravnenim(Number(team.id), 'data.zaloha');
        if (!ids.length) return;
        const prijemci = await sql`
          SELECT DISTINCT email FROM users
          WHERE id = ANY(${ids}::int[]) AND email IS NOT NULL`;
        if (!prijemci.length) return;
        const token = podepisOdkazZalohy(Number(team.id), tajemstvi);
        if (!token) return;
        const odkaz = `${zaklad}${cestaOdkazuZalohy(token)}`;
        teamsNotified++;
        for (const e of prijemci) {
          // Odkaz, o kterém si myslíme, že odešel, je horší než žádný: majitel se
          // na zálohu spoléhá. `sendBackupEmail` chybu vrací — čte se návratová hodnota.
          const mail = await sendBackupEmail(e.email as string, String(team.name ?? ''), den, odkaz, PLATNOST_ODKAZU_DNI);
          if (mail.sent) sent++;
          else { failed++; problems.push(`${team.name}: ${String(mail.error ?? 'e-mail neodešel').slice(0, 80)}`); }
        }
      } catch (err) {
        failed++;
        problems.push(`${team.name}: odkaz se nepodařilo poslat — ${String((err as any)?.message ?? err).slice(0, 80)}`);
      }
    };
    const davky = await poDavkach(teams as any[], zpracujPodnik, { soubezne: 5, rozpocetMs: 50_000 });
    if (davky.nestihnuto) { failed += davky.nestihnuto; problems.push(`${davky.nestihnuto} podniků se do limitu nestihlo — dostanou odkaz zítra`); }

    const ok = failed === 0 && (sent > 0 || teamsNotified === 0);
    if (!ok) console.error('backup: part failed', { sent, failed, problems });
    return NextResponse.json({ ok, teams: teamsNotified, emailedTo: sent, failed, problems }, { status: ok ? 200 : 500 });
  } catch (error) {
    console.error('backup failed', error);
    // Ven jde jen to, že se nepovedlo. Hlášky Postgresu prozrazují schéma.
    return NextResponse.json({ ok: false, error: 'Odkazy na zálohu se nepodařilo rozeslat.' }, { status: 500 });
  }
}
