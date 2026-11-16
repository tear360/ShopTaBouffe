# Brancher Discord, GitHub et Google (OAuth)

L'app ouvre un Custom Tab sur `{PUBLIC_URL}/api/auth/start?provider=…`, le **serveur** échange le
code contre le profil (le `client_secret` ne quitte jamais le serveur), puis renvoie l'app en
ouvrant le deep link `shoptabouffe://auth?token=…`.

Vous n'avez donc qu'**une seule URL à déclarer par fournisseur** : le callback du backend.

```
https://VOTRE-SERVEUR/api/auth/discord/callback
https://VOTRE-SERVEUR/api/auth/github/callback
https://VOTRE-SERVEUR/api/auth/google/callback
```

> `VOTRE-SERVEUR` doit être **identique** à la variable `PUBLIC_URL` du serveur, **et** à
> `delivro.apiUrl` dans `android/local.properties` (sans le `/api`, sans `/` final).

---

## 1. GitHub

1. <https://github.com/settings/developers> → **New OAuth App**
2. **Application name** : `Delivro` (libre)
3. **Homepage URL** : `https://VOTRE-SERVEUR`
4. **Authorization callback URL** : `https://VOTRE-SERVEUR/api/auth/github/callback`
5. **Register application** → copiez le *Client ID*
6. *Client Secret* → **Generate a new client secret** → copiez-le (il n'est affiché qu'une fois)

```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 2. Discord

1. <https://discord.com/developers/applications> → **New Application** (nom : `Delivro`) → **Create**
2. Onglet **OAuth2** → *Redirects* → **Add Redirect** :
   `https://VOTRE-SERVEUR/api/auth/discord/callback` → **Save Changes**
3. Toujours dans OAuth2 : copiez **Client ID** et **Client Secret** (→ *Reset Secret* si besoin)

```env
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Scopes utilisés côté serveur : `identify email`.

## 3. Google

1. <https://console.cloud.google.com/> → projet existant ou **New Project** (`Delivro`)
2. **APIs & Services → OAuth consent screen**
   - User Type : **External** → Create
   - App name, support email → Save and Continue (scopes et test users : passer à l'étape suivante)
   - Si l'app reste en mode **Testing**, ajoutez votre adresse Google dans **Test users**
     (sinon la fenêtre de connexion affiche « app non vérifiée »).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type : **Web application**
   - Name : `Delivro Web`
   - **Authorized redirect URIs → Add URI** :
     `https://VOTRE-SERVEUR/api/auth/google/callback`
4. **Create** → copiez *Client ID* et *Client Secret*

```env
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-yyyyyyyyyyyy.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
```

---

## Serveur : où poser les clés ?

```powershell
cd C:\Users\degre_3\Desktop\codes\delivro\backend
Copy-Item .env.example .env   # puis éditez .env
npm start
```

Variables importantes :

| var | ex. | rôle |
|---|---|---|
| `PUBLIC_URL` | `https://mon-delivro.up.railway.app` | base publique (callbacks OAuth + Socket.IO) |
| `APP_REDIRECT_SCHEME` | `delivro` | schéma du deep link de retour vers l'app |
| `ADMIN_CODE` | `SUPPLIER-2026` | code pour activer le mode fournisseur |
| `DISCORD_*` / `GITHUB_*` / `GOOGLE_*` | — | clés OAuth ci-dessus |

Sans clés, l'app reste utilisable : la connexion sociale affiche un message explicite et le
**mode démo** (bouton « Essayer sans compte ») fonctionne à 100 %.

---

## Développement local : pourquoi un tunnel ?

Les trois fournisseurs exigent un callback **https** (Google n'accepte que `localhost` en http).
Sur un émulateur Android, `PUBLIC_URL` doit être joignable **par le téléphone** :

```powershell
# option A — tunnel (ex. cloudflared)
cloudflared tunnel --url http://localhost:3000
# → https://random-url.trycloudflare.com  → PUBLIC_URL=https://random-url.trycloudflare.com

# option B — déployer (Render / Railway / VPS) : le plus simple pour un usage réel
```

Puis mettez à jour `PUBLIC_URL` **et** `delivro.apiUrl` (dans `android/local.properties`)
avec la même base, et relancez `npm start` + le build Android.

## Sécurité

- Le `client_secret` reste sur le serveur ; l'app ne reçoit jamais qu'un **JWT** (30 jours).
- `state` aléatoire à usage unique protège contre le CSRF du flux.
- Le code fournisseur (`ADMIN_CODE`) est protégé par un rate limit (10 essais / 15 min / IP).
- En production : mettez un `JWT_SECRET` fort et servez le tout derrière **HTTPS**.
