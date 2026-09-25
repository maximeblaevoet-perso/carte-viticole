/**
 * Plain-French rendering of a **BD Charm-50** formation (ADR 0014).
 *
 * BD Charm-50 is BRGM's harmonised 1/50 000 geological map, ingested into
 * `geology_units` (migration 0012) and queried point-by-point. Its labels are
 * written for geologists:
 *
 * > `j2c` — *Grande oolithe et marnes à acuminata (Bajocien supérieur)*
 *
 * That string carries three different things, and the card shows all three
 * rather than flattening them:
 *
 * 1. a **rock family** a non-geologist can act on ("calcaire"), inferred from
 *    the wording — there is no lithology column in BD Charm-50, the label *is*
 *    the lithology;
 * 2. the **exact formation**, kept verbatim, because it is the whole reason for
 *    leaving the 1/1 000 000 layer behind;
 * 3. the **age**, which BD Charm-50 puts in trailing parentheses.
 *
 * The families below are ordered, but matching is **by position in the label**,
 * not by list order: "Calcaires et marnes à Teloceras" is a limestone with some
 * marl, "Marnes gréseuses bariolées à gypse" is a marl with some sandstone, and
 * only the first-named lithology separates them. List order breaks ties.
 *
 * **Superficial formations come first on purpose.** Éboulis, colluvions, lœss
 * and alluvions are not the bedrock — they are transported cover, and they are
 * what the vine actually roots in. On the Steinert, 45 % of the delimited
 * surface is soliflucted slope deposit rather than the Bajocian limestone
 * underneath; a card that answered "calcaire" everywhere would hide exactly the
 * distinction the 1/50 000 map was brought in to show.
 */

export interface FormationInfo {
  /** BD Charm-50 stratigraphic id, e.g. `j2c`. `null` when absent. */
  notation: string | null;
  /** Full BD Charm-50 label, age included. */
  descr: string;
  /** Source 1/50 000 sheet, e.g. "Rouffach". `null` when absent. */
  carte: string | null;
  /** Département code of the ingested layer, e.g. "68". */
  department: string | null;
}

/** One rock family: how to recognise it, and what to tell a winegrower. */
interface Family {
  /** Match against the accent-folded lowercase label. */
  test: RegExp;
  phrase: string;
  gloss: string;
  /** Transported cover rather than bedrock — flagged in the UI. */
  superficial?: boolean;
}

const SUPERFICIAL: Family[] = [
  {
    test: /eboulis|cryoclaste/,
    phrase: "Éboulis de pente",
    gloss:
      "Cailloux détachés du versant au-dessus : sol très drainant, qui garde la nature de la roche d’origine.",
    superficial: true,
  },
  {
    test: /soliflu/,
    phrase: "Dépôts de pente soliflués",
    gloss:
      "Manteau de débris descendu lentement le long du versant : profond, caillouteux, plus frais que la roche nue.",
    superficial: true,
  },
  {
    test: /colluvion/,
    phrase: "Colluvions de bas de pente",
    gloss:
      "Terre fine accumulée en pied de coteau : sol plus épais et plus riche, souvent plus vigoureux.",
    superficial: true,
  },
  {
    test: /alluvion/,
    phrase: "Alluvions",
    gloss:
      "Graviers et sables déposés par la rivière : sol jeune, drainant, avec une nappe souvent proche.",
    superficial: true,
  },
  {
    test: /loess|lehm/,
    phrase: "Lœss et lehms",
    gloss:
      "Limon fin déposé par le vent : sol profond, facile à travailler, qui retient bien l’eau.",
    superficial: true,
  },
  {
    // Piedmont sheets, alluvial fans and old terraces: the flat, stony ground
    // between the Vosges front and the plain, planted in generic AOC Alsace.
    test: /cone[s]? (de dejection|alluvi)|cailloutis|glacis|terrasse|epandage/,
    phrase: "Cailloutis de piémont",
    gloss:
      "Nappe de galets étalée au débouché des vallées : sol très drainant, souvent sec.",
    superficial: true,
  },
  {
    test: /limon/,
    phrase: "Limons",
    gloss:
      "Terre fine et profonde des plateaux : facile à travailler, bonne réserve en eau.",
    superficial: true,
  },
  {
    test: /hydrographie|plan d.eau|eau libre/,
    phrase: "Eau libre",
    gloss: "Rivière ou plan d’eau : pas de sol.",
    superficial: true,
  },
  {
    test: /moraine|glaciaire/,
    phrase: "Dépôts glaciaires",
    gloss:
      "Mélange hétérogène laissé par un glacier : blocs, sables et argiles sans tri.",
    superficial: true,
  },
  {
    test: /tourbe/,
    phrase: "Tourbe",
    gloss: "Sol organique gorgé d’eau : jamais planté en vigne.",
    superficial: true,
  },
  {
    test: /remblai|anthropique/,
    phrase: "Remblais",
    gloss: "Terrain rapporté par l’homme.",
    superficial: true,
  },
];

const BEDROCK: Family[] = [
  {
    // Before the volcanic family: a "tuf calcaire" is a freshwater limestone,
    // not a volcanic tuff.
    test: /travertin|tuf calcaire|tufs calcaires/,
    phrase: "Sous-sol de travertin",
    gloss: "Calcaire déposé par une source : roche tendre et très poreuse.",
  },
  {
    test: /craie/,
    phrase: "Sous-sol de craie",
    gloss:
      "Roche blanche et poreuse : elle stocke l’eau et la rend à la vigne — la Champagne.",
  },
  {
    test: /oolith|calcaire|calcareu|dolomi|muschelkalk/,
    phrase: "Sous-sol de calcaire",
    gloss:
      "Roche claire et filtrante, sèche et chaude : le socle classique des grands vins blancs.",
  },
  {
    test: /marne|marno/,
    phrase: "Sous-sol de marne",
    gloss:
      "Mélange d’argile et de calcaire : plus frais et plus retenteur en eau qu’un calcaire pur.",
  },
  {
    test: /gypse|anhydrite|evaporite|salifere|keuper/,
    phrase: "Sous-sol de marnes à gypse",
    gloss:
      "Marnes salées et gypseuses : sols lourds, souvent les plus tardifs d’un coteau.",
  },
  {
    test: /conglomerat|poudingue|gompholite/,
    phrase: "Sous-sol de conglomérat",
    gloss:
      "Galets cimentés en roche : sol caillouteux et drainant, qui restitue la chaleur.",
  },
  {
    test: /gres|arkose|buntsandstein|voltzia/,
    phrase: "Sous-sol de grès",
    gloss: "Sable ancien durci en roche : sol pauvre, acide et très drainant.",
  },
  {
    test: /argil/,
    phrase: "Sous-sol d’argile",
    gloss:
      "Terre lourde et compacte, qui retient l’eau et se réchauffe lentement.",
  },
  {
    test: /sable|sablon/,
    phrase: "Sous-sol de sable",
    gloss: "Sol léger qui se réchauffe vite et ne retient presque pas l’eau.",
  },
  {
    test: /rhyolit|ignimbrit|basalt|andesit|trachyt|latite|pyromerid|volcan|spilite|\btufs?\b/,
    phrase: "Sous-sol volcanique",
    gloss:
      "Cendres et laves anciennes : roches sombres, riches en minéraux, qui chauffent vite — le Rangen.",
  },
  {
    test: /granit|granodiorit/,
    phrase: "Sous-sol de granite",
    gloss: "Roche dure et cristalline, qui donne des sols acides et drainants.",
  },
  {
    test: /gabbro|diorit|syenit|peridotit/,
    phrase: "Sous-sol de roche magmatique de profondeur",
    gloss: "Magma cristallisé en profondeur : roche dense et dure.",
  },
  {
    test: /migmatit|gneiss/,
    phrase: "Sous-sol de gneiss",
    gloss: "Roche dure et feuilletée, proche du granite.",
  },
  {
    test: /micaschiste/,
    phrase: "Sous-sol de micaschiste",
    gloss: "Roche feuilletée et brillante, qui se délite en plaquettes.",
  },
  {
    test: /schiste|ardois|phyllade/,
    phrase: "Sous-sol de schiste",
    gloss:
      "Roche feuilletée sombre, qui emmagasine la chaleur du jour — le Kastelberg.",
  },
  {
    test: /grauwacke/,
    phrase: "Sous-sol de grauwacke",
    gloss: "Grès sombre et impur, issu de coulées sous-marines.",
  },
  {
    test: /gaize/,
    phrase: "Sous-sol de gaize",
    gloss: "Roche siliceuse tendre et poreuse — l’Argonne.",
  },
  {
    test: /breche|mylonite/,
    phrase: "Sous-sol de brèche",
    gloss: "Fragments anguleux cimentés, souvent le long d’une faille.",
  },
  {
    test: /quartzit/,
    phrase: "Sous-sol de quartzite",
    gloss: "Roche siliceuse extrêmement dure et stérile.",
  },
  {
    test: /amphibolit|serpentinit/,
    phrase: "Sous-sol de roche métamorphique basique",
    gloss: "Roche sombre et dense, transformée par la chaleur et la pression.",
  },
];

const FAMILIES: Family[] = [...SUPERFICIAL, ...BEDROCK];

/** Lowercase, accent-free, so the regexes above stay readable. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export interface PlainFormation {
  /** Headline, e.g. "Sous-sol de calcaire" or "Éboulis de pente". */
  phrase: string;
  /** One-line, non-technical meaning for a vine. `null` when unrecognised. */
  gloss: string | null;
  /** The BD Charm-50 label, age stripped off. */
  formation: string;
  /** Geological age as printed by BRGM, e.g. "Bajocien supérieur". */
  age: string | null;
  /** True for transported cover (éboulis, lœss, colluvions…). */
  superficial: boolean;
}

/**
 * Split BD Charm-50's trailing age off the label.
 *
 * BRGM writes the stage in parentheses at the very end, after a separator that
 * is sometimes a dash: `"… et marnes à acuminata (Bajocien supérieur)"`. Only
 * the *last* parenthesised group is the age — some labels carry an inline
 * example such as `"Ex : (j1 a-b)"` earlier in the string.
 */
export function splitAge(descr: string): { label: string; age: string | null } {
  const match = /\(([^()]*)\)\s*$/.exec(descr);
  if (!match) return { label: descr.trim(), age: null };
  const label = descr
    .slice(0, match.index)
    .replace(/[\s,;:-]+$/, "")
    .trim();
  const age = match[1].trim();
  return { label: label || descr.trim(), age: age || null };
}

/**
 * Pick the rock family a BD Charm-50 label describes.
 *
 * Matching is by **earliest position** in the label, so the first-named
 * lithology wins ("Calcaires et marnes" → calcaire, "Marnes gréseuses" →
 * marne). List order only breaks ties at the same position.
 */
export function matchFamily(descr: string): Family | null {
  const folded = fold(descr);
  let best: { family: Family; at: number } | null = null;
  for (const family of FAMILIES) {
    const at = folded.search(family.test);
    if (at < 0) continue;
    if (!best || at < best.at) best = { family, at };
  }
  return best ? best.family : null;
}

/** Turn one BD Charm-50 formation into something a winegrower can read. */
export function plainFormation(info: FormationInfo): PlainFormation {
  const { label, age } = splitAge(info.descr);
  const family = matchFamily(info.descr);
  return {
    phrase: family ? family.phrase : "Sous-sol",
    gloss: family ? family.gloss : null,
    formation: label,
    age,
    superficial: Boolean(family?.superficial),
  };
}
