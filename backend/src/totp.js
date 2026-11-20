import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30_000;

/** Génère un secret TOTP (20 octets → 32 caractères base32). */
export function generateTotpSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return out;
}

function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) bits += ALPHABET.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function equal(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Code TOTP à 6 chiffres pour un compteur donné (RFC 6238, SHA-1). */
function hotp(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

/** Code courant (utile pour les tests et le diagnostic local). */
export function totpCode(secret) {
  return hotp(secret, Math.floor(Date.now() / STEP_MS));
}

/** Vérifie un code avec une tolérance d'une fenêtre de 30 s de part et d'autre. */
export function verifyTotp(secret, code, window = 1) {
  if (!secret || !/^\d{6}$/.test(String(code || ''))) return false;
  const step = Math.floor(Date.now() / STEP_MS);
  for (let delta = -window; delta <= window; delta += 1) {
    if (equal(hotp(secret, step + delta), String(code))) return true;
  }
  return false;
}

/** URI à encoder dans le QR code / à saisir manuellement dans l'authentificateur. */
export function otpauthUrl(secret, label, issuer = 'ShopTaBouffe') {
  const name = encodeURIComponent(`${issuer}:${label || 'compte'}`);
  const qs = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${name}?${qs}`;
}

/** Codes de récupération lisibles, à stocker hashés côté serveur. */
export function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`);
  }
  return codes;
}

export function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(String(code).toUpperCase().replace(/\s/g, '')).digest('hex');
}
