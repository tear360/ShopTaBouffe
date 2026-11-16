# 🛵 Delivro — livraison de produits / nourriture

Application Android (Kotlin + Jetpack Compose) de commande et de livraison, avec un backend
Node.js temps réel : catalogue, panier, commandes, **chat client ↔ fournisseur en direct**,
comptes sociaux **Discord / GitHub / Google**.

```
delivro/
├── android/          App Android (Kotlin, Jetpack Compose, Min SDK 24)
├── backend/          API REST + Socket.IO + SQLite (Node.js 20+, ESM)
└── docs/             API.md (contrat) · OAUTH_SETUP.md (branchement des 3 réseaux)
```

---

## Fonctionnalités

**Client**
- Connexion en **1 clic** avec Discord, GitHub ou Google (Custom Tab → retour en deep link
  `shoptabouffe://auth?token=…`), plus un **mode démo** sans compte.
- Galerie de produits : recherche, filtres par catégorie, fiche produit, quantités.
- Panier persistant pendant la session, commande avec adresse / téléphone / note.
- Suivi des commandes (statuts : en attente → acceptée → préparation → livraison → livrée,
  ou refusée) et **chat en temps réel** avec le fournisseur.

**Fournisseur (admin)**
- Activation par **code fournisseur** (défaut `SUPPLIER-2026`), saisie dans le profil.
- Onglet *Fournisseur* : commandes entrantes en direct (Accepter / Refuser / statut suivant),
  gestion du catalogue (ajout, édition, disponibilité, suppression), conversations clients
  avec compteur de non-lus.
- Chaque client a **sa propre conversation** avec le fournisseur.

---

## Démarrage rapide

### 1. Le backend

```powershell
cd delivro\backend
npm install
npm start            # http://10.0.2.2:3000  (URL utilisée par l'émulateur Android)
```

Le premier lancement crée `data/delivro.db` et insère 10 produits de démonstration.

Vérification : `GET http://localhost:3000/api/health` → `{"ok":true,…}`
Test de bout en bout : `npm run smoke` → `SMOKE OK`

### 2. L'app Android

```powershell
cd delivro\android
.\gradlew.bat assembleDebug
# APK : android\app\build\outputs\apk\debug\app-debug.apk

# installation sur l'émulateur
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.delivro.app/.MainActivity
```

Ou simplement ouvrir le dossier `android/` dans **Android Studio** (Run ▶).

### 3. Pointer l'app vers le bon serveur

`android/local.properties` :

```properties
sdk.dir=C\:\\Users\\…\\AppData\\Local\\Android\\Sdk
delivro.apiUrl=http://10.0.2.2:3000     # émulateur (défaut)
# delivro.apiUrl=https://mon-serveur.up.railway.app   # serveur distant
```

| Contexte | `delivro.apiUrl` / `PUBLIC_URL` |
|---|---|
| Émulateur Android | `http://10.0.2.2:3000` (défaut) |
| Téléphone réel sur le même Wi-Fi | `http://192.168.x.x:3000` |
| Déploiement + connexions sociales | `https://…` (voir [docs/OAUTH_SETUP.md](docs/OAUTH_SETUP.md)) |

---

## Comptes de test

| Besoin | Étapes |
|---|---|
| Client rapide | Écran de connexion → *Essayer sans compte (mode démo)* |
| Fournisseur | Même chose, puis **Profil → Espace fournisseur → code `SUPPLIER-2026`** |
| Connexion sociale | Créer les 3 apps OAuth : [docs/OAUTH_SETUP.md](docs/OAUTH_SETUP.md) |

Un compte devenu fournisseur gagne instantanément l'onglet *Fournisseur* dans la barre
inférieure (mise à jour en direct via le profil).

---

## Architecture

```
App Android (Compose)                Backend Node.js
─────────────────────                ─────────────────────────────
UI (5 écrans + 3 écrans admin)
  └─ ViewModels (StateFlow)
       ├─ Retrofit + OkHttp  ─────────►  Express  /api/*  (JSON, JWT)
       ├─ Socket.IO client  ──────────►  Socket.IO rooms : user:<id>, admin, conv:<id>
       └─ Session (JWT 30 j)              └─ SQLite (better-sqlite3)  data/delivro.db
Custom Tab OAuth start ─────────────►  /api/auth/:provider/callback → shoptabouffe://auth?token=…
```

- **Contrat d'API** : [docs/API.md](docs/API.md) — la source de vérité partagée.
- **Temps réel** : toute mutation REST émet aussi un événement socket
  (`order:new`, `order:updated`, `message:new`, `product:changed`) ; l'app re-fait un `GET`
  après événement pour rester cohérente.
- **Sécurité** : `client_secret` jamais exposé côté mobile, prix recalculés par le serveur,
  `state` OAuth à usage unique, rate-limit sur le code fournisseur (10 essais / 15 min).
- **Argent** : entiers en centimes (`priceCents`), formatage `9,50 €`.

### Stack

| | |
|---|---|
| Mobile | Kotlin 2.2 · Jetpack Compose (BOM 2024.12) · Material 3 · Navigation Compose · Coil · Retrofit · Socket.IO |
| Serveur | Node 20+ · Express 4 · better-sqlite3 · socket.io · jsonwebtoken · dotenv |
| Build | Gradle 8.14 (wrapper inclus, JDK 21 via `gradle.properties`) · AGP 8.13 |

---

## Commandes utiles

```powershell
# backend
npm start            # serveur
npm run smoke        # tests de bout en bout (démarre le serveur si besoin)

# app
.\gradlew.bat assembleDebug        # APK debug
.\gradlew.bat assembleRelease      # APK release (nécessite un keystore)
.\gradlew.bat testDebugUnitTest    # tests JVM
```

---

## Limites connues / suites possibles

- Pas de paiement en ligne : la commande est confirmée par le fournisseur (paiement à la
  livraison) — brancher Stripe/PayPal sur `POST /api/orders` reste à faire.
- Le panier vit en mémoire (perdu si l'app est tuée par le système).
- Une seule conversation par client (pas d'historique multi-achats) et pas de notifications
  push (le temps réel fonctionne seulement quand l'app est ouverte).
- APK de debug non signé pour la Play Store : ajouter un keystore + `signingConfig` avant
  publication.
