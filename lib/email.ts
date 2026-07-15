import { Resend } from 'resend';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? 'placeholder');
}

export async function sendInvitationEmail(to: string, name: string, tempPassword: string) {
  await getResend().emails.send({
    from: 'Pangea <onboarding@resend.dev>',
    to,
    subject: 'Vítejte v Pangea! 🍵',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0D0D0D; color: white; border-radius: 16px;">
        <h1 style="color: #30D158; font-size: 28px;">Vítejte, ${name}! 🍵</h1>
        <p style="color: rgba(235,235,245,0.6);">Byli jste přidáni do systému Pangea.</p>
        <div style="background: #1C1C1E; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: rgba(235,235,245,0.6); font-size: 14px;">Přihlašovací email</p>
          <p style="margin: 4px 0 16px; font-weight: bold;">${to}</p>
          <p style="margin: 0; color: rgba(235,235,245,0.6); font-size: 14px;">Dočasné heslo</p>
          <p style="margin: 4px 0 0; font-weight: bold; color: #30D158; font-size: 20px;">${tempPassword}</p>
        </div>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/login" style="display: inline-block; background: #30D158; color: black; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold;">Přihlásit se →</a>
      </div>
    `,
  });
}

export async function sendTeamInvitation(to: string, teamName: string, inviterName: string, token: string) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/join?token=${token}`;
  await getResend().emails.send({
    from: 'Pangea <onboarding@resend.dev>',
    to,
    subject: `Pozvánka do týmu ${teamName} 🍵`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0A0A0C; color: white; border-radius: 20px;">
        <h1 style="color: #C8F542; font-size: 26px;">Pozvánka do týmu</h1>
        <p style="color: rgba(235,235,245,0.6);"><strong style="color:white;">${inviterName}</strong> vás zve do týmu <strong style="color:white;">${teamName}</strong> v aplikaci pro správu podniku.</p>
        <p style="color: rgba(235,235,245,0.6);">Klikněte na tlačítko níže a vytvořte si účet zaměstnance.</p>
        <a href="${url}" style="display: inline-block; margin-top: 12px; background: #C8F542; color: black; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: bold;">Přijmout pozvánku →</a>
        <p style="color: rgba(235,235,245,0.35); font-size: 12px; margin-top: 24px;">Pokud tlačítko nefunguje, otevřete: ${url}</p>
      </div>
    `,
  });
}

export async function sendBackupEmail(to: string, filename: string, json: string) {
  await getResend().emails.send({
    from: 'Pangea Zálohy <onboarding@resend.dev>',
    to,
    subject: `Záloha dat Pangea — ${filename.replace('pangea-backup-', '').replace('.json', '')}`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:28px;background:#F1F4EC;color:#16181A;border-radius:20px;">
        <h1 style="font-size:20px;margin:0 0 8px;">🗄️ Automatická záloha</h1>
        <p style="color:#5c6353;font-size:14px;">V příloze je kompletní záloha dat tvého podniku (${filename}). Ulož si e-mail — kdyby se s databází cokoli stalo, data se z něj dají obnovit.</p>
      </div>`,
    attachments: [{ filename, content: Buffer.from(json).toString('base64') }],
  });
}

export async function sendLowStockAlert(employerEmail: string, items: string[]) {
  await getResend().emails.send({
    from: 'Pangea <onboarding@resend.dev>',
    to: employerEmail,
    subject: '⚠️ Upozornění: Nízké zásoby',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0D0D0D; color: white; border-radius: 16px;">
        <h1 style="color: #FF9F0A; font-size: 24px;">⚠️ Nízké zásoby</h1>
        <p style="color: rgba(235,235,245,0.6);">Zaměstnanec nahlásil nedostatek těchto položek:</p>
        <ul style="background: #1C1C1E; border-radius: 12px; padding: 20px 20px 20px 36px; margin: 16px 0;">
          ${items.map(item => `<li style="color: white; margin-bottom: 8px;">${item}</li>`).join('')}
        </ul>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/employer/inventory" style="display: inline-block; background: #FF9F0A; color: black; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold;">Zobrazit sklad →</a>
      </div>
    `,
  });
}

export async function sendShiftRequestNotification(employerEmail: string, employeeName: string, requestType: string, date: string) {
  await getResend().emails.send({
    from: 'Pangea <onboarding@resend.dev>',
    to: employerEmail,
    subject: `📅 Nová žádost o směnu od ${employeeName}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0D0D0D; color: white; border-radius: 16px;">
        <h1 style="color: #0A84FF; font-size: 24px;">📅 Žádost o směnu</h1>
        <p style="color: rgba(235,235,245,0.6);"><strong style="color: white;">${employeeName}</strong> žádá o ${requestType} dne <strong style="color: white;">${date}</strong>.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/employer/shifts" style="display: inline-block; background: #0A84FF; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold;">Zobrazit žádosti →</a>
      </div>
    `,
  });
}
