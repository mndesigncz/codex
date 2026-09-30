// Vygeneruje obsah souborů pro ověřené odkazy z apps/apps.json.
//
//   node apps/scripts/well-known.mjs aasa <TEAMID>          # apple-app-site-association (iOS universal links)
//   node apps/scripts/well-known.mjs assetlinks             # assetlinks.json (Android App Links), SHA-256 z apps.json
//   node apps/scripts/well-known.mjs assetlinks --sha=managero:AA:BB:..,client:CC:DD:..   # SHA-256 z příkazové řádky
//
// Výstup jde na stdout; ulož ho na web:
//   https://www.managero.app/.well-known/apple-app-site-association   (bez přípony, Content-Type application/json, BEZ přesměrování)
//   https://www.managero.app/.well-known/assetlinks.json
// Soubory NEJSOU v repu předem: potřebují Team ID (Apple) a SHA-256 podpisového klíče Play App Signing (Google), které
// vzniknou až po založení účtů. Apex `managero.app` jen přesměrovává na www, proto se všechno váže na www.
import { argumenty, spolecne } from './_spolecne.mjs';

const [druh, teamId] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const arg = argumenty();

if (druh === 'aasa') {
  if (!/^[A-Z0-9]{10}$/.test(teamId ?? '')) { console.error('použití: well-known.mjs aasa <TEAMID> (10 znaků A-Z0-9)'); process.exit(2); }
  const cesty = (k) => spolecne.apps[k].linkCesty.flatMap(c => [{ '/': c }, { '/': `${c}/*` }]);
  const out = {
    applinks: { details: ['client', 'managero'].map(k => ({ appIDs: [`${teamId}.${spolecne.apps[k].bundleId}`], components: cesty(k) })) },
    webcredentials: { apps: ['managero', 'client'].map(k => `${teamId}.${spolecne.apps[k].bundleId}`) },
  };
  console.log(JSON.stringify(out, null, 2));
} else if (druh === 'assetlinks') {
  const z = { ...spolecne.android.sha256 };
  if (arg.sha) for (const cast of String(arg.sha).split(',')) { const [k, ...hex] = cast.split(':'); z[k] = [hex.join(':')]; }
  const chybi = Object.keys(spolecne.apps).filter(k => !(z[k] ?? []).length);
  if (chybi.length) { console.error(`chybí SHA-256 pro: ${chybi.join(', ')} (Play Console > App integrity > App signing)`); process.exit(2); }
  const out = Object.keys(spolecne.apps).map(k => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: spolecne.apps[k].applicationId, sha256_cert_fingerprints: z[k] },
  }));
  console.log(JSON.stringify(out, null, 2));
} else {
  console.error('použití: well-known.mjs aasa <TEAMID> | assetlinks [--sha=managero:AA:BB,client:CC:DD]');
  process.exit(2);
}
