# Brancher GitHub et Google (OAuth)

L'app ouvre un Custom Tab sur `{PUBLIC_URL}/api/auth/start?provider=…`, le **serveur** échange le
code contre le profil (le `client_secret` ne quitte jamais le serveur), puis renvoie l'app en
ouvrant le deep link `shoptabouffe://auth?token=…`.

Vous n'avez donc qu'**une seule URL à déclarer par fournisseur** : le callback du backend.

```
https://VOTRE-SERVEUR/api/auth/github/callback
https://VOTRE-SERVEUR/api/auth/google/callback
```

> `VOTRE-SERVEUR` doit être **identique** à la variable `PUBLIC_URL` du serveur, **et** à
> `delivro.apiUrl` dans `android/local.properties` (sans le `/api`, sans `/` final).
>
> Serveur actuel : `VOTRE-SERVEUR` = `https://chorizo.dpdns.org`

---

## 1. GitHub

1. <https://github.com/settings/developers> → **New OAuth App**
2. **Application name** : `ShopTaBouffe` (libre)
3. **Homepage URL** : `https://VOTRE-SERVEUR`
4. **Authorization callback URL** : `https://VOTRE-SERVEUR/api/auth/github/callback`
5. **Register application** → copiez le *Client ID*
6. *Client Secret* → **Generate a new client secret** → copiez-le (il n'est affiché qu'une fois)

```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 2. Google (guide pas à pas)

Google est le plus long à configurer. Comptez **10 minutes**.

### 2.1 Créer le projet

1. Ouvrez <https://console.cloud.google.com/>
2. En haut à gauche (sélecteur de projet) → **New project** → nom `ShopTaBouffe` → **Create**
   (ou choisissez un projet existant).
3. Attendez la notification « Project creation completed », sélectionnez le projet.

### 2.2 Écran de consentement OAuth

1. Menu ☰ → **APIs & Services** → **OAuth consent screen**
2. **User Type** : **External** → **Create**
3. Renseignez :
   - **App name** : `ShopTaBouffe`
   - **User support email** : votre adresse Gmail
   - **Developer contact email** : votre adresse Gmail
   → **Save and Continue**
4. **Scopes** : cliquez **Add or Remove Scopes**, cochez :
   - `…/auth/userinfo.email`
   - `…/auth/userinfo.profile`
   → **Update** → **Save and Continue**
5. **Test users** : si vous laissez l'application en mode *Testing*, ajoutez votre adresse
   Gmail ici (sinon Google refuse la connexion avec « Error 403: access_denied »).
   → **Save and Continue** → **Back to Dashboard**

> ⚠️ Tant que le projet est en **Testing**, seules les adresses listées comme *Test users* peuvent
> se connecter. Pour ouvrir à tout le monde : **Publish app** (Google peut demander une vérification
> si vous publiez des scopes sensibles ; `email`/`profile` restent en vérification légère).

### 2.3 Créer le client OAuth (Web application)

1. Menu ☰ → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID**
3. **Application type** : **Web application**
4. **Name** : `ShopTaBouffe Web`
5. **Authorized redirect URIs** → **Add URI** :
   `https://VOTRE-SERVEUR/api/auth/google/callback`
   (donc ici : `https://chorizo.dpdns.org/api/auth/google/callback`)
6. **Create** → copiez le **Client ID** et le **Client Secret**

```env
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-yyyyyyyyyyyy.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
```

### 2.4 Activer l'API People (recommandé)

Pour que Google renvoie bien le profil, activez **People API** :
☰ → **APIs & Services** → **Library** → cherchez `People API` → **Enable**.
(Le flux OAuth standard `userinfo` fonctionne aussi, l'activation évite les erreurs.)

### 2.5 Poser les clés sur le serveur

Sur le mini PC (là où tourne le backend) :

```bash
nano ~/shoptabouffe/backend/.env      # collez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET
sudo systemctl restart shoptabouffe   # relance avec les nouvelles variables
```

Vérifiez que le bouton répond :

```bash
curl -i "https://chorizo.dpdns.org/api/auth/start?provider=google"
# attendu : HTTP/2 302 → Location: https://accounts.google.com/o/oauth2/v2/auth?...
```

Si vous obtenez `{"error":"provider_not_configured"}`, les clés ne sont pas bien chargées
(`.env` mal formaté ou service non redémarré).

---

## Connexion sans compte (optionnelle)

Le champ « Votre nom » + bouton **« Se connecter avec ce nom »** crée un compte invité
(`provider = demo`), sans mot de passe ni e-mail.

⚠️ **Le chat est désormais accessible à tous**, y compris aux comptes invités (par nom) :
le bouton « Discuter avec le fournisseur » est toujours affiché et le serveur n'impose
plus la restriction `chat_forbidden` sur `/api/conversations*` ni sur le socket
`conversation:join`.

Pour désactiver complètement cette connexion : `ALLOW_DEMO_LOGIN=false` dans le `.env`.

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
| `PUBLIC_URL` | `https://chorizo.dpdns.org` | base publique (callbacks OAuth + Socket.IO) |
| `APP_REDIRECT_SCHEME` | `shoptabouffe` | schéma du deep link de retour vers l'app |
| `ADMIN_CODE` | `82dha92jdao8210dajod821JS0` | code pour activer le mode fournisseur |
| `ALLOW_DEMO_LOGIN` | `true` | active la connexion par nom (avec chat) |
| `GITHUB_*` / `GOOGLE_*` | — | clés OAuth ci-dessus |

Sans clés, l'app reste utilisable : la connexion sociale affiche un message explicite et la
**connexion par nom** fonctionne (avec chat).

---

## Sécurité

- Le `client_secret` reste sur le serveur ; l'app ne reçoit jamais qu'un **JWT** (30 jours).
- `state` aléatoire à usage unique protège contre le CSRF du flux.
- Le code fournisseur (`ADMIN_CODE`) est protégé par un rate limit (10 essais / 15 min / IP).
- En production : mettez un `JWT_SECRET` fort et servez le tout derrière **HTTPS**.
- Les comptes invités (sans compte) sont volontairement privés du chat fournisseur.
