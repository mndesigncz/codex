import { Resend } from 'resend';
import { emailText, sazejHtml } from './i18n/email.ts';
import { LOCALE_PRO_JAZYK, type Jazyk } from './i18n/config.ts';
import { htmlNaText, escHtml } from './emailAdresa.ts';
import { firma, identifikace } from './firma.ts';

// E-mail, o kterém aplikace ví, jestli odešel.
//
// Tady byly tři chyby a každá se projevila až u někoho jiného.
//
// **`send()` nepadá.** Resend vrací chybu v odpovědi (`{ data, error }`),
// ne výjimkou. Volalo se `await resend.emails.send(...)` a nikdo se na
// `error` nepodíval, takže odmítnutý e-mail prošel jako úspěch: server
// zapsal `email_sent_at`, obrazovka napsala „Objednávka odeslána ✓"
// a dodavatel nedostal nic. Vedoucí čekal na zboží, které nikdo
// neobjednal. Je to ta samá tichá lež jako u `fetch` a HTTP 500.
//
// **Odesílatel byl `onboarding@resend.dev`.** To je zkušební adresa
// Resendu, ne doména podniku: pošta z ní končí ve spamu nebo se
// nedoručí vůbec, a hlavně na ni nejde odpovědět. Přitom objednávka
// dodavateli výslovně prosí „Odpovězte prosím na tento e-mail
// s potvrzením" — a ta odpověď padala do prázdna. Adresa se teď bere
// z `EMAIL_FROM`; když chybí, řekne se to do logu a pošle se zkušební
// adresou, ale s `reply_to` na někoho živého.
//
// **Do HTML se vkládala jména bez ošetření.** Název podniku nebo jméno
// kolegy s `<` rozbily šablonu; s `&` se rozpadl text na entitu.

// escHtml žije v emailAdresa.ts (čistý modul bez Resendu) — šablony, které
// čte i klientský kód (poukazyEmail), ho berou odtamtud a SDK Resendu se
// tak netáhne do bundlu prohlížeče. Tady zůstává re-export pro serverové trasy.
export { escHtml } from './emailAdresa.ts';

/** Zkušební adresa Resendu — funguje, ale nedoručuje komukoli. */
const SANDBOX = 'onboarding@resend.dev';

/**
 * Odesílatel podniku. Bez `EMAIL_FROM` se jede na zkušební adresu, což
 * u pozvánky projde, ale objednávka dodavateli tak nedojde — proto se
 * to hlásí do logu, a ne potichu.
 */
function sender(label: string): string {
  const configured = (process.env.EMAIL_FROM ?? '').trim();
  if (configured) return configured.includes('<') ? configured : `${label} <${configured}>`;
  return `${label} <${SANDBOX}>`;
}

/** Jede se přes zkušební adresu? Volající podle toho může varovat. */
export function usingSandboxSender(): boolean {
  return !(process.env.EMAIL_FROM ?? '').trim();
}

export interface SendResult {
  sent: boolean;
  /** Co řekl Resend, když to nevyšlo — patří do logu, ne na obrazovku hosta. */
  error: string | null;
}

interface SendArgs {
  label: string;
  to: string;
  subject: string;
  html: string;
  /** Kam má chodit odpověď. U objednávky je to povinné, jinak se ptá do prázdna. */
  replyTo?: string | null;
  attachments?: { filename: string; content: string }[];
  /** Vlastní hlavičky (List-Unsubscribe u hromadných zpráv). */
  headers?: Record<string, string>;
}

/**
 * Patička s identifikací provozovatele (§ 435 OZ: jméno, IČO, sídlo, zápis, DPH) pod každým
 * e-mailem, transakčním i hromadným. U zpráv jménem podniku (novinky, poukazy, objednávky)
 * zůstává odesílatelem podnik — tahle řádka jen říká, kdo provozuje službu, která zprávu doručila.
 * Česky: identifikace je údaj z českého rejstříku.
 */
export function sPatickouProvozovatele(html: string): string {
  const f = firma();
  const p = `<p style="font-family:-apple-system,system-ui,sans-serif;color:#8a917f;font-size:11px;line-height:1.5;max-width:500px;margin:16px auto 0;padding:0 28px;" data-provozovatel>${escHtml(identifikace(f))} ${escHtml(f.emailPodpory)}, ${escHtml(f.telefon)}</p>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${p}</body>`) : html + p;
}

/**
 * Jedno místo, kde se e-mail opravdu odešle — a jediné, kde se čte
 * `error`. Nikdy nevyhazuje: volající dostane `{ sent, error }`
 * a rozhodne se, co s tím říct člověku.
 */
async function send({ label, to, subject, html, replyTo, attachments, headers }: SendArgs): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Bez klíče se nic neodešle. Tvrdit opak je horší než neodeslat.
    return { sent: false, error: 'RESEND_API_KEY není nastavený' };
  }
  html = sPatickouProvozovatele(html);
  try {
    const { error } = await new Resend(key).emails.send({
      from: sender(label),
      to,
      subject,
      html,
      text: htmlNaText(html),
      ...(replyTo ? { replyTo } : {}),
      ...(attachments ? { attachments } : {}),
      ...(headers ? { headers } : {}),
    });
    if (error) {
      console.error(`[email] ${subject} → ${to}: ${error.message ?? String(error)}`);
      return { sent: false, error: error.message ?? 'Odeslání odmítnuto' };
    }
    return { sent: true, error: null };
  } catch (e: any) {
    // Výjimka znamená, že spojení vůbec nevzniklo.
    console.error(`[email] ${subject} → ${to}: ${e?.message ?? e}`);
    return { sent: false, error: e?.message ?? 'Odeslání se nepovedlo' };
  }
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? '';

export async function sendInvitationEmail(to: string, name: string, tempPassword: string): Promise<SendResult> {
  return send({
    label: 'Managero',
    to,
    subject: 'Vítej v Managero',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0A0A0C; color: white; border-radius: 20px;">
        <h1 style="color: #C8F542; font-size: 26px;">Vítej, ${escHtml(name)}!</h1>
        <p style="color: rgba(235,235,245,0.6);">Vedení tě přidalo do týmu v Managero.</p>
        <div style="background: #16181A; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: rgba(235,235,245,0.6); font-size: 14px;">Přihlašovací e-mail</p>
          <p style="margin: 4px 0 16px; font-weight: bold;">${escHtml(to)}</p>
          <p style="margin: 0; color: rgba(235,235,245,0.6); font-size: 14px;">Dočasné heslo</p>
          <p style="margin: 4px 0 0; font-weight: bold; color: #C8F542; font-size: 20px;">${escHtml(tempPassword)}</p>
        </div>
        <a href="${escHtml(APP_URL())}/login" style="display: inline-block; background: #C8F542; color: black; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: bold;">Přihlásit se →</a>
      </div>
    `,
  });
}

/** Základ odkazů v e-mailech, které vedou na jednorázové stránky (heslo, smazání účtu). */
export function odkazovyZaklad(): string {
  // Bez importu lib/web: tenhle soubor načítají i testy přímo v Node (bez rozlišení cest bez přípony).
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.managero.app').replace(/\/+$/, '');
}

/** Provozní e-mail pro správce platformy (eskalace nahlášeného obsahu, lib/moderaceDb.ts). */
export async function sendSpravaEmail(to: string, subject: string, html: string): Promise<SendResult> {
  return send({ label: 'Managero správa', to, subject, html });
}

/** E-mail s odkazem na nové heslo. Odkaz platí hodinu a jde použít jednou. */
export async function sendPasswordResetEmail(to: string, name: string, cesta: string): Promise<SendResult> {
  const url = `${odkazovyZaklad()}${cesta}`;
  return send({
    label: 'Managero',
    to,
    subject: 'Nové heslo do Managero',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 28px; background: #F1F4EC; color: #16181A; border-radius: 20px;">
        <h1 style="font-size: 22px; margin: 0 0 8px;">Nové heslo</h1>
        <p style="color: #5c6353;">Ahoj ${escHtml(name)}, přišla žádost o obnovení hesla k tvému účtu. Odkaz platí hodinu a jde použít jednou.</p>
        <a href="${escHtml(url)}" style="display: inline-block; margin-top: 8px; background: #C8F542; color: #16181A; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold;">Nastavit nové heslo</a>
        <p style="color: #5c6353; font-size: 13px; margin-top: 22px;">Pokud jsi o nic nežádal(a), e-mail ignoruj, heslo zůstává beze změny.</p>
        <p style="color: #8a917f; font-size: 12px;">Pokud tlačítko nefunguje, otevři: ${escHtml(url)}</p>
      </div>
    `,
  });
}

/** Host: jednorázový kód pro přihlášení do Managero client bez hesla (lib/klient/prihlaseniKodem.ts). Platí 10 minut. */
export async function sendHostLoginCodeEmail(to: string, name: string, kod: string): Promise<SendResult> {
  return send({
    label: 'Managero client',
    to,
    subject: `${kod} je tvůj kód do Managero client`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 28px; background: #F1F4EC; color: #16181A; border-radius: 20px;">
        <h1 style="font-size: 22px; margin: 0 0 8px;">Kód pro přihlášení</h1>
        <p style="color: #5c6353;">Ahoj ${escHtml(name)}, tímhle kódem se přihlásíš do Managero client. Platí 10 minut a jde použít jednou.</p>
        <p style="font-family: ui-monospace, monospace; font-size: 34px; font-weight: bold; letter-spacing: 0.3em; margin: 18px 0;">${escHtml(kod)}</p>
        <p style="color: #5c6353; font-size: 13px;">Pokud ses nepřihlašoval(a), e-mail ignoruj. Bez kódu se do účtu nikdo nedostane.</p>
      </div>
    `,
  });
}

/** E-mail s potvrzením smazání účtu. Bez otevření odkazu se nic nesmaže. */
export async function sendAccountDeleteEmail(to: string, name: string, cesta: string): Promise<SendResult> {
  const url = `${odkazovyZaklad()}${cesta}`;
  return send({
    label: 'Managero',
    to,
    subject: 'Potvrď smazání účtu Managero',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 28px; background: #F1F4EC; color: #16181A; border-radius: 20px;">
        <h1 style="font-size: 22px; margin: 0 0 8px;">Smazání účtu</h1>
        <p style="color: #5c6353;">Ahoj ${escHtml(name)}, někdo požádal o smazání účtu s tímto e-mailem. Když jsi to byl(a) ty, potvrď to odkazem. Odkaz platí hodinu.</p>
        <a href="${escHtml(url)}" style="display: inline-block; margin-top: 8px; background: #16181A; color: #ffffff; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold;">Přejít k potvrzení</a>
        <p style="color: #5c6353; font-size: 13px; margin-top: 22px;">Pokud jsi o smazání nežádal(a), e-mail ignoruj. Účet zůstane beze změny.</p>
        <p style="color: #8a917f; font-size: 12px;">Pokud tlačítko nefunguje, otevři: ${escHtml(url)}</p>
      </div>
    `,
  });
}

/** Potvrzení e-mailu vedení po registraci podniku (spuštění, balík S). Odkaz platí 48 hodin. */
export async function sendEmailVerification(to: string, name: string, cesta: string): Promise<SendResult> {
  const url = `${odkazovyZaklad()}${cesta}`;
  return send({
    label: 'Managero',
    to,
    subject: 'Potvrď e-mail pro Managero',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 28px; background: #F1F4EC; color: #16181A; border-radius: 20px;">
        <h1 style="font-size: 22px; margin: 0 0 8px;">Potvrď e-mail</h1>
        <p style="color: #5c6353;">Ahoj ${escHtml(name)}, díky za registraci podniku. Potvrď prosím, že tahle adresa patří tobě — budou na ni chodit faktury, zálohy a obnovení hesla. Odkaz platí 48 hodin.</p>
        <a href="${escHtml(url)}" style="display: inline-block; margin-top: 8px; background: #C8F542; color: #16181A; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold;">Potvrdit e-mail</a>
        <p style="color: #5c6353; font-size: 13px; margin-top: 22px;">Pokud ses neregistroval(a), e-mail ignoruj.</p>
        <p style="color: #8a917f; font-size: 12px;">Pokud tlačítko nefunguje, otevři: ${escHtml(url)}</p>
      </div>
    `,
  });
}

export async function sendTeamInvitation(to: string, teamName: string, inviterName: string, token: string, jazyk: Jazyk = 'cs'): Promise<SendResult> {
  const url = `${APP_URL()}/join?token=${encodeURIComponent(token)}`;
  return send({
    label: 'Managero',
    to,
    subject: emailText('pozvankaPredmet', jazyk, { tym: teamName }),
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0A0A0C; color: white; border-radius: 20px;">
        <h1 style="color: #C8F542; font-size: 26px;">${escHtml(emailText('pozvankaNadpis', jazyk))}</h1>
        <p style="color: rgba(235,235,245,0.6);">${sazejHtml('pozvankaText', jazyk, { kdo: `<strong style="color:white;">${escHtml(inviterName)}</strong>`, tym: `<strong style="color:white;">${escHtml(teamName)}</strong>` }, {}, escHtml)}</p>
        <p style="color: rgba(235,235,245,0.6);">${escHtml(emailText('pozvankaPokyn', jazyk))}</p>
        <a href="${escHtml(url)}" style="display: inline-block; margin-top: 12px; background: #C8F542; color: black; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold;">${escHtml(emailText('pozvankaTlacitko', jazyk))}</a>
        <p style="color: rgba(235,235,245,0.35); font-size: 12px; margin-top: 24px;">${escHtml(emailText('pozvankaOdkaz', jazyk, { url }))}</p>
      </div>
    `,
  });
}

/**
 * Denní záloha: ODKAZ ke stažení, ne příloha (spuštění, balík P). Odkaz je podepsaný,
 * platí `dni` dní a stáhnout přes něj jde jen po přihlášení s oprávněním data.zaloha
 * v daném podniku (app/api/backup/stahnout). V e-mailu tedy nejsou žádná data.
 */
export async function sendBackupEmail(to: string, podnik: string, den: string, url: string, dni: number): Promise<SendResult> {
  return send({
    label: 'Managero Zálohy',
    to,
    subject: `Záloha dat Managero — ${den}`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:28px;background:#F1F4EC;color:#16181A;border-radius:20px;">
        <h1 style="font-size:20px;margin:0 0 8px;">Záloha dat je připravená</h1>
        <p style="color:#5c6353;font-size:14px;">Zálohu podniku ${escHtml(podnik)} stáhneš odkazem níž. Po otevření se přihlas účtem, který má v podniku oprávnění „Dostávat zálohu dat“. Odkaz platí ${dni} dní.</p>
        <a href="${escHtml(url)}" style="display:inline-block;margin-top:8px;background:#C8F542;color:#16181A;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;">Stáhnout zálohu</a>
        <p style="color:#5c6353;font-size:13px;margin-top:22px;">Záloha se vytvoří až při stažení. Nejsou v ní soukromé zprávy, sazby ani mzdové údaje.</p>
        <p style="color:#8a917f;font-size:12px;">Pokud tlačítko nefunguje, otevři: ${escHtml(url)}</p>
      </div>`,
  });
}

/**
 * Objednávka dodavateli. `replyTo` je tu to podstatné: e-mail výslovně
 * prosí o odpověď s termínem dodání, a ta musí dojít do podniku, ne na
 * adresu odesílací služby.
 */
export async function sendOrderEmail(
  to: string,
  businessName: string,
  orderText: string,
  note?: string | null,
  replyTo?: string | null,
  jazyk: Jazyk = 'cs',
): Promise<SendResult> {
  return send({
    label: `Managero — ${businessName}`,
    to,
    replyTo: replyTo ?? null,
    subject: emailText('objednavkaPredmet', jazyk, { podnik: businessName, datum: new Date().toLocaleDateString(LOCALE_PRO_JAZYK[jazyk]) }),
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px;">
        <h2 style="margin: 0 0 4px;">${escHtml(emailText('objednavkaNadpis', jazyk, { podnik: businessName }))}</h2>
        <p style="color: #666; margin: 0 0 20px;">${escHtml(emailText('objednavkaOdeslano', jazyk))}</p>
        <pre style="background: #F6F7F2; border-radius: 12px; padding: 18px; font-family: inherit; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${escHtml(orderText)}</pre>
        ${note ? `<p style="color: #444;">${escHtml(note)}</p>` : ''}
        <p style="color: #999; font-size: 13px;">${replyTo
          ? escHtml(emailText('objednavkaOdpoved', jazyk, { adresa: replyTo }))
          : escHtml(emailText('objednavkaBezOdpovedi', jazyk))}</p>
      </div>
    `,
  });
}

export async function sendDigestEmail(to: string, businessName: string, dateLabel: string, html: string): Promise<SendResult> {
  return send({
    label: 'Managero',
    to,
    subject: `Souhrn dne — ${businessName} · ${dateLabel}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px;">
        <h2 style="margin: 0 0 2px;">Souhrn dne · ${escHtml(dateLabel)}</h2>
        <p style="color: #666; margin: 0 0 20px;">${escHtml(businessName)} — automaticky z aplikace Managero.</p>
        ${html}
        <p style="color: #999; font-size: 12px; margin-top: 24px;">Denní souhrn chodí každý večer. Detaily najdete v aplikaci.</p>
      </div>
    `,
  });
}

/**
 * E-mail kolem dárkového poukazu (poukaz pro obdarovaného, připomenutí konce platnosti). Obsah skládá
 * lib/poukazyEmail.ts; tady se jen odešle a přečte výsledek. `replyTo` je e-mail podniku, ať odpověď
 * obdarovaného nepadá do prázdna.
 */
export async function sendVoucherEmail(to: string, businessName: string, obsah: { subject: string; html: string }, replyTo?: string | null): Promise<SendResult> {
  // Jméno podniku jde do hlavičky „Od“: úhlové závorky a uvozovky by ji rozbily.
  const jmeno = businessName.replace(/[<>"\r\n]/g, '').trim().slice(0, 60) || 'podnik';
  return send({ label: `Managero — ${jmeno}`, to, replyTo: replyTo ?? null, subject: obsah.subject, html: obsah.html });
}

/**
 * Zpráva členům klubu e-mailem (rozesílka, automatizace). Hlavičky List-Unsubscribe (včetně
 * jednoho kliknutí) nechají poštovní klienty nabídnout „Odhlásit“ vedle odesílatele; bez nich
 * lidé klikají na „Spam“ a to poškozuje doručitelnost všem podnikům.
 */
export async function sendNovinkyEmail(
  to: string, label: string, subject: string, html: string, odhlasitUrl: string, replyTo?: string | null,
): Promise<SendResult> {
  return send({
    label, to, subject, html, replyTo,
    headers: { 'List-Unsubscribe': `<${odhlasitUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  });
}

/**
 * Právní a provozní e-mail jednomu člověku (spuštění, balík G): potvrzení a rozhodnutí o oznámení
 * nezákonného obsahu (DSA čl. 16), odůvodnění omezení (čl. 17), upozornění před anonymizací
 * neaktivního účtu (retence). Obsah skládají lib/dsa.ts a lib/retence.ts; tady se jen odešle.
 */
export async function sendPravniEmail(to: string, subject: string, html: string): Promise<SendResult> {
  return send({ label: 'Managero', to, subject, html });
}

/**
 * E-mail vlastníkovi podniku k předplatnému (spuštění, balík G): nezdařená platba
 * (`invoice.payment_failed`) a konec zkušebního období za 3 dny (`trial_will_end`).
 * Dřív šlo jen oznámení v aplikaci — a kdo aplikaci zrovna neotevřel, o platbě nevěděl.
 */
export async function sendPlatbaEmail(to: string, v: { druh: 'platba_selhala' | 'konec_zkousky'; podnik: string; jmeno: string; zruseno?: boolean; pokus?: number | null }): Promise<SendResult> {
  const odkaz = `${odkazovyZaklad()}/employer/overview?view=settings&tab=billing`;
  const selhala = v.druh === 'platba_selhala';
  const subject = selhala ? `Platba předplatného se nezdařila — ${v.podnik}` : `Zkušební období končí za 3 dny — ${v.podnik}`;
  const text = selhala
    ? `Platbu předplatného podniku ${v.podnik} se nepodařilo strhnout${v.pokus && v.pokus > 1 ? ` (${v.pokus}. pokus)` : ''}. Stripe to během několika dní zkusí znovu. Zkontrolujte prosím kartu v Nastavení → Předplatné → Spravovat předplatné, ať podnik nepřijde o placené funkce.`
    : v.zruseno
      ? `Zkušební období podniku ${v.podnik} končí za 3 dny. Předplatné máte zrušené, nic se nestrhne a po skončení zkoušky se podnik vrátí na tarif Zdarma.`
      : `Zkušební období podniku ${v.podnik} končí za 3 dny. Potom se z karty strhne první platba. Tarif změníte nebo předplatné zrušíte v Nastavení → Předplatné.`;
  return send({
    label: 'Managero Předplatné', to, subject,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:28px;background:#F1F4EC;color:#16181A;border-radius:20px;">
        <h1 style="font-size:20px;margin:0 0 8px;">${escHtml(selhala ? 'Platba se nezdařila' : 'Zkušební období končí')}</h1>
        <p style="color:#5c6353;font-size:14px;">Dobrý den${v.jmeno ? `, ${escHtml(v.jmeno)}` : ''}.</p>
        <p style="color:#5c6353;font-size:14px;">${escHtml(text)}</p>
        <a href="${escHtml(odkaz)}" style="display:inline-block;margin-top:8px;background:#C8F542;color:#16181A;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;">Otevřít Předplatné</a>
        <p style="color:#8a917f;font-size:12px;margin-top:22px;">Pokud tlačítko nefunguje, otevři: ${escHtml(odkaz)}</p>
      </div>`,
  });
}
