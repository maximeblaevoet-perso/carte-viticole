# 0007 — Servir les géodonnées viticoles en vecteur (MVT via PostGIS)

## Statut

Accepté.

## Contexte

La carte MapLibre (`src/components/map/WineMap.tsx`) affichait uniquement les
contours éditoriaux seed (`src/data/geo.ts`) chargés en GeoJSON en mémoire.
Après l'ingestion réelle (ADR 0006), la base contient des volumes incompatibles
avec un chargement GeoJSON côté client : ~78 aires (Alsace GC/appellations),
~334 parcelles et **~150 000 lieux-dits** (Champagne). Il faut brancher la carte
sur ces données PostGIS **sans** :

- charger des GeoJSON massifs dans le navigateur,
- exposer une clé Supabase côté client,
- casser le repli synthetic (démo hors-ligne).

## Décision

Servir les géométries en **tuiles vectorielles Mapbox (MVT)** générées par
PostGIS (`ST_AsMVT` / `ST_AsMVTGeom`).

- Migration `0007_wine_mvt_tiles.sql` : fonction `wine_mvt(z, x, y)` qui
  concatène plusieurs couches MVT dans une même tuile. Noms de couches =
  source-layers MapLibre : `wine-areas-region`, `wine-areas-appellation`,
  `wine-areas-cru`, `wine-parcels`, `wine-lieux-dits`.
- **Gating par zoom** (payload maîtrisé) : régions ≤ z8 ; appellations ≥ z7 ;
  crus ≥ z10 ; parcelles + lieux-dits ≥ z13. **Simplification** ~2 px de la
  tuile courante (`ST_SimplifyPreserveTopology`) : divise ~par 2 le nombre de
  sommets des contours INAO très denses, sans changement visible.
- **Route Next.js** `src/app/api/tiles/wine/[z]/[x]/[y]/route.ts` : proxy
  serveur qui appelle le RPC `wine_mvt` via PostgREST
  (réponse JSON contenant le `bytea` hexadécimal, décodée côté serveur) et
  renvoie le `application/vnd.mapbox-vector-tile`.
  La clé Supabase est lue **côté serveur** (`SUPABASE_SERVICE_ROLE_KEY`, repli
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) et n'est jamais transmise au navigateur ; le
  client ne connaît que `/api/tiles/wine/{z}/{x}/{y}`.
- Chaque feature MVT porte sa **provenance** (`source_dataset_id`,
  `source_type`, `is_official`, `is_informative`, `license`, `attribution`) pour
  l'afficher dans le panneau (INAO / Cadastre / RPG + disclaimer « donnée
  informative »).

### Pourquoi MVT plutôt que GeoJSON / RPC GeoJSON

- GeoJSON complet = plusieurs Mo côté client (150k lieux-dits) → exclu.
- MVT = binaire, tuilé, simplifié par zoom, mis en cache par tuile.
- Un RPC GeoJSON par sélection resterait lourd et sans tuilage ; MVT s'intègre
  nativement à MapLibre (`source: { type: "vector", tiles: [...] }`).

## Conséquences

- Le repli **synthetic reste intact** : les couches GeoJSON seed sont toujours
  la base. Les couches réelles ne sont ajoutées **que** si
  `shouldUseSupabase()` (donc `NEXT_PUBLIC_DATA_SOURCE=real` + credentials). Un
  léger recouvrement seed/réel est accepté (Alsace/Champagne uniquement).
- Si Supabase n'est pas configuré, la route renvoie `204` et la carte reste
  100 % synthetic.
- Interactions : hover/click sur les couches réelles alimentent une sélection
  riche (`SelectedGeoFeature` dans `src/lib/types.ts`) → le panneau gère aire
  réelle, parcelle fine et lieu-dit, avec bloc source/provenance. Les
  interactions synthetic existantes sont conservées.
- Ouvrir une appellation/cru zoome assez (≥ z13) pour révéler le parcellaire.
- `wine_mvt` est `stable`/`parallel safe`, en lecture seule, `grant execute` à
  `anon`/`authenticated`/`service_role` (RLS désactivée sur les tables geodata).

## Alternatives écartées

- **pg_tileserv / martin** : service séparé à héberger ; superflu, PostgREST +
  `ST_AsMVT` suffit.
- **Tuiles statiques pré-générées** : pénible à régénérer à chaque ingestion.
