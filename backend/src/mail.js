import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER || 'ShopTaBouffe <noreply@localhost>';

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
      html: `<p>Bonjour,</p><p>Utilisez ce lien pour choisir un nouveau mot de passe :</p><p><a href="${link}">Réinitialiser mon mot de passe</a></p><p>Ce lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
    });
    return true;
  } catch (err) {
    console.error('[mail] échec envoi réinitialisation :', err && err.message);
    return false;
  }
}
