import crypto from 'node:crypto';

const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://10.0.2.2:3000').replace(/\/+$/, '');
const redirectUri = (provider) => `${PUBLIC_URL}/api/auth/${provider}/callback`;

function env(key) {
  const v = process.env[key];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

// --- state en mémoire (TTL 10 min, consommation unique) ---
const STATES_TTL_MS = 10 * 60 * 1000;
export const oauthStates = new Map(); // state -> { provider, expires }

setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of oauthStates) {
    if (entry.expires <= now) oauthStates.delete(state);
  }
}, 60 * 1000).unref();

export function createState(provider) {
  const state = crypto.randomBytes(16).toString('hex'); // 32 hex
  oauthStates.set(state, { provider, expires: Date.now() + STATES_TTL_MS });
  return state;
}

/** Vérifie (cookie + mémoire, provider correspond) puis consomme (usage unique). */
export function consumeState(state, provider) {
  const entry = oauthStates.get(state);
  if (!entry) return false;
  oauthStates.delete(state);
  if (entry.expires <= Date.now()) return false;
  if (entry.provider !== provider) return false;
  return true;
}

function authorizeUrl(baseUrl, params) {
  const qs = new URLSearchParams(params).toString().replace(/\+/g, '%20');
  return `${baseUrl}?${qs}`;
}

// --- fournisseurs ---
export const PROVIDERS = {
  discord: {
    id: 'discord',
    clientId: () => env('DISCORD_CLIENT_ID'),
    clientSecret: () => env('DISCORD_CLIENT_SECRET'),
    scope: 'identify email',
    authorize(state) {
      return authorizeUrl('https://discord.com/api/oauth2/authorize', {
        client_id: this.clientId(),
        redirect_uri: redirectUri('discord'),
        response_type: 'code',
        scope: this.scope,
        state,
      });
    },
    async exchange(code) {
      const res = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId(),
          client_secret: this.clientSecret(),
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri('discord'),
          scope: this.scope,
        }).toString(),
      });
      if (!res.ok) throw new Error(`discord token ${res.status}`);
      const data = await res.json();
      if (!data.access_token) throw new Error('discord: access_token manquant');
      return data.access_token;
    },
    async getProfile(token) {
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`discord profile ${res.status}`);
      const d = await res.json();
      const avatarUrl = d.avatar
        ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png?size=128`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
      return {
        providerId: String(d.id),
        name: d.global_name || d.username || '',
        email: d.email ?? null,
        avatarUrl,
      };
    },
  },

  github: {
    id: 'github',
    clientId: () => env('GITHUB_CLIENT_ID'),
    clientSecret: () => env('GITHUB_CLIENT_SECRET'),
    scope: 'read:user user:email',
    authorize(state) {
      return authorizeUrl('https://github.com/login/oauth/authorize', {
        client_id: this.clientId(),
        redirect_uri: redirectUri('github'),
        response_type: 'code',
        scope: this.scope,
        state,
      });
    },
    async exchange(code) {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'delivro-backend',
        },
        body: new URLSearchParams({
          client_id: this.clientId(),
          client_secret: this.clientSecret(),
          code,
          redirect_uri: redirectUri('github'),
        }).toString(),
      });
      if (!res.ok) throw new Error(`github token ${res.status}`);
      const data = await res.json();
      if (!data.access_token) throw new Error(`github: ${data.error || 'access_token manquant'}`);
      return data.access_token;
    },
    async getProfile(token) {
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'delivro-backend',
      };
      const res = await fetch('https://api.github.com/user', { headers });
      if (!res.ok) throw new Error(`github profile ${res.status}`);
      const d = await res.json();
      let email = d.email ?? null;
      if (!email) {
        try {
          const er = await fetch('https://api.github.com/user/emails', { headers });
          if (er.ok) {
            const emails = await er.json();
            const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
            email = primary ? primary.email : null;
          }
        } catch {
          /* email optionnel */
        }
      }
      return {
        providerId: String(d.id),
        name: d.name || d.login || '',
        email,
        avatarUrl: d.avatar_url || null,
      };
    },
  },

  google: {
    id: 'google',
    clientId: () => env('GOOGLE_CLIENT_ID'),
    clientSecret: () => env('GOOGLE_CLIENT_SECRET'),
    scope: 'openid email profile',
    authorize(state) {
      return authorizeUrl('https://accounts.google.com/o/oauth2/v2/auth', {
        client_id: this.clientId(),
        redirect_uri: redirectUri('google'),
        response_type: 'code',
        scope: this.scope,
        access_type: 'offline',
        prompt: 'select_account',
        state,
      });
    },
    async exchange(code) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId(),
          client_secret: this.clientSecret(),
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri('google'),
        }).toString(),
      });
      if (!res.ok) throw new Error(`google token ${res.status}`);
      const data = await res.json();
      if (!data.access_token) throw new Error('google: access_token manquant');
      return data.access_token;
    },
    async getProfile(token) {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`google profile ${res.status}`);
      const d = await res.json();
      return {
        providerId: String(d.sub),
        name: d.name || d.email || '',
        email: d.email ?? null,
        avatarUrl: d.picture || null,
      };
    },
  },
};

export function isConfigured(provider) {
  const conf = typeof provider === 'string' ? PROVIDERS[provider] : provider;
  return !!(conf && conf.clientId() && conf.clientSecret());
}
