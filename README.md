# ShopTaBouffe — suivi d'avancement du projet

> Dernière mise à jour : **20 novembre 2026** — version en cours : **1.0.10**
> Ce README est la fiche de suivi du projet : état réel, URLs de production,
> décisions prises et commandes pour reconstruire / redéployer.

---

## 1. Ce que fait l'application

ShopTaBouffe est une marketplace locale (commandes, panier, catalogue, chat,
finances, espace fournisseur/admin) déclinée sur **quatre clients** qui parlent
à la même API :

| Client | Techno | Emplacement |
| --- | --- | --- |
| Backend / API | Node.js + Express + SQLite + Socket.IO | `backend/` |
| Site web PWA | JavaScript vanilla + CSS responsive | `web/` |
| Android | Kotlin + Jetpack Compose (thème `Theme.ShopTaBouffe`, icônes Painter, bottom nav) | `android/` |
| Windows | Rust + egui/eframe, installateur NSIS (sans console, sans admin) | `rust-app/` |

### URLs de production (référence unique)

- Site / PWA : **https://chorizo.dpdns.org/app**
- API : **https://chorizo.dpdns.org/api**
- Health : `https://chorizo.dpdns.org/api/health` → `{"ok":true,"version":"1.0.0"}`
- Callbacks OAuth (à déclarer tels quels chez les fournisseurs) :
  - `https://chorizo.dpdns.org/api/auth/github/callback`
  - `https://chorizo.dpdns.org/api/auth/google/callback`
- Deep link Android : `shoptabouffe://auth?token=…`

> **Règle d'or** : `PUBLIC_URL` (backend), `delivro.apiUrl` (Android) et
> `API_BASE` (Windows) doivent tous valoir `https://chorizo.dpdns.org`
> (sans `/api`, sans `/` final). Le site web utilise des URLs relatives
> `/api/…`, donc il suit automatiquement le domaine courant.

---

## 2. État d'avancement

### ✅ Terminé

- **Release 1.0.9** publiée sur GitHub (`v1.0.9`), non draft / non prerelease,
  avec `ShopTaBouffe-Setup-1.0.9.exe` et `ShopTaBouffe-1.0.9.apk`.
- **Boucle d'auto-update 1.0.8 corrigée** : `is_newer(newer, current)` compare
  strictement `>` ; le binaire 1.0.9 a été vérifié puis envoyé dans l'installateur.
- **Comptes username + mot de passe** disponibles partout :
  - inscription `POST /api/auth/register` (nom + username + mot de passe) ;
  - connexion `POST /api/auth/login` (username + mot de passe) ;
  - OAuth GitHub et Google conservés (le `client_secret` reste sur le serveur).
- **Connexion par nom supprimée** des trois interfaces (web, Android, Windows) :
  aucun onglet « Connexion par nom », aucun formulaire `auth/demo`.
  `POST /api/auth/demo` répond désormais **410 Gone**.
- **Anciens comptes démo préservés** : aucune ligne `provider='demo'` n'est
  supprimée. Leur token reste valide et `POST /api/auth/upgrade` fait un
  `UPDATE` sur le **même id** (donc commandes, panier, conversations et
  finances conservés). L'upgrade demande username + mot de passe ; le nom est
  repris tel quel et affiché en lecture seule.
- **Formulaire de finalisation obligatoire** :
  - Web : modale non fermable, fond inerte, gardes sur clics/submit/logout,
    plus de bouton « Plus tard » ; `?v=8` pour casser le cache.
  - Android : `vm.needsUpgrade` pilote un `AlertDialog(onDismissRequest = {})`,
    logout bloqué tant que le compte n'est pas finalisé.
  - Windows : session persistée dans `%LOCALAPPDATA%\ShopTaBouffe\session.txt`
    (reprise via `/auth/me`), écran bloquant rendu **seul** dans `update()`,
    logout refusé tant que `upgrade_modal` est actif.
- **Domaine OAuth corrigé partout** (demande du 20/11) :
  - `backend/.env` et `backend/.env.example` → `PUBLIC_URL=https://chorizo.dpdns.org` ;
  - `android/local.properties` → `delivro.apiUrl=https://chorizo.dpdns.org`
    (avant : `http://10.0.2.2:3000`, l'émulateur — c'était la cause des boutons
    Google/GitHub inopérants sur un vrai téléphone) ;
  - Windows : `API_BASE = "https://chorizo.dpdns.org/api"` (déjà correct) ;
  - Web : liens `/api/auth/start?...` relatifs (déjà corrects).
- **Vérification en production** : `/api/auth/start?provider=google|github&target=web`
  renvoie bien `redirect_uri=https://chorizo.dpdns.org/api/auth/<provider>/callback`
  (302) et les pages d'autorisation Google/GitHub répondent 200 sans
  `redirect_uri_mismatch`.
- **Déploiement du 20/11** :
  - sauvegarde `/home/tear/shoptabouffe-backup-pre-v8` avant copie ;
  - `auth.js`, `app.js`, `app.css`, `index.html` uploadés dans
    `/home/tear/shoptabouffe/{backend/src/routes,web}` ;
  - `ALLOW_DEMO_LOGIN=false` posé sur le serveur (les **clés OAuth** du `.env`
    de production ont été conservées) ;
  - service `shoptabouffe` redémarré et actif.

### ✅ Version 1.0.10 (release publiée)

- Bump de version : `APP_VERSION`, `Cargo.toml`, `installer.nsi`,
  Android `versionCode = 11` / `versionName = "1.0.10"`.
- Recompilation Windows (`cargo build --release`) et Android
  (`.\gradlew assembleRelease`) après les derniers correctifs : **BUILD SUCCESSFUL**.
- Artifacts générés : `ShopTaBouffe-Setup-1.0.10.exe` (4,1 Mo) et
  `ShopTaBouffe-1.0.10.apk` (12,5 Mo).
- Release **`v1.0.10`** publiée avec les deux artifacts :
  <https://github.com/tear360/ShopTaBouffe/releases/tag/v1.0.10>.
- README de suivi ajouté, commit + push de l'ensemble des modifications.

### ⏳ À faire / points d'attention

- Refaire un test OAuth **interactif** avec un vrai compte Google et un vrai
  compte GitHub depuis le site et depuis l'APK 1.0.10 (les URLs et callbacks
  sont vérifiés, mais le consentement réel n'est pas automatisable ici).
- Vérifier l'installation PWA sur iOS/Android (manifest + icône déjà présents
  dans `web/`).
- Le serveur écoute en HTTP derrière le reverse-proxy/`chorizo.dpdns.org` ;
  si un certificat est ajouté un jour, garder `PUBLIC_URL` en `https://`.
- `/home/tear/shoptabouffe-backup-20261120` et `...-pre-v8` sont les sauvegardes
  à ne pas supprimer tant que 1.0.10 n'est pas validée.

---

## 3. Comportement des comptes (important)

| Situation | Comportement attendu |
| --- | --- |
| Nouveau visiteur | Inscription **nom + username + mot de passe**, ou OAuth Google/GitHub. Aucun bouton « invité ». |
| Ancien compte `demo` qui rouvre l'app | Session reprise (web/Android/Windows), modale obligatoire : nom pré-rempli en lecture seule + username + mot de passe. |
| Ancien compte `demo` qui essaie de se déconnecter | Déconnexion refusée avec message « Finalisez votre compte avant de vous déconnecter. » |
| Appel à `/api/auth/demo` | `410 Gone` — aucun nouveau compte invité n'est créé. |
| `POST /api/auth/upgrade` | Met à jour la **même ligne** : `provider='local'`, `provider_id=username`, hash du mot de passe. Aucune donnée n'est perdue. |
| Identifiants déjà pris | `409 Conflict` ; le formulaire reste ouvert avec le message d'erreur. |

---

## 4. Commandes utiles

### Vérifications rapides

```powershell
node --check backend/src/routes/auth.js
node --check web/app.js
```

### Construire les artifacts 1.0.10

```powershell
cd rust-app\shoptabouffe
cargo build --release

cd ..\..
& "C:\Program Files (x86)\NSIS\makensis.exe" -V2 rust-app\installer.nsi
Copy-Item rust-app\ShopTaBouffe-Setup-1.0.10.exe ShopTaBouffe-Setup-1.0.10.exe

cd android
.\gradlew assembleRelease --console=plain
Copy-Item app\build\outputs\apk\release\app-release.apk ..\ShopTaBouffe-1.0.10.apk
```

### Déployer le backend + le site

Les helpers SSH/SFTP utilisés se trouvent dans
`%LOCALAPPDATA%\Temp\opencode\` (`ssh193.py`, `sftp193.py`). Le mot de passe du
serveur n'est **pas** stocké dans ce README (voir la note privée du projet).

```powershell
python ...\sftp193.py put /home/tear/shoptabouffe/backend/src/routes/auth.js backend\src\routes\auth.js
python ...\sftp193.py put /home/tear/shoptabouffe/web/app.js web\app.js
python ...\sftp193.py put /home/tear/shoptabouffe/web/app.css web\app.css
python ...\sftp193.py put /home/tear/shoptabouffe/web/index.html web\index.html
python ...\ssh193.py 'echo <MOT_DE_PASSE> | sudo -S systemctl restart shoptabouffe'
```

### Vérifier après déploiement

```powershell
# demo supprimée → 410
Invoke-WebRequest https://chorizo.dpdns.org/api/auth/demo -Method POST -Body '{"name":"x"}' -ContentType application/json
# callbacks au bon domaine
Invoke-WebRequest 'https://chorizo.dpdns.org/api/auth/start?provider=google&target=web' -MaximumRedirection 0
Invoke-WebRequest 'https://chorizo.dpdns.org/api/auth/start?provider=github&target=web' -MaximumRedirection 0
# site à ?v=8, sans onglet démo
Invoke-WebRequest https://chorizo.dpdns.org/app/
```

---

## 5. Historique des releases

| Version | Contenu |
| --- | --- |
| `v1.0.8` | Auto-update (boucle de mise à jour corrigée ensuite). |
| `v1.0.9` | Correctif auto-update, installer sans console ni droits admin, APK Android. |
| [`v1.0.10`](https://github.com/tear360/ShopTaBouffe/releases/tag/v1.0.10) | Domaine OAuth `chorizo.dpdns.org` sur tous les clients, fin de la connexion par nom, finalisation obligatoire des anciens comptes démo, session Windows persistée. |

---

## 6. Rappels techniques

- Ne **jamais** exécuter de `DELETE FROM users WHERE provider='demo'`.
- `upgrade` conserve l'id : c'est ce qui garde les commandes liées au compte.
- Windows : fichier de session `%LOCALAPPDATA%\ShopTaBouffe\session.txt`.
- Android : deep link `shoptabouffe://auth` déclaré dans `AndroidManifest.xml`.
- Nginx : port 80 → backend `127.0.0.1:3000` (sert aussi le site `/app`) ;
  port 8080 → `/var/www/chorizo`.
- Code fournisseur/admin : `ADMIN_CODE` dans `backend/.env` (non dupliqué ici).
