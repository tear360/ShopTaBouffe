# Delivro — Contrat d'API (v1)

Base URL : `{PUBLIC_URL}/api` (dev : `http://10.0.2.2:3000/api` depuis l'émulateur Android).

Toutes les réponses sont du JSON (`Content-Type: application/json`), sauf mention contraire.
Erreurs : `{ "error": "message lisible" }` avec le bon code HTTP (400 / 401 / 403 / 404 / 409).

**Authentification** : header `Authorization: Bearer <JWT>` sur toutes les routes `/api/*` sauf
`GET /api/health`, `GET /api/auth/start`, `GET /api/auth/:provider/callback`, `POST /api/auth/demo`.

**Argent** : entiers en centimes d'euro (`price_cents`, `total_cents`).

**Rôles** : `customer` (défaut) | `supplier` (fournisseur/admin).

---

## 1. Authentification sociale (flow backend-mediated)

Principe : l'app ouvre un Custom Tab sur `PUBLIC_URL/api/auth/start?provider=X`, le backend fait le
cycle authorization_code côté serveur (client_secret), puis redirige vers le deep link de l'app.

### `GET /api/auth/start?provider=github|google`
- Génère `state` aléatoire (32 hex), le stocke en mémoire avec TTL 10 min (Map + cleanup), associe
  `provider`, et pose le cookie `oauth_state=<state>; HttpOnly; SameSite=Lax; Max-Age=600`.
- 302 vers l'URL d'autorisation du fournisseur avec `client_id`, `redirect_uri={PUBLIC_URL}/api/auth/{provider}/callback`,
  `scope`, `state`, `response_type=code`.
  - github : `https://github.com/login/oauth/authorize`, scope `read:user user:email`
  - google : `https://accounts.google.com/o/oauth2/v2/auth`, scope `openid email profile`, `access_type=offline`, `prompt=select_account`
- Si `client_id`/`client_secret` manquants pour ce provider → 302 vers
  `{PUBLIC_URL}/api/auth/failed?reason=not_configured` (le backend renverra ensuite vers le deep link
  d'erreur, voir plus bas).

### `GET /api/auth/:provider/callback?code&state`
- Vérifie `state` (cookie + mémoire, une seule consommation) → sinon redirect erreur `state_mismatch`.
- Échange `code` contre le token (POST token endpoint, `redirect_uri` identique, `client_id`/`secret`),
  récupère le profil :
  - github : `GET https://api.github.com/user` (+ `GET https://api.github.com/user/emails` si email null)
    → `id`, `login`, `name`, `email`, `avatar_url`
  - google : `GET https://openidconnect.googleapis.com/v1/userinfo` → `sub`, `name`, `email`, `picture`
- Upsert `users` sur `(provider, provider_id)` : met à jour `name`, `email`, `avatar_url`.
- Émet un JWT (HS256, 30 j, `JWT_SECRET`) : `{ sub: userId, role, name }`.
- **302** vers :
  `{APP_REDIRECT_SCHEME}://auth?token=<JWT>&name=<urlencoded>&avatar=<urlencoded>&role=<customer|supplier>`
  avec `APP_REDIRECT_SCHEME` défaut `delivro`.
- Échec quelconque → 302 vers `shoptabouffe://auth?error=<code>` (`not_configured`, `state_mismatch`,
  `provider_error`, `missing_code`).

### `POST /api/auth/demo` — body `{ "name": string }` — connexion par nom (compte invité)
Login sans compte ni mot de passe (champ « Votre nom » de l'écran de connexion). Crée/réutilise
un user `provider='demo'`, `provider_id='demo:<slug name>'`, rôle `customer`.
Réponse 200 : objet `AuthResponse` (voir §1.1). Désactivable via `ALLOW_DEMO_LOGIN=false`.

⚠️ **Chat désormais ouvert à tous les comptes** (y compris les connexions par nom / « Invité ») :
les routes `/api/conversations*` et le socket `conversation:join` n'imposent plus de
restriction sur `provider === 'demo'`. Un compte devenu **fournisseur** (`role = 'supplier'`,
via le code fournisseur) reste naturellement autorisé.

### `GET /api/auth/me` → 200 `User`
```json
{ "id": 1, "provider": "github", "name": "Léa", "email": "lea@x.fr",
  "avatarUrl": "https://...", "role": "customer", "createdAt": "2026-11-15T10:00:00.000Z" }
```

### 1.1 `AuthResponse`
```json
{ "token": "jwt...", "user": { ...User } }
```
(Le deep link ne contient que le token ; l'app appelle ensuite `GET /api/auth/me`.)

---

## 2. Compte fournisseur (code admin)

### `POST /api/admin/enter` body `{ "code": string }`
- Compare au code (`ADMIN_CODE` env, défaut `82dha92jdao8210dajod821JS0`, insensible à la casse, trim).
  Accepte aussi tout code présent actif dans la table `admin_codes` (champ `active=1`).
- Si OK → `role='supplier'` pour l'utilisateur courant, répond 200 avec `User` mis à jour.
- Sinon → **403** `{ "error": "Code invalide" }`. (Limite : 10 tentatives / 15 min / IP → 429 sinon.)

### `POST /api/admin/logout-role` → remet `role='customer'` (optionnel, utile pour les tests).

---

## 3. Produits (galerie)

### `GET /api/products?search=&category=&available=1`
→ `{ "products": [Product] }` trié par `category`, puis `name`.
- `search` : LIKE sur `name` + `description` (insensible casse).
- `category` : filtre exact. `available=1` : masque les produits discontinués (défaut côté app : `available=1`).

```json
{ "id": 1, "name": "Pizza Margherita", "description": "Tomate, mozzarella, basilic",
  "priceCents": 950, "costCents": 400, "category": "Pizza", "imageUrl": "https://...",
  "available": true, "createdAt": "..." }
```
`costCents` = prix de revient (coût d'achat) → sert à la marge dans l'espace Finances.

### `GET /api/products/:id` → `Product` ou 404.

### Fournisseur uniquement (403 sinon)
- `POST /api/products` body `{ name, description, priceCents, costCents?, category, imageUrl, available? }` → 201 `Product`
  - validations : `name` requis (1–120), `priceCents` entier ≥ 0, `costCents` entier ≥ 0 (défaut 0),
    `category` requis (1–60), `description` ≤ 2000, `imageUrl` ≤ 500 (peut être vide → placeholder).
- `PATCH /api/products/:id` (champs partiels, mêmes validations) → `Product`
- `DELETE /api/products/:id` → 204. (Refus 409 si le produit apparaît dans une commande non livrée ?
  Non : on supprime seulement le produit, les `order_items` gardent une copie du nom/prix.)

### Catégories

Les chips de la galerie viennent de la table `categories` (seed : 10 catégories par défaut, une
seule fois). Le fournisseur les gère depuis son espace.

- `GET /api/categories` (public) → `{ "categories": [ { "id", "name", "createdAt", "productsCount" } ] }`
  trié par nom.
- Fournisseur uniquement (403 sinon) :
  - `POST /api/categories` body `{ "name": string }` (1–60) → 201 ; 409 si déjà existante.
  - `PATCH /api/categories/:id` body `{ "name": string }` → 200. **Renomme aussi les produits**
    de l'ancien nom (transaction) pour ne pas casser les filtres ; 409 si le nouveau nom existe.
  - `DELETE /api/categories/:id` → 204 ; **409 si encore utilisée** par des produits.
- Émet en socket : `categories:changed` (toutes les connexions).

---

## 4. Panier & commandes

Le panier est **local à l'app** (pas d'endpoint).

### `POST /api/orders`
```json
{ "items": [ { "productId": 1, "qty": 2 }, { "productId": 4, "qty": 1 } ],
  "address": "12 rue des Lilas, Paris", "phone": "0612345678", "note": "Sans oignons" }
```
- Re-valide **prix et disponibilité côté serveur** (le client n'envoie jamais les prix).
- 1–50 lignes, `qty` 1–99, `address` requis (3–200), `phone` requis (6–30), `note` ≤ 500.
- Répond **201** :
```json
{ "id": 7, "status": "pending", "totalCents": 2850, "address": "...", "phone": "...",
  "note": "...", "createdAt": "...", "updatedAt": "...",
  "items": [ { "productId": 1, "name": "Pizza Margherita", "priceCents": 950, "qty": 2 } ],
  "customer": { "id": 3, "name": "Léa", "avatarUrl": "..." } }
```
- Émet en socket : `order:new` (room `admin`) et `order:updated` (room `user:<id>`).

### `GET /api/orders/mine` → `{ "orders": [Order] }` (du client courant, plus récent d'abord)
### `GET /api/orders/:id` → `Order` (client propriétaire ou supplier, sinon 403/404)
### Fournisseur : `GET /api/orders?status=pending` → `{ "orders": [Order] }` (tous les clients,
`customer` inclus, tri `createdAt` DESC ; sans `status` → toutes).
### Fournisseur : `PATCH /api/orders/:id` body `{ "status": "..." }`
Statuts : `pending` → `accepted` | `refused` ; `accepted` → `preparing` → `delivering` → `delivering` → `delivered`.
Transitions invalides → 409. Émet `order:updated` sur `user:<customerId>` et `admin`.

`Order.customer` n'est présent que pour les réponses supplier.

---

## 5. Chat (1 conversation par client ↔ fournisseur)

### `GET /api/conversations`
- Client : renvoie **sa** conversation avec le fournisseur (la crée à la volée si absente).
- Supplier : `{ "conversations": [ { "id", "customer": { id, name, avatarUrl }, "lastMessage": { id, body, createdAt, senderId } | null, "unreadCount": n, "updatedAt" } ] }`
- Client : même forme (avec `customer` = lui-même, `unreadCount` = messages non lus par lui).

### `GET /api/conversations/:id/messages?before=<id>&limit=50`
→ `{ "messages": [ { "id", "conversationId", "senderId", "senderName", "body", "createdAt", "readAt" } ] }`
tri ASC, pagination par `before` (id plus petit que `before`), `limit` défaut 50 max 100.
Seuls les 2 participants accèdent (403 sinon).

### `POST /api/conversations/:id/messages` body `{ "body": string }` (1–1000)
→ 201 `Message` + émission socket `message:new` sur la room `conv:<id>`.

### `POST /api/conversations/:id/read` → 204 (marque tous les messages de l'autre comme lus).

---

## 6. Socket.IO (temps réel)

URL : `{PUBLIC_URL}` (pas de `/api`), protocole `websocket`.
Handshake : `io(PUBLIC_URL, { auth: { token: "<JWT>" } })` — **401** si token invalide.

Côté serveur, à la connexion :
- join room `user:<id>`
- si `role === 'supplier'` → join room `admin`

Côté client, à la connexion :
- émet `conversation:join` `{ conversationId }` pour chaque conversation suivie → le serveur
  vérifie la participation puis join la room `conv:<id>` (ack `joined`/`error`).
- émet `watch:orders` (supplier) → join room `admin` (idempotent).

Événements reçus par le client :

| event | payload | rooms |
|---|---|---|
| `message:new` | `{ id, conversationId, senderId, senderName, body, createdAt, readAt }` | `conv:<id>` |
| `order:new` | `Order` (avec `customer`) | `admin` |
| `order:updated` | `Order` (avec `customer` si supplier) | `user:<customerId>`, `admin` |
| `order:deleted` | `{ id, customerId, mine? }` — commande purgée après 2 h | `user:<customerId>`, `admin` |
| `conversation:deleted` | `{ conversationId }` — fil purgé avec la dernière commande | `conv:<id>`, `user:<customerId>`, `admin` |
| `product:changed` | `{ action: "created"\|"updated"\|"deleted", product }` | toutes les connexions |
| `categories:changed` | (sans payload) — liste des catégories à re-fetcher | toutes les connexions |

Reconnexion automatique côté client (`reconnection: true`). Toute mutation REST émet aussi l'event
correspondant (les sockets ne sont pas la seule source de vérité → l'app re-fait un GET après un
événement pour rester cohérent).

### Purge automatique des commandes terminées

Toutes les 60 s (`ORDER_PURGE_INTERVAL_S`), le serveur supprime :

1. les commandes `delivered` ou `refused` dont le `updated_at` a plus de **2 h**
   (`ORDER_RETENTION_HOURS`) — les lignes d'articles partent en cascade ;
2. **ensuite**, la conversation du client **si** il ne lui reste plus aucune commande en cours
   (sinon le fil est conservé : il sert encore) — les messages partent en cascade.

Chaque suppression est diffusée en socket (`order:deleted`, `conversation:deleted`) pour que
l'app du client et l'espace fournisseur se mettent à jour instantanément.

**Le journal des ventes (`sales` / `sale_items`) n'est PAS purgé** : écrit à la livraison avec une
copie figée des prix et des coûts, il survit à la suppression de la commande (voir §7 Finances).

---

## 7. Espace Finances (fournisseur)

Toutes les routes sont **fournisseur uniquement** (401 sans JWT, 403 sinon). Les montants sont en
centimes. Les dates de période sont en `AAAA-MM-JJ` (paramètres `from` / `to`, optionnels,
filtrent sur la date locale).

### `GET /api/finances/summary?from=&to=`
```json
{ "period": { "from": null, "to": null },
  "revenueCents": 4850, "costCents": 2100, "grossMarginCents": 2750,
  "expensesCents": 12000, "netCents": -9250,
  "orders": 3, "units": 7, "expenseCount": 1 }
```
- **Revenus** : somme des ventes livrées (table `sales`).
- **Coûts** : `cost_cents × qty` des articles vendus (prix de revient figé à la livraison).
- **Marge brute** = revenus − coûts ; **résultat net** = marge brute − dépenses.

### `GET /api/finances/sales?from=&to=&limit=100` (max 500)
→ `{ "sales": [ { "id", "orderId", "totalCents", "deliveredAt",
  "items": [ { "productId", "name", "priceCents", "costCents", "qty" } ] } ] }`
Plus récent d'abord. Survivent à la purge de 2 h des commandes.

### `GET /api/finances/products?from=&to=`
→ `{ "products": [ { "productId", "name", "units", "revenueCents", "costCents", "marginCents" } ] }`
Revenus / coûts / marge **par produit**, triés par revenu décroissant.

### Dépenses manuelles (charges du fournisseur)
- `GET /api/finances/expenses` → `{ "expenses": [ { "id", "label", "amountCents", "date", "createdAt" } ] }`
- `POST /api/finances/expenses` body `{ "label": string, "amountCents": int ≥ 0, "date?": "AAAA-MM-JJ" }`
  → 201 (`date` défaut : aujourd'hui).
- `PATCH /api/finances/expenses/:id` (champs partiels) → 200 ; 404 si introuvable.
- `DELETE /api/finances/expenses/:id` → 204 ; 404 si déjà supprimée.

---

## 8. Santé & seed

### `GET /api/health` → `{ "ok": true, "version": "1.0.0" }`

### Seed (au premier démarrage, si la table `products` est vide)
~10 produits de démo répartis en catégories `Pizza`, `Burger`, `Sushi`, `Dessert`, `Boisson`, avec
des images `https://images.unsplash.com/...&w=600` et prix réalistes.

---

## 9. Variables d'environnement (`.env`)

| var | défaut | rôle |
|---|---|---|
| `PORT` | `3000` | port HTTP |
| `PUBLIC_URL` | `http://10.0.2.2:3000` | URL publique (callbacks OAuth + socket) |
| `APP_REDIRECT_SCHEME` | `shoptabouffe` | schéma du deep link de retour |
| `JWT_SECRET` | aléatoire au 1er lancement (persisté dans la DB) | signature JWT |
| `ADMIN_CODE` | `82dha92jdao8210dajod821JS0` | code fournisseur |
| `ALLOW_DEMO_LOGIN` | `true` | active `POST /api/auth/demo` (connexion par nom, avec chat) |
| `ORDER_RETENTION_HOURS` | `2` | purge des commandes terminées après ce délai |
| `ORDER_PURGE_INTERVAL_S` | `60` | fréquence du tour de purge |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | OAuth GitHub |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | OAuth Google |

---

## 10. Choix techniques backend

- Node.js ≥ 20, **ESM** (`"type": "module"`), Express 4, `better-sqlite3` (fichier `data/delivro.db`),
  `socket.io`, `jsonwebtoken`, `cookie-parser`, `dotenv`, `express-rate-limit`.
- Pas de build : `npm start` lance `src/server.js`.
- CORS : autoriser toutes les origines en dev (l'app n'utilise pas de CORS, mais pratique pour tester).
- Journal console simple : `console.log` avec timestamp pour chaque requête API.
- Un script `npm run smoke` (Node) qui démarre le serveur, exécute les endpoints clés (health, demo
  login, produits, commande, admin code, conversation, messages) et affiche `SMOKE OK`.
