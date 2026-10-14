// Soubory pro ověřené odkazy (iOS universal links, Android App Links) z apps/apps.json.
//
//   node apps/scripts/well-known.mjs zapis [--team=ABCDE12345] [--sha=managero:AA:BB:..,client:CC:DD:..]
//        zapíše OBA soubory do public/.well-known/ (web je servíruje bez přesměrování). Team ID se bere
//        z --team, jinak z APPLE_TEAM_ID; otisky z --sha, jinak z apps.json (android.sha256). Co chybí,
//        zůstane jako ZÁSTUPNÉ POLE a skript to vypíše: {{TEAM_ID}}, {{SHA256_MANAGERO}}, {{SHA256_CLIENT}}.
//        Se zástupným polem odkazy NEFUNGUJÍ (kontrola `scripts/check-well-known.mjs --release` neprojde).
//   node apps/scripts/well-known.mjs aasa <TEAMID>|--zastupne        jen AASA na stdout
//   node apps/scripts/well-known.mjs assetlinks [--sha=…] [--zastupne]  jen assetlinks na stdout
//
// Kde vzít hodnoty:
//   Team ID: developer.apple.com > Account > Membership details (10 znaků A–Z, 0–9).
//   SHA-256: Play Console > aplikace > Test and release > App integrity > App signing >
//            „App signing key certificate" (otisk klíče, kterým podepisuje GOOGLE, ne upload klíč).
//            Po zjištění je zapiš i do apps/apps.json (android.sha256.managero / .client).
// Apex `managero.app` jen přesměrovává na www, proto se všechno váže na www (apps.json: domena).
import { writeFileSync } from 'node:fs';
import { argumenty, spolecne, REPO } from './_spolecne.mjs';

export const ZASTUPNY_TEAM = '{{TEAM_ID}}';
export const zastupnySha = (klic) => `{{SHA256_${klic.toUpperCase()}}}`;
const JE_TEAM = /^[A-Z0-9]{10}$/;
const JE_SHA = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function aasa(teamId) {
  const cesty = (k) => spolecne.apps[k].linkCesty.flatMap(c => [{ '/': c }, { '/': `${c}/*` }]);
  return {
    applinks: { details: ['client', 'managero'].map(k => ({ appIDs: [`${teamId}.${spolecne.apps[k].bundleId}`], components: cesty(k) })) },
    webcredentials: { apps: ['managero', 'client'].map(k => `${teamId}.${spolecne.apps[k].bundleId}`) },
  };
}

/** Otisky podle aplikace: z apps.json, přepsané --sha; prázdné → zástupné pole (nebo chyba bez zástupných). */
export function otisky(shaArg, zastupne) {
  const z = { ...spolecne.android.sha256 };
  if (shaArg) for (const cast of String(shaArg).split(',')) { const [k, ...hex] = cast.split(':'); z[k] = [hex.join(':').toUpperCase()]; }
  const chybi = [];
  for (const k of Object.keys(spolecne.apps)) {
    const platne = (z[k] ?? []).filter(s => JE_SHA.test(String(s).toUpperCase()));
    if (platne.length) z[k] = platne.map(s => String(s).toUpperCase());
    else { chybi.push(k); z[k] = zastupne ? [zastupnySha(k)] : []; }
  }
  return { z, chybi };
}

export function assetlinks(z) {
  return Object.keys(spolecne.apps).map(k => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: spolecne.apps[k].applicationId, sha256_cert_fingerprints: z[k] },
  }));
}

const json = (o) => `${JSON.stringify(o, null, 2)}\n`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const pozicni = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const [druh, teamPoz] = pozicni;
  const arg = argumenty(process.argv.slice(2).filter(a => a.startsWith('--')));
  if (druh === 'aasa') {
    const team = arg.zastupne ? ZASTUPNY_TEAM : teamPoz;
    if (team !== ZASTUPNY_TEAM && !JE_TEAM.test(team ?? '')) { console.error('použití: well-known.mjs aasa <TEAMID> (10 znaků A-Z0-9) | --zastupne'); process.exit(2); }
    process.stdout.write(json(aasa(team)));
  } else if (druh === 'assetlinks') {
    const { z, chybi } = otisky(arg.sha, !!arg.zastupne);
    if (chybi.length && !arg.zastupne) { console.error(`chybí SHA-256 pro: ${chybi.join(', ')} (Play Console > App integrity > App signing), nebo --zastupne`); process.exit(2); }
    process.stdout.write(json(assetlinks(z)));
  } else if (druh === 'zapis') {
    const teamZ = String(arg.team ?? process.env.APPLE_TEAM_ID ?? '').trim();
    const team = JE_TEAM.test(teamZ) ? teamZ : ZASTUPNY_TEAM;
    if (teamZ && team === ZASTUPNY_TEAM) console.error(`Team ID „${teamZ}" nemá tvar 10 znaků A–Z0–9, zapisuji zástupné pole.`);
    const { z, chybi } = otisky(arg.sha, true);
    writeFileSync(`${REPO}/public/.well-known/apple-app-site-association`, json(aasa(team)));
    writeFileSync(`${REPO}/public/.well-known/assetlinks.json`, json(assetlinks(z)));
    console.log('Zapsáno: public/.well-known/apple-app-site-association, public/.well-known/assetlinks.json');
    const zbyva = [...(team === ZASTUPNY_TEAM ? [`${ZASTUPNY_TEAM} (Apple Team ID)`] : []), ...chybi.map(k => `${zastupnySha(k)} (Play App Signing, ${spolecne.apps[k].applicationId})`)];
    if (zbyva.length) console.log(`POZOR, zástupná pole (odkazy s nimi nefungují): ${zbyva.join(', ')}`);
  } else {
    console.error('použití: well-known.mjs zapis [--team=…] [--sha=…] | aasa <TEAMID>|--zastupne | assetlinks [--sha=…] [--zastupne]');
    process.exit(2);
  }
}
