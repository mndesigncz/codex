import { Resend } from 'resend';

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

/** Text do HTML e-mailu. Escapuje se i `&`, jinak se „R&D" rozpadne. */
export function escHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
}

/**
 * Jedno místo, kde se e-mail opravdu odešle — a jediné, kde se čte
 * `error`. Nikdy nevyhazuje: volající dostane `{ sent, error }`
 * a rozhodne se, co s tím říct člověku.
 */
async function send({ label, to, subject, html, replyTo, attachments }: SendArgs): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Bez klíče se nic neodešle. Tvrdit opak je horší než neodeslat.
    return { sent: false, error: 'RESEND_API_KEY není nastavený' };
  }
  try {
    const { error } = await new Resend(key).emails.send({
      from: sender(label),
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments ? { attachments } : {}),
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
    subject: 'Vítejte v Managero',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0A0A0C; color: white; border-radius: 20px;">
        <h1 style="color: #C8F542; font-size: 26px;">Vítejte, ${escHtml(name)}!</h1>
        <p style="color: rgba(235,235,245,0.6);">Byli jste přidáni do systému Managero.</p>
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

export async function sendTeamInvitation(to: string, teamName: string, inviterName: string, token: string): Promise<SendResult> {
  const url = `${APP_URL()}/join?token=${encodeURIComponent(token)}`;
  return send({
    label: 'Managero',
    to,
    subject: `Pozvánka do týmu ${teamName}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0A0A0C; color: white; border-radius: 20px;">
        <h1 style="color: #C8F542; font-size: 26px;">Pozvánka do týmu</h1>
        <p style="color: rgba(235,235,245,0.6);"><strong style="color:white;">${escHtml(inviterName)}</strong> vás zve do týmu <strong style="color:white;">${escHtml(teamName)}</strong> v aplikaci pro správu podniku.</p>
        <p style="color: rgba(235,235,245,0.6);">Klikněte na tlačítko níže a vytvořte si účet zaměstnance.</p>
        <a href="${escHtml(url)}" style="display: inline-block; margin-top: 12px; background: #C8F542; color: black; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold;">Přijmout pozvánku →</a>
        <p style="color: rgba(235,235,245,0.35); font-size: 12px; margin-top: 24px;">Pokud tlačítko nefunguje, otevřete: ${escHtml(url)}</p>
      </div>
    `,
  });
}

export async function sendBackupEmail(to: string, filename: string, json: string): Promise<SendResult> {
  return send({
    label: 'Managero Zálohy',
    to,
    subject: `Záloha dat Managero — ${filename.replace('managero-backup-', '').replace('.json', '')}`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:28px;background:#F1F4EC;color:#16181A;border-radius:20px;">
        <h1 style="font-size:20px;margin:0 0 8px;">Automatická záloha</h1>
        <p style="color:#5c6353;font-size:14px;">V příloze je kompletní záloha dat tvého podniku (${escHtml(filename)}). Ulož si e-mail — kdyby se s databází cokoli stalo, data se z něj dají obnovit.</p>
      </div>`,
    attachments: [{ filename, content: Buffer.from(json).toString('base64') }],
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
): Promise<SendResult> {
  return send({
    label: `Managero — ${businessName}`,
    to,
    replyTo: replyTo ?? null,
    subject: `Objednávka — ${businessName} (${new Date().toLocaleDateString('cs-CZ')})`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px;">
        <h2 style="margin: 0 0 4px;">Objednávka — ${escHtml(businessName)}</h2>
        <p style="color: #666; margin: 0 0 20px;">Odesláno z aplikace Managero.</p>
        <pre style="background: #F6F7F2; border-radius: 12px; padding: 18px; font-family: inherit; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${escHtml(orderText)}</pre>
        ${note ? `<p style="color: #444;">${escHtml(note)}</p>` : ''}
        <p style="color: #999; font-size: 13px;">${replyTo
          ? `Odpovězte prosím na tento e-mail s potvrzením a termínem dodání — odpověď dorazí na ${escHtml(replyTo)}.`
          : 'Potvrzení a termín dodání pošlete prosím na kontakt podniku.'}</p>
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
