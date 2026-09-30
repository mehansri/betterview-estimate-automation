/**
 * Palma's standard paint and stain colours, for the configurator's colour
 * pickers and the door drawing. Mirrors services/doors/colours.py (checked by
 * tests/test_door_colours.py); stain hex values are approximate.
 */

export type PalmaPaint = { name: string; code: string; hex: string };
export type PalmaStain = { name: string; hex: string };

export const PALMA_PAINTS: PalmaPaint[] = [
  { name: "Polytex White", code: "", hex: "#ededed" },
  { name: "NS Espresso", code: "", hex: "#272320" },
  { name: "Antique Brown", code: "G-265", hex: "#4d3f24" },
  { name: "Red", code: "G-322", hex: "#ca1921" },
  { name: "Ice White", code: "G-429", hex: "#e0e6e6" },
  { name: "Rainwear White", code: "G-430", hex: "#e5e5e1" },
  { name: "Bright White", code: "G-431", hex: "#e3e3de" },
  { name: "Cream", code: "G-492", hex: "#d0c0a6" },
  { name: "Lambeth Beige", code: "G-501", hex: "#c2b59e" },
  { name: "Maize", code: "G-502", hex: "#e7d8b8" },
  { name: "Windswept Smoke", code: "G-506", hex: "#5c564f" },
  { name: "Tan", code: "G-507", hex: "#b39a86" },
  { name: "Sandalwood", code: "G-508", hex: "#c0aea0" },
  { name: "Midnight Surf", code: "G-509", hex: "#4f5558" },
  { name: "Canyon Clay", code: "G-510", hex: "#b3aa9a" },
  { name: "Moonlit Moss", code: "G-513", hex: "#64655c" },
  { name: "Cashmere", code: "G-514", hex: "#d1c9bc" },
  { name: "Sage", code: "G-517", hex: "#94948b" },
  { name: "Ivy Green", code: "G-522", hex: "#546a65" },
  { name: "Slate", code: "G-523", hex: "#61615c" },
  { name: "Black", code: "G-525", hex: "#1a1a1c" },
  { name: "Almond", code: "G-532", hex: "#d4c7b5" },
  { name: "Antique Ivory", code: "G-533", hex: "#d9c5a4" },
  { name: "Pearl", code: "G-534", hex: "#c3c3be" },
  { name: "Wedgewood Blue", code: "G-535", hex: "#5f7583" },
  { name: "Dover Gray", code: "G-536", hex: "#abaaa7" },
  { name: "Mist Blue", code: "G-537", hex: "#909da0" },
  { name: "Wicker Cafe", code: "G-538", hex: "#bcac95" },
  { name: "Venetian Red", code: "G-539", hex: "#7a3829" },
  { name: "Sandstone", code: "G-540", hex: "#ebe3d1" },
  { name: "Old World Blue", code: "G-542", hex: "#243748" },
  { name: "Harvest Wheat", code: "G-543", hex: "#a98663" },
  { name: "Sable", code: "G-547", hex: "#665f54" },
  { name: "Chestnut Brown", code: "G-554", hex: "#442d25" },
  { name: "Forest Green", code: "G-556", hex: "#1f4931" },
  { name: "Dark Drift", code: "G-557", hex: "#7a6957" },
  { name: "Pebble", code: "G-559", hex: "#9b8e7b" },
  { name: "Commercial Brown", code: "G-562", hex: "#423a32" },
  { name: "Burgundy", code: "G-567", hex: "#592231" },
  { name: "Nutmeg", code: "G-568", hex: "#3e281d" },
  { name: "Saddle Brown", code: "G-569", hex: "#705746" },
  { name: "Storm", code: "G-570", hex: "#847d74" },
  { name: "Brownstone", code: "G-571", hex: "#9d8e7a" },
  { name: "Juniper Grove", code: "G-580", hex: "#949c7c" },
  { name: "Chesapeake Grey", code: "G-5C1", hex: "#808581" },
  { name: "Marine Dusk", code: "G-5C6", hex: "#323d47" },
  { name: "Rockwell Blue", code: "G-5P2", hex: "#62747d" },
  { name: "Espresso", code: "G-5P3", hex: "#594438" },
  { name: "Graphite", code: "G-5P5", hex: "#545955" },
  { name: "Iron Ore", code: "G-5P6", hex: "#444442" },
  { name: "Coastal Blue", code: "G-5P9", hex: "#3a5f74" },
];

export const PALMA_STAINS: PalmaStain[] = [
  { name: "Timber Grey", hex: "#4d5154" },
  { name: "Slate Grey", hex: "#33383a" },
  { name: "Charcoal Grey", hex: "#23292c" },
  { name: "White Oak", hex: "#736048" },
  { name: "Bleached Oak", hex: "#877b68" },
  { name: "Driftwood", hex: "#776d5b" },
  { name: "Teak", hex: "#612b1c" },
  { name: "Rustic Cherry", hex: "#462118" },
  { name: "Red Mahogany", hex: "#291e1c" },
  { name: "English Oak", hex: "#3e2517" },
  { name: "Light Pecan", hex: "#7a4b2a" },
  { name: "Early American", hex: "#4a3122" },
  { name: "Dark Walnut", hex: "#2a201c" },
  { name: "Jacobean", hex: "#26201a" },
  { name: "Early American Black", hex: "#2e241b" },
  { name: "Dark Pecan", hex: "#201b17" },
];

// Spellings reps (and the book) use for a standard colour.
const PAINT_ALIASES: Record<string, string> = {
  "white": "Polytex White",
  "standard white": "Polytex White",
  "polytex": "Polytex White",
  "polytex white": "Polytex White",
  "irion ore": "Iron Ore",
  "dover grey": "Dover Gray",
  "chesapeake gray": "Chesapeake Grey",
};

const key = (text?: string) => (text || "").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

const PAINT_BY_KEY = new Map<string, PalmaPaint>();
for (const paint of PALMA_PAINTS) {
  PAINT_BY_KEY.set(key(paint.name), paint);
  if (paint.code) {
    const short = paint.code.replace("G-", "");
    for (const alias of [paint.code, short, `${paint.code} ${paint.name}`, `${short} ${paint.name}`]) PAINT_BY_KEY.set(key(alias), paint);
  }
}
for (const [alias, name] of Object.entries(PAINT_ALIASES)) {
  const paint = PAINT_BY_KEY.get(key(name));
  if (paint) PAINT_BY_KEY.set(alias, paint);
}
const STAIN_BY_KEY = new Map(PALMA_STAINS.map((stain) => [key(stain.name), stain]));

/** Palma's name for a standard colour, or null when it is custom (or blank). */
export function standardColourName(type?: string, colour?: string): string | null {
  const found = type === "stained" ? STAIN_BY_KEY.get(key(colour)) : PAINT_BY_KEY.get(key(colour));
  return found?.name ?? null;
}

export function palmaHex(type?: string, colour?: string): string | null {
  const found = type === "stained" ? STAIN_BY_KEY.get(key(colour)) : PAINT_BY_KEY.get(key(colour));
  return found?.hex ?? null;
}

/** True when a painted/stained colour has been typed and is not on Palma's list (custom colour match). */
export function isCustomColour(type?: string, colour?: string): boolean {
  if (type !== "painted" && type !== "stained") return false;
  return Boolean(key(colour)) && standardColourName(type, colour) === null;
}
