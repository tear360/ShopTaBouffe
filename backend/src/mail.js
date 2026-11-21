import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER || 'ShopTaBouffe <noreply@localhost>';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

let transport = null;

export function mailConfigured() {
  return !!(SMTP_HOST && SMTP_PORT && (SMTP_USER || String(process.env.SMTP_NO_AUTH || '') === '1'));
}

function getTransport() {
  if (!mailConfigured()) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }
  return transport;
}

/**
 * Envoie le lien de réinitialisation. Renvoie true si l'e-mail a été envoyé.
 * Sans SMTP configuré, on ne fait que journaliser : l'API reste muette côté
 * utilisateur (pas d'énumération de comptes), et la configuration manquante
 * est visible dans les logs du serveur.
 */
export async function sendPasswordResetMail(to, link) {
  const tx = getTransport();
  if (!tx) {
    console.warn('[mail] SMTP non configuré : aucun e-mail envoyé (définir SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS dans backend/.env).');
    return false;
  }
  try {
    await tx.sendMail({
      from: MAIL_FROM,
      to,
      subject: 'ShopTaBouffe — réinitialisation de votre mot de passe',
      text: `Bonjour,\n\nUtilisez ce lien pour choisir un nouveau mot de passe :\n${link}\n\nCe lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n`,
      html: `
        <div style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 12px;">
            <tr><td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(17,24,39,.08);">
                <tr><td style="background:#ef6c33;padding:22px 28px;">
                  <div style="font-size:20px;font-weight:bold;color:#ffffff;">ShopTaBouffe</div>
                </td></tr>
                <tr><td style="padding:28px;">
                  <h1 style="margin:0 0 14px;font-size:20px;color:#111827;">Réinitialisation du mot de passe</h1>
                  <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#374151;">Bonjour,</p>
                  <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#374151;">Vous avez demandé à choisir un nouveau mot de passe pour votre compte ShopTaBouffe. Cliquez sur le bouton ci-dessous pour continuer.</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
                    <tr><td style="border-radius:8px;background:#ef6c33;">
                      <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Réinitialiser mon mot de passe</a>
                    </td></tr>
                  </table>
                  <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;">Ce lien expire dans <strong>30 minutes</strong> et ne peut être utilisé qu’une seule fois.</p>
                  <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail : votre mot de passe restera inchangé.</p>
                  <p style="margin:22px 0 0;font-size:12px;color:#9ca3af;word-break:break-all;">Lien alternatif : <a href="${escapeHtml(link)}" style="color:#ef6c33;">${escapeHtml(link)}</a></p>
                </td></tr>
                <tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
                  ShopTaBouffe — message automatique, merci de ne pas y répondre.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </div>`,
    });
    return true;
  } catch (err) {
    console.error('[mail] échec envoi réinitialisation :', err && err.message);
    return false;
  }
}

/**
 * Envoie le code de vérification d'une adresse e-mail ajoutée au compte.
 * Renvoie true si l'e-mail a été envoyé, false si SMTP est absent ou en échec.
 */
export async function sendEmailVerificationMail(to, code) {
  const tx = getTransport();
  if (!tx) {
    console.warn('[mail] SMTP non configuré : aucun code de vérification envoyé.');
    return false;
  }
  const safeCode = escapeHtml(code);
  try {
    await tx.sendMail({
      from: MAIL_FROM,
      to,
      subject: 'ShopTaBouffe — vérifiez votre adresse e-mail',
      text: `Bonjour,\n\nVoici votre code de vérification ShopTaBouffe : ${code}\n\nCe code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n`,
      html: `
        <div style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 12px;">
            <tr><td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(17,24,39,.08);">
                <tr><td style="background:#ef6c33;padding:22px 28px;">
                  <div style="font-size:20px;font-weight:bold;color:#ffffff;">ShopTaBouffe</div>
                </td></tr>
                <tr><td style="padding:28px;">
                  <h1 style="margin:0 0 14px;font-size:20px;color:#111827;">Vérification de votre adresse e-mail</h1>
                  <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#374151;">Bonjour,</p>
                  <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#374151;">Saisissez le code ci-dessous dans l'application pour confirmer que cette adresse vous appartient.</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
                    <tr><td align="center" style="border-radius:10px;background:#fff4ee;border:1px solid #f8c9ac;padding:16px 28px;">
                      <div style="font-size:32px;line-height:1.2;letter-spacing:8px;font-weight:bold;color:#ef6c33;font-family:Arial,Helvetica,sans-serif;">${safeCode}</div>
                    </td></tr>
                  </table>
                  <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;">Ce code expire dans <strong>10 minutes</strong> et ne peut être utilisé qu’une seule fois.</p>
                  <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail : votre adresse actuelle restera inchangée.</p>
                </td></tr>
                <tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
                  ShopTaBouffe — message automatique, merci de ne pas y répondre.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </div>`,
    });
    return true;
  } catch (err) {
    console.error('[mail] échec envoi code vérification :', err && err.message);
    return false;
  }
}
