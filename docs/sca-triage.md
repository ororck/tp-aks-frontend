# Triage SCA : tp-aks-frontend

Date : 2026-09-30. Portée : lecture seule, aucune dépendance modifiée, aucun déploiement, aucune ressource Azure touchée.

## Chiffres et méthode

- **66 lignes** (paquet, version, identifiant), soit **58 identifiants uniques** : `undici` 6.x et 7.x partagent des identifiants mais se corrigent séparément (deux copies dans `package-lock.json`). Le chiffre de 66 du sujet compte les lignes.
- Sévérités : 0 critique, **22 hautes**, 37 moyennes, 7 faibles.
- Source : `osv-scanner` 2.6.0 relancé en local sur `package-lock.json` (même version et même commande que `sca.yml`). Le log CI ne contient que la redirection vers le Job Summary, pas le tableau.
- Portée des dépendances : champ `dev` et parents lus dans `package-lock.json`. Le `Dockerfile` construit avec `node:24-alpine` (`npm ci`, `ng build`) puis ne livre que le dossier compilé dans `nginx-unprivileged` : les paquets de dev n'atteignent jamais l'image finale.
- **Simulation** (copie dans un dossier temporaire, dépôt intact) : `npm update --package-lock-only fast-uri brace-expansion browserslist baseline-browser-mapping ip-address nanoid postcss qs tar undici hono @hono/node-server` modifie 17 entrées du lockfile (13 pour les paquets visés, `undici` ayant deux copies, et 4 dépendances de `browserslist` : `caniuse-lite`, `electron-to-chromium`, `node-releases`, `update-browserslist-db`), **aucun changement de version majeure**, `package.json` inchangé, et un nouveau scan OSV passe de 66 à **7 lignes**.
- **Limite** : aucun build ni test n'a été lancé (pas de `node_modules`).

## Lecture des colonnes d'atteignabilité

- **Chargé en runtime ?** : le paquet est-il dans ce que le navigateur reçoit (bundle) ou seulement dans la chaîne de build/test.
- **Chemin vulnérable exercé ?** : le code de l'app déclenche-t-il la fonction touchée.
- **Seul `@angular/*` est livré dans le bundle.** Les 22 hautes sont toutes en build/test seul : aucune n'est exposée à un utilisateur final.

## Lots

### Lot 1 : bumps sûrs, un commit (59 lignes dont les 22 hautes)

Mise à jour du lockfile seule, sans toucher `package.json`, sans majeure, vérifiée par la simulation ci-dessus :

`npm update --package-lock-only fast-uri brace-expansion browserslist baseline-browser-mapping ip-address nanoid postcss qs tar undici hono @hono/node-server`

Versions obtenues en simulation : fast-uri 3.1.8, brace-expansion 5.0.12, ip-address 10.7.2, qs 6.16.0, hono 4.13.12, undici 7.30.0 et 6.29.0 (copie sous `node-gyp`), postcss 8.5.28, nanoid 3.3.19, tar 7.5.22, browserslist 4.29.3 (mineur). Un `npm ci && npm run build:prod` reste conseillé après le commit.

### Lot 2 : bumps qui demandent un test de build (6 lignes)

| Paquet | Actuelle | Cible | Pourquoi tester |
|---|---|---|---|
| `@angular/core`, `@angular/common`, `@angular/compiler` | 22.0.5 | 22.1.1 minimum | Seules failles livrées dans le bundle. Les paquets `@angular/*` doivent monter ensemble : `npm update` seul n'a pas bougé en simulation. Un commit unique, puis `ng build` + `npm test`. Les PR Dependabot #8, #20 et #22 (vers 22.2.0) n'en couvrent qu'une partie chacune et risquent de produire des versions mixtes |
| `@babel/core` (copie 7.29.0) | 7.29.0 | 7.29.6 | Copie épinglée par `@angular/build`/`compiler-cli`, se résout avec la mise à jour Angular |
| `vitest`, `@vitest/mocker` | 4.1.10 | 4.1.11 | Nécessite d'aligner `@vitest/coverage-v8` dans `package.json`, puis `npm test` |

### Lot 3 : migrations majeures à écarter

| Paquet | Sévérité | Justification |
|---|---|---|
| `esbuild` 0.27.7 vers 0.28.1 | Faible (2.5) | Copie imbriquée sous `vite` 7 ; en simulation, la résoudre a fait passer `vite` de 7.3.5 à 8.3.0 (changement de chaîne de build). Faille limitée au serveur de dev, absent de la CI et de l'image. Version 0.x : les mineures peuvent casser |

Hors findings mais à écarter (déjà notés dans `.worker-out/etat.md`) : Node 25/26 pour l'image de build (versions non LTS), `jsdom` 29 (majeure, PR #21). Ils ne sont pas nécessaires pour solder le SCA.

## Recommandation : preuve de remédiation réelle

Lecture retenue : **une faille par catégorie de sévérité exploitable comme preuve**, choisie parmi les lots 1 et 2. Le lot 3 est écarté par définition et ne fournit aucune preuve.

1. **Haute : `fast-uri` 3.1.3 vers 3.1.8, GHSA-f65p-4m7j-42xc / CVE-2026-75975** (SSRF par IPv6 mal formée).
   - Lot 1, patch sans rupture, lockfile seul, efface 8 lignes d'un coup (dont 7 hautes).
   - **Aucune haute n'est atteignable dans le bundle** : `fast-uri` est un outil de build (via `ajv`). La preuve est « SCA vert sur les hautes », pas « exposition réduite ».
2. **Moyenne : `@angular/compiler` + `@angular/core` 22.0.5 vers 22.1.1, GHSA-hh8m-fm6v-7cvg / CVE-2026-88057** (contournement de sanitisation via host bindings).
   - C'est la **seule catégorie réellement livrée aux utilisateurs** (lot 2, mineure sans rupture), donc la meilleure preuve d'une correction qui compte. Le déclencheur n'est pas trouvé dans `src/`.
   - Elle demande le test de build du lot 2 : à faire en dernier, après le lot 1.

## Détail des findings

| Paquet | Version actuelle | Version corrigée (cette faille) | Cible du lot (toutes failles) | Sévérité (CVSS) | Identifiants | Correctif | Chargé en runtime ? | Chemin vulnérable exercé ? | Lot |
|---|---|---|---|---|---|---|---|---|---|
| `brace-expansion` | 5.0.7 | 5.0.10 | 5.0.12 | Haute (7.5) | GHSA-6j4f-fj2g-mc7p / CVE-2026-102276 | patch | Non, build/test seul: dev: `minimatch` (globbing des outils). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `brace-expansion` | 5.0.7 | 5.0.8 | 5.0.12 | Haute (7.5) | GHSA-mh99-v99m-4gvg / CVE-2026-14257 | patch | Non, build/test seul: dev: `minimatch` (globbing des outils). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `brace-expansion` | 5.0.7 | 5.0.11 | 5.0.12 | Haute (7.5) | GHSA-qhr7-859c-m2p7 / CVE-2026-102278 | patch | Non, build/test seul: dev: `minimatch` (globbing des outils). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `brace-expansion` | 5.0.7 | 5.0.9 | 5.0.12 | Haute (7.5) | GHSA-rgw5-rvv9-x895 / CVE-2026-69152 | patch | Non, build/test seul: dev: `minimatch` (globbing des outils). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `browserslist` | 4.28.5 | 4.28.7 | 4.28.7 | Haute (7.5) | GHSA-73wf-gq98-2v4g / CVE-2026-73088 | patch | Non, build/test seul: dev: `@angular/build`, Babel (cibles de compilation). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `browserslist` | 4.28.5 | 4.28.7 | 4.28.7 | Haute (7.5) | GHSA-c83g-rgw3-j3cx / CVE-2026-73089 | patch | Non, build/test seul: dev: `@angular/build`, Babel (cibles de compilation). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `fast-uri` | 3.1.3 | 3.1.6 | 3.1.8 | Haute (7.5) | GHSA-5jgf-p345-68v8 / CVE-2026-75931 | patch | Non, build/test seul: dev: `ajv` (validation de schémas, lint/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `fast-uri` | 3.1.3 | 3.1.5 | 3.1.8 | Haute (7.5) | GHSA-7p8r-x3mc-p8w7 / CVE-2026-18446 | patch | Non, build/test seul: dev: `ajv` (validation de schémas, lint/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `fast-uri` | 3.1.3 | 3.1.6 | 3.1.8 | Haute (7.5) | GHSA-f65p-4m7j-42xc / CVE-2026-75975 | patch | Non, build/test seul: dev: `ajv` (validation de schémas, lint/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `fast-uri` | 3.1.3 | 3.1.6 | 3.1.8 | Haute (7.5) | GHSA-fph4-wmhf-6fwf / CVE-2026-75899 | patch | Non, build/test seul: dev: `ajv` (validation de schémas, lint/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `fast-uri` | 3.1.3 | 3.1.6 | 3.1.8 | Haute (7.5) | GHSA-jqff-g426-hqxp / CVE-2026-76172 | patch | Non, build/test seul: dev: `ajv` (validation de schémas, lint/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `fast-uri` | 3.1.3 | 3.1.7 | 3.1.8 | Haute (7.5) | GHSA-qw65-cvwx-89v3 / CVE-2026-84292 | patch | Non, build/test seul: dev: `ajv` (validation de schémas, lint/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `fast-uri` | 3.1.3 | 3.1.4 | 3.1.8 | Haute (7.5) | GHSA-v2hh-gcrm-f6hx / CVE-2026-16221 | patch | Non, build/test seul: dev: `ajv` (validation de schémas, lint/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `ip-address` | 10.2.0 | 10.3.1 | 10.7.1 | Haute (7.7) | GHSA-mwp4-54f8-5fhr / CVE-2026-69192 | mineur | Non, build/test seul: dev: `socks`, `express-rate-limit` (outillage npm/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `nanoid` | 3.3.15 | 3.3.16 | 3.3.18 | Haute (8.2) | GHSA-28wg-ghj8-5hjv / CVE-2026-67214 | patch | Non, build/test seul: dev: `postcss`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `nanoid` | 3.3.15 | 3.3.18 | 3.3.18 | Haute (8.2) | GHSA-2v37-7h3g-55p8 / CVE-2026-67213 | patch | Non, build/test seul: dev: `postcss`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `postcss` | 8.5.16 | 8.5.18 | 8.5.23 | Haute (7.5) | GHSA-r28c-9q8g-f849 / CVE-2026-73646 | patch | Non, build/test seul: dev: `@angular/build`, `vite`, `beasties` (pipeline CSS). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `tar` | 7.5.19 | 7.5.21 | 7.5.21 | Haute (7.5) | GHSA-r292-9mhp-454m / CVE-2026-73566 | patch | Non, build/test seul: dev: `node-gyp`, `pacote` (installation npm). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 6.27.0 | 6.28.1 | 6.28.1 | Haute (7.5) | GHSA-rfgv-xxqx-mfg5 / CVE-2026-19534 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.0 | 7.29.1 | Haute (7.4) | GHSA-4cwx-7wf7-3272 / CVE-2026-13697 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Haute (7.5) | GHSA-rfgv-xxqx-mfg5 / CVE-2026-19534 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Haute (7.4) | GHSA-w293-vg96-wgc3 / CVE-2026-84961 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `@angular/common` | 22.0.5 | 22.1.1 | 22.1.1 | Moyenne (4.0) | GHSA-p297-fm68-3q8c / CVE-2026-88059 | mineur | Oui, bundle navigateur (dépendance prod) | Non: `HttpTransferCache` n'existe qu'avec SSR/hydratation, l'app est CSR seule (pas de `provideClientHydration`, pas de SSR dans `angular.json`) | 2 |
| `@angular/compiler` | 22.0.5 | 22.1.0 | 22.1.0 | Moyenne (5.3) | GHSA-hh8m-fm6v-7cvg / CVE-2026-88057 | mineur | Oui, bundle navigateur (dépendance prod) | Non trouvé: aucun `host:`, `@HostBinding`, `innerHTML` ni `bypassSecurityTrust*` dans `src/` | 2 |
| `@angular/core` | 22.0.5 | 22.1.0 | 22.1.0 | Moyenne (5.3) | GHSA-hh8m-fm6v-7cvg / CVE-2026-88057 | mineur | Oui, bundle navigateur (dépendance prod) | Non trouvé: aucun `host:`, `@HostBinding`, `innerHTML` ni `bypassSecurityTrust*` dans `src/` | 2 |
| `@hono/node-server` | 1.19.14 | 1.19.15 | 1.19.15 | Moyenne (5.9) | GHSA-frvp-7c67-39w9 | patch | Non, build/test seul: dev: `@modelcontextprotocol/sdk` (serveur MCP de `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `@vitest/mocker` | 4.1.10 | 4.1.11 | 4.1.11 | Moyenne (5.9) | GHSA-82fw-gwwq-j7x9 / CVE-2026-84373 | patch | Non, build/test seul: dev: tests unitaires. Absent de l'image nginx finale | Non: exécuté sur les tests du dépôt (entrées de confiance) | 2 |
| `baseline-browser-mapping` | 2.10.42 | 2.11.0 | 2.11.0 | Moyenne (6.6) | GHSA-w5vr-8v7q-w6rv / CVE-2026-45819 | mineur | Non, build/test seul: dev: `browserslist` (cibles de compilation). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `brace-expansion` | 5.0.7 | 5.0.12 | 5.0.12 | Moyenne (5.3) | GHSA-q2hr-2g5m-vwhr / CVE-2026-102277 | patch | Non, build/test seul: dev: `minimatch` (globbing des outils). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `fast-uri` | 3.1.3 | 3.1.8 | 3.1.8 | Moyenne (4.8) | GHSA-hrr3-gc8f-f4qj / CVE-2026-86472 | patch | Non, build/test seul: dev: `ajv` (validation de schémas, lint/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `hono` | 4.12.28 | 4.12.34 | 4.13.5 | Moyenne (5.3) | GHSA-54fx-42gc-7vw4 / CVE-2026-71848 | mineur | Non, build/test seul: dev: `@modelcontextprotocol/sdk` (serveur MCP de `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `hono` | 4.12.28 | 4.12.34 | 4.13.5 | Moyenne (5.3) | GHSA-8j4g-w8fx-2239 / CVE-2026-69207 | mineur | Non, build/test seul: dev: `@modelcontextprotocol/sdk` (serveur MCP de `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `hono` | 4.12.28 | 4.13.5 | 4.13.5 | Moyenne (5.9) | GHSA-crvj-82cr-hjcx / CVE-2026-84363 | mineur | Non, build/test seul: dev: `@modelcontextprotocol/sdk` (serveur MCP de `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `hono` | 4.12.28 | 4.12.34 | 4.13.5 | Moyenne (4.8) | GHSA-f23p-vx2j-j53r / CVE-2026-71850 | mineur | Non, build/test seul: dev: `@modelcontextprotocol/sdk` (serveur MCP de `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `hono` | 4.12.28 | 4.13.5 | 4.13.5 | Moyenne (5.3) | GHSA-g6gw-c38x-mqfc / CVE-2026-84364 | mineur | Non, build/test seul: dev: `@modelcontextprotocol/sdk` (serveur MCP de `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `hono` | 4.12.28 | 4.13.5 | 4.13.5 | Moyenne (6.5) | GHSA-gqvv-2mrq-wpjv / CVE-2026-84365 | mineur | Non, build/test seul: dev: `@modelcontextprotocol/sdk` (serveur MCP de `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `ip-address` | 10.2.0 | 10.2.1 | 10.7.1 | Moyenne (6.9) | GHSA-22jq-vg5j-6vgg / CVE-2026-54272 | mineur | Non, build/test seul: dev: `socks`, `express-rate-limit` (outillage npm/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `ip-address` | 10.2.0 | 10.5.1 | 10.7.1 | Moyenne (6.9) | GHSA-2vr4-cq9g-pvrc / CVE-2026-101910 | mineur | Non, build/test seul: dev: `socks`, `express-rate-limit` (outillage npm/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `ip-address` | 10.2.0 | 10.2.2 | 10.7.1 | Moyenne (6.9) | GHSA-4xrf-jv44-h6hh / CVE-2026-69198 | mineur | Non, build/test seul: dev: `socks`, `express-rate-limit` (outillage npm/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `ip-address` | 10.2.0 | 10.7.1 | 10.7.1 | Moyenne (6.3) | GHSA-h3mg-xc3c-68pw / CVE-2026-101911 | mineur | Non, build/test seul: dev: `socks`, `express-rate-limit` (outillage npm/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `ip-address` | 10.2.0 | 10.7.1 | 10.7.1 | Moyenne (6.3) | GHSA-j6r3-76f7-8jcv / CVE-2026-101912 | mineur | Non, build/test seul: dev: `socks`, `express-rate-limit` (outillage npm/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `ip-address` | 10.2.0 | 10.5.1 | 10.7.1 | Moyenne (6.3) | GHSA-rpw4-54j3-4h4q / CVE-2026-101913 | mineur | Non, build/test seul: dev: `socks`, `express-rate-limit` (outillage npm/CLI). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `postcss` | 8.5.16 | 8.5.23 | 8.5.23 | Moyenne (6.3) | GHSA-fxqj-rqcc-2cmp / CVE-2026-69153 | patch | Non, build/test seul: dev: `@angular/build`, `vite`, `beasties` (pipeline CSS). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `qs` | 6.15.3 | 6.16.0 | 6.16.0 | Moyenne (6.3) | GHSA-4mjr-xmp4-gh2g / CVE-2026-82417 | mineur | Non, build/test seul: dev: `express`/`body-parser` (outillage `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `qs` | 6.15.3 | 6.16.0 | 6.16.0 | Moyenne (6.3) | GHSA-x5fp-wj9c-mxmx / CVE-2026-82562 | mineur | Non, build/test seul: dev: `express`/`body-parser` (outillage `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 6.27.0 | 6.28.1 | 6.28.1 | Moyenne (5.9) | GHSA-3wwx-pv8p-q78v / CVE-2026-85024 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 6.27.0 | 6.28.0 | 6.28.1 | Moyenne (4.8) | GHSA-8xcm-r25x-g524 / CVE-2026-16728 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 6.27.0 | 6.28.0 | 6.28.1 | Moyenne (4.2) | GHSA-m8rv-5g2x-5cg5 / CVE-2026-15157 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 6.27.0 | 6.28.0 | 6.28.1 | Moyenne (4.8) | GHSA-v3r7-h72x-cjcm / CVE-2026-16729 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Moyenne (6.5) | GHSA-2jfj-6hjv-fm6j / CVE-2026-84933 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Moyenne (5.9) | GHSA-3wwx-pv8p-q78v / CVE-2026-85024 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Moyenne (5.9) | GHSA-3xpg-4rpp-hhhm / CVE-2026-84890 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.0 | 7.29.1 | Moyenne (4.8) | GHSA-8xcm-r25x-g524 / CVE-2026-16728 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.0 | 7.29.1 | Moyenne (5.9) | GHSA-jr45-8vmc-qm54 / CVE-2026-14643 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.0 | 7.29.1 | Moyenne (4.2) | GHSA-m8rv-5g2x-5cg5 / CVE-2026-15157 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Moyenne (5.9) | GHSA-pmjh-fq2x-6v4x / CVE-2026-18149 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Moyenne (5.9) | GHSA-rx4f-c7p8-82vq / CVE-2026-85014 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.0 | 7.29.1 | Moyenne (4.8) | GHSA-v3r7-h72x-cjcm / CVE-2026-16729 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `vitest` | 4.1.10 | 4.1.11 | 4.1.11 | Moyenne (5.9) | GHSA-82fw-gwwq-j7x9 / CVE-2026-84373 | patch | Non, build/test seul: dev: tests unitaires. Absent de l'image nginx finale | Non: exécuté sur les tests du dépôt (entrées de confiance) | 2 |
| `@babel/core` | 7.29.0 | 7.29.6 | 7.29.6 | Faible (3.2) | GHSA-4x5r-pxfx-6jf8 / CVE-2026-49356 | patch | Non, build/test seul: dev: `@angular/build`, `@angular/compiler-cli`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 2 |
| `esbuild` | 0.27.7 | 0.28.1 | 0.28.1 | Faible (2.5) | GHSA-g7r4-m6w7-qqqr | rupture possible (0.x) | Non, build/test seul: dev: `vite`, serveur de dev `ng serve` (absent de la CI et du Dockerfile). Absent de l'image nginx finale | Non: ne concerne que le serveur de dev (`ng serve`) | 3 |
| `hono` | 4.12.28 | 4.12.34 | 4.13.5 | Faible (3.7) | GHSA-79qm-7rj5-m7r9 / CVE-2026-71849 | mineur | Non, build/test seul: dev: `@modelcontextprotocol/sdk` (serveur MCP de `@angular/cli`). Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 6.27.0 | 6.28.1 | 6.28.1 | Faible (3.7) | GHSA-r53p-7pc4-xj5r / CVE-2026-18540 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Faible (3.7) | GHSA-2gqq-gqf2-x968 / CVE-2026-84947 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Faible (3.7) | GHSA-8436-99hf-9mmv / CVE-2026-85008 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
| `undici` | 7.28.0 | 7.29.1 | 7.29.1 | Faible (3.7) | GHSA-r53p-7pc4-xj5r / CVE-2026-18540 | mineur | Non, build/test seul: dev: `jsdom` (tests) et `node-gyp`. Absent de l'image nginx finale | Non: outil lancé sur des entrées du dépôt (de confiance) pendant `npm ci`/`ng build` | 1 |
