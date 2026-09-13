/**
 * "What is under this point?" — the subsoil readout, available on **every**
 * basemap (ADR 0011, then ADR 0013).
 *
 * The geological basemap (`GEOLOGIE`) is a pure image service: it is not
 * queryable, and its legend runs to hundreds of formations per 1/50 000 sheet —
 * far too many to show as a static legend. BRGM does expose one queryable
 * layer describing the subsoil nationally, `LITHO_1M_SIMPLIFIEE` (simplified
 * lithology at 1/1 000 000), so clicking the map answers with a **rock family**
 * ("Calcaires", "Marnes", "Granites"…) rather than the exact formation.
 *
 * That precision gap is real and must stay visible in the UI: the colours on
 * screen are the 1/50 000 map, the label comes from the 1/1 000 000 one.
 *
 * **No soil depth is served here, on purpose.** BRGM's `EPAISSEUR_ALTERITES`
 * ("Modèle d'épaisseur des Altérites") is the right *concept* — the thickness
 * of weathered cover above fresh rock — but it is unusable: its footprint is
 * Bretagne only (22/29/35/56, no vineyard), and its GetFeatureInfo answers with
 * an empty feature because the layer is an unattributed raster. No other
 * queryable BRGM layer carries a depth. See `docs/data-sources.md`.
 */

const BRGM_WMS = "https://geoservices.brgm.fr/geologie";

/** The only BRGM layer on this service that answers GetFeatureInfo. */
const LITHO_LAYER = "LITHO_1M_SIMPLIFIEE";

/**
 * Ground width of the query box, in metres. **Deliberately fixed, and
 * independent of the map zoom.**
 *
 * MapServer refuses a request whose scale falls outside a layer's declared
 * window, and `LITHO_1M_SIMPLIFIEE` declares `MinScaleDenominator` 25 000. A box
 * that shrank with the map zoom silently crossed that floor around z15 and the
 * answer came back empty — clicking a cru at full zoom returned nothing.
 *
 * A WMS scale denominator is `bbox_width / (WIDTH_px × 0.00028)`, so with a
 * 256 px box, 7168 m lands on exactly 1:100 000 — comfortably inside
 * 25 000…10 000 000, and an honest scale for a 1/1 000 000 layer.
 *
 * This changes only the *scale* of the request, never the point queried: the
 * box stays centred on the click and the query pixel stays dead centre.
 */
const QUERY_BOX_METERS = 7168;

/**
 * GetFeatureInfo URL for a point given in EPSG:3857 metres. The box is built
 * *around* the point (query pixel dead centre), so no assumption is made about
 * the canvas size, zoom, pitch or bearing.
 */
export function geologyInfoUrl(xMeters: number, yMeters: number): string {
  const half = QUERY_BOX_METERS / 2;
  const bbox = [
    xMeters - half,
    yMeters - half,
    xMeters + half,
    yMeters + half,
  ].join(",");

  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    LAYERS: LITHO_LAYER,
    QUERY_LAYERS: LITHO_LAYER,
    CRS: "EPSG:3857",
    BBOX: bbox,
    WIDTH: "256",
    HEIGHT: "256",
    I: "128",
    J: "128",
    // `application/json` is rejected by this MapServer instance.
    INFO_FORMAT: "text/plain",
    FEATURE_COUNT: "1",
    STYLES: "",
  });
  return `${BRGM_WMS}?${params.toString()}`;
}

export interface GeologyInfo {
  /** Rock family, e.g. "Calcaires". */
  descr: string;
  /** Broad class, e.g. "Roches Sédimentaires". `null` when absent. */
  type: string | null;
  /** `CODE_GEOL`, the stable class id behind `descr`. `null` when absent. */
  code: string | null;
}

/**
 * Plain-French rendering of a lithology class, for readers who are not
 * geologists (the whole point of the readout).
 *
 * Keyed by `CODE_GEOL` rather than `DESCR`: the code is the stable id, and the
 * raw label is a plural, capitalised heading ("Calcaires, marnes et gypse")
 * that reads badly inside a sentence. `phrase` therefore carries the whole
 * "Sous-sol de …" completion — elisions and plurals included — instead of
 * being assembled at render time.
 *
 * The eleven classes below are the ones observed over France métropolitaine by
 * sweeping the layer on a grid; unknown codes fall back to the raw `DESCR`.
 */
const LITHOLOGY_PLAIN: Record<string, { phrase: string; gloss: string }> = {
  "1": {
    phrase: "Sous-sol d’argile",
    gloss: "Terre lourde et compacte, qui retient l’eau et se réchauffe lentement.",
  },
  "2": {
    phrase: "Sous-sol de calcaire et de marne",
    gloss: "Roche claire et filtrante, le socle classique des grands vins blancs.",
  },
  "3": {
    phrase: "Sous-sol de craie",
    gloss: "Roche blanche et poreuse : elle stocke l’eau et la rend à la vigne — la Champagne.",
  },
  "5": {
    phrase: "Sous-sol de grès",
    gloss: "Sable ancien durci en roche : sol pauvre, très drainant.",
  },
  "6": {
    phrase: "Sous-sol de sable",
    gloss: "Sol léger qui se réchauffe vite et ne retient presque pas l’eau.",
  },
  "7": {
    phrase: "Sous-sol de roches volcaniques",
    gloss: "Basaltes et rhyolites : roches sombres, riches en minéraux.",
  },
  "8": {
    phrase: "Sous-sol de granite",
    gloss: "Roche dure et cristalline, qui donne des sols acides et drainants.",
  },
  "9": {
    phrase: "Sous-sol d’ophiolite",
    gloss: "Anciens fonds océaniques remontés en surface — très rare.",
  },
  "10": {
    phrase: "Sous-sol de gneiss",
    gloss: "Roche dure et feuilletée, proche du granite.",
  },
  "11": {
    phrase: "Sous-sol de micaschiste",
    gloss: "Roche feuilletée et brillante, qui se délite en plaquettes.",
  },
  "12": {
    phrase: "Sous-sol de schiste et de grès",
    gloss: "Roche feuilletée sombre, qui emmagasine la chaleur du jour.",
  },
};

/** Broad BRGM class → lowercase singular, for the secondary line. */
const ROCK_CLASS_PLAIN: Record<string, string> = {
  "Roches Sédimentaires": "roche sédimentaire",
  "Roches Magmatiques": "roche magmatique (volcanique ou de profondeur)",
  "Roches Métamorphiques": "roche métamorphique (transformée par la chaleur et la pression)",
};

export interface PlainSubsoil {
  /** Headline sentence, e.g. "Sous-sol de gneiss". */
  phrase: string;
  /** One-line explanation in plain French, or `null` for an unmapped class. */
  gloss: string | null;
  /** Rock class in plain French, or the raw BRGM label as a fallback. */
  rockClass: string | null;
}

/** Turn a raw BRGM lithology answer into something a non-geologist can read. */
export function plainSubsoil(info: GeologyInfo): PlainSubsoil {
  const known = info.code ? LITHOLOGY_PLAIN[info.code] : undefined;
  return {
    phrase: known ? known.phrase : `Sous-sol : ${info.descr.toLowerCase()}`,
    gloss: known ? known.gloss : null,
    rockClass: info.type ? ROCK_CLASS_PLAIN[info.type] ?? info.type : null,
  };
}

/**
 * Parse the MapServer `text/plain` GetFeatureInfo body, whose payload is a run
 * of `KEY = 'value'` lines. Returns `null` when the click lands outside the
 * layer (sea, abroad) or the service answers with an exception.
 */
export function parseGeologyInfo(body: string): GeologyInfo | null {
  if (body.includes("ServiceException")) return null;

  const fields = new Map<string, string>();
  for (const line of body.split("\n")) {
    const m = /^\s*([A-Z_0-9]+)\s*=\s*'(.*)'\s*$/.exec(line);
    if (m) fields.set(m[1], m[2].trim());
  }

  const descr = fields.get("DESCR");
  if (!descr) return null;
  return {
    descr,
    type: fields.get("TYPE") || null,
    code: fields.get("CODE_GEOL") || null,
  };
}
