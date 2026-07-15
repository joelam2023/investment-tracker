# Investment Tracker — Suivi privé de portefeuille dans Obsidian

[English](https://github.com/joelam2023/investment-tracker/blob/main/README.md) | [简体中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-CN.md) | [繁體中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-TW.md) | [日本語](https://github.com/joelam2023/investment-tracker/blob/main/README.ja.md) | [한국어](https://github.com/joelam2023/investment-tracker/blob/main/README.ko.md) | [Español](https://github.com/joelam2023/investment-tracker/blob/main/README.es.md) | [Deutsch](https://github.com/joelam2023/investment-tracker/blob/main/README.de.md) | Français | [Português (Brasil)](https://github.com/joelam2023/investment-tracker/blob/main/README.pt-BR.md)

**Votre portefeuille. Votre coffre. Chiffré.**

Investment Tracker est un outil de suivi de portefeuille privé et local pour Obsidian. Suivez les flux de trésorerie, les valorisations, les rendements et les performances d’un indice de référence tout en conservant vos données d’investissement chiffrées dans votre coffre, sans compte, télémétrie ni serveur exploité par le développeur.

Il fonctionne au niveau des comptes, ce qui permet de calculer la performance de vos investissements sans tenir un historique des opérations pour chaque position.

## Points essentiels

| Sujet | Fonctionnement d’Investment Tracker |
| --- | --- |
| Données d’investissement | Chiffrées et stockées dans le coffre Obsidian de l’utilisateur |
| Serveur exploité par le développeur | Aucun |
| Compte ou connexion | Non requis |
| Télémétrie et analyse | Aucune |
| Chiffrement | AES-256-GCM, avec la clé du registre protégée par PBKDF2-SHA256 et une clé de récupération distincte |
| Accès réseau facultatif | Le mode d’indice automatique demande à FRED des données publiques sur l’indice de référence et les taux de change |
| Synchronisation du coffre | Un service choisi par l’utilisateur, tel qu’Obsidian Sync ou iCloud, peut synchroniser le registre chiffré |
| Exportations | Les exportations JSON et CSV créées par l’utilisateur sont des fichiers en clair |

## Fonctionnalités

- Plusieurs comptes d’investissement en USD, GBP, SGD, CNY, TWD, JPY, KRW, EUR ou BRL.
- Comptabilité immuable fondée sur des événements pour les versements, retraits et valorisations.
- XIRR, gain cumulé, rendements annuels et rendements mensuels selon la méthode Modified Dietz.
- Comparaison avec le S&P 500 Price Index en utilisant les mêmes flux de trésorerie.
- Conversion des données de référence FRED selon la devise, avec vérification explicite du sens de cotation.
- Verrouillage par mot de passe, clé de récupération distincte, masquage des valeurs financières et verrouillage automatique configurable.
- Événements JSON chiffrés stockés dans le coffre de l’utilisateur.
- Exportation locale explicite aux formats JSON et CSV ; les réglages exigent une nouvelle authentification par mot de passe.
- Sélection automatique de la langue de l’interface, avec choix manuel et anglais comme langue de secours.
- Anglais, chinois simplifié, chinois traditionnel, japonais, coréen, espagnol, allemand, français et portugais du Brésil.

## Idéal pour

- Les investisseurs soucieux de leur confidentialité qui souhaitent conserver leurs données de portefeuille dans leur propre coffre Obsidian.
- Les personnes qui enregistrent manuellement les versements, retraits et valorisations au niveau des comptes.
- Les investisseurs qui veulent calculer le XIRR et les performances mensuelles et annuelles, puis les comparer au S&P 500.
- Les utilisateurs qui préfèrent un fonctionnement local sans créer un compte financier supplémentaire.

## Non conçu pour

- La synchronisation avec un compte de courtage.
- Le suivi en temps réel des positions et des cours, la comptabilité par lots fiscaux ou la négociation automatisée.
- Remplacer un relevé de courtier, un document fiscal ou les conseils d’un professionnel de la finance.
- Protéger un coffre déverrouillé contre un appareil compromis ou une autre extension malveillante.

## Installation et mises à jour

Installez **Investment Tracker** depuis **Obsidian → Réglages → Modules complémentaires → Parcourir**. Recherchez « Investment Tracker », sélectionnez l’extension, puis choisissez **Installer** et **Activer**.

Les mises à jour sont distribuées par le mécanisme de mise à jour des modules complémentaires d’Obsidian.

Pour une installation manuelle ou des tests, placez `main.js`, `manifest.json` et `styles.css` dans :

```text
<Coffre>/.obsidian/plugins/investment-tracker/
```

## Utilisation de base

1. Ouvrez Investment Tracker depuis le ruban.
2. Définissez un mot de passe et conservez la clé de récupération générée en dehors du coffre.
3. Créez un compte et enregistrez sa valorisation initiale.
4. Enregistrez les versements et retraits externes ainsi que les nouvelles valorisations totales du compte.
5. Utilisez le bouton en forme d’œil pour afficher ou masquer les valeurs financières.
6. Consultez les rendements mensuels et annuels et comparez-les à l’indice de référence sélectionné.
7. Choisissez les règles de verrouillage automatique sous **Réglages → Investment Tracker → Confidentialité et chiffrement**.

Changer la langue de l’interface ne modifie jamais la devise d’un compte existant. Lors d’une nouvelle installation, l’extension utilise uniquement les paramètres régionaux pour suggérer une devise initiale ; l’utilisateur peut la modifier avant de créer un compte.

## Confidentialité et sécurité

Investment Tracker ne dispose d’aucun service infonuagique exploité par le développeur, système de compte, mécanisme de télémétrie ou d’analyse, publicité ni mécanisme d’envoi automatique. Les noms des comptes, dates, montants, notes et données d’événements sont chiffrés et stockés dans le coffre Obsidian de l’utilisateur. Les nouvelles installations utilisent le dossier `Investment Tracker Data` ; les chemins de données existants qui sont sûrs sont conservés lors des mises à jour.

Les données d’événements sont chiffrées avec AES-256-GCM. La clé du registre est encapsulée à l’aide d’une clé PBKDF2-SHA256 dérivée du mot de passe et d’une clé de récupération distincte. Ni le mot de passe ni la clé du registre non encapsulée ne sont enregistrés dans les réglages de l’extension.

Le verrouillage automatique comprend deux règles indépendantes : verrouiller immédiatement lorsque vous quittez Investment Tracker ou qu’Obsidian perd le focus, et verrouiller après 1, 5, 15 ou 30 minutes sans activité dans Investment Tracker. Au moins une règle reste activée. Si le verrouillage immédiat en quittant est désactivé, quitter masque néanmoins les valeurs financières, réduit l’historique développé et ferme les boîtes de dialogue sensibles. La règle d’inactivité ou un verrouillage manuel détermine le moment où la clé du registre est effacée de la mémoire.

Une clé de récupération qui vient d’être générée est masquée lorsque vous quittez l’extension et ne s’affiche de nouveau qu’après le déverrouillage du registre. Conservez la clé de récupération en dehors du coffre et utilisez un mot de passe fort et unique.

Le chiffrement protège les fichiers du registre stockés contre une divulgation accidentelle. Il ne peut pas protéger les données lorsque l’extension est déverrouillée, ni contre un appareil compromis, l’exposition par capture d’écran ou presse-papiers, ou une autre extension malveillante ayant accès au même coffre.

### Synchronisation et exportations

Investment Tracker n’exploite aucun service de synchronisation. Si l’utilisateur active Obsidian Sync, iCloud ou un autre service de synchronisation du coffre, ce service choisi par l’utilisateur peut synchroniser les fichiers chiffrés du registre entre les appareils.

Les exportations JSON et CSV sont des fichiers en clair créés uniquement lorsque l’utilisateur lance explicitement une exportation. Considérez-les comme des documents financiers sensibles et stockez-les ou supprimez-les de manière appropriée.

Consultez la [Politique de confidentialité](https://github.com/joelam2023/investment-tracker/blob/main/PRIVACY.md) et la [Politique de sécurité](https://github.com/joelam2023/investment-tracker/blob/main/SECURITY.md) complètes.

## Informations sur le réseau

La tenue des registres et les calculs de rendement ne nécessitent aucun service exploité par le développeur. Le mode d’indice automatique envoie des requêtes HTTPS GET au service Federal Reserve Economic Data à l’adresse `fred.stlouisfed.org` pour obtenir les données du S&P 500 et de conversion des devises.

Ces requêtes contiennent uniquement les identifiants de séries publiques, les devises sélectionnées nécessaires au choix d’une série de taux de change et les plages de dates. Elles ne contiennent ni noms de comptes, soldes, montants de flux de trésorerie, valorisations, notes, mots de passe, clés de récupération, ni contenu du registre.

Les utilisateurs peuvent sélectionner le mode d’indice manuel pour éviter les requêtes automatiques à FRED. Les mises à jour automatiques de l’indice de référence nécessitent une connexion à Internet. La série du S&P 500 utilisée par l’extension est un indice de prix qui n’inclut pas les dividendes.

## Questions fréquentes

### Investment Tracker envoie-t-il les données de mon portefeuille ?

Aucun registre de portefeuille n’est envoyé à un serveur exploité par le développeur. L’extension ne possède aucun système de compte du développeur, dispositif de télémétrie ou d’analyse, ni mécanisme d’envoi automatique du portefeuille. Le mode d’indice automatique effectue les requêtes limitées à FRED décrites sous [Informations sur le réseau](#informations-sur-le-réseau).

### Où mes données d’investissement sont-elles stockées ?

Le registre chiffré est stocké dans le coffre Obsidian de l’utilisateur. Les nouvelles installations utilisent `Investment Tracker Data`. Si le coffre est synchronisé par un service choisi par l’utilisateur, ce service peut également stocker ou transférer le registre chiffré.

### Mes données d’investissement sont-elles chiffrées ?

Les données d’événements stockées sont chiffrées avec AES-256-GCM. Une clé PBKDF2-SHA256 dérivée du mot de passe et une clé de récupération distincte protègent la clé du registre. Les données sont visibles lorsque l’extension est déverrouillée, et les exportations JSON ou CSV créées par l’utilisateur ne sont pas chiffrées.

### Puis-je utiliser Investment Tracker hors connexion ?

Les données locales et les calculs de rendement peuvent être utilisés sans service exploité par le développeur. Les mises à jour automatiques de l’indice de référence et des devises par FRED nécessitent une connexion à Internet ; le mode d’indice manuel évite ces requêtes.

### Se connecte-t-il à mon compte de courtage ?

Non. Investment Tracker ne se connecte pas aux comptes de courtage. Les utilisateurs enregistrent manuellement les versements et retraits externes ainsi que les valorisations totales des comptes.

### Suit-il les positions ou les opérations individuelles ?

Aucun historique des opérations par position n’est requis. L’extension est conçue pour les flux de trésorerie et les valorisations au niveau des comptes, et non pour le suivi en temps réel des positions ou la comptabilité par lots fiscaux.

### Quelles informations sont envoyées à FRED ?

Seuls les identifiants de séries publiques, les devises sélectionnées nécessaires au choix de la série de taux de change et les plages de dates figurent dans les requêtes automatiques d’indice. Les données de portefeuille et les identifiants de connexion n’y figurent pas.

### Que se passe-t-il si je perds mon mot de passe ?

Utilisez la clé de récupération conservée séparément pour rétablir l’accès à l’aide du processus de récupération de l’extension. La perte du mot de passe et de la clé de récupération peut rendre le registre chiffré inaccessible.

### Les exportations JSON et CSV sont-elles chiffrées ?

Non. Les exportations JSON et CSV sont des fichiers en clair et doivent être considérées comme des documents financiers sensibles.

## Aide et commentaires

Ouvrez **Réglages → Investment Tracker → Aide et commentaires** pour signaler un bogue, proposer une fonctionnalité ou copier des informations de diagnostic non sensibles. Les signalements peuvent être rédigés dans n’importe quelle langue.

Les liens de commentaires n’ouvrent GitHub qu’après un clic de l’utilisateur. L’extension ne crée jamais automatiquement de signalement et n’envoie jamais au développeur le registre, les noms de comptes, soldes, transactions, mots de passe, clés de récupération, noms ou chemins du coffre, ni les informations de diagnostic. Vérifiez les informations de diagnostic copiées et masquez les données sensibles des captures d’écran avant de les transmettre.

Signalez les vulnérabilités de sécurité ou de confidentialité au moyen du [signalement privé de vulnérabilité de GitHub](https://github.com/joelam2023/investment-tracker/security/advisories/new), et non dans une demande publique.

## Développement

```bash
npm ci
npm run check
npm run build:release
npm run privacy:check
```

Les traductions utilisent les textes sources en anglais comme langue de secours. Toute demande de fusion qui modifie un texte visible par l’utilisateur doit mettre à jour toutes les langues et conserver les paramètres d’interpolation à l’identique.

Les étiquettes de version doivent correspondre exactement à la version sémantique de `manifest.json`, sans préfixe `v`. Le processus de publication crée un brouillon de version GitHub contenant uniquement `main.js`, `manifest.json` et `styles.css`, afin qu’il puisse être vérifié manuellement avant sa publication.

Les instructions destinées aux responsables de la maintenance figurent dans le [Guide de publication](https://github.com/joelam2023/investment-tracker/blob/main/RELEASING.md) complet.

## Avertissement financier

Cette extension est un outil de tenue de registres et de calcul. Elle ne fournit aucun conseil financier, fiscal, juridique ou d’investissement. Vérifiez indépendamment les calculs importants avant de prendre une décision.

## Licence

[Licence MIT](https://github.com/joelam2023/investment-tracker/blob/main/LICENSE)
