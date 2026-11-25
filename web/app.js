'use strict';

/* ============================================================
   ShopTaBouffe — UI web (client Windows / navigateur)
   Mêmes contrats et mêmes libellés que l'app Android.
   ============================================================ */

/* ---------------- Constantes ---------------- */

const CATEGORIES = [
  'Pizza', 'Burger', 'Sushi', 'Dessert', 'Boisson',
  'Sandwich', 'Salade', 'Snack', 'Plat', 'Épicerie',
];

const STATUS = {
  pending: 'En attente',
  accepted: 'Acceptée',
  preparing: 'En préparation',
  delivering: 'En livraison',
  delivered: 'Livrée',
  refused: 'Refusée',
};

const STEPS = [
  ['pending', 'Commande envoyée', 'Le vendeur reçoit votre commande'],
  ['accepted', 'Acceptée par le fournisseur', 'Votre commande est confirmée'],
  ['preparing', 'En préparation', 'Le vendeur prépare vos articles'],
  ['delivering', 'En livraison', 'Votre commande est en route'],
  ['delivered', 'Livrée', 'Commande livrée — merci !'],
];

const ISSUES_URL = 'https://github.com/tear360/ShopTaBouffe/issues/new';

/* Icônes SVG inline (pas d'emoji) — dessinées au trait, héritent de la couleur du texte. */
const ICONS = {
  store: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></svg>',
  box: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  wallet: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
  cart: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  receipt: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg>',
  chat: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  person: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  search: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  trash: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  edit: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  minus: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  lock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  chart: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  pin: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  phone: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  note: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
  refresh: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  back: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  send: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  check: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  warn: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  wave: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  close: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  calendar: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  arrow: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  bag: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  logout: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  tag: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  success: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
};

function emojiFor(category) { return ICONS.box; }

function icon(name) { return ICONS[name] || ''; }

const PROVIDER_LABELS = { github: 'GitHub', google: 'Google', local: 'Mot de passe', demo: 'Invité' };

/* Logos OAuth (SVG inline <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> lisibles sur fond sombre comme sur clair). */
const LOGO_GOOGLE = `<svg class="plogo" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/>
  <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/>
  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/>
</svg>`;
const LOGO_GITHUB = `<svg class="plogo" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

/* ---------------- État ---------------- */

const state = {
  token: localStorage.getItem('stb_token') || '',
  user: null,
  view: 'gallery',
  param: null,
  cart: loadCart(),
  // boutique
  shopStatus: { closed: false, reopensAt: null, now: null },
  shopReopenValue: '',
  products: [], search: '', category: '',
  categories: [],
  // commandes
  orders: [], orderFilter: 'all', order: null,
  // chat
  convs: [], conv: null, messages: [], chatBlocked: false, chatError: null, sending: false,
  // fournisseur
  adminTab: 'orders', adminFilter: 'all',
  adminOrders: [], adminProducts: [], adminConvs: [],
  // finances
  fin: null, finSales: [], finProducts: [], expenses: [],
  finFrom: '', finTo: '',
  // divers
  loading: false, error: null, notice: null,
  loginError: null, loginNotice: null, loginName: '', loggingIn: false,
  loginMode: 'login', loginUsername: '', loginPassword: '',
  regName: '', regUsername: '', regPassword: '', regBusy: false, regError: null,
  // mot de passe oublié / réinitialisation
  forgotEmail: '', forgotBusy: false, forgotDone: false,
  resetToken: '', resetValid: null, resetPassword: '', resetConfirm: '', resetBusy: false,
  // double authentification à la connexion
  challengeToken: '', twofaCode: '', twofaRecovery: '', twofaBusy: false,
  upgradeModal: false, upgradeName: '', upgradeUsername: '', upgradePassword: '', upgradeBusy: false, upgradeError: null,
  // compte
  account: null, accountBusy: false, accountError: null, accountNotice: null,
  accountTab: 'info',
  emailVerify: null, emailVerifyBusy: false,
  passwordForm: { current: '', next: '', confirm: '' }, passwordBusy: false,
  twofaSetup: null, twofaSetupCode: '', twofaSetupBusy: false,
  twofaRecoveryCodes: [], twofaDisableCode: '', twofaDisablePassword: '', twofaDisableBusy: false,
  deletePassword: '', deleteConfirm: '', deleteBusy: false,
  socket: null, joinedConv: null,
};

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem('stb_cart') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function saveCart() { localStorage.setItem('stb_cart', JSON.stringify(state.cart)); }

/* ---------------- Petits utilitaires ---------------- */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function h(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function euro(cents) {
  return (Number(cents || 0) / 100).toFixed(2).replace('.', ',') + ' €';
}

/** Prix effectivement payé : la remise si elle est active, sinon le prix normal. */
function effectivePriceCents(p) {
  if (p && p.discountPriceCents != null) return Number(p.discountPriceCents);
  return Number((p && p.priceCents) || 0);
}

/** Affichage d'un prix : ancien prix barré et nouveau prix fluo si remise active. */
function priceLabel(p) {
  if (p && p.discountPriceCents != null) {
    return `<span class="price-wrap"><span class="price-old">${euro(p.priceCents)}</span><span class="price-new">${euro(p.discountPriceCents)}</span></span>`;
  }
  return `<span class="price">${euro(p ? p.priceCents : 0)}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function avatarHtml(user, cls) {
  const url = user && user.avatarUrl;
  const initial = h(((user && user.name) || '?').trim().charAt(0).toUpperCase() || '?');
  return `<span class="avatar ${cls || ''}">${url ? `<img src="${h(url)}" alt="" />` : initial}</span>`;
}

/** Noms de catégories : table `categories` du serveur, repli sur la liste par défaut. */
function categoryNames() {
  if (state.categories.length) return state.categories.map((c) => c.name);
  return CATEGORIES;
}

let toastTimer = null;
function toast(message, kind) {
  const el = $('#toast');
  el.textContent = message;
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

class NetError extends Error {}
class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

/* ---------------- API ---------------- */

async function api(path, opts) {
  const o = opts || {};
  const headers = {};
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  let body;
  if (o.form) {
    body = o.form;
  } else if (o.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(o.body);
  }
  let res;
  try {
    res = await fetch('/api' + path, { method: o.method || 'GET', headers, body });
  } catch {
    throw new NetError('Erreur : vérifiez votre connexion à Internet');
  }
  if (res.status === 401 && state.token && !o.noLogout) {
    logout(false);
    throw new ApiError('Session expirée, veuillez vous reconnecter.', 401);
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { /* réponse non JSON */ } }
  if (!res.ok) {
    const code = data && data.code;
    const msg = (data && data.error) || (res.status >= 500
      ? 'Erreur : vérifiez votre connexion à Internet'
      : 'Erreur serveur (' + res.status + ')');
    throw new ApiError(msg, res.status, code);
  }
  return data;
}

/* ---------------- Session ---------------- */

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('stb_token', token);
}

function logout(callApi) {
  // Un ancien compte invité ne peut pas se déconnecter avant d'avoir choisi
  // ses identifiants : il perdrait sinon la possibilité de se reconnecter.
  if (state.user && state.user.provider === 'demo') {
    state.upgradeModal = true;
    state.upgradeName = state.user.name || '';
    state.upgradeError = 'Finalisez votre compte avant de vous déconnecter.';
    render();
    return;
  }
  if (callApi !== false && state.token) {
    // best effort : on vide la session quand même
    fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + state.token } }).catch(() => {});
  }
  state.token = '';
  state.user = null;
  state.view = 'gallery';
  state.cart = [];
  saveCart();
  localStorage.removeItem('stb_token');
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  render();
}

function loginErrorFromUrl() {
  const p = new URLSearchParams(location.search);
  const err = p.get('error');
  if (!err) return null;
  const map = {
    not_configured: 'Ce fournisseur de connexion n’est pas encore configuré.',
    state_mismatch: 'Session expirée, réessayez la connexion.',
    provider_error: 'Erreur pendant la connexion, réessayez.',
    missing_code: 'Erreur pendant la connexion, réendez-vous.',
    link_invalid: 'Session expirée, reconnectez-vous avant de lier un compte.',
    identity_taken: 'Cette identité est déjà liée à un autre compte.',
  };
  return map[err] || 'Erreur pendant la connexion.';
}

/* ---------------- Statut de la boutique ---------------- */

let shopStatusRefreshing = false;
let shopCountdownTimer = null;

function normalizeShopStatus(data) {
  const reopensAt = data && data.reopensAt ? data.reopensAt : null;
  const ts = reopensAt ? new Date(reopensAt).getTime() : NaN;
  const expired = Number.isFinite(ts) && ts <= Date.now();
  return {
    closed: !!(data && data.closed) && !expired,
    reopensAt,
    now: (data && data.now) || null,
  };
}

function setShopStatus(data) {
  state.shopStatus = normalizeShopStatus(data);
}

async function loadShopStatus() {
  try {
    setShopStatus(await api('/shop/status'));
  } catch { /* statut non bloquant */ }
}

function shopStatusExpired() {
  if (!state.shopStatus.reopensAt) return false;
  const ts = new Date(state.shopStatus.reopensAt).getTime();
  return Number.isFinite(ts) && ts <= Date.now();
}

function refreshShopStatusOnce() {
  if (shopStatusRefreshing) return Promise.resolve();
  shopStatusRefreshing = true;
  return loadShopStatus().finally(() => { shopStatusRefreshing = false; });
}

function formatShopCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) return `${days} j ${hours} h ${minutes} min`;
  if (hours) return `${hours} h ${minutes} min`;
  if (minutes) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

function shopBlocksView() {
  if (!state.shopStatus.closed || shopStatusExpired()) return false;
  if (state.view === 'profile') return false;
  return !(isSupplier() && (state.view === 'admin' || state.view === 'finances'));
}

function shopInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shopReopenDefault() {
  return shopInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function viewShopClosed() {
  const reopensAt = state.shopStatus.reopensAt;
  const ts = reopensAt ? new Date(reopensAt).getTime() : NaN;
  const countdown = Number.isFinite(ts) ? formatShopCountdown(ts - Date.now()) : 'bientôt';
  return `
  <div class="shop-closed">
    <div class="shop-closed-logo">${ICONS.store}</div>
    <h1>Boutique fermée</h1>
    <p class="shop-closed-message">Réouverture dans</p>
    <div class="shop-closed-countdown" id="shop-countdown" role="status" aria-live="polite">${h(countdown)}</div>
    ${reopensAt ? `<p class="shop-closed-date">Réouverture prévue le ${h(fmtDate(reopensAt))}</p>` : ''}
    <div class="shop-closed-links">
      <button class="btn btn-ghost btn-sm" type="button" data-action="go" data-view="profile">Mon profil</button>
      ${isSupplier() ? `<button class="btn btn-ghost btn-sm" type="button" data-action="go" data-view="admin">Administration</button>` : ''}
    </div>
  </div>`;
}

function stopShopCountdown() {
  if (shopCountdownTimer) {
    clearInterval(shopCountdownTimer);
    shopCountdownTimer = null;
  }
}

function startShopCountdown() {
  stopShopCountdown();
  const tick = () => {
    const el = $('#shop-countdown');
    if (!el) { stopShopCountdown(); return; }
    if (shopStatusExpired()) { render(); return; }
    const ts = state.shopStatus.reopensAt ? new Date(state.shopStatus.reopensAt).getTime() : NaN;
    el.textContent = Number.isFinite(ts) ? formatShopCountdown(ts - Date.now()) : 'bientôt';
  };
  tick();
  shopCountdownTimer = setInterval(tick, 1000);
}

/* ---------------- Rendu : dispatcher ---------------- */

function render() {
  const app = $('#app');
  stopShopCountdown();
  const authScreen = state.loginMode === 'forgot' || state.loginMode === 'reset'
    || state.loginMode === 'twofa';
  if (!state.token || !state.user || authScreen) {
    app.innerHTML = viewLogin() + (state.upgradeModal ? viewUpgradeModal() : '');
    return;
  }

  if (state.shopStatus.closed && shopStatusExpired()) {
    state.shopStatus.closed = false;
    refreshShopStatusOnce().then(render);
  }

  if (shopBlocksView()) {
    app.innerHTML = viewShopClosed() + (state.upgradeModal ? viewUpgradeModal() : '');
    startShopCountdown();
    return;
  }

  app.innerHTML = shell() + (state.upgradeModal ? viewUpgradeModal() : '');
  afterRender();
}

/* ---------------- Écran de connexion ---------------- */

function viewLogin() {
  const err = state.error || state.loginError;
  const isLogin = state.loginMode === 'login';
  const isRegister = state.loginMode === 'register';
  const isForgot = state.loginMode === 'forgot';
  const isReset = state.loginMode === 'reset';
  const isTwofa = state.loginMode === 'twofa';
  const backLogin = `<button class="btn btn-ghost" type="button" data-action="auth-mode" data-mode="login">Retour à la connexion</button>`;

  let content = '';
  if (isLogin) {
    content = `
      <form id="login-form">
        <div class="field">
          <label for="login-username">Nom d'utilisateur</label>
          <input id="login-username" name="username" maxlength="32" autocomplete="username"
                 placeholder="Ex. : lea" value="${h(state.loginUsername)}" required />
        </div>
        <div class="field">
          <label for="login-password">Mot de passe</label>
          <input id="login-password" name="password" type="password" maxlength="128" autocomplete="current-password"
                 placeholder="••••••" value="${h(state.loginPassword)}" required />
        </div>
        <button class="forgot" type="button" data-action="auth-mode" data-mode="forgot">Mot de passe oublié ?</button>
        <button class="btn" type="submit" ${state.loggingIn ? 'disabled' : ''}>
          ${state.loggingIn ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>`;
  } else if (isRegister) {
    content = `
      <form id="register-form">
        <div class="field">
          <label for="reg-name">Votre nom</label>
          <input id="reg-name" name="name" maxlength="80" autocomplete="name"
                 placeholder="Ex. : Léa" value="${h(state.regName)}" required />
        </div>
        <div class="field">
          <label for="reg-username">Nom d'utilisateur</label>
          <input id="reg-username" name="username" maxlength="32" autocomplete="username"
                 placeholder="Ex. : lea" value="${h(state.regUsername)}" required />
        </div>
        <div class="field">
          <label for="reg-password">Mot de passe</label>
          <input id="reg-password" name="password" type="password" maxlength="128" autocomplete="new-password"
                 placeholder="6 caractères minimum" value="${h(state.regPassword)}" required />
        </div>
        <button class="btn" type="submit" ${state.regBusy ? 'disabled' : ''}>
          ${state.regBusy ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>`;
  } else if (isForgot) {
    content = `
      <h2 class="auth-title">Mot de passe oublié ?</h2>
      ${state.forgotDone ? `
        <p class="login-card-text">Si cette adresse est associée à un compte, un lien de réinitialisation a été envoyé. Vérifiez votre boîte mail.</p>
        ${backLogin}` : `
        <p class="login-card-text">Saisissez votre adresse e-mail. Nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
        <form id="forgot-form">
          <div class="field">
            <label for="forgot-email">Adresse e-mail</label>
            <input id="forgot-email" name="email" type="email" maxlength="180" autocomplete="email"
                   placeholder="vous@exemple.com" value="${h(state.forgotEmail)}" required />
          </div>
          <button class="btn" type="submit" ${state.forgotBusy ? 'disabled' : ''}>
            ${state.forgotBusy ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>
        ${backLogin}`}`;
  } else if (isReset) {
    content = `
      <h2 class="auth-title">Nouveau mot de passe</h2>
      ${state.resetValid === null ? `
        <p class="login-card-text">Vérification du lien en cours…</p>` : ''}
      ${state.resetValid === false ? `
        <p class="login-card-text">Ce lien de réinitialisation n’est pas valide ou a expiré. Vous pouvez demander un nouveau lien.</p>
        <div class="auth-stack">
          <button class="btn" type="button" data-action="auth-mode" data-mode="forgot">Demander un nouveau lien</button>
          ${backLogin}
        </div>` : ''}
      ${state.resetValid === true ? `
        <form id="reset-form">
          <div class="field">
            <label for="reset-password">Nouveau mot de passe</label>
            <input id="reset-password" name="password" type="password" maxlength="128" autocomplete="new-password"
                   minlength="6" placeholder="6 caractères minimum" value="${h(state.resetPassword)}" required />
          </div>
          <div class="field">
            <label for="reset-confirm">Confirmer le mot de passe</label>
            <input id="reset-confirm" name="confirm" type="password" maxlength="128" autocomplete="new-password"
                   placeholder="Répétez le mot de passe" value="${h(state.resetConfirm)}" required />
          </div>
          <button class="btn" type="submit" ${state.resetBusy ? 'disabled' : ''}>
            ${state.resetBusy ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
          </button>
        </form>` : ''}`;
  } else if (isTwofa) {
    content = `
      <h2 class="auth-title">Double authentification</h2>
      <p class="login-card-text">Un code est requis pour terminer la connexion. Utilisez le code de votre application d’authentification ou l’un de vos codes de récupération.</p>
      <form id="twofa-form">
        <div class="field">
          <label for="twofa-code">Code d'authentification</label>
          <input id="twofa-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12"
                 placeholder="123456" value="${h(state.twofaCode)}" />
        </div>
        <div class="field">
          <label for="twofa-recovery">Code de récupération</label>
          <input id="twofa-recovery" name="recoveryCode" maxlength="32" autocomplete="off"
                 placeholder="XXXX-XXXX-XXXX" value="${h(state.twofaRecovery)}" />
        </div>
        <button class="btn" type="submit" ${state.twofaBusy ? 'disabled' : ''}>
          ${state.twofaBusy ? 'Vérification…' : 'Vérifier le code'}
        </button>
      </form>
      <button class="btn btn-ghost" type="button" data-action="auth-mode" data-mode="login">Annuler</button>`;
  }

  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo">${ICONS.bag}</div>
      <h1>ShopTaBouffe</h1>
      ${err ? `<div class="login-error">${h(err)}</div>` : ''}
      ${state.loginNotice ? `<div class="info-box">${h(state.loginNotice)}</div>` : ''}
      ${isLogin || isRegister ? `
      <div class="auth-tabs">
        <button class="btn btn-ghost btn-sm ${isLogin ? 'active' : ''}" data-action="auth-mode" data-mode="login">Se connecter</button>
        <button class="btn btn-ghost btn-sm ${isRegister ? 'active' : ''}" data-action="auth-mode" data-mode="register">S'inscrire</button>
      </div>` : ''}
      ${content}
      ${isLogin || isRegister ? `
      <div class="divider">ou continuer avec</div>
      <a class="btn btn-provider google" href="/api/auth/start?provider=google&target=web">${LOGO_GOOGLE} Continuer avec Google</a>
      <a class="btn btn-provider github" href="/api/auth/start?provider=github&target=web">${LOGO_GITHUB} Continuer avec GitHub</a>` : ''}
    </div>
  </div>`;
}

function viewUpgradeModal() {
  const err = state.upgradeError;
  const name = state.upgradeName || '';
  return `
  <div class="modal-backdrop modal-mandatory" id="upgrade-backdrop">
    <div class="modal">
      <h3>Finalisez votre compte</h3>
      <p style="color:var(--muted);font-size:13.5px;margin:0 0 14px">
        Votre commande et vos données sont conservées. Choisissez simplement un
        <strong>nom d'utilisateur</strong> et un <strong>mot de passe</strong> pour garder
        accès à votre compte. Votre nom est déjà renseigné.
      </p>
      ${err ? `<div class="login-error">${h(err)}</div>` : ''}
      <form id="upgrade-form">
        <div class="field">
          <label for="up-name">Votre nom</label>
          <input id="up-name" name="name" maxlength="80" value="${h(name)}"
                 ${name ? 'readonly' : ''} autocomplete="name" required />
          ${name ? '<small class="field-hint">Repris de votre compte invité — conservé tel quel.</small>' : ''}
        </div>
        <div class="field">
          <label for="up-username">Nom d'utilisateur</label>
          <input id="up-username" name="username" maxlength="32" autocomplete="username"
                 placeholder="Ex. : lea (3 caractères minimum)" value="${h(state.upgradeUsername)}" required />
        </div>
        <div class="field">
          <label for="up-password">Mot de passe</label>
          <input id="up-password" name="password" type="password" maxlength="128" autocomplete="new-password"
                 minlength="6" placeholder="6 caractères minimum" value="${h(state.upgradePassword)}" required />
        </div>
        <div class="actions">
          <button class="btn" type="submit" ${state.upgradeBusy ? 'disabled' : ''}>
            ${state.upgradeBusy ? 'Enregistrement…' : 'Enregistrer mon compte'}
          </button>
        </div>
      </form>
    </div>
  </div>`;
}

function cartCount() { return state.cart.reduce((n, l) => n + l.qty, 0); }

function isSupplier() { return state.user && state.user.role === 'supplier'; }
function chatAllowed() { return state.user != null; }

function navItems() {
  const items = [
    { id: 'gallery', label: 'Boutique', icon: ICONS.store },
  ];
  if (isSupplier()) {
    items.push({ id: 'admin', label: 'Produits', icon: ICONS.box });
    items.push({ id: 'finances', label: 'Finances', icon: ICONS.wallet });
  } else {
    items.push({ id: 'cart', label: 'Panier', icon: ICONS.cart, badge: cartCount() });
    items.push({ id: 'orders', label: 'Commandes', icon: ICONS.receipt });
  }
  items.push({ id: 'profile', label: 'Profil', icon: ICONS.person });
  return items;
}

function shell() {
  const items = navItems();
  const active = state.view === 'orderDetail' ? 'orders'
    : state.view === 'chatThread' ? (isSupplier() ? 'admin' : 'orders')
    : state.view;
  const n = state.user.name || '?';
  return `
  <header class="topbar">
    <div class="brand" data-action="go" data-view="gallery">
      <span class="logo">${ICONS.bag}</span> ShopTaBouffe
    </div>
    <div class="spacer"></div>
    ${!isSupplier() ? `
    <button class="icon-btn" data-action="go" data-view="cart" title="Panier">
      ${ICONS.cart}${cartCount() ? `<span class="badge">${cartCount()}</span>` : ''}
    </button>` : ''}
    <span class="avatar" data-action="go" data-view="profile" title="${h(n)}">
      ${state.user.avatarUrl ? `<img src="${h(state.user.avatarUrl)}" alt="" />` : h(n.charAt(0).toUpperCase())}
    </span>
  </header>
  <main>${mainView()}</main>
  <nav class="nav" aria-label="Navigation principale">
    ${items.map((it) => `
      <button data-action="go" data-view="${it.id}" class="${active === it.id ? 'active' : ''}"
              aria-current="${active === it.id ? 'page' : 'false'}">
        <span class="ic" aria-hidden="true">${it.icon}</span>
        <span class="lb">${h(it.label)}</span>
        ${it.badge ? `<span class="nav-badge">${it.badge}</span>` : ''}
      </button>`).join('')}
  </nav>`;
}

function mainView() {
  switch (state.view) {
    case 'gallery': return viewGallery();
    case 'cart': return viewCart();
    case 'orders': return viewOrders();
    case 'orderDetail': return viewOrderDetail();
    case 'chat': return viewChatList();
    case 'chatThread': return viewChatThread();
    case 'profile': return viewProfile();
    case 'admin': return viewAdmin();
    case 'finances': return viewFinances();
    default: return viewGallery();
  }
}

function afterRender() {
  if (state.view === 'chatThread') {
    const body = $('#chat-body');
    if (body) body.scrollTop = body.scrollHeight;
    const inp = $('#chat-msg');
    if (inp && state.focusChat) { inp.focus(); state.focusChat = false; }
  }
}

/* ---------------- Boutique ---------------- */

function visibleProducts() {
  const q = state.search.trim().toLowerCase();
  return state.products.filter((p) => {
    if (state.category && p.category !== state.category) return false;
    if (!q) return true;
    return (p.name + ' ' + (p.description || '')).toLowerCase().includes(q);
  });
}

function productCard(p) {
  const line = state.cart.find((l) => l.productId === p.id);
  const emoji = emojiFor(p.category);
  return `
  <div class="card">
    <div class="thumb">${p.imageUrl ? `<img src="${h(p.imageUrl)}" alt="${h(p.name)}" loading="lazy" />` : emoji}</div>
    <div class="body">
      <div class="row">
        <span class="name">${h(p.name)}</span>
        <span>${p.kind === 'formule' ? '<span class="tag formule">Formule</span> ' : ''}<span class="tag">${h(p.category)}</span></span>
      </div>
      <div class="desc">${h(p.description || '')}</div>
      <div class="row">
        ${priceLabel(p)}
        ${!p.available ? `<span class="tag off">Indisponible</span>` : (isSupplier() ? '' : (line ? `
          <span class="qty-box">
            <button data-action="cart-dec" data-id="${p.id}" aria-label="Retirer">−</button>
            <span class="n">${line.qty}</span>
            <button data-action="cart-inc" data-id="${p.id}" aria-label="Ajouter">+</button>
          </span>` : `
          <button class="btn btn-sm" data-action="cart-add" data-id="${p.id}" ${p.available ? '' : 'disabled'}>Ajouter</button>`))}
      </div>
    </div>
  </div>`;
}

function viewGallery() {
  const list = visibleProducts();
  // chips : catégories du serveur ∪ celles portées par des produits (héritage), triées, sans doublon
  const used = new Set(state.products.map((p) => p.category));
  const cats = [...new Set([...categoryNames(), ...used])]
    .filter((c) => used.has(c))
    .sort((a, b) => a.localeCompare(b, 'fr'));
  return `
  <div class="view-title">Boutique <span class="count">${list.length} produit(s)</span>
    <span style="flex:1"></span>
    <button class="btn btn-ghost btn-sm" data-action="refresh"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Rafraîchir</button>
  </div>
  <div class="toolbar">
    <div class="search">
      <span class="mag"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
      <input id="search-input" placeholder="Rechercher un produit…" value="${h(state.search)}" />
    </div>
  </div>
  <div class="chips">
    <button class="chip ${state.category === '' ? 'active' : ''}" data-action="cat" data-cat="">Tout</button>
    ${cats.map((c) => `
      <button class="chip ${state.category === c ? 'active' : ''}" data-action="cat" data-cat="${h(c)}">
        ${emojiFor(c)} ${h(c)}
      </button>`).join('')}
  </div>
  ${state.error ? `<div class="error-box">${h(state.error)}</div>` : ''}
  ${list.length === 0 ? `
    <div class="empty">
      <div class="big">${ICONS.box}</div>
      <div class="t">Aucun produit trouvé</div>
      <div>Essayez une autre recherche ou une autre catégorie.</div>
    </div>` : `
    <div class="grid" id="grid">${list.map(productCard).join('')}</div>`}`;
}

/* ---------------- Panier ---------------- */

function cartTotal() { return state.cart.reduce((n, l) => n + l.priceCents * l.qty, 0); }

/** Met à jour les lignes du panier dès que le produit est connu (remise expirée ou modifiée). */
function refreshCartPrices() {
  let changed = false;
  state.cart.forEach((l) => {
    const p = state.products.find((x) => x.id === l.productId);
    if (!p) return;
    const price = effectivePriceCents(p);
    const old = p.discountPriceCents != null ? Number(p.priceCents) : null;
    if (l.priceCents !== price || (l.oldPriceCents == null ? null : l.oldPriceCents) !== old) {
      l.priceCents = price;
      if (old != null) l.oldPriceCents = old;
      else delete l.oldPriceCents;
      changed = true;
    }
  });
  if (changed) saveCart();
}

function cartPriceLabel(l) {
  return priceLabel(l.oldPriceCents != null && l.oldPriceCents !== l.priceCents
    ? { priceCents: l.oldPriceCents, discountPriceCents: l.priceCents }
    : { priceCents: l.priceCents });
}

function cartTotalLabel() {
  const total = cartTotal();
  const oldTotal = state.cart.reduce(
    (n, l) => n + (l.oldPriceCents != null ? l.oldPriceCents : l.priceCents) * l.qty, 0);
  return priceLabel(oldTotal > total
    ? { priceCents: oldTotal, discountPriceCents: total }
    : { priceCents: total });
}

function viewCart() {
  refreshCartPrices();
  if (state.cart.length === 0) {
    return `
    <div class="view-title">Panier</div>
    <div class="empty">
      <div class="big">${ICONS.box}</div>
      <div class="t">Votre panier est vide</div>
      <div>Ajoutez des produits depuis la boutique.</div>
      <p style="margin-top:16px"><button class="btn btn-sm" data-action="go" data-view="gallery">Voir la boutique</button></p>
    </div>`;
  }
  return `
  <div class="view-title">Panier <span class="count">${cartCount()} article(s)</span></div>
  <div class="two-col">
    <div>
      ${state.cart.map((l) => `
        <div class="cart-line">
          <div class="thumb">${l.imageUrl ? `<img src="${h(l.imageUrl)}" alt="" />` : emojiFor(l.category)}</div>
          <div class="info">
            <div class="nm">${h(l.name)}</div>
            <div class="sub">${cartPriceLabel(l)} × ${l.qty} = <strong>${euro(l.priceCents * l.qty)}</strong></div>
          </div>
          <span class="qty-box">
            <button data-action="cart-dec" data-id="${l.productId}">−</button>
            <span class="n">${l.qty}</span>
            <button data-action="cart-inc" data-id="${l.productId}">+</button>
          </span>
          <button class="icon-btn" data-action="cart-del" data-id="${l.productId}" title="Supprimer"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div>`).join('')}
    </div>
    <div class="panel">
      <h3>Finaliser la commande</h3>
      ${state.error ? `<div class="error-box">${h(state.error)}</div>` : ''}
      <form id="order-form">
        <div class="field">
          <label for="ord-address">Adresse de livraison</label>
          <input id="ord-address" name="address" maxlength="200" required
                 placeholder="12 rue des Lilas, Paris" />
        </div>
        <div class="field">
          <label for="ord-phone">Téléphone</label>
          <input id="ord-phone" name="phone" maxlength="30" required
                 placeholder="0612345789" inputmode="tel"
                 value="${h((state.user && state.user.phone) || '')}" />
        </div>
        <div class="field">
          <label for="ord-note">Note (optionnel)</label>
          <textarea id="ord-note" name="note" maxlength="500" placeholder="Sans oignons, sonner deux fois…"></textarea>
        </div>
        <div class="total-row"><span>Total</span>${cartTotalLabel()}</div>
        <button class="btn" type="submit">Commander</button>
      </form>
    </div>
  </div>`;
}

/* ---------------- Commandes ---------------- */

const ORDER_FILTERS = [
  ['all', 'Toutes'], ['pending', 'En attente'], ['active', 'En cours'], ['done', 'Terminées'],
];

function filterOrders(orders, f) {
  return orders.filter((o) => {
    if (f === 'pending') return o.status === 'pending';
    if (f === 'active') return ['accepted', 'preparing', 'delivering'].includes(o.status);
    if (f === 'done') return ['delivered', 'refused'].includes(o.status);
    return true;
  });
}

function orderCard(o) {
  const items = (o.items || []).map((i) => `${i.qty}× ${i.name}`).join(', ');
  return `
  <div class="order-card" data-action="open-order" data-id="${o.id}">
    <div class="head">
      <span class="num">Commande #${o.id}</span>
      <span class="status ${o.status}">${STATUS[o.status] || o.status}</span>
      <span class="date">${fmtDate(o.createdAt)}</span>
    </div>
    <div class="items">${h(items)}</div>
    <div class="foot">
      <span class="price">${euro(o.totalCents)}</span>
      <span class="btn btn-ghost btn-sm">Voir le détail <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>
    </div>
  </div>`;
}

function viewOrders() {
  const list = filterOrders(state.orders, state.orderFilter);
  return `
  <div class="view-title">Mes commandes <span class="count">${list.length} commande(s)</span>
    <span style="flex:1"></span>
    <button class="btn btn-ghost btn-sm" data-action="refresh"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Rafraîchir</button>
  </div>
  <div class="chips">
    ${ORDER_FILTERS.map(([id, label]) => `
      <button class="chip ${state.orderFilter === id ? 'active' : ''}" data-action="ofilter" data-f="${id}">${label}</button>`).join('')}
  </div>
  ${state.error ? `<div class="error-box">${h(state.error)}</div>` : ''}
  ${list.length === 0 ? `
    <div class="empty">
      <div class="big">${ICONS.box}</div>
      <div class="t">Aucune commande</div>
      <div>Vos commandes apparaîtront ici.</div>
    </div>` : list.map(orderCard).join('')}`;
}

function viewOrderDetail() {
  const o = state.order;
  if (!o) {
    return `<div class="empty"><div class="big">${ICONS.box}</div><div class="t">Chargement…</div></div>`;
  }
  const refused = o.status === 'refused';
  const idx = refused ? -1 : STEPS.findIndex((s) => s[0] === o.status);
  return `
  <div class="view-title">
    <button class="icon-btn" data-action="go" data-view="orders" title="Retour"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></button>
    Commande #${o.id}
    <span class="status ${o.status}">${STATUS[o.status] || o.status}</span>
  </div>
  ${state.error ? `<div class="error-box">${h(state.error)}</div>` : ''}
  <div class="two-col">
    <div class="panel">
      <h3>Suivi</h3>
      ${refused ? `
        <div class="error-box"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cette commande a été refusée par le fournisseur.</div>` : `
        <div class="steps">
          ${STEPS.map((s, i) => `
            <div class="step ${i <= idx ? 'done' : ''} ${i === idx ? 'current' : ''}">
              <div class="rail">
                <div class="dot">${i <= idx ? '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : i + 1}</div>
                <div class="line"></div>
              </div>
              <div class="txt">
                <div class="t">${s[1]}</div>
                <div class="s">${s[2]}</div>
              </div>
            </div>`).join('')}
        </div>`}
      <h3 style="margin-top:6px">Articles</h3>
      ${(o.items || []).map((i) => `
        <div class="line-item">
          <span>${i.qty}× ${h(i.name)}</span>
          <span>${euro(i.priceCents * i.qty)}</span>
        </div>`).join('')}
      <div class="total-row" style="margin-bottom:0"><span>Total</span><span class="price">${euro(o.totalCents)}</span></div>
    </div>
    <div class="panel">
      <h3>Livraison</h3>
      <div class="meta-row"><span class="k">Adresse</span><span>${h(o.address || '—')}</span></div>
      <div class="meta-row"><span class="k">Téléphone</span><span>${h(o.phone || '—')}</span></div>
      ${o.note ? `<div class="meta-row"><span class="k">Note</span><span>${h(o.note)}</span></div>` : ''}
      <div class="meta-row"><span class="k">Commandée le</span><span>${fmtDate(o.createdAt)}</span></div>
      <div class="meta-row"><span class="k">Mise à jour</span><span>${fmtDate(o.updatedAt)}</span></div>
      ${chatAllowed() ? `<p style="margin-top:14px">
        <button class="btn btn-ghost" data-action="go" data-view="chat"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Discuter avec le vendeur</button>
      </p>` : ''}
    </div>
  </div>`;
}

/* ---------------- Chat ---------------- */

function viewChatList() {
  if (state.chatBlocked) {
    return `
    <div class="view-title">Chat</div>
    <div class="empty chat-blocked">
      <div class="big">${ICONS.box}</div>
      <div class="t">Chat réservé</div>
      <div>Chat réservé aux comptes connectés via GitHub ou Google.</div>
      <p style="margin-top:16px">
        <a class="btn btn-sm" style="width:auto" href="/api/auth/start?provider=github&target=web">
          ▶ Se connecter avec GitHub</a>
      </p>
    </div>`;
  }
  if (state.error && !state.convs.length) {
    return `<div class="view-title">Chat</div><div class="error-box">${h(state.error)}</div>`;
  }
  const list = state.convs;
  return `
  <div class="view-title">Chat <span class="count">${list.length} discussion(s)</span>
    <span style="flex:1"></span>
    <button class="btn btn-ghost btn-sm" data-action="refresh"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Rafraîchir</button>
  </div>
  ${list.length === 0 ? `
    <div class="empty">
      <div class="big">${ICONS.box}</div>
      <div class="t">Aucune discussion</div>
      <div>Une conversation avec le vendeur sera créée automatiquement.</div>
    </div>` : `
    <div class="conv-list">
      ${list.map((c) => `
        <div class="conv-item" data-action="open-conv" data-id="${c.id}">
          ${avatarHtml(c.customer)}
          <div class="info">
            <div class="nm">${h((c.customer && c.customer.name) || 'Client')}</div>
            <div class="last">${c.lastMessage ? h(c.lastMessage.body) : 'Aucun message pour l’instant'}</div>
          </div>
          ${c.unreadCount ? `<span class="unread">${c.unreadCount}</span>` : ''}
        </div>`).join('')}
    </div>`}`;
}

function viewChatThread() {
  const conv = state.conv;
  const other = conv && conv.customer ? conv.customer : state.user;
  return `
  <div class="view-title">
    <button class="icon-btn" data-action="go" data-view="${isSupplier() ? 'admin' : 'orders'}" title="Retour"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></button>
    Discussion
  </div>
  ${state.chatError ? `<div class="error-box">${h(state.chatError)}</div>` : ''}
  <div class="chat-wrap">
    <div class="chat-head">
      ${avatarHtml(other)}
      <div>
        <div class="nm">${h((other && other.name) || 'Client')}</div>
        <div class="st">${isSupplier() ? 'Client' : 'Vendeur'} · en ligne</div>
      </div>
    </div>
    <div class="chat-body" id="chat-body">
      ${state.messages.length === 0 ? `
        <div class="empty" style="padding:30px 10px">
          <div class="big">${ICONS.box}</div>
          <div class="t">Dites bonjour !</div>
          <div>Envoyez le premier message.</div>
        </div>` : state.messages.map((m) => {
          const mine = state.user && m.senderId === state.user.id;
          return `
          <div class="msg ${mine ? 'me' : 'them'}">
            <div class="who">${mine ? 'Moi' : h(m.senderName || (isSupplier() ? 'Client' : 'Vendeur'))}</div>
            <div>${h(m.body)}</div>
            <div class="at">${fmtDate(m.createdAt)}</div>
          </div>`;
        }).join('')}
    </div>
    <form class="chat-input" id="chat-form">
      <input id="chat-msg" maxlength="1000" placeholder="Écrivez un message…"
             autocomplete="off" ${state.sending ? 'disabled' : ''} />
      <button type="submit" title="Envoyer" ${state.sending ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </form>
  </div>`;
}

/* ---------------- Modale « Gérer le compte » ---------------- */

const ACCOUNT_TABS = [
  ['info', 'Informations'],
  ['security', 'Sécurité'],
  ['connections', 'Connexions'],
  ['danger', 'Danger'],
];

function accountInfoHtml(acc) {
  return `
    <form id="account-form">
      <div class="field">
        <label for="acc-email">Adresse e-mail (optionnel)</label>
        <input id="acc-email" name="email" type="email" maxlength="180"
               placeholder="vous@exemple.com" value="${h(acc.email || '')}" />
        <span class="field-hint">Laissez vide si vous ne souhaitez pas renseigner d’adresse. Une nouvelle adresse est enregistrée après vérification par code.</span>
      </div>
      ${state.emailVerify ? `
        <div class="info-box">
          Un code à 6 chiffres a été envoyé à <strong>${h(state.emailVerify.email)}</strong>.<br>
          Saisissez-le ci-dessous pour confirmer cette adresse. Votre adresse actuelle reste inchangée jusqu’à validation.
        </div>
        <div class="email-verify">
          <div class="field">
            <label for="acc-verify-code">Code de vérification</label>
            <input id="acc-verify-code" inputmode="numeric" autocomplete="one-time-code"
                   maxlength="6" placeholder="123456" />
            <span class="field-hint">Le code expire dans 10 minutes.</span>
          </div>
          <button class="btn" type="button" data-action="email-verify" ${state.emailVerifyBusy ? 'disabled' : ''}>
            ${state.emailVerifyBusy ? 'Vérification…' : 'Vérifier l’adresse'}
          </button>
          <button class="btn btn-ghost" type="button" data-action="email-resend" ${state.emailVerifyBusy ? 'disabled' : ''}>
            Renvoyer le code
          </button>
        </div>` : ''}
      <div class="field">
        <label for="acc-phone">Numéro de téléphone</label>
        <input id="acc-phone" name="phone" maxlength="30" inputmode="tel"
               placeholder="0612345678" value="${h(acc.phone || '')}" />
        <span class="field-hint">Pré-rempli automatiquement lors de vos commandes.</span>
      </div>
      ${state.accountError ? `<div class="error-box">${h(state.accountError)}</div>` : ''}
      ${state.accountNotice ? `<div class="info-box">${h(state.accountNotice)}</div>` : ''}
      <button class="btn" type="submit" ${state.accountBusy ? 'disabled' : ''}>
        ${state.accountBusy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>`;
}

function accountPasswordHtml(acc) {
  if (!acc.hasPassword) {
    return `<p class="login-card-text">Votre compte n’a pas de mot de passe (connexion via GitHub ou Google). La double authentification reste disponible ci-dessous.</p>`;
  }
  const f = state.passwordForm || {};
  return `
    <form id="account-password-form">
      <div class="field">
        <label for="acc-cur-pwd">Mot de passe actuel</label>
        <input id="acc-cur-pwd" name="currentPassword" type="password" maxlength="128"
               autocomplete="current-password" placeholder="Votre mot de passe actuel"
               value="${h(f.current || '')}" required />
      </div>
      <div class="field">
        <label for="acc-new-pwd">Nouveau mot de passe</label>
        <input id="acc-new-pwd" name="newPassword" type="password" maxlength="128"
               autocomplete="new-password" minlength="6" placeholder="6 caractères minimum"
               value="${h(f.next || '')}" required />
      </div>
      <div class="field">
        <label for="acc-confirm-pwd">Confirmer le nouveau mot de passe</label>
        <input id="acc-confirm-pwd" name="confirmPassword" type="password" maxlength="128"
               autocomplete="new-password" placeholder="Répétez le nouveau mot de passe"
               value="${h(f.confirm || '')}" required />
      </div>
      <button class="btn" type="submit" ${state.passwordBusy ? 'disabled' : ''}>
        ${state.passwordBusy ? 'Modification…' : 'Changer le mot de passe'}
      </button>
    </form>`;
}

function accountTwofaHtml(acc) {
  const enabled = !!acc.twoFactorEnabled;
  const codes = state.twofaRecoveryCodes || [];
  let controls;
  if (enabled) {
    controls = `
      <form id="2fa-disable-form">
        <div class="field">
          <label for="acc-2fa-disable-code">Code d'authentification</label>
          <input id="acc-2fa-disable-code" name="code" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" placeholder="123456" value="${h(state.twofaDisableCode)}" required />
        </div>
        ${acc.hasPassword ? `
        <div class="field">
          <label for="acc-2fa-disable-pwd">Mot de passe</label>
          <input id="acc-2fa-disable-pwd" name="password" type="password" maxlength="128"
                 autocomplete="current-password" placeholder="Votre mot de passe"
                 value="${h(state.twofaDisablePassword)}" required />
        </div>` : ''}
        <button class="btn btn-danger" type="submit" ${state.twofaDisableBusy ? 'disabled' : ''}>
          ${state.twofaDisableBusy ? 'Désactivation…' : 'Désactiver la double authentification'}
        </button>
      </form>`;
  } else if (state.twofaSetup) {
    controls = `
      <p class="login-card-text">Scannez ce QR code avec votre application d’authentification, ou saisissez la clé secrète manuellement.</p>
      ${state.twofaSetup.qrDataUrl ? `<img class="twofa-qr" src="${h(state.twofaSetup.qrDataUrl)}" alt="QR code de configuration de la double authentification" />` : ''}
      <div class="field">
        <label>Clé secrète (saisie manuelle)</label>
        <code class="twofa-secret">${h(state.twofaSetup.secret || '')}</code>
        <span class="field-hint">À copier dans votre application si le QR code ne peut pas être scanné.</span>
      </div>
      <form id="2fa-enable-form">
        <div class="field">
          <label for="acc-2fa-enable-code">Code à 6 chiffres</label>
          <input id="acc-2fa-enable-code" name="code" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" placeholder="123456" value="${h(state.twofaSetupCode)}" required />
        </div>
        <div class="actions">
          <button class="btn" type="submit" ${state.twofaSetupBusy ? 'disabled' : ''}>
            ${state.twofaSetupBusy ? 'Activation…' : 'Activer'}
          </button>
          <button class="btn btn-ghost" type="button" data-action="2fa-setup-cancel"
                  ${state.twofaSetupBusy ? 'disabled' : ''}>Annuler</button>
        </div>
      </form>`;
  } else {
    controls = `
      <button class="btn btn-ghost" type="button" data-action="2fa-start" ${state.twofaSetupBusy ? 'disabled' : ''}>
        ${state.twofaSetupBusy ? 'Préparation…' : 'Configurer la double authentification'}
      </button>`;
  }
  return `
    <div class="account-subsection">
      <h4>Double authentification</h4>
      <div class="setting-row">
        <span class="ic">${ICONS.lock}</span>
        <div class="info">
          <div class="t">État</div>
          <div class="s">${enabled
            ? 'Un code est demandé à chaque connexion par mot de passe.'
            : 'Protégez votre compte avec une application d’authentification (TOTP).'}</div>
        </div>
        <span class="pill ${enabled ? 'on' : ''}">${enabled ? 'Activée' : 'Désactivée'}</span>
      </div>
      ${codes.length ? `
      <div class="recovery-box">
        <div class="recovery-title">${ICONS.warn} Codes de récupération — à conserver précieusement</div>
        <p class="login-card-text">Ces codes ne seront affichés qu’<strong>une seule fois</strong>. Notez-les et conservez-les dans un endroit sûr : ils permettent de se reconnecter si vous perdez votre application d’authentification.</p>
        <div class="recovery-codes">${codes.map((c) => `<code>${h(c)}</code>`).join('')}</div>
        <button class="btn btn-ghost btn-sm" type="button" data-action="2fa-recovery-done">J’ai conservé ces codes</button>
      </div>` : ''}
      ${controls}
    </div>`;
}

function accountSecurityHtml(acc) {
  return `
    <div class="account-subsection">
      <h4>Changer le mot de passe</h4>
      ${accountPasswordHtml(acc)}
    </div>
    ${accountTwofaHtml(acc)}`;
}

function accountConnectionsHtml(acc) {
  const canUnlink = (item) =>
    acc.identities.some((i) => i.provider !== item.provider) ||
    (item.provider !== 'local' && acc.hasPassword);
  const oauthButtons = ['github', 'google'].filter(
    (p) => !acc.identities.some((i) => i.provider === p)
  );
  return `
    <h4>Moyens de connexion</h4>
    ${acc.identities.length === 0
      ? `<div class="login-card-text">Chargement…</div>`
      : acc.identities.map((i) => `
        <div class="setting-row">
          <span class="ic">${i.provider === 'github' ? LOGO_GITHUB : i.provider === 'google' ? LOGO_GOOGLE : ''}</span>
          <div class="info">
            <div class="t">${h(PROVIDER_LABELS[i.provider] || i.provider)}</div>
            <div class="s">${i.provider === 'local' ? 'Connexion par nom d’utilisateur et mot de passe' : h(i.email || 'Identité liée')}</div>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-action="account-unlink" data-provider="${h(i.provider)}"
                  ${canUnlink(i) ? '' : 'disabled title="Ajoutez un autre moyen de connexion avant de dissocier"'}>Dissocier</button>
        </div>`).join('')}
    ${oauthButtons.length ? `
      <div class="account-links">
        ${oauthButtons.map((p) => `
          <button class="btn btn-ghost btn-sm" type="button" data-action="account-link" data-provider="${p}">
            ${p === 'github' ? LOGO_GITHUB : LOGO_GOOGLE} Lier ${PROVIDER_LABELS[p]}
          </button>`).join('')}
      </div>` : `<div class="login-card-text">GitHub et Google sont tous deux liés à ce compte.</div>`}`;
}

function accountDangerHtml(acc) {
  const withPassword = !!acc.hasPassword;
  return `
    <div class="account-subsection danger-zone">
      <h4>Supprimer mon compte</h4>
      <p class="login-card-text">Cette action est définitive : vos commandes, messages et identités seront effacés. L’argent rapporté dans les finances est conservé.</p>
      <form id="account-delete-form">
        <div class="field">
          <label for="acc-delete-value">${withPassword ? 'Mot de passe' : 'Confirmation'}</label>
          <input id="acc-delete-value" name="value" type="${withPassword ? 'password' : 'text'}"
                 maxlength="128" autocomplete="${withPassword ? 'current-password' : 'off'}"
                 placeholder="${withPassword ? 'Votre mot de passe' : 'Saisissez SUPPRIMER'}"
                 value="${h(withPassword ? state.deletePassword : state.deleteConfirm)}" required />
          ${withPassword ? '' : '<span class="field-hint">Saisissez exactement SUPPRIMER (en majuscules).</span>'}
        </div>
        <button class="btn btn-danger" type="submit" ${state.deleteBusy ? 'disabled' : ''}>
          ${state.deleteBusy ? 'Suppression…' : 'Supprimer définitivement mon compte'}
        </button>
      </form>
    </div>`;
}

function accountModalHtml() {
  const acc = state.account || {
    email: '', phone: '', identities: [], hasPassword: false, twoFactorEnabled: false,
  };
  const tab = ACCOUNT_TABS.some(([id]) => id === state.accountTab) ? state.accountTab : 'info';
  let section = '';
  if (tab === 'info') section = accountInfoHtml(acc);
  else if (tab === 'security') section = accountSecurityHtml(acc);
  else if (tab === 'connections') section = accountConnectionsHtml(acc);
  else section = accountDangerHtml(acc);
  return `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Gérer le compte">
      <h3>Gérer le compte</h3>
      <div class="account-tabs" role="tablist" aria-label="Catégories du compte">
        ${ACCOUNT_TABS.map(([id, label]) => `
          <button class="account-tab ${tab === id ? 'active' : ''}" type="button" role="tab"
                  aria-selected="${tab === id}" data-action="account-tab" data-tab="${id}">${label}</button>`).join('')}
      </div>
      ${state.accountError && tab !== 'info' ? `<div class="error-box">${h(state.accountError)}</div>` : ''}
      ${state.accountNotice && tab !== 'info' ? `<div class="info-box">${h(state.accountNotice)}</div>` : ''}
      <div class="account-panel" role="tabpanel">${section}</div>
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-close>Fermer</button>
      </div>
    </div>`;
}

function drawAccountModal() {
  const backdrop = document.getElementById('account-modal');
  if (backdrop) backdrop.innerHTML = accountModalHtml();
}

function openAccountModal() {
  if (document.getElementById('account-modal')) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'account-modal';
  backdrop.innerHTML = accountModalHtml();
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) closeAccountModal();
  });
}

function closeAccountModal() {
  const backdrop = document.getElementById('account-modal');
  if (backdrop) backdrop.remove();
  // Les codes de récupération ne doivent être visibles qu'une seule fois.
  state.twofaRecoveryCodes = [];
}

/* ---------------- Profil ---------------- */

function viewProfile() {
  const u = state.user;
  const supplier = isSupplier();
  const notifNew = localStorage.getItem('stb_notif_new') !== '0';
  const notifMine = localStorage.getItem('stb_notif_mine') !== '0';
  return `
  <div class="view-title">Profil</div>
  <div class="profile-head">
    ${avatarHtml(u)}
    <div>
      <div class="nm">${h(u.name)}</div>
      <div class="sub">${h(PROVIDER_LABELS[u.provider] || u.provider)} · ${supplier ? 'Fournisseur' : 'Client'}</div>
    </div>
  </div>
  ${state.error ? `<div class="error-box">${h(state.error)}</div>` : ''}
  ${state.notice ? `<div class="info-box">${h(state.notice)}</div>` : ''}

  <div class="panel">
    <h3>Mon compte</h3>
    <div class="setting-row">
      <span class="ic"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
      <div class="info">
        <div class="t">Informations et connexions</div>
        <div class="s">E-mail, téléphone, moyens de connexion et suppression du compte.</div>
      </div>
      <button class="btn btn-ghost btn-sm" type="button" data-action="account-open">Gérer le compte</button>
    </div>
  </div>

  <div class="panel">
    <h3>Espace fournisseur</h3>
    ${supplier ? `
      <div class="setting-row">
        <span class="ic"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>
        <div class="info">
          <div class="t">Vous êtes fournisseur</div>
          <div class="s">Vos commandes entrantes et votre catalogue sont dans l’onglet Espace fournisseur.</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="go" data-view="admin">Ouvrir</button>
      </div>
      <div class="setting-row">
        <span class="ic"></span>
        <div class="info">
          <div class="t">Quitter le rôle fournisseur</div>
          <div class="s">Revenir à un compte client classique.</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="leave-role">Quitter</button>
      </div>` : `
      <form id="supplier-form">
        <div class="field">
          <label for="sup-code">Code d’accès fournisseur</label>
          <input id="sup-code" name="code" placeholder="Code d'accès" required />
        </div>
        <button class="btn" type="submit">Activer l’espace fournisseur</button>
      </form>`}
  </div>

  <div class="panel">
    <h3>Notifications</h3>
    ${supplier ? `
    <div class="setting-row">
      <span class="ic"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>
      <div class="info">
        <div class="t">Nouvelles commandes</div>
        <div class="s">Prévenir à chaque commande reçue</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="notif-new" ${notifNew ? 'checked' : ''} />
        <span class="track"></span>
      </label>
    </div>` : ''}
    <div class="setting-row">
      <span class="ic"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
      <div class="info">
        <div class="t">Suivi de mes commandes</div>
        <div class="s">Prévenir quand le statut de ma commande change</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="notif-mine" ${notifMine ? 'checked' : ''} />
        <span class="track"></span>
      </label>
    </div>
  </div>

  <div class="panel">
    <h3>Application</h3>
    <div class="setting-row">
      <span class="ic"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>
      <div class="info">
        <div class="t">Signaler un problème</div>
      </div>
      <a class="btn btn-ghost btn-sm" href="${ISSUES_URL}" target="_blank" rel="noreferrer">Ouvrir</a>
    </div>
    <div class="setting-row">
      <span class="ic">ℹ</span>
      <div class="info">
        <div class="t">Version</div>
        <div class="s">ShopTaBouffe 1.0.2 · Windows</div>
      </div>
    </div>
    <div class="setting-row">
      <span class="ic"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
      <div class="info">
        <div class="t">Se déconnecter</div>
      </div>
      <button class="btn btn-danger btn-sm" data-action="logout">Déconnexion</button>
    </div>
  </div>`;
}

/* ---------------- Espace fournisseur ---------------- */

const ADMIN_TABS = [
  ['orders', 'Commandes', ICONS.receipt], ['products', 'Produits', ICONS.box], ['convs', 'Conversations', ICONS.chat],
];
const ADMIN_FILTERS = [
  ['all', 'Toutes'], ['pending', 'Nouvelles'], ['active', 'En cours'], ['done', 'Terminées'],
];

function adminOrderCard(o) {
  const items = (o.items || []).map((i) => `${i.qty}× ${i.name}`).join(', ');
  const next = {
    pending: [['accepted', 'Accepter', 'btn-green'], ['refused', 'Refuser', 'btn-danger']],
    accepted: [['preparing', 'En préparation', '']],
    preparing: [['delivering', 'En livraison', '']],
    delivering: [['delivered', 'Livrée', 'btn-green']],
  }[o.status] || [];
  return `
  <div class="admin-order">
    <div class="head">
      <span class="cust">${avatarHtml(o.customer)} ${h((o.customer && o.customer.name) || 'Client')}</span>
      <span class="status ${o.status}">${STATUS[o.status] || o.status}</span>
      <span class="date" style="color:var(--muted);font-size:13px;margin-left:auto">${fmtDate(o.createdAt)}</span>
      <span class="price">${euro(o.totalCents)}</span>
    </div>
    <div class="items">${h(items)}</div>
    ${o.address ? `<div class="addr"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${h(o.address)} · <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${h(o.phone || '')}</div>` : ''}
    ${o.note ? `<div class="addr"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg> ${h(o.note)}</div>` : ''}
    <div class="actions">
      ${next.map(([st, label, cls]) => `
        <button class="btn btn-sm ${cls}" data-action="set-status" data-id="${o.id}" data-status="${st}">${label}</button>`).join('')}
      ${chatAllowed() ? `<button class="btn btn-ghost btn-sm" data-action="open-conv-of" data-id="${o.id}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Ouvrir le chat</button>` : ''}
    </div>
  </div>`;
}

function viewAdmin() {
  if (!isSupplier()) {
    return `
    <div class="view-title">Produits</div>
    <div class="empty">
      <div class="big">${ICONS.box}</div>
      <div class="t">Accès réservé aux fournisseurs</div>
      <div>Activez votre espace fournisseur depuis le Profil avec votre code d’accès.</div>
      <p style="margin-top:16px"><button class="btn btn-sm" data-action="go" data-view="profile">Aller au Profil</button></p>
    </div>`;
  }
  let content = '';
  if (state.adminTab === 'orders') {
    const list = filterOrders(state.adminOrders, state.adminFilter);
    content = `
      <div class="chips">
        ${ADMIN_FILTERS.map(([id, label]) => `
          <button class="chip ${state.adminFilter === id ? 'active' : ''}" data-action="afilter" data-f="${id}">${label}</button>`).join('')}
      </div>
      ${list.length === 0 ? `
        <div class="empty">
          <div class="big">${ICONS.box}</div>
          <div class="t">Aucune commande</div>
          <div>Les nouvelles commandes arrivent ici en temps réel.</div>
        </div>` : list.map(adminOrderCard).join('')}`;
  } else if (state.adminTab === 'products') {
    content = `
      <div class="toolbar">
        <span style="flex:1"></span>
        <button class="btn btn-sm" data-action="create-open">＋ Créer</button>
      </div>
      ${state.adminProducts.length === 0 ? `
        <div class="empty">
          <div class="big">${ICONS.box}</div>
          <div class="t">Aucun produit</div>
          <div>Ajoutez votre premier produit au catalogue.</div>
        </div>` : state.adminProducts.map((p) => `
        <div class="product-admin-row">
          <div class="thumb">${p.imageUrl ? `<img src="${h(p.imageUrl)}" alt="" />` : emojiFor(p.category)}</div>
          <div class="info">
            <div class="nm">${h(p.name)} ${p.kind === 'formule' ? '<span class="tag formule">Formule</span>' : ''} ${p.available ? '' : '<span class="tag off">Indisponible</span>'}</div>
            <div class="sub">${priceLabel(p)} · ${h(p.category)}</div>
          </div>
          <div class="acts">
            <button class="btn btn-ghost btn-sm" data-action="discount-open" data-id="${p.id}">${ICONS.tag} Remise</button>
            <button class="btn btn-ghost btn-sm" data-action="product-edit" data-id="${p.id}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn btn-danger btn-sm" data-action="product-del" data-id="${p.id}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
          </div>
        </div>`).join('')}`;
  } else {
    content = state.adminConvs.length === 0 ? `
      <div class="empty">
        <div class="big">${ICONS.box}</div>
        <div class="t">Aucune conversation</div>
        <div>Les clients peuvent vous écrire depuis l’onglet Chat.</div>
      </div>` : `
      <div class="conv-list">
        ${state.adminConvs.map((c) => `
          <div class="conv-item" data-action="open-conv" data-id="${c.id}">
            ${avatarHtml(c.customer)}
            <div class="info">
              <div class="nm">${h((c.customer && c.customer.name) || 'Client')}</div>
              <div class="last">${c.lastMessage ? h(c.lastMessage.body) : 'Aucun message'}</div>
            </div>
            ${c.unreadCount ? `<span class="unread">${c.unreadCount}</span>` : ''}
          </div>`).join('')}
      </div>`;
  }
  const pending = state.adminOrders.filter((o) => o.status === 'pending').length;
  const shopClosed = !!state.shopStatus.closed && !shopStatusExpired();
  const shopStatusText = shopClosed
    ? (state.shopStatus.reopensAt
      ? `Fermée jusqu'au ${h(fmtDate(state.shopStatus.reopensAt))}`
      : 'Fermée (réouverture à annoncer)')
    : 'Ouverte';
  const shopCard = isSupplier() ? `
  <div class="shop-admin-card">
    <div class="shop-admin-head">
      <h3>Boutique</h3>
      <span class="pill ${shopClosed ? '' : 'on'}">${shopClosed ? 'Fermée' : 'Ouverte'}</span>
    </div>
    <p class="shop-admin-status">Statut actuel : ${shopStatusText}</p>
    <div class="shop-admin-row">
      <div>
        <label for="shop-reopen">Date et heure de réouverture</label>
        <input id="shop-reopen" type="datetime-local" data-field="shop-reopen"
               value="${h(state.shopReopenValue || shopReopenDefault())}" />
      </div>
    </div>
    <div class="shop-admin-actions">
      <button class="btn btn-sm" type="button" data-action="shop-close">Fermer temporairement</button>
      ${shopClosed ? `<button class="btn btn-ghost btn-sm" type="button" data-action="shop-open">Rouvrir maintenant</button>` : ''}
    </div>
  </div>` : '';
  return `
  <div class="view-title">Produits
    ${pending ? `<span class="status pending">${pending} nouvelle(s)</span>` : ''}
  </div>
  ${shopCard}
  <div class="admin-tabs">
    ${ADMIN_TABS.map(([id, label, ic]) => `
      <button class="chip ${state.adminTab === id ? 'active' : ''}" data-action="atab" data-t="${id}">
        ${ic} ${label}${id === 'orders' && pending ? ` (${pending})` : ''}
      </button>`).join('')}
  </div>
  ${state.error ? `<div class="error-box">${h(state.error)}</div>` : ''}
  ${content}`;
}

/* ---------------- Modale catégories ---------------- */

function openCategoriesModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  document.body.appendChild(backdrop);

  const draw = () => {
    backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>Gérer les catégories</h3>
      <form id="cat-form">
        <div class="field" style="display:flex;gap:8px;align-items:flex-end">
          <div style="flex:1">
            <label for="cat-name">Nouvelle catégorie</label>
            <input id="cat-name" name="name" maxlength="60" placeholder="Ex. : Tacos" required />
          </div>
          <button class="btn btn-sm" type="submit">Ajouter</button>
        </div>
      </form>
      <div class="cat-list">
        ${state.categories.length === 0
          ? `<div style="color:var(--muted);font-size:13.5px">Aucune catégorie pour l’instant.</div>`
          : state.categories.map((c) => `
          <div class="cat-row">
            <span class="nm">${emojiFor(c.name)} ${h(c.name)}</span>
            <span class="cnt">${c.productsCount} produit(s)</span>
            <button class="btn btn-ghost btn-sm" type="button" data-ren="${c.id}" title="Renommer"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn btn-danger btn-sm" type="button" data-del="${c.id}" title="Supprimer"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
          </div>`).join('')}
      </div>
      <div class="actions">
        <button class="btn" type="button" data-close>Fermer</button>
      </div>
    </div>`;
    $('[data-close]', backdrop).addEventListener('click', () => backdrop.remove());
    $('#cat-form', backdrop).addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = String(new FormData(e.target).get('name') || '').trim();
      if (!name) return;
      try {
        await api('/categories', { method: 'POST', body: { name } });
        await loadCategories();
        draw();
        render();
        toast('Catégorie ajoutée', 'ok');
      } catch (err) {
        toast(err.message || 'Erreur', 'err');
      }
    });
    $$('[data-ren]', backdrop).forEach((btn) => btn.addEventListener('click', async () => {
      const c = state.categories.find((x) => x.id === Number(btn.dataset.ren));
      if (!c) return;
      const name = prompt('Nouveau nom de la catégorie :', c.name);
      if (name == null || !name.trim() || name.trim() === c.name) return;
      try {
        await api('/categories/' + c.id, { method: 'PATCH', body: { name: name.trim() } });
        await loadCategories();
        draw();
        render();
        toast('Catégorie renommée', 'ok');
      } catch (err) {
        toast(err.message || 'Erreur', 'err');
      }
    }));
    $$('[data-del]', backdrop).forEach((btn) => btn.addEventListener('click', async () => {
      const c = state.categories.find((x) => x.id === Number(btn.dataset.del));
      if (!c) return;
      if (!confirm(`Supprimer la catégorie « ${c.name} » ?`)) return;
      try {
        await api('/categories/' + c.id, { method: 'DELETE' });
        await loadCategories();
        draw();
        render();
        toast('Catégorie supprimée', 'ok');
      } catch (err) {
        toast(err.message || 'Erreur', 'err');
      }
    }));
  };

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  draw();
}

/* ---------------- Création unique (produit / formule / catégorie) ---------------- */

function openCreateModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const choices = [
    ['product', ICONS.box, 'Produit', 'Un article simple, vendu à l’unité.'],
    ['formule', ICONS.tag || ICONS.box, 'Formule', 'Un ensemble de plusieurs produits vendus ensemble.'],
    ['category', ICONS.tag || ICONS.box, 'Catégorie', 'Un nouveau rayon pour organiser le catalogue.'],
  ];
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>Que voulez-vous créer ?</h3>
      <div class="cat-list">
        ${choices.map(([kind, icon, title, desc]) => `
          <button type="button" class="cat-row create-choice" data-kind="${kind}" style="text-align:left;cursor:pointer">
            <span class="ic">${icon}</span>
            <span class="nm">${title}<span class="field-hint">${desc}</span></span>
          </button>`).join('')}
      </div>
      <div class="actions">
        <button class="btn btn-ghost" type="button" data-close>Annuler</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  $('[data-close]', backdrop).addEventListener('click', close);
  $$('[data-kind]', backdrop).forEach((btn) => btn.addEventListener('click', () => {
    const kind = btn.dataset.kind;
    close();
    if (kind === 'product') openProductModal(null);
    else if (kind === 'formule') openFormuleModal(null);
    else openCategoriesModal();
  }));
}

/* ---------------- Modale formule ---------------- */

function openFormuleModal(formule) {
  const f = formule || {
    name: '', description: '', priceCents: 0, category: 'Formules',
    imageUrl: '', available: true, items: [],
  };
  const catNames = [...new Set(['Formules', ...categoryNames(), f.category])].filter(Boolean);
  const selected = new Map((f.items || []).map((i) => [i.productId, i.qty]));
  const products = state.adminProducts.filter((p) => p.kind !== 'formule');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${formule ? 'Modifier la formule' : 'Ajouter une formule'}</h3>
      <form id="formule-form">
        <div class="field">
          <label for="f-name">Nom de la formule</label>
          <input id="f-name" name="name" maxlength="120" required value="${h(f.name)}" />
        </div>
        <div class="field">
          <label for="f-desc">Description</label>
          <textarea id="f-desc" name="description" maxlength="2000">${h(f.description || '')}</textarea>
        </div>
        <div class="field">
          <label>Produits inclus <span class="field-hint">Cochez et indiquez la quantité. Le prix de revient est calculé automatiquement.</span></label>
          ${products.length === 0
            ? `<div class="error-box">Créez d’abord au moins un produit avant de composer une formule.</div>`
            : `<div class="cat-list">${products.map((p) => `
              <label class="cat-row" style="cursor:pointer">
                <input type="checkbox" data-item-id="${p.id}" ${selected.has(p.id) ? 'checked' : ''} style="width:auto" />
                <span class="nm">${h(p.name)}</span>
                <span class="cnt">${euro(p.priceCents)}</span>
                <input type="number" data-item-qty="${p.id}" min="1" max="99"
                       value="${selected.get(p.id) || 1}" aria-label="Quantité pour ${h(p.name)}"
                       style="width:64px;padding:6px 8px" />
              </label>`).join('')}</div>`}
        </div>
        <div class="field">
          <label for="f-price">Prix de vente de la formule (€)</label>
          <input id="f-price" name="price" type="number" min="0" step="0.01" required
                 value="${(f.priceCents / 100).toFixed(2)}" />
        </div>
        <div class="field">
          <label for="f-cat">Catégorie</label>
          <select id="f-cat" name="category">
            ${catNames.map((c) => `<option value="${h(c)}" ${c === f.category ? 'selected' : ''}>${emojiFor(c)} ${h(c)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-image">Photo (JPEG, PNG, WebP — 5 Mo max)</label>
          <input id="f-image" name="image" type="file" accept="image/*" />
          ${f.imageUrl ? `<span class="field-hint">Image actuelle conservée si aucun nouveau fichier.</span>` : ''}
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:9px;cursor:pointer">
            <input type="checkbox" name="available" ${f.available ? 'checked' : ''} style="width:auto" />
            Disponible à la vente
          </label>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" type="button" data-close>Annuler</button>
          <button class="btn" type="submit">${formule ? 'Enregistrer' : 'Créer la formule'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  $('[data-close]', backdrop).addEventListener('click', close);

  $('#formule-form', backdrop).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = $('button[type="submit"]', backdrop);
    btn.disabled = true;
    try {
      const items = $$('[data-item-id]', backdrop)
        .filter((el) => el.checked)
        .map((el) => {
          const qtyEl = $(`[data-item-qty="${el.dataset.itemId}"]`, backdrop);
          const qty = Math.max(1, Math.min(99, Number(qtyEl && qtyEl.value) || 1));
          return { productId: Number(el.dataset.itemId), qty };
        });
      if (!items.length) throw new Error('Sélectionnez au moins un produit pour la formule.');

      let imageUrl = f.imageUrl || '';
      const file = fd.get('image');
      if (file && file.size > 0) {
        const upForm = new FormData();
        upForm.append('image', file);
        const up = await api('/uploads/product-image', { method: 'POST', form: upForm });
        imageUrl = up.url;
      }
      const body = {
        name: String(fd.get('name') || '').trim(),
        description: String(fd.get('description') || '').trim(),
        priceCents: Math.round(Number(fd.get('price')) * 100),
        category: String(fd.get('category') || ''),
        imageUrl,
        available: fd.get('available') === 'on',
        items,
      };
      if (formule) {
        await api('/formules/' + formule.id, { method: 'PATCH', body });
        toast('Formule mise à jour', 'ok');
      } else {
        await api('/formules', { method: 'POST', body });
        toast('Formule ajoutée', 'ok');
      }
      close();
      await loadAdminProducts();
      render();
    } catch (err) {
      btn.disabled = false;
      toast(err.message || 'Erreur', 'err');
    }
  });
}

/* ---------------- Espace Finances ---------------- */

function viewFinances() {
  if (!isSupplier()) {
    return `
    <div class="view-title">Finances</div>
    <div class="empty">
      <div class="big">${ICONS.box}</div>
      <div class="t">Accès réservé aux fournisseurs</div>
      <div>Activez votre espace fournisseur depuis le Profil.</div>
    </div>`;
  }
  const s = state.fin;
  const cards = s ? [
    ['Revenus', euro(s.revenueCents), `${s.orders} commande(s) livrée(s)`],
    ['Coûts d’achat', euro(s.costCents), `${s.units} unité(s) vendue(s)`],
    ['Marge brute', euro(s.grossMarginCents), 'Revenus − coûts'],
    ['Dépenses', euro(s.expensesCents), `${s.expenseCount} ligne(s)`],
    ['Résultat net', euro(s.netCents), 'Marge − dépenses'],
  ] : [];
  const today = new Date().toISOString().slice(0, 10);

  return `
  <div class="view-title">Finances
    <span class="count">${state.finSales.length} vente(s) affichée(s)</span>
    <span style="flex:1"></span>
    <button class="btn btn-ghost btn-sm" data-action="refresh"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Rafraîchir</button>
  </div>
  <div class="toolbar">
    <div class="search" style="max-width:none;flex:1">
      <span class="mag"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
      <input type="date" id="fin-from" value="${h(state.finFrom)}" title="Du" />
    </div>
    <div class="search" style="max-width:none;flex:1">
      <span class="mag"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>
      <input type="date" id="fin-to" value="${h(state.finTo)}" title="Au" />
    </div>
    <button class="btn btn-sm" data-action="fin-apply">Appliquer</button>
    <button class="btn btn-ghost btn-sm" data-action="fin-reset">Tout</button>
  </div>
  ${state.error ? `<div class="error-box">${h(state.error)}</div>` : ''}
  <div class="fin-grid">
    ${cards.map(([label, value, sub], i) => `
      <div class="fin-card ${i === 4 ? 'net' : ''}">
        <div class="lbl">${label}</div>
        <div class="val">${value}</div>
        <div class="sub">${sub}</div>
      </div>`).join('')}
  </div>

  <h3 class="sec-title">Revenus par produit</h3>
  ${state.finProducts.length === 0 ? `
    <div class="empty"><div class="big">${ICONS.box}</div><div class="t">Aucune vente encore</div>
    <div>Les ventes livrées apparaîtront ici avec la marge par produit.</div></div>` : `
    <div class="fin-table">
      <div class="fin-row head">
        <span class="nm">Produit</span><span class="c">Qté</span><span class="c">Revenu</span>
        <span class="c">Coût</span><span class="c">Marge</span>
      </div>
      ${state.finProducts.map((p) => `
      <div class="fin-row">
        <span class="nm">${h(p.name)}</span>
        <span class="c" data-l="Qté">${p.units}×</span>
        <span class="c" data-l="Revenu">${euro(p.revenueCents)}</span>
        <span class="c muted" data-l="Coût">${euro(p.costCents)}</span>
        <span class="c ${p.marginCents < 0 ? 'neg' : 'pos'}" data-l="Marge">${euro(p.marginCents)}</span>
      </div>`).join('')}
    </div>`}

  <h3 class="sec-title">Ventes récentes</h3>
  ${state.finSales.length === 0 ? `
    <div class="empty"><div class="big">${ICONS.box}</div><div class="t">Aucune vente</div>
    <div>Le journal est écrit à chaque livraison et conservé (il survit à la purge de 2 h).</div></div>` : `
    <div class="conv-list">
      ${state.finSales.map((sale) => `
      <div class="conv-item" style="cursor:default">
        <div class="info">
          <div class="nm">Commande #${sale.orderId} · ${euro(sale.totalCents)}</div>
          <div class="last">${sale.items.map((i) => `${i.qty}× ${h(i.name)}`).join(', ')}</div>
        </div>
        <span class="date">${fmtDate(sale.deliveredAt)}</span>
      </div>`).join('')}
    </div>`}

  <h3 class="sec-title">Dépenses</h3>
  <form id="expense-form" class="toolbar">
    <div class="search" style="max-width:none;flex:2">
      <span class="mag"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg></span>
      <input name="label" maxlength="120" placeholder="Libellé (ex. Loyer, Carburant…)" required />
    </div>
    <div class="search" style="max-width:none;flex:1">
      <span class="mag">€</span>
      <input name="amount" type="number" min="0" step="0.01" placeholder="Montant" required />
    </div>
    <input name="date" type="date" value="${today}" title="Date" style="max-width:150px;padding:9px 10px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text)" />
    <button class="btn btn-sm" type="submit">Ajouter</button>
  </form>
  ${state.expenses.length === 0 ? `
    <div class="empty"><div class="big">${ICONS.box}</div><div class="t">Aucune dépense</div>
    <div>Ajoutez vos charges pour calculer le résultat net.</div></div>` : `
    <div class="conv-list">
      ${state.expenses.map((e) => `
      <div class="conv-item" style="cursor:default">
        <div class="info">
          <div class="nm">${h(e.label)}</div>
          <div class="last">${e.date}</div>
        </div>
        <span class="price">${euro(e.amountCents)}</span>
        <button class="btn btn-danger btn-sm" data-action="exp-del" data-id="${e.id}" title="Supprimer"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div>`).join('')}
    </div>`}`;
}

/* ---------------- Modale produit ---------------- */

function openProductModal(product) {
  const p = product || { name: '', description: '', priceCents: 0, costCents: 0, category: 'Pizza', imageUrl: '', available: true };
  // catégories serveur + celle du produit si elle n'y figure plus (héritage)
  const catNames = [...new Set([...categoryNames(), p.category])].filter(Boolean);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${product ? 'Modifier le produit' : 'Ajouter un produit'}</h3>
      <form id="product-form">
        <div class="field">
          <label for="p-name">Nom</label>
          <input id="p-name" name="name" maxlength="120" required value="${h(p.name)}" />
        </div>
        <div class="field">
          <label for="p-desc">Description</label>
          <textarea id="p-desc" name="description" maxlength="2000">${h(p.description || '')}</textarea>
        </div>
        <div class="field">
          <label for="p-price">Prix de vente (€)</label>
          <input id="p-price" name="price" type="number" min="0" step="0.01" required
                 value="${(p.priceCents / 100).toFixed(2)}" />
        </div>
        <div class="field">
          <label for="p-cost">Prix de revient (€) — pour la marge</label>
          <input id="p-cost" name="cost" type="number" min="0" step="0.01"
                 value="${((p.costCents || 0) / 100).toFixed(2)}" />
        </div>
        <div class="field">
          <label for="p-cat">Catégorie</label>
          <select id="p-cat" name="category">
            ${catNames.map((c) => `<option value="${h(c)}" ${c === p.category ? 'selected' : ''}>${emojiFor(c)} ${h(c)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="p-image">Photo (JPEG, PNG, WebP — 5 Mo max)</label>
          <input id="p-image" name="image" type="file" accept="image/*" />
          ${p.imageUrl ? `<div class="s" style="color:var(--muted);font-size:12.5px;margin-top:5px">Image actuelle conservée si aucun nouveau fichier.</div>` : ''}
        </div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:9px;cursor:pointer">
            <input type="checkbox" name="available" ${p.available ? 'checked' : ''} style="width:auto" />
            Disponible à la vente
          </label>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" type="button" data-close>Annuler</button>
          <button class="btn" type="submit">${product ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  $('[data-close]', backdrop).addEventListener('click', close);

  $('#product-form', backdrop).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = $('button[type="submit"]', backdrop);
    btn.disabled = true;
    try {
      let imageUrl = p.imageUrl || '';
      const file = fd.get('image');
      if (file && file.size > 0) {
        const upForm = new FormData();
        upForm.append('image', file);
        const up = await api('/uploads/product-image', { method: 'POST', form: upForm });
        imageUrl = up.url;
      }
      const body = {
        name: String(fd.get('name') || '').trim(),
        description: String(fd.get('description') || '').trim(),
        priceCents: Math.round(Number(fd.get('price')) * 100),
        costCents: Math.round((Number(fd.get('cost')) || 0) * 100),
        category: String(fd.get('category') || ''),
        imageUrl,
        available: fd.get('available') === 'on',
      };
      if (product) {
        await api('/products/' + product.id, { method: 'PATCH', body });
        toast('Produit mis à jour', 'ok');
      } else {
        await api('/products', { method: 'POST', body });
        toast('Produit ajouté', 'ok');
      }
      close();
      await loadAdminProducts();
      render();
    } catch (err) {
      btn.disabled = false;
      toast(err.message || 'Erreur', 'err');
    }
  });
}

/* ---------------- Modale remise temporaire ---------------- */

function openDiscountModal(product) {
  const p = product;
  const active = p.discountPriceCents != null;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>Remise temporaire</h3>
      <div class="info-box">
        <strong>${h(p.name)}</strong>${p.kind === 'formule' ? ' <span class="tag formule">Formule</span>' : ''}<br />
        Prix normal : ${euro(p.priceCents)}
        ${active ? `<br />Remise en cours : ${euro(p.discountPriceCents)} jusqu’au ${h(fmtDate(p.discountUntil))}` : ''}
      </div>
      <form id="discount-form">
        <div class="field">
          <label for="d-price">Prix remisé (€)</label>
          <input id="d-price" name="price" type="number" min="0.01" step="0.01" required
                 value="${active ? (Number(p.discountPriceCents) / 100).toFixed(2) : ''}"
                 placeholder="${(Number(p.priceCents) / 100).toFixed(2)}" />
          <span class="field-hint">Supérieur à 0 et inférieur au prix normal (${euro(p.priceCents)}).</span>
        </div>
        <div class="field">
          <label for="d-hours">Durée (heures)</label>
          <input id="d-hours" name="hours" type="number" min="1" max="168" step="1" required value="24" />
          <span class="field-hint">Nombre entier de 1 à 168 heures.</span>
        </div>
        <div class="error-box" id="d-error" hidden></div>
        <div class="actions">
          <button class="btn btn-ghost" type="button" data-close>Fermer</button>
          ${active ? '<button class="btn btn-danger" type="button" data-remove>Retirer la remise</button>' : ''}
          <button class="btn" type="submit">Appliquer</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  const showError = (message) => {
    const box = $('#d-error', backdrop);
    box.textContent = message;
    box.hidden = false;
  };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  $('[data-close]', backdrop).addEventListener('click', close);

  const reload = async (message) => {
    close();
    await loadAdminProducts();
    if (typeof loadProducts === 'function') await loadProducts();
    refreshCartPrices();
    render();
    toast(message, 'ok');
  };

  $('#discount-form', backdrop).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const price = Number(fd.get('price'));
    const priceCents = Math.round(price * 100);
    const hours = Number(fd.get('hours'));
    $('#d-error', backdrop).hidden = true;
    if (!Number.isFinite(price) || priceCents <= 0 || priceCents >= Number(p.priceCents)) {
      showError('Le prix remisé doit être supérieur à 0 et inférieur au prix normal (' + euro(p.priceCents) + ').');
      return;
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      showError('La durée doit être un nombre entier compris entre 1 et 168 heures.');
      return;
    }
    const btn = $('button[type="submit"]', backdrop);
    btn.disabled = true;
    try {
      await api('/products/' + p.id + '/discount', {
        method: 'POST',
        body: { priceCents, durationHours: hours },
      });
      await reload('Remise appliquée');
    } catch (err) {
      btn.disabled = false;
      showError(err.message || 'Impossible d’appliquer la remise.');
    }
  });

  const removeBtn = $('[data-remove]', backdrop);
  if (removeBtn) removeBtn.addEventListener('click', async () => {
    removeBtn.disabled = true;
    $('#d-error', backdrop).hidden = true;
    try {
      await api('/products/' + p.id + '/discount', { method: 'DELETE' });
      await reload('Remise retirée');
    } catch (err) {
      removeBtn.disabled = false;
      showError(err.message || 'Impossible de retirer la remise.');
    }
  });
}

/* ---------------- Chargements de données ---------------- */

async function loadProducts() {
  try {
    const qs = new URLSearchParams({ available: '1' });
    if (state.search) qs.set('search', state.search);
    if (state.category) qs.set('category', state.category);
    const data = await api('/products?' + qs.toString());
    state.products = data.products || [];
    state.error = null;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) state.error = err.message;
  }
}

async function loadOrders() {
  try {
    const data = await api('/orders/mine');
    state.orders = data.orders || [];
    state.error = null;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) state.error = err.message;
  }
}

async function loadOrder(id) {
  try {
    state.order = await api('/orders/' + id);
    state.error = null;
  } catch (err) {
    state.error = err.message;
  }
}

async function loadConversations() {
  try {
    const data = await api('/conversations');
    state.convs = data.conversations || [];
    state.chatBlocked = false;
    state.error = null;
  } catch (err) {
    if (err.code === 'chat_forbidden') {
      state.chatBlocked = true;
      state.convs = [];
      state.error = null;
    } else if (!(err instanceof ApiError && err.status === 401)) {
      state.error = err.message;
    }
  }
}

async function loadMessages(convId) {
  try {
    const data = await api(`/conversations/${convId}/messages?limit=100`);
    state.messages = data.messages || [];
    state.chatError = null;
    await api(`/conversations/${convId}/read`, { method: 'POST' }).catch(() => {});
  } catch (err) {
    state.chatError = err.message;
    if (err.code === 'chat_forbidden') state.chatBlocked = true;
  }
}

async function loadAdmin() {
  await Promise.all([loadAdminOrders(), loadAdminProducts(), loadAdminConversations()]);
}

async function loadAdminOrders() {
  try {
    const data = await api('/orders');
    state.adminOrders = data.orders || [];
    state.error = null;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) state.error = err.message;
  }
}

async function loadAdminProducts() {
  try {
    const data = await api('/products');
    state.adminProducts = data.products || [];
  } catch (err) { /* silencieux */ }
}

async function loadAdminConversations() {
  try {
    const data = await api('/conversations');
    state.adminConvs = data.conversations || [];
    state.convs = data.conversations || [];
    state.chatBlocked = false;
  } catch (err) {
    if (err.code === 'chat_forbidden') state.chatBlocked = true;
  }
}

async function loadCategories() {
  try {
    const data = await api('/categories');
    state.categories = data.categories || [];
  } catch (err) { /* silencieux : repli sur la liste par défaut */ }
}

async function loadAccount() {
  try {
    state.account = await api('/account');
    state.accountError = null;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) state.accountError = err.message;
  }
}

/** Espace Finances : résumé + journal des ventes + détail par produit + dépenses. */
async function loadFinances() {
  const qs = new URLSearchParams();
  if (state.finFrom) qs.set('from', state.finFrom);
  if (state.finTo) qs.set('to', state.finTo);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  try {
    const [summary, sales, products, expenses] = await Promise.all([
      api('/finances/summary' + suffix),
      api('/finances/sales' + suffix + (suffix ? '&' : '?') + 'limit=50'),
      api('/finances/products' + suffix),
      api('/finances/expenses'),
    ]);
    state.fin = summary;
    state.finSales = sales.sales || [];
    state.finProducts = products.products || [];
    state.expenses = expenses.expenses || [];
    state.error = null;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) state.error = err.message;
  }
}

/* ---------------- Socket.IO ---------------- */

function connectSocket() {
  if (state.socket || !state.token || typeof io === 'undefined') return;
  const socket = io({ auth: { token: state.token }, reconnection: true });
  state.socket = socket;

  socket.on('connect', () => {
    // rejoindre le fil ouvert (client ou fournisseur)
    const convId = state.view === 'chatThread' && state.conv ? state.conv.id : state.joinedConv;
    if (convId) {
      socket.emit('conversation:join', { conversationId: convId }, () => {});
    }
    if (isSupplier()) socket.emit('watch:orders', {}, () => {});
  });

  socket.on('order:new', (payload) => {
    if (isSupplier()) {
      loadAdminOrders().then(render);
      if (localStorage.getItem('stb_notif_new') !== '0') {
        toast('<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Nouvelle commande #' + (payload && payload.id) + ' !', 'ok');
        notify('Nouvelle commande', 'Commande #' + (payload && payload.id) + ' reçue.');
      }
    }
  });

  socket.on('order:updated', (payload) => {
    if (isSupplier()) {
      loadAdminOrders().then(render);
    } else if (payload && payload.mine) {
      const refresh = () => {
        if (state.view === 'orders') loadOrders().then(render);
        else if (state.view === 'orderDetail' && state.order && state.order.id === payload.id) {
          loadOrder(payload.id).then(render);
        }
      };
      refresh();
      if (localStorage.getItem('stb_notif_mine') !== '0') {
        toast('<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> Commande #' + payload.id + ' : ' + (STATUS[payload.status] || payload.status), 'ok');
        notify('Mise à jour de commande', 'Commande #' + payload.id + ' — ' + (STATUS[payload.status] || payload.status));
      }
    }
  });

  socket.on('order:deleted', () => {
    if (isSupplier()) loadAdminOrders().then(render);
    else if (state.view === 'orders') loadOrders().then(render);
    else if (state.view === 'orderDetail') { state.order = null; state.error = 'Commande expirée : elle est supprimée automatiquement 2 h après sa livraison.'; render(); }
  });

  socket.on('conversation:deleted', () => {
    if (state.view === 'chatThread') {
      state.conv = null; state.messages = [];
      state.chatError = 'Cette discussion a été supprimée (commande terminée).';
      state.view = isSupplier() ? 'admin' : 'chat';
    }
    if (isSupplier()) loadAdminConversations().then(render);
    else loadConversations().then(render);
  });

  socket.on('message:new', (msg) => {
    const open = state.view === 'chatThread' && state.conv && msg.conversationId === state.conv.id;
    if (open) {
      state.messages.push(msg);
      if (state.user && msg.senderId !== state.user.id) {
        api(`/conversations/${msg.conversationId}/read`, { method: 'POST' }).catch(() => {});
      }
      render();
    } else {
      if (isSupplier()) loadAdminConversations().then(render);
      else loadConversations().then(render);
      if (state.user && msg.senderId !== state.user.id) {
        toast('<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Nouveau message de ' + (msg.senderName || '…'), 'ok');
        notify('Nouveau message', (msg.senderName || '') + ' : ' + msg.body.slice(0, 80));
      }
    }
  });

  socket.on('shop:changed', (payload) => {
    if (payload) setShopStatus(payload);
    else loadShopStatus();
    render();
  });

  socket.on('product:changed', () => {
    if (state.view === 'gallery') {
      loadProducts().then(() => { refreshCartPrices(); render(); });
    } else {
      refreshCartPrices();
      if (state.view === 'cart') render();
    }
    if (isSupplier() && state.adminTab === 'products') loadAdminProducts().then(render);
  });

  socket.on('categories:changed', () => {
    loadCategories().then(() => {
      if (state.view === 'gallery') loadProducts().then(render);
      else render();
    });
  });

  socket.on('connect_error', () => { /* géré par reconnection */ });
}

function notify(title, body) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch { /* non supporté */ }
}

/* ---------------- Navigation ---------------- */

async function go(view, param) {
  state.view = view;
  state.param = param || null;
  state.error = null;
  window.scrollTo(0, 0);

  if (view === 'gallery') {
    await loadProducts();
  } else if (view === 'cart') {
    /* rendu immédiat */
  } else if (view === 'profile') {
    await loadAccount();
  } else if (view === 'orders') {
    await loadOrders();
  } else if (view === 'orderDetail') {
    await loadOrder(param);
  } else if (view === 'chat') {
    await loadConversations();
    // client : un seul fil <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> ouverture directe du thread
    if (!isSupplier() && !state.chatBlocked && state.convs.length > 0) {
      await openConversation(state.convs[0].id, state.convs[0]);
    }
  } else if (view === 'chatThread') {
    /* chargé par openConversation */
  } else if (view === 'admin') {
    await loadAdmin();
  } else if (view === 'finances') {
    await loadFinances();
  }
  render();
}

async function openConversation(convId, convMeta) {
  state.conv = convMeta || state.convs.find((c) => c.id === convId) || { id: convId };
  state.view = 'chatThread';
  state.messages = [];
  state.chatError = null;
  state.joinedConv = convId;
  await loadMessages(convId);
  if (state.socket) {
    state.socket.emit('conversation:join', { conversationId: convId }, (reply) => {
      if (reply && reply.status === 'error') {
        state.chatError = reply.error === 'chat_forbidden'
          ? 'Chat réservé aux comptes connectés via GitHub ou Google.'
          : 'Accès refusé à cette discussion.';
        render();
      }
    });
  }
  // rafraîchir le compteur de non-lus
  loadConversations();
  render();
}

async function refresh() {
  const v = state.view;
  state.error = null;
  if (v === 'gallery') await loadProducts();
  else if (v === 'orders') await loadOrders();
  else if (v === 'orderDetail' && state.order) await loadOrder(state.order.id);
  else if (v === 'chat') await loadConversations();
  else if (v === 'chatThread' && state.conv) await loadMessages(state.conv.id);
  else if (v === 'admin') await loadAdmin();
  else if (v === 'finances') await loadFinances();
  render();
  toast('À jour <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>', 'ok');
}

/* ---------------- Actions panier ---------------- */

function cartAdd(productId) {
  const p = state.products.find((x) => x.id === productId);
  if (!p || !p.available) return;
  const price = effectivePriceCents(p);
  const old = p.discountPriceCents != null ? Number(p.priceCents) : null;
  const line = state.cart.find((l) => l.productId === productId);
  if (line) {
    line.qty = Math.min(99, line.qty + 1);
    line.priceCents = price;
    if (old != null) line.oldPriceCents = old;
    else delete line.oldPriceCents;
  } else {
    const item = {
      productId: p.id, name: p.name, priceCents: price,
      imageUrl: p.imageUrl || '', category: p.category, qty: 1,
    };
    if (old != null) item.oldPriceCents = old;
    state.cart.push(item);
  }
  saveCart();
}

function cartDec(productId) {
  const line = state.cart.find((l) => l.productId === productId);
  if (!line) return;
  line.qty -= 1;
  if (line.qty <= 0) state.cart = state.cart.filter((l) => l.productId !== productId);
  saveCart();
}

/* ---------------- Événements globaux ---------------- */

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = Number(el.dataset.id);

  // Finalisation de compte obligatoire : aucune autre action n'est autorisée.
  if (state.upgradeModal) {
    e.preventDefault();
    state.upgradeError = 'Enregistrez d’abord votre nom d’utilisateur et votre mot de passe.';
    render();
    return;
  }

  try {
    if (action === 'go') {
      e.preventDefault();
      await go(el.dataset.view);
    } else if (action === 'auth-mode') {
      state.loginMode = el.dataset.mode;
      state.loginError = null;
      state.error = null;
      if (state.loginMode !== 'twofa') {
        state.challengeToken = '';
        state.twofaCode = '';
        state.twofaRecovery = '';
        state.twofaBusy = false;
      }
      if (state.loginMode === 'forgot') {
        state.forgotDone = false;
        state.forgotBusy = false;
      }
      if (state.loginMode === 'reset' && !state.resetToken) state.resetValid = false;
      render();
    } else if (action === 'refresh') {
      await refresh();
    } else if (action === 'cat') {
      state.category = el.dataset.cat;
      await loadProducts();
      render();
    } else if (action === 'ofilter') {
      state.orderFilter = el.dataset.f;
      render();
    } else if (action === 'afilter') {
      state.adminFilter = el.dataset.f;
      render();
    } else if (action === 'atab') {
      state.adminTab = el.dataset.t;
      render();
    } else if (action === 'shop-close' || action === 'shop-open') {
      if (!isSupplier()) return;
      el.disabled = true;
      state.error = null;
      let data;
      if (action === 'shop-close') {
        const input = $('[data-field="shop-reopen"]');
        const value = String((input && input.value) || '').trim();
        state.shopReopenValue = value;
        const reopen = value ? new Date(value) : null;
        if (!reopen || !Number.isFinite(reopen.getTime()) || reopen.getTime() <= Date.now()) {
          state.error = value
            ? 'La date de réouverture doit être dans le futur.'
            : 'Choisissez une date et une heure de réouverture.';
          toast(state.error, 'err');
          render();
          return;
        }
        data = await api('/shop/close', { method: 'POST', body: { reopensAt: reopen.toISOString() } });
      } else {
        data = await api('/shop/open', { method: 'POST' });
      }
      setShopStatus(data);
      state.shopReopenValue = '';
      toast(action === 'shop-close' ? 'Boutique fermée temporairement' : 'Boutique rouverte', 'ok');
      render();
    } else if (action === 'create-open') {
      openCreateModal();
    } else if (action === 'discount-open') {
      const p = state.adminProducts.find((x) => x.id === id);
      if (p) openDiscountModal(p);
    } else if (action === 'fin-apply') {
      const fromEl = $('#fin-from');
      const toEl = $('#fin-to');
      state.finFrom = fromEl ? fromEl.value : '';
      state.finTo = toEl ? toEl.value : '';
      await loadFinances();
      render();
    } else if (action === 'fin-reset') {
      state.finFrom = '';
      state.finTo = '';
      await loadFinances();
      render();
    } else if (action === 'exp-del') {
      if (confirm('Supprimer cette dépense ?')) {
        await api('/finances/expenses/' + id, { method: 'DELETE' });
        await loadFinances();
        render();
        toast('Dépense supprimée', 'ok');
      }
    } else if (action === 'cart-add') {
      cartAdd(id); render(); toast('Ajouté au panier', 'ok');
    } else if (action === 'cart-inc') {
      cartAdd(id); render();
    } else if (action === 'cart-dec') {
      cartDec(id); render();
    } else if (action === 'cart-del') {
      state.cart = state.cart.filter((l) => l.productId !== id); saveCart(); render();
    } else if (action === 'open-order') {
      await go('orderDetail', id);
    } else if (action === 'open-conv') {
      await openConversation(id);
    } else if (action === 'open-conv-of') {
      const order = state.adminOrders.find((o) => o.id === id);
      const custId = order && order.customer && order.customer.id;
      await loadAdminConversations();
      const conv = state.adminConvs.find((c) => c.customer && c.customer.id === custId);
      if (conv) await openConversation(conv.id, conv);
      else toast('Aucune discussion avec ce client', 'err');
    } else if (action === 'set-status') {
      el.disabled = true;
      await api('/orders/' + id, { method: 'PATCH', body: { status: el.dataset.status } });
      await loadAdminOrders();
      render();
      toast('Statut mis à jour : ' + (STATUS[el.dataset.status] || el.dataset.status), 'ok');
    } else if (action === 'product-new') {
      openCreateModal();
    } else if (action === 'product-edit') {
      const p = state.adminProducts.find((x) => x.id === id);
      if (p) {
        if (p.kind === 'formule') openFormuleModal(p);
        else openProductModal(p);
      }
    } else if (action === 'product-del') {
      const p = state.adminProducts.find((x) => x.id === id);
      if (p && confirm(`Supprimer « ${p.name} » ?`)) {
        const path = p.kind === 'formule' ? '/formules/' : '/products/';
        await api(path + id, { method: 'DELETE' });
        await loadAdminProducts();
        render();
        toast((p.kind === 'formule' ? 'Formule' : 'Produit') + ' supprimé', 'ok');
      }
    } else if (action === 'account-open') {
      await loadAccount();
      state.accountTab = 'info';
      state.accountError = null;
      state.accountNotice = null;
      try {
        const pending = await api('/account/email/pending');
        state.emailVerify = pending && pending.pending ? { email: pending.email } : null;
      } catch { state.emailVerify = null; }
      openAccountModal();
    } else if (action === 'email-verify' || action === 'email-resend') {
      const typedCode = action === 'email-verify'
        ? String(document.getElementById('acc-verify-code')?.value || '').replace(/\s+/g, '')
        : '';
      state.accountError = null;
      state.accountNotice = null;
      state.emailVerifyBusy = true;
      drawAccountModal();
      try {
        let data;
        if (action === 'email-resend') {
          data = await api('/account/email/resend', { method: 'POST' });
        } else {
          data = await api('/account/email/verify', { method: 'POST', body: { code: typedCode } });
        }
        if (action === 'email-resend') {
          state.emailVerify = { email: data.pendingEmail };
          state.accountNotice = `Nouveau code envoyé à ${data.pendingEmail}.`;
          toast('Nouveau code envoyé', 'ok');
        } else {
          state.account = data;
          state.emailVerify = null;
          state.user = await api('/auth/me');
          state.accountNotice = 'Adresse e-mail vérifiée et enregistrée.';
          toast('Adresse e-mail vérifiée', 'ok');
          render();
        }
      } catch (err) {
        state.accountError = err.message;
      }
      state.emailVerifyBusy = false;
      drawAccountModal();
    } else if (action === 'account-tab') {
      state.accountTab = el.dataset.tab;
      state.accountError = null;
      state.accountNotice = null;
      drawAccountModal();
    } else if (action === '2fa-start') {
      state.accountError = null;
      state.twofaSetupBusy = true;
      drawAccountModal();
      try {
        const data = await api('/account/2fa/start', { method: 'POST' });
        state.twofaSetup = data || {};
        state.twofaSetupCode = '';
        toast('Scannez le QR code pour configurer la double authentification', 'ok');
      } catch (err) {
        state.accountError = err.message;
      }
      state.twofaSetupBusy = false;
      drawAccountModal();
    } else if (action === '2fa-setup-cancel') {
      state.twofaSetup = null;
      state.twofaSetupCode = '';
      state.accountError = null;
      drawAccountModal();
    } else if (action === '2fa-recovery-done') {
      state.twofaRecoveryCodes = [];
      state.accountNotice = 'Double authentification activée.';
      drawAccountModal();
    } else if (action === 'account-link') {
      const provider = el.dataset.provider;
      const data = await api('/account/link', { method: 'POST', body: { provider, target: 'web' } });
      window.location.href = data.url;
    } else if (action === 'account-unlink') {
      const provider = el.dataset.provider;
      if (!confirm(`Dissocier ${PROVIDER_LABELS[provider] || provider} de votre compte ?`)) return;
      state.account = await api('/account/unlink/' + encodeURIComponent(provider), { method: 'DELETE' });
      state.accountError = null;
      state.user = await api('/auth/me');
      render();
      drawAccountModal();
      toast('Identité dissociée', 'ok');
    } else if (action === 'leave-role') {
      await api('/admin/logout-role', { method: 'POST' });
      state.user = await api('/auth/me');
      await loadConversations();
      toast('Vous êtes de nouveau client', 'ok');
      await go('gallery');
    } else if (action === 'logout') {
      logout();
    }
  } catch (err) {
    toast(err.message || 'Erreur', 'err');
    if (err instanceof ApiError && err.status !== 401) {
      state.error = err.message;
      render();
    }
  }
});

document.addEventListener('input', async (e) => {
  if (e.target.id === 'search-input') {
    state.search = e.target.value;
    const grid = $('#grid');
    const list = visibleProducts();
    if (grid) {
      grid.innerHTML = list.map(productCard).join('');
    } else {
      render();
      const inp = $('#search-input');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
    // le filtre serveur peut affiner (recherche serveur identique côté client pour l'instant)
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.id === 'notif-new') {
    localStorage.setItem('stb_notif_new', e.target.checked ? '1' : '0');
    if (e.target.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } else if (e.target.id === 'notif-mine') {
    localStorage.setItem('stb_notif_mine', e.target.checked ? '1' : '0');
    if (e.target.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } else if (e.target.dataset.field === 'shop-reopen') {
    state.shopReopenValue = e.target.value;
  }
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (state.upgradeModal && e.target.id !== 'upgrade-form') {
    state.upgradeError = 'Enregistrez d’abord votre nom d’utilisateur et votre mot de passe.';
    render();
    return;
  }

  if (e.target.id === 'login-form') {
    const username = String(new FormData(e.target).get('username') || '').trim();
    const password = String(new FormData(e.target).get('password') || '');
    if (!username || !password) return;
    state.loggingIn = true;
    state.loginUsername = username;
    state.loginPassword = password;
    state.loginError = null;
    render();
    try {
      const data = await api('/auth/login', { method: 'POST', body: { username, password }, noLogout: true });
      state.loggingIn = false;
      if (data && data.twoFactorRequired && data.challengeToken) {
        state.challengeToken = data.challengeToken;
        state.twofaCode = '';
        state.twofaRecovery = '';
        state.loginMode = 'twofa';
        state.loginPassword = '';
        render();
        return;
      }
      saveSession(data.token, data.user);
      state.loginNotice = null;
      await bootAfterLogin();
    } catch (err) {
      state.loggingIn = false;
      state.loginError = err.message;
      render();
    }
    return;
  }

  if (e.target.id === 'register-form') {
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');
    if (!name || !username || !password) return;
    state.regBusy = true;
    state.regName = name; state.regUsername = username; state.regPassword = password;
    state.regError = null;
    state.error = null;
    render();
    try {
      const data = await api('/auth/register', { method: 'POST', body: { name, username, password }, noLogout: true });
      saveSession(data.token, data.user);
      state.regBusy = false;
      await bootAfterLogin();
    } catch (err) {
      state.regBusy = false;
      state.regError = err.message;
      state.error = err.message;
      render();
    }
    return;
  }

  if (e.target.id === 'forgot-form') {
    const email = String(new FormData(e.target).get('email') || '').trim();
    if (!email) return;
    state.forgotEmail = email;
    state.forgotBusy = true;
    state.loginError = null;
    render();
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email }, noLogout: true });
      state.forgotDone = true;
    } catch {
      // Message volontairement neutre : on ne révèle pas si le compte existe.
      state.loginError = 'Impossible d’envoyer le lien pour le moment. Réessayez plus tard.';
    }
    state.forgotBusy = false;
    render();
    return;
  }

  if (e.target.id === 'reset-form') {
    const fd = new FormData(e.target);
    const password = String(fd.get('password') || '');
    const confirm = String(fd.get('confirm') || '');
    state.resetPassword = password;
    state.resetConfirm = confirm;
    state.loginError = null;
    if (password.length < 6) {
      state.loginError = 'Le nouveau mot de passe doit contenir au moins 6 caractères.';
      render();
      return;
    }
    if (password !== confirm) {
      state.loginError = 'Les mots de passe ne correspondent pas.';
      render();
      return;
    }
    state.resetBusy = true;
    render();
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { token: state.resetToken, password },
        noLogout: true,
      });
      state.loginMode = 'login';
      state.resetToken = '';
      state.resetPassword = '';
      state.resetConfirm = '';
      state.resetValid = null;
      state.resetBusy = false;
      state.loginNotice = 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.';
      toast('Mot de passe modifié', 'ok');
    } catch (err) {
      state.resetBusy = false;
      state.loginError = err.message;
    }
    render();
    return;
  }

  if (e.target.id === 'twofa-form') {
    const fd = new FormData(e.target);
    const code = String(fd.get('code') || '').trim();
    const recoveryCode = String(fd.get('recoveryCode') || '').trim();
    state.twofaCode = code;
    state.twofaRecovery = recoveryCode;
    state.loginError = null;
    if (!code && !recoveryCode) {
      state.loginError = 'Saisissez un code d’authentification ou un code de récupération.';
      render();
      return;
    }
    const body = { challengeToken: state.challengeToken };
    if (code) body.code = code;
    else body.recoveryCode = recoveryCode;
    state.twofaBusy = true;
    render();
    try {
      const data = await api('/auth/2fa/verify', { method: 'POST', body, noLogout: true });
      saveSession(data.token, data.user);
      state.twofaBusy = false;
      state.challengeToken = '';
      state.twofaCode = '';
      state.twofaRecovery = '';
      state.loginMode = 'login';
      await bootAfterLogin();
    } catch (err) {
      state.twofaBusy = false;
      state.loginError = err.message;
      render();
    }
    return;
  }

  if (e.target.id === 'order-form') {
    const fd = new FormData(e.target);
    const body = {
      items: state.cart.map((l) => ({ productId: l.productId, qty: l.qty })),
      address: String(fd.get('address') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      note: String(fd.get('note') || '').trim(),
    };
    const btn = $('button[type="submit"]', e.target);
    btn.disabled = true;
    try {
      const order = await api('/orders', { method: 'POST', body });
      state.cart = [];
      saveCart();
      state.error = null;
      toast('<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Commande #' + order.id + ' envoyée !', 'ok');
      await go('orderDetail', order.id);
    } catch (err) {
      btn.disabled = false;
      state.error = err.message;
      render();
    }
    return;
  }

  if (e.target.id === 'upgrade-form') {
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');
    if (!name || !username || !password) return;
    state.upgradeBusy = true;
    state.upgradeName = name; state.upgradeUsername = username; state.upgradePassword = password;
    state.upgradeError = null;
    render();
    try {
      const data = await api('/auth/upgrade', { method: 'POST', body: { name, username, password } });
      saveSession(data.token, data.user);
      state.upgradeBusy = false;
      state.upgradeModal = false;
      toast('Compte créé — vos données sont conservées', 'ok');
      render();
    } catch (err) {
      state.upgradeBusy = false;
      state.upgradeError = err.message;
      render();
    }
    return;
  }

  if (e.target.id === 'chat-form') {
    const inp = $('#chat-msg');
    const body = String(inp.value || '').trim();
    if (!body || state.sending || !state.conv) return;
    state.sending = true;
    render();
    try {
      const msg = await api(`/conversations/${state.conv.id}/messages`, { method: 'POST', body: { body } });
      state.messages.push(msg);
      state.sending = false;
      state.focusChat = true;
      render();
    } catch (err) {
      state.sending = false;
      state.chatError = err.message;
      render();
    }
    return;
  }

  if (e.target.id === 'expense-form') {
    const fd = new FormData(e.target);
    const btn = $('button[type="submit"]', e.target);
    btn.disabled = true;
    try {
      await api('/finances/expenses', {
        method: 'POST',
        body: {
          label: String(fd.get('label') || '').trim(),
          amountCents: Math.round((Number(fd.get('amount')) || 0) * 100),
          date: String(fd.get('date') || '').trim() || undefined,
        },
      });
      toast('Dépense ajoutée', 'ok');
      await loadFinances();
      render();
    } catch (err) {
      btn.disabled = false;
      toast(err.message || 'Erreur', 'err');
    }
    return;
  }

  if (e.target.id === 'account-form') {
    const fd = new FormData(e.target);
    state.accountBusy = true;
    state.accountError = null;
    state.accountNotice = null;
    drawAccountModal();
    try {
      const saved = await api('/account', {
        method: 'PATCH',
        body: {
          email: String(fd.get('email') || '').trim(),
          phone: String(fd.get('phone') || '').trim(),
        },
      });
      state.account = saved;
      state.user = await api('/auth/me');
      state.accountBusy = false;
      if (saved.verificationRequired) {
        state.emailVerify = { email: saved.pendingEmail };
        state.accountNotice = `Un code a été envoyé à ${saved.pendingEmail}.`;
        toast('Code de vérification envoyé', 'ok');
      } else {
        state.emailVerify = null;
        state.accountNotice = 'Informations du compte enregistrées.';
        toast('Informations du compte enregistrées', 'ok');
        render();
      }
    } catch (err) {
      state.accountBusy = false;
      state.accountError = err.message;
    }
    drawAccountModal();
    return;
  }

  if (e.target.id === 'account-password-form') {
    const fd = new FormData(e.target);
    const currentPassword = String(fd.get('currentPassword') || '');
    const newPassword = String(fd.get('newPassword') || '');
    const confirmPassword = String(fd.get('confirmPassword') || '');
    state.passwordForm = { current: currentPassword, next: newPassword, confirm: confirmPassword };
    state.accountError = null;
    state.accountNotice = null;
    if (newPassword.length < 6) {
      state.accountError = 'Le nouveau mot de passe doit contenir au moins 6 caractères.';
      drawAccountModal();
      return;
    }
    if (newPassword !== confirmPassword) {
      state.accountError = 'La confirmation ne correspond pas au nouveau mot de passe.';
      drawAccountModal();
      return;
    }
    state.passwordBusy = true;
    drawAccountModal();
    try {
      const data = await api('/account/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
        noLogout: true, // un 401 ici signifie « ancien mot de passe incorrect »
      });
      // Le serveur révoque tous les anciens jetons : installer immédiatement le nouveau.
      if (data && data.token) saveSession(data.token, state.user); else throw new Error('Nouveau jeton manquant');
      state.passwordForm = { current: '', next: '', confirm: '' };
      state.passwordBusy = false;
      if (state.account) state.account.hasPassword = true;
      state.accountNotice = 'Mot de passe modifié. Votre session a été renouvelée.';
      toast('Mot de passe modifié', 'ok');
    } catch (err) {
      state.passwordBusy = false;
      state.accountError = err.message;
    }
    drawAccountModal();
    return;
  }

  if (e.target.id === '2fa-enable-form') {
    const code = String(new FormData(e.target).get('code') || '').trim();
    state.twofaSetupCode = code;
    state.accountError = null;
    if (!/^\d{6}$/.test(code)) {
      state.accountError = 'Saisissez le code à 6 chiffres affiché par votre application.';
      drawAccountModal();
      return;
    }
    state.twofaSetupBusy = true;
    drawAccountModal();
    try {
      const data = await api('/account/2fa/enable', {
        method: 'POST',
        body: { code },
        noLogout: true,
      });
      if (state.account) state.account.twoFactorEnabled = true;
      state.twofaRecoveryCodes = Array.isArray(data && data.recoveryCodes) ? data.recoveryCodes : [];
      state.twofaSetup = null;
      state.twofaSetupCode = '';
      state.twofaSetupBusy = false;
      state.accountNotice = 'Double authentification activée.';
      toast('Double authentification activée', 'ok');
    } catch (err) {
      state.twofaSetupBusy = false;
      state.accountError = err.message;
    }
    drawAccountModal();
    return;
  }

  if (e.target.id === '2fa-disable-form') {
    const fd = new FormData(e.target);
    const code = String(fd.get('code') || '').trim();
    const password = String(fd.get('password') || '');
    state.twofaDisableCode = code;
    state.twofaDisablePassword = password;
    state.accountError = null;
    if (!/^\d{6}$/.test(code)) {
      state.accountError = 'Saisissez le code à 6 chiffres affiché par votre application.';
      drawAccountModal();
      return;
    }
    const body = { code };
    if (state.account && state.account.hasPassword) {
      if (!password) {
        state.accountError = 'Saisissez votre mot de passe pour désactiver la double authentification.';
        drawAccountModal();
        return;
      }
      body.password = password;
    }
    state.twofaDisableBusy = true;
    drawAccountModal();
    try {
      await api('/account/2fa/disable', { method: 'POST', body, noLogout: true });
      if (state.account) state.account.twoFactorEnabled = false;
      state.twofaDisableCode = '';
      state.twofaDisablePassword = '';
      state.twofaDisableBusy = false;
      state.accountNotice = 'Double authentification désactivée.';
      toast('Double authentification désactivée', 'ok');
    } catch (err) {
      state.twofaDisableBusy = false;
      state.accountError = err.message;
    }
    drawAccountModal();
    return;
  }

  if (e.target.id === 'account-delete-form') {
    const acc = state.account || {};
    const value = String(new FormData(e.target).get('value') || '');
    if (acc.hasPassword) state.deletePassword = value;
    else state.deleteConfirm = value;
    state.accountError = null;
    if (acc.hasPassword ? !value : value !== 'SUPPRIMER') {
      state.accountError = acc.hasPassword
        ? 'Saisissez votre mot de passe pour confirmer la suppression.'
        : 'Saisissez exactement SUPPRIMER pour confirmer la suppression.';
      drawAccountModal();
      return;
    }
    if (!confirm('SUPPRIMER DÉFINITIVEMENT votre compte ? Vos commandes, messages et identités seront effacés. L’argent rapporté dans les finances sera conservé.')) return;
    state.deleteBusy = true;
    drawAccountModal();
    try {
      await api('/account', {
        method: 'DELETE',
        body: acc.hasPassword ? { password: value } : { confirm: value },
        noLogout: true,
      });
      state.deleteBusy = false;
      state.deletePassword = '';
      state.deleteConfirm = '';
      closeAccountModal();
      toast('Compte supprimé', 'ok');
      logout(false);
    } catch (err) {
      state.deleteBusy = false;
      state.accountError = err.message;
      drawAccountModal();
    }
    return;
  }

  if (e.target.id === 'supplier-form') {
    const code = String(new FormData(e.target).get('code') || '').trim();
    try {
      state.user = await api('/admin/enter', { method: 'POST', body: { code } });
      toast('Espace fournisseur activé ', 'ok');
      await loadConversations();
      await go('admin');
    } catch (err) {
      state.error = err.message;
      render();
    }
  }
});

/* ---------------- Démarrage ---------------- */

async function bootAfterLogin() {
  // reprendre la session existante
  state.user = await api('/auth/me', { noLogout: true });

  // Anciens comptes "par nom" : on ne les supprime pas, on leur impose la
  // finalisation du compte (nom repris tel quel, username + mot de passe à choisir).
  if (state.user && state.user.provider === 'demo') {
    state.upgradeModal = true;
    state.upgradeName = state.user.name || '';
    state.upgradeUsername = '';
    state.upgradePassword = '';
    state.upgradeError = null;
  }

  connectSocket();
  await loadShopStatus();
  await loadCategories();
  if (isSupplier()) await loadAdminConversations();
  else await loadConversations();
  await go('gallery');
}

async function init() {
  const params = new URLSearchParams(location.search);
  const resetToken = params.get('reset');
  const linkedProvider = params.get('linked');
  const urlError = loginErrorFromUrl();
  if (urlError) state.loginError = urlError;
  loadShopStatus();

  // Retour depuis le lien e-mail : /app?reset=<jeton> (ou /?reset=<jeton>).
  if (resetToken) {
    state.resetToken = resetToken;
    state.resetValid = null;
    state.resetPassword = '';
    state.resetConfirm = '';
    state.resetBusy = false;
    state.loginMode = 'reset';
    state.loginError = null;
    state.loginNotice = null;
    state.error = null;
    // Les anciens jetons seront révoqués après le reset : on repart du login.
    state.token = '';
    state.user = null;
    localStorage.removeItem('stb_token');
    if (state.socket) { state.socket.disconnect(); state.socket = null; }
    history.replaceState({}, '', location.pathname);
    render();
    try {
      const check = await api('/auth/reset-validate?token=' + encodeURIComponent(resetToken), {
        noLogout: true,
      });
      state.resetValid = !!(check && check.valid);
    } catch (err) {
      state.resetValid = false;
      state.loginError = err.message;
    }
    render();
    return;
  }

  // retour OAuth web : /?token=…&role=… ou /?linked=github après liaison
  if (params.get('token')) {
    saveSession(params.get('token'), null);
    history.replaceState({}, '', location.pathname);
  } else if (linkedProvider) {
    history.replaceState({}, '', location.pathname);
  }
  if (state.loginError && !state.token) {
    render();
    return;
  }
  if (!state.token) {
    render();
    return;
  }
  try {
    await bootAfterLogin();
    if (linkedProvider) {
      toast(`Compte ${PROVIDER_LABELS[linkedProvider] || linkedProvider} lié avec succès.`, 'ok');
    }
  } catch {
    localStorage.removeItem('stb_token');
    state.token = '';
    state.user = null;
    render();
  }
}

init();
