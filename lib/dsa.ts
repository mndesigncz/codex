// Akt o digitálních službách (DSA, nařízení 2022/2065): oznámení nezákonného obsahu od kohokoli
// (čl. 16), odůvodnění omezení autorovi (čl. 17) a kontaktní místo (čl. 11, 12). Čisté, bez databáze
// a bez importů aplikace (testy: scripts/testy/k90-gdpr-dsa.ts). Databáze a e-maily: lib/dsaDb.ts.
//
// Veřejný formulář je /nahlasit (funguje i bez účtu). Oznámení se uloží do content_reports se zdrojem
// „web“ a jde provozovateli platformy stejnou cestou jako nahlášení z chatu (MODERACE_EMAIL, správa
// /admin/nahlaseni). Oznamovatel dostane potvrzení přijetí a později rozhodnutí (čl. 16 odst. 4 a 5).

/** Kategorie nezákonného obsahu (podle taxonomie Komise pro databázi odůvodnění, zjednodušeně). */
export const KATEGORIE_DSA: { id: string; nazev: string }[] = [
  { id: 'nenavist', nazev: 'Nenávistné projevy nebo podněcování k násilí' },
  { id: 'obtezovani', nazev: 'Obtěžování, vyhrožování nebo šikana' },
  { id: 'podvod', nazev: 'Podvod nebo klamání spotřebitelů' },
  { id: 'osobni_udaje', nazev: 'Zneužití osobních údajů nebo zásah do soukromí' },
  { id: 'dusevni_vlastnictvi', nazev: 'Porušení autorských práv nebo ochranné známky' },
  { id: 'deti', nazev: 'Ohrožení dětí' },
  { id: 'nebezpecne', nazev: 'Nebezpečné výrobky nebo nelegální zboží' },
  { id: 'nasili', nazev: 'Násilí nebo terorismus' },
  { id: 'jine', nazev: 'Jiný nezákonný obsah' },
];

export const nazevKategorieDsa = (id: string): string => KATEGORIE_DSA.find(k => k.id === id)?.nazev ?? 'Jiný nezákonný obsah';

/** Druh nahlášení z veřejného formuláře v content_reports.kind. */
export const DRUH_WEB = 'web';

export const MIN_ZDUVODNENI = 20;

export interface OznameniDsa {
  url: string | null;
  popis: string;
  kategorie: string;
  zduvodneni: string;
  jmeno: string | null;
  email: string | null;
  prohlaseni: true;
}

export type VstupOznameni = { ok: true; v: OznameniDsa } | { ok: false; error: string; pole: string };

const JE_EMAIL = /^[^@\s{}<>,;]+@[^@\s{}<>,;]+\.[^@\s{}<>,;]+$/;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+\n/g, '\n').slice(0, max) : '');

/** Odkaz na obsah: jen http(s), bez skriptů; prázdný = null. Neplatný = undefined (chyba). */
export function cistyOdkaz(v: unknown): string | null | undefined {
  const s = text(v, 500);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch { return undefined; }
}

/**
 * Zkontroluje tělo veřejného formuláře. Jméno a e-mail jsou povinné (čl. 16 odst. 2 písm. c) kromě
 * oznámení ohrožení dětí, kde je smí oznamovatel vynechat. Prohlášení o dobré víře je povinné (písm. d).
 */
export function platneOznameni(b: unknown): VstupOznameni {
  const x = (b ?? {}) as Record<string, unknown>;
  const url = cistyOdkaz(x.url);
  if (url === undefined) return { ok: false, error: 'Odkaz nevypadá jako webová adresa (https://…).', pole: 'url' };
  const popis = text(x.popis, 1000);
  if (popis.length < 5) return { ok: false, error: 'Popiš, o jaký obsah jde a kde je (podnik, stránka, zpráva).', pole: 'popis' };
  const kategorie = String(x.kategorie ?? '');
  if (!KATEGORIE_DSA.some(k => k.id === kategorie)) return { ok: false, error: 'Vyber, proč je obsah nezákonný.', pole: 'kategorie' };
  const zduvodneni = text(x.zduvodneni, 3000);
  if (zduvodneni.length < MIN_ZDUVODNENI) return { ok: false, error: `Vysvětli, proč je obsah podle tebe nezákonný (aspoň ${MIN_ZDUVODNENI} znaků).`, pole: 'zduvodneni' };
  const jmeno = text(x.jmeno, 120) || null;
  const emailSurovy = text(x.email, 200).toLowerCase();
  const email = emailSurovy || null;
  if (email && !JE_EMAIL.test(email)) return { ok: false, error: 'E-mail nevypadá správně.', pole: 'email' };
  const anonymniSmi = kategorie === 'deti';
  if (!anonymniSmi && !jmeno) return { ok: false, error: 'Napiš své jméno.', pole: 'jmeno' };
  if (!anonymniSmi && !email) return { ok: false, error: 'Napiš e-mail, ať ti můžeme poslat potvrzení a rozhodnutí.', pole: 'email' };
  if (x.prohlaseni !== true) return { ok: false, error: 'Potvrď, že údaje v oznámení jsou podle tvého nejlepšího vědomí pravdivé a úplné.', pole: 'prohlaseni' };
  return { ok: true, v: { url, popis, kategorie, zduvodneni, jmeno, email, prohlaseni: true } };
}

/** Slug podniku z odkazu na jeho stránku v Managero client (`/client/<slug>`), ať oznámení dostane i vedení podniku. */
export function slugZOdkazu(url: string | null): string | null {
  if (!url) return null;
  try {
    const m = /^\/client\/([a-z0-9][a-z0-9-]{0,60})(?:\/|$)/i.exec(new URL(url).pathname);
    if (!m) return null;
    const s = m[1].toLowerCase();
    return ['me', 'login', 'register', 'odhlasit', 'zapomenute-heslo', 'najit'].includes(s) ? null : s;
  } catch { return null; }
}

/** Opis do content_reports.snapshot: co a kde (odkaz) — bez kontaktu oznamovatele. */
export function opisOznameni(v: Pick<OznameniDsa, 'url' | 'popis'>): string {
  const s = `${v.popis}${v.url ? `\n${v.url}` : ''}`;
  return s.length > 1200 ? `${s.slice(0, 1197)}…` : s;
}

// ---- E-maily (čisté skládání; odesílá lib/dsaDb.ts přes lib/email) -------------------------

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const obal = (obsah: string) => `
  <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#F1F4EC;color:#16181A;border-radius:20px;">${obsah}</div>`;

/** Provozovateli: nové oznámení z webu. Bez kontaktu a bez textu oznámení — ty uvidí správce po přihlášení. */
export function emailNovehoOznameni(v: { id: number; kategorie: string; podnik: string | null; odkaz: string }): { subject: string; html: string } {
  return {
    subject: `Oznámení nezákonného obsahu #${v.id}: ${nazevKategorieDsa(v.kategorie)}`,
    html: obal(`
      <h1 style="font-size:20px;margin:0 0 8px;">Nové oznámení z formuláře /nahlasit</h1>
      <p style="color:#5c6353;font-size:14px;margin:0 0 6px;">Kategorie: <b>${esc(nazevKategorieDsa(v.kategorie))}</b>${v.podnik ? ` · podnik: ${esc(v.podnik)}` : ''}</p>
      <p style="color:#5c6353;font-size:14px;">DSA čl. 16: oznámení je potřeba posoudit včas, objektivně a s péčí a oznamovateli poslat rozhodnutí.</p>
      <a href="${esc(v.odkaz)}" style="display:inline-block;margin-top:8px;background:#C8F542;color:#16181A;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;">Otevřít oznámení</a>
      <p style="color:#8a917f;font-size:12px;margin-top:22px;">Text oznámení a kontakt oznamovatele v e-mailu schválně nejsou. Uvidíš je po přihlášení správce.</p>`),
  };
}

/** Oznamovateli: potvrzení přijetí (čl. 16 odst. 4). */
export function emailPotvrzeniOznameni(v: { id: number; kategorie: string; kontakt: string }): { subject: string; html: string } {
  return {
    subject: `Přijali jsme vaše oznámení #${v.id}`,
    html: obal(`
      <h1 style="font-size:20px;margin:0 0 8px;">Oznámení jsme přijali</h1>
      <p style="color:#5c6353;font-size:14px;">Děkujeme. Vaše oznámení obsahu (${esc(nazevKategorieDsa(v.kategorie))}) má číslo <b>#${v.id}</b>. Posoudíme ho bez zbytečného odkladu a o rozhodnutí vám napíšeme na tuto adresu.</p>
      <p style="color:#5c6353;font-size:14px;">Dotazy: ${esc(v.kontakt)}. Do odpovědi uveďte číslo oznámení.</p>`),
  };
}

export type RozhodnutiDsa = 'removed' | 'resolved' | 'dismissed';

/** Oznamovateli: rozhodnutí (čl. 16 odst. 5) a možnost se ohradit (čl. 20). */
export function emailRozhodnutiOznameni(v: { id: number; stav: RozhodnutiDsa; kontakt: string }): { subject: string; html: string } {
  const co = v.stav === 'removed'
    ? 'Obsah jsme posoudili jako rozporný s právem nebo s podmínkami a odstranili jsme ho nebo omezili jeho dostupnost.'
    : v.stav === 'resolved'
      ? 'Oznámení jsme vyřídili jinak (například s provozovatelem podniku, kterého se týká).'
      : 'Obsah jsme posoudili a neshledali jsme, že by byl nezákonný nebo porušoval podmínky. Zůstává dostupný.';
  return {
    subject: `Rozhodnutí o oznámení #${v.id}`,
    html: obal(`
      <h1 style="font-size:20px;margin:0 0 8px;">Rozhodnutí o vašem oznámení</h1>
      <p style="color:#5c6353;font-size:14px;">${esc(co)}</p>
      <p style="color:#5c6353;font-size:14px;">Rozhodl člověk, ne automat. Pokud s rozhodnutím nesouhlasíte, odpovězte do 6 měsíců na ${esc(v.kontakt)} s číslem oznámení #${v.id}; posoudíme ho znovu. Můžete se obrátit i na soud nebo na orgán mimosoudního řešení sporů.</p>`),
  };
}

export type DruhOmezeni = 'odstraneni_zpravy' | 'odstraneni_napadu' | 'blokace_clena';

/** Odůvodnění omezení autorovi (DSA čl. 17): co, proč, na jakém základě, kdo rozhodl a jak se ohradit. */
export function oduvodneni(v: { druh: DruhOmezeni; duvod: string; podnik: string | null; kdo: 'podnik' | 'provozovatel'; poznamka?: string | null; kontakt: string }): { title: string; body: string; subject: string; html: string } {
  const co = v.druh === 'odstraneni_zpravy' ? 'Tvoje zpráva v chatu byla odstraněna.'
    : v.druh === 'odstraneni_napadu' ? 'Tvůj nápad byl odstraněn.'
      : `Podnik ${v.podnik ?? ''} tě zablokoval ve svém věrnostním programu.`.replace('  ', ' ');
  const kdo = v.kdo === 'provozovatel' ? 'provozovatel aplikace Managero' : `vedení podniku${v.podnik ? ` ${v.podnik}` : ''}`;
  const zaklad = v.druh === 'blokace_clena'
    ? 'Pravidla věrnostního programu podniku a Podmínky užívání Managero client.'
    : 'Podmínky užívání, oddíl Obsah a chování (zákaz nezákonného, urážlivého, obtěžujícího a nenávistného obsahu).';
  const poznamka = v.poznamka?.trim() ? v.poznamka.trim().slice(0, 500) : null;
  const radky = [
    co,
    `Důvod: ${v.duvod}.`,
    ...(poznamka ? [`Upřesnění: ${poznamka}`] : []),
    `Na jakém základě: ${zaklad}`,
    `Kdo rozhodl: ${kdo}. Rozhodl člověk, ne automat.`,
    `Nesouhlasíš? Napiš do 6 měsíců na ${v.kontakt}; rozhodnutí posoudíme znovu. Můžeš se obrátit i na soud.`,
  ];
  return {
    title: v.druh === 'blokace_clena' ? 'Blokace ve věrnostním programu' : 'Obsah byl odstraněn',
    body: `${co} Důvod: ${v.duvod}.`,
    subject: v.druh === 'blokace_clena' ? `Blokace ve věrnostním programu${v.podnik ? ` (${v.podnik})` : ''}` : 'Odstranění obsahu v Managero',
    html: obal(`<h1 style="font-size:20px;margin:0 0 8px;">${esc(v.druh === 'blokace_clena' ? 'Blokace ve věrnostním programu' : 'Odstranění obsahu')}</h1>
      ${radky.map(r => `<p style="color:#5c6353;font-size:14px;margin:0 0 8px;">${esc(r)}</p>`).join('')}`),
  };
}
