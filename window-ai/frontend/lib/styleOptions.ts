type CatalogStyle = {
  code: string;
  name: string;
  collection: string;
};

export type WindowStyleGroup<T extends CatalogStyle = CatalogStyle> = {
  collection: string;
  label: string;
  styles: T[];
};

const COLLECTION_ORDER = ["heritage", "heritage_maximum", "classic"];

const COLLECTION_LABELS: Record<string, string> = {
  heritage: "Heritage",
  heritage_maximum: "Heritage Maximum",
  classic: "Classic",
};

const STYLE_ORDER = [
  "CASEMENT",
  "FIXED CASEMENT",
  "CASEMENT FIXED",
  "AWNING",
  "SLIM FIXED",
  "SINGLE SLIDER TILT",
  "SINGLE SLIDER LIFT OUT",
  "DOUBLE SLIDER TILT",
  "DOUBLE SLIDER LIFT OUT",
  "SINGLE HUNG TILT",
  "DOUBLE HUNG TILT",
];

const STYLE_LABELS: Record<string, string> = {
  CASEMENT: "Casement",
  "FIXED CASEMENT": "Fixed Casement",
  "CASEMENT FIXED": "Fixed Casement",
  AWNING: "Awning",
  "SLIM FIXED": "Slim Fixed",
  "SINGLE SLIDER TILT": "Single Slider",
  "SINGLE SLIDER LIFT OUT": "Single Slider",
  "DOUBLE SLIDER TILT": "Double Slider",
  "DOUBLE SLIDER LIFT OUT": "Double Slider",
  "SINGLE HUNG TILT": "Hung",
  "DOUBLE HUNG TILT": "Hung",
};

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function windowStyleLabel(style: CatalogStyle) {
  const name = style.name.trim().toUpperCase();
  return `${STYLE_LABELS[name] || titleCase(style.name)} · ${style.code}`;
}

export function groupWindowStyles<T extends CatalogStyle>(styles: T[]): WindowStyleGroup<T>[] {
  const grouped = new Map<string, T[]>();

  for (const style of styles) {
    const collectionStyles = grouped.get(style.collection) || [];
    collectionStyles.push(style);
    grouped.set(style.collection, collectionStyles);
  }

  const collections = [
    ...COLLECTION_ORDER,
    ...Array.from(grouped.keys()).filter((collection) => !COLLECTION_ORDER.includes(collection)),
  ];

  return collections
    .filter((collection) => grouped.has(collection))
    .map((collection) => ({
      collection,
      label: COLLECTION_LABELS[collection] || titleCase(collection.replace(/_/g, " ")),
      styles: [...(grouped.get(collection) || [])].sort((left, right) => {
        const leftOrder = STYLE_ORDER.indexOf(left.name.trim().toUpperCase());
        const rightOrder = STYLE_ORDER.indexOf(right.name.trim().toUpperCase());
        if (leftOrder !== rightOrder) {
          return (leftOrder < 0 ? Number.MAX_SAFE_INTEGER : leftOrder) - (rightOrder < 0 ? Number.MAX_SAFE_INTEGER : rightOrder);
        }
        return left.code.localeCompare(right.code, undefined, { numeric: true });
      }),
    }));
}
