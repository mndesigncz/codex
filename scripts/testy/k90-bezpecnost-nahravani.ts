// Přímé nahrávání do Vercel Blob (spuštění, balík S): jen vlastní předpona,
// povolené typy, bez tokenu úložiště se nahrává jako dřív.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { povolenyTyp, cistyNazev, predponaNahravani, patriPodPredponu, PRIMO_OD_BYTES, MAX_PRIMO_BYTES } from '../../lib/nahravaniPravidla.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  eq('typ: fotka, video, PDF projdou', [povolenyTyp('a.jpg', 'image/jpeg'), povolenyTyp('v.mov', 'video/quicktime'), povolenyTyp('f.pdf', 'application/pdf')], ['image/jpeg', 'video/quicktime', 'application/pdf']);
  eq('typ: bez typu rozhodne přípona', povolenyTyp('faktura.pdf', ''), 'application/pdf');
  ok('typ: HTML, SVG, archiv a spustitelné ne', [povolenyTyp('x.html', 'text/html'), povolenyTyp('x.svg', 'image/svg+xml'), povolenyTyp('x.zip', 'application/zip'), povolenyTyp('x.exe', '')].every(v => v === null));
  ok('typ: falešná přípona .jpg.html neprojde ani s typem obrázku', povolenyTyp('x.jpg.html', 'image/jpeg') === null);
  eq('název: bez lomítek a ..', cistyNazev('../../etc/passwd'), '._._etc_passwd');
  eq('předpona: podnik a člověk', predponaNahravani(12, 34), 'podniky/12/34/');
  ok('předpona: vlastní soubor projde', patriPodPredponu('podniky/12/34/video-AbC.mp4', 12, 34));
  ok('předpona: cizí člověk, cizí podnik, podsložka ani .. neprojdou', !patriPodPredponu('podniky/12/35/v.mp4', 12, 34) && !patriPodPredponu('podniky/13/34/v.mp4', 12, 34)
    && !patriPodPredponu('podniky/12/34/x/v.mp4', 12, 34) && !patriPodPredponu('podniky/12/34/../35/v.mp4', 12, 34) && !patriPodPredponu('podniky/12/34/', 12, 34));
  ok('limity: přímo od 4 MB (pod 4,5 MB serverless), nejvýš 50 MB', PRIMO_OD_BYTES === 4 * 1024 * 1024 && MAX_PRIMO_BYTES === 50 * 1024 * 1024);

  const primo = cti('app/api/upload/primo/route.ts');
  ok('route: přihlášení a člen podniku (pozaduj) před vším', /export async function POST[\s\S]*?const c = await pozaduj\(null\);\s*if \(jeOdpoved\(c\)\) return c;/.test(primo));
  ok('route: bez BLOB_READ_WRITE_TOKEN 501 a GET říká zapnuto: false', /status: 501/.test(primo) && /zapnuto: false/.test(primo));
  ok('route: token jen pro vlastní předponu a povolený typ', /onBeforeGenerateToken: async \(pathname, clientPayload\) => \{\s*if \(!patriPodPredponu\(pathname, teamId, c\.meId\)\)/.test(primo) && /allowedContentTypes: \[mime\], maximumSizeInBytes: MAX_PRIMO_BYTES/.test(primo));
  ok('route: zápis ověří předponu, soubor v úložišti (head) a typ podle úložiště', /patriPodPredponu\(pathname, teamId, c\.meId\)/.test(primo) && /await head\(pathname\)/.test(primo) && /povolenyTyp\(nazev, info\.contentType\)/.test(primo));
  ok('route: soubor je soukromý a čte se jen přes /api/upload/<id>', /url: `\/api\/upload\/\$\{row\.id\}`/.test(primo) && /access: 'private'/.test(cti('lib/nahrajSoubor.ts')));
  ok('route: omezení tokenů na člověka', /hit\(`nahravani-primo:\$\{c\.meId\}`/.test(primo));
  const klient = cti('lib/nahrajSoubor.ts');
  ok('klient: malé soubory dál přes app/api/upload, velké zkusí přímo', /soubor\.size >= PRIMO_OD_BYTES/.test(klient) && /fetch\('\/api\/upload', \{ method: 'POST', body: fd \}\)/.test(klient));
  ok('klient: knihovna úložiště se stahuje až pro velký soubor', /await import\('@vercel\/blob\/client'\)/.test(klient));
  ok('chat a fotky akcí jdou přes nahrajSoubor', /nahrajSoubor\(/.test(cti('components/chat/useChat.ts')) && /nahrajSoubor\(/.test(cti('components/employer/EventsView.tsx')));
  ok('CSP: connect-src pustí https://vercel.com (API úložiště)', /connect-src 'self'[^"]*https:\/\/vercel\.com/.test(cti('next.config.js')));
  ok('klasická routa zůstává a bere stejná pravidla', /povolenyTyp\(f\.name, f\.type\)/.test(cti('app/api/upload/route.ts')));
}
