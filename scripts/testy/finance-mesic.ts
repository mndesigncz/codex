// Období „mesic:RRRR-MM" widgetu Tržba po dnech (lib/financeWidgety.ts obdobiPokladny): celý minulý měsíc,
// dnešní jen do dneška, budoucí neukáže tržbu z budoucnosti, únor přestupného roku; staré volby se nemění.
import type { Testy } from './_testy.ts';
import { obdobiPokladny } from '../../lib/financeWidgety.ts';

export default function ({ eq }: Testy) {
  const dnes = '2026-10-05';
  const o = (id: string) => { const x = obdobiPokladny(id, dnes); return `${x.from}..${x.to} ${x.popis}`; };
  eq('měsíc: minulý měsíc celý', o('mesic:2026-09'), '2026-09-01..2026-09-30 2026-09');
  eq('měsíc: dnešní měsíc jen do dneška', o('mesic:2026-10'), '2026-10-01..2026-10-05 2026-10');
  eq('měsíc: budoucí měsíc nesahá do budoucnosti (jen jeho první den)', o('mesic:2026-12'), '2026-12-01..2026-12-01 2026-12');
  eq('měsíc: únor přestupného roku má 29 dní', o('mesic:2024-02'), '2024-02-01..2024-02-29 2024-02');
  eq('měsíc: přelom roku (prosinec)', o('mesic:2025-12'), '2025-12-01..2025-12-31 2025-12');
  eq('měsíc: staré volby beze změny (7 dní)', o('7_dni'), '2026-09-29..2026-10-05 Posledních 7 dní');
  eq('měsíc: „tento_mesic" jako dřív', o('tento_mesic'), '2026-10-01..2026-10-05 Tento měsíc');
  eq('měsíc: neplatný formát = dnes', o('mesic:2026-9'), '2026-10-05..2026-10-05 Dnes');
}
