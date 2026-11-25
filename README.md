# Aymane Pafune

Boutique de parfums en français avec commande invité et paiement en espèces à la livraison. Administration et catalogue partagent le même projet Supabase. Aymane Pafune et l’illustration éditoriale sont des éléments d’identité initiaux que l’administrateur peut remplacer. Le catalogue, les villes et les statistiques démarrent vides.

Le catalogue s’affiche dès la page d’accueil. Le client choisit un parfum, une contenance et une quantité, puis renseigne directement ses coordonnées de livraison.

## Démarrage

1. Installez les dépendances avec `npm ci` et copiez `.env.example` vers `.env.local`. Renseignez l’URL de votre projet Supabase et sa clé **publishable** (ou son ancienne clé **anon**). Les variables Vite sont publiques.
2. Appliquez les migrations selon la procédure SQL Editor ci-dessous. Comme alternative sur un projet neuf, utilisez `supabase link --project-ref VOTRE_REFERENCE`, puis `supabase db push`.
3. Désactivez l’inscription publique dans les réglages Auth du projet hébergé. Dans Authentication → Users → Add user, créez le compte du propriétaire avec une adresse qu’il contrôle et un mot de passe fort et unique. Confirmez uniquement une adresse dont le propriétaire a vérifié le contrôle. Copiez l’UUID du compte confirmé et attribuez le rôle par le SQL Editor.

   ```sql
   insert into public.profiles (id, role)
   select id, 'admin'
   from auth.users
   where id = 'UUID_UTILISATEUR'::uuid and email_confirmed_at is not null
   on conflict (id) do nothing
   returning id, role;
   ```

4. Générez un secret de limitation aléatoire de 32 octets ou plus. Configurez les secrets Supabase Edge `CHECKOUT_RATE_SECRET` et `STORE_ORIGINS`. Pour une boutique locale, l’origine est généralement `http://localhost:5173`. Séparez les origines autorisées par des virgules, sans barre oblique finale. Supabase injecte `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans la fonction hébergée. Ne placez jamais ces valeurs privées dans Vite ou Vercel. En local, passez les deux secrets personnalisés via un fichier ignoré à `supabase functions serve checkout --env-file .env.functions.local`.
5. Déployez la fonction via `supabase functions deploy checkout --no-verify-jwt`. La commande est publique et passe par la validation et la limitation de débit de la fonction. Le RPC de réservation est réservé au service Supabase.
6. Lancez `npm run dev`. Connectez-vous sur `/admin/login`, ajoutez les marques, les produits, les tailles, le stock et les villes desservies. Configurez le logo, la bannière, le numéro WhatsApp au format 212…, l’URL Instagram et les coordonnées dans Paramètres.

## Vérifier le déploiement de la commande

Depuis le dossier du projet, déployez la fonction sur la référence du même projet que `VITE_SUPABASE_URL` avec `supabase functions deploy checkout --project-ref VOTRE_REFERENCE --no-verify-jwt`. La commande reste accessible aux clients sans compte. Les appels PostgreSQL de réservation restent réservés au rôle de service.

- `404 NOT_FOUND` sur `/functions/v1/checkout` signifie que cette fonction est absente du projet ciblé.
- Dans l’onglet de commande, ouvrez la console du navigateur et exécutez `window.location.origin`. Dans Supabase **Edge Functions → Secrets**, ajoutez cette valeur à `STORE_ORIGINS`. Séparez les origines par des virgules. Utilisez le protocole, le domaine et le port exacts. `localhost` et `127.0.0.1` sont des origines différentes. Une URL de page, une valeur JSON ou un joker ne sont pas acceptés.
- Envoyez une requête `OPTIONS` avec l’en-tête `Origin` de votre boutique. La réponse attendue est `204` avec `Access-Control-Allow-Origin` égal à cette origine, `Access-Control-Allow-Methods` comprenant `POST` et `Access-Control-Allow-Headers` autorisant `authorization`, `apikey`, `x-client-info` et `content-type`. Une réponse `403 Origine non autorisée` signifie que la requête s’arrête avant la commande. Les journaux de la version mise à jour indiquent l’origine rejetée et le nombre d’entrées valides et invalides, sans afficher les secrets.
- Depuis le panneau de test de la fonction, envoyez un `POST` avec un corps JSON vide `{}`. Une réponse `400` confirme que la fonction a démarré avec les variables requises et que la validation rejette la demande. Cette vérification ne crée aucune commande. Une erreur `503` avant validation indique qu’il faut vérifier les variables côté serveur dans les journaux de la fonction.

## Appliquer les migrations dans Supabase SQL Editor

Sur un projet neuf, ouvrez **SQL Editor → New query**. Pour chaque fichier dans cet ordre, copiez le contenu complet dans une requête distincte et exécutez-le une seule fois. Passez au fichier suivant après confirmation du succès.

1. `supabase/migrations/202611230001_store.sql` crée les tables, les règles RLS, le stockage `store-media` et les transactions de commande.
2. `supabase/migrations/202611230002_catalog.sql` ajoute les transactions d’édition du catalogue et d’ajustement du stock.
3. `supabase/migrations/202611230003_checkout_consistency.sql` ajoute les validations, les dates de modification et les notifications Realtime.
4. `supabase/migrations/202611240001_delete_unused_products.sql` autorise les administrateurs à supprimer les produits hors ligne sans historique. Archivez les produits ayant des mouvements de stock ou des commandes pour conserver leur historique.

5. `supabase/migrations/202611240002_save_product_stock.sql` enregistre les changements du parfum et du stock existant dans la même transaction.

6. `supabase/migrations/202611240003_product_publication.sql` permet de publier ou dépublier depuis la liste Produits via la fonction existante, tout en préservant les variantes et les images.

7. `supabase/migrations/202611240004_collections.sql` ajoute les collections, leurs associations et leur stockage.

Si des migrations sont déjà appliquées, exécutez seulement celles qui manquent. L’exécution dans le SQL Editor ne renseigne pas l’historique des migrations du CLI. Si vous adoptez ensuite le CLI, réconciliez cet historique avant un `db push`.

Vérifiez que la création du premier administrateur renvoie bien son UUID et le rôle `admin`. Le compte Supabase Auth et ce rôle sont tous les deux nécessaires pour ouvrir `/admin/login`. Le déploiement de la fonction Edge et la configuration de ses secrets se font séparément après les migrations.

## Déployer la gestion des collections sur une boutique existante

Appliquez [202611240004_collections.sql](supabase/migrations/202611240004_collections.sql) sur le projet désigné par `VITE_SUPABASE_URL` avant de redéployer le frontend. Cette migration s'ajoute aux six précédentes.

- **Projet suivi par le CLI**. Depuis la racine, exécutez `npx supabase login`, puis `npx supabase link --project-ref VOTRE_REFERENCE`. Exécutez `npx supabase migration list` et `npx supabase db push --dry-run`. Sur la boutique déjà à jour jusqu'à 202611240003, le seul fichier attendu est 202611240004. Appliquez-le avec `npx supabase db push`, puis vérifiez avec `npx supabase migration list`.
- **Projet géré par SQL Editor**. Ouvrez **SQL Editor → New query** sur le bon projet. Collez le fichier complet, exécutez-le une fois et attendez la confirmation. Vérifiez que les tables `collections` et `product_collections` et le bucket privé `collection-media` existent. Si les migrations précédentes ont été appliquées par SQL Editor, utilisez aussi cette méthode ou réconciliez l'historique avant de lancer le CLI.

L'amorçage reprend les collections de catégorie existantes et leurs parfums. La collection Promotions Femme est amorcée si une remise Femme publiée existe au moment de la migration. Par la suite, toutes les associations et publications se gèrent depuis l'administration. Les couvertures fournies par défaut peuvent être remplacées dans le menu **Collections**.

Redéployez le frontend avec la configuration Vercel actuelle. L'environnement et la fonction Edge de commande n'ont pas besoin de changement. Vérifiez sur un projet de test qu'un administrateur peut créer, illustrer, publier et réordonner une collection, assigner un parfum dans **Produits**, puis ouvrir la collection et passer une commande. En navigation privée, seuls les collections et parfums publiés doivent apparaître.

## Vercel

Importez ce dossier en tant que projet Vite. Choisissez `npm run build` comme commande et `dist` comme sortie. Configurez les deux variables publiques de `.env.example` dans l’environnement cible. Ajoutez l’origine HTTPS finale à `STORE_ORIGINS`. Réservez les aperçus transactionnels à des origines explicites reliées à un projet de test. Avant de diffuser le lien Instagram, réalisez une commande de test et vérifiez son statut et son effet sur le stock depuis l’administration.

Pour le partage Instagram et autres aperçus sociaux, configurez une URL d’image absolue dans la balise OG de `index.html` une fois le domaine définitif connu. Les métadonnées HTML initiales servent aux robots qui ignorent le JavaScript.

## Catalogue vide après le déploiement

Vérifiez que l’environnement Production de Vercel contient `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` pour le même projet Supabase. Vite lit ces valeurs à la compilation. Redéployez la boutique après toute modification.

Dans Supabase, lancez cette requête dans le SQL Editor pour vérifier que les migrations sont installées.

```sql
select to_regclass('public.products') as products_table;
```

Si la table existe, vérifiez le nombre de fiches enregistrées et publiées.

```sql
select count(*) as total,
       count(*) filter (where published) as published
from public.products;
```

Comparez ensuite le nombre de fiches accessibles à un visiteur. Cette requête conserve les règles RLS.

```sql
begin;
set local role anon;
select count(*) as publicly_visible from public.products where published;
rollback;
```

Si aucune fiche n’est publiée, ouvrez `/admin/login` puis **Produits**. Ajoutez la marque sous **Gérer les marques** si nécessaire. Choisissez **Ajouter un parfum**, renseignez le nom, la marque et la catégorie, puis saisissez les contenances, les prix en MAD et le stock réel. Ajoutez vos photos, cochez **Publié dans la boutique** et enregistrez. Pour une fiche existante affichée **Brouillon**, utilisez **Publier** dans la liste des produits. Vérifiez ensuite l’accueil en navigation privée.

## Configurer les villes de livraison

Ajoutez vos villes dans la page protégée `/admin/delivery` et renseignez leurs tarifs réels en MAD. Seules les villes activées apparaissent à la commande.

Pour ajouter plusieurs villes, ouvrez `supabase/seeds/delivery_cities.sql` dans le SQL Editor. Remplacez chaque valeur `null` uniquement si vous connaissez le tarif confirmé de la ville, puis exécutez le fichier. Les noms existants sont ignorés, y compris les variantes de casse et d’accents. Les nouvelles villes dont vous avez renseigné le tarif sont activées par défaut. Passez `activate_new_cities` à `false` pour les vérifier dans `/admin/delivery` avant de les activer. Les villes existantes désactivées restent désactivées, avec leur tarif d’origine. Pour les rendre disponibles, vérifiez leur tarif puis cochez **Livraison disponible** et enregistrez. Ce fichier ne modifie pas le schéma et ne s’exécute pas automatiquement.

Pour distinguer une table vide d’une liste uniquement désactivée, exécutez `select name, fee, enabled from public.delivery_cities order by name;` dans le SQL Editor avec votre accès propriétaire. Après configuration, rechargez la commande et vérifiez que le choix de la ville affiche les frais attendus.

## Commandes et stock

Les commandes réservent le stock dans la même transaction que l’enregistrement de la commande et de ses lignes. Le serveur relit les prix et les frais. Toute répétition du même identifiant et contenu renvoie la commande originale. Une annulation avant livraison réintègre le stock une seule fois. Les commandes livrées ou annulées ont des statuts finaux. L’inventaire conserve les entrées, retraits, réservations et réintégrations. Les variantes retirées sont désactivées afin de conserver les références historiques.

Supabase Storage héberge les médias destinés au public. Limitez le bucket aux visuels commerciaux et gardez tout document privé hors de ce bucket. Les commandes, coordonnées clients et journaux d’administration sont protégés par RLS. Après validation, les tentatives de commande sont limitées par adresse réseau et par téléphone, représentés sous forme de condensats. Une tâche de maintenance peut supprimer les lignes de `checkout_limits` dont `window_start` date de plus d’un jour.

## Vérification

`npm run build` contrôle TypeScript et génère la version de production. Pour une recette complète dans un projet de test, vérifiez les articles publiés et masqués, le panier persistant, la commande invité, l’absence d’accès public aux commandes, les transitions de statut, la réintégration du stock et les modes clair et sombre.

