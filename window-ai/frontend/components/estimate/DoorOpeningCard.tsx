import { DoorGeometryDrawing } from "@/components/DoorDrawing";
import type { DoorSectionOpening } from "@/lib/api";
import { doorSpecLines, specPair } from "@/lib/doorPipeline";

const SCOPE_PREFIX = "To supply and install:";

/** A door's parts, unpriced (one price per door, as the QuickBooks estimates), "× qty" when more than one. */
export function doorParts(opening: Pick<DoorSectionOpening, "items">): string[] {
  return (opening.items || [])
    .filter((item) => item.description)
    .map((item) => {
      const qty = Number(item.qty ?? 1);
      return Number.isFinite(qty) && qty !== 1 ? `${item.description} × ${qty}` : item.description;
    });
}

/** Item number and location, the door type, and "To supply and install · material · finish" (as door_card() in the PDF). */
export function doorCardHeading(opening: Pick<DoorSectionOpening, "scope" | "label" | "location" | "material" | "finish_label">, index: number) {
  const scope = opening.scope || "";
  const supply = scope.startsWith(SCOPE_PREFIX);
  const title = supply ? scope.slice(SCOPE_PREFIX.length).trim() : scope || opening.label || "Door";
  // Only the location: the label is the long order summary.
  const place = (opening.location || "").trim();
  const kicker = `Item ${index}${place && place.toLowerCase() !== title.toLowerCase() ? ` · ${place}` : ""}`;
  const material = opening.material ? opening.material.charAt(0).toUpperCase() + opening.material.slice(1) : "";
  const sub = [supply ? "To supply and install" : "", material, opening.finish_label].filter(Boolean).join(" · ");
  return { kicker, title, sub };
}

/**
 * One door on the estimate as a card, laid out like door_card() in services/estimate_documents.py:
 * item and price across the top, a large elevation with its sizes in a shaded panel beside the
 * spec rows, then what the price includes. Shared by the builder's preview and the customer portal.
 */
export default function DoorOpeningCard({ opening, index, price, taxLabel = "HST", onConfigure, kicker: kickerText, everyOption = false }: {
  opening: DoorSectionOpening;
  index: number;
  /** Doors offered as options: "Option A · Front entry" in place of "Item 1 · Front entry". */
  kicker?: string;
  /** A door every option has: its price is part of each option's total, so none is shown on its own. */
  everyOption?: boolean;
  /** The door's price, formatted by the page (it knows the currency). */
  price: string;
  taxLabel?: string;
  /** Open this door in the door configurator (internal project page only). */
  onConfigure?: () => void;
}) {
  const heading = doorCardHeading(opening, index);
  const { title, sub } = heading;
  const kicker = kickerText ?? heading.kicker;
  const specs = doorSpecLines(opening);
  const parts = doorParts(opening);
  const drawing = opening.drawing ? (
    <DoorGeometryDrawing geometry={opening.drawing} size={264} dimensions title={`Item ${index}, viewed from outside`} />
  ) : null;
  const partsList = (
    <div className="door-card-parts">
      <p className="door-card-kicker">{`${kickerText && !everyOption ? kickerText.split(" · ")[0] : `Item ${index}`} includes`}</p>
      <ul>{parts.map((text, i) => <li key={i}>{text}</li>)}</ul>
    </div>
  );
  return (
    <article className="door-card">
      <header className="door-card-head">
        <div className="min-w-0">
          <p className="door-card-kicker">{kicker}</p>
          <h3>{title}</h3>
          {sub ? <p className="door-card-sub">{sub}</p> : null}
        </div>
        <div className="door-card-price">{everyOption ? <span>In every option</span> : <><strong>{price}</strong><span>+ {taxLabel}</span></>}</div>
      </header>
      <div className={drawing ? "door-card-body" : "door-card-body door-card-body-plain"}>
        {drawing ? (
          <figure className="door-card-drawing">
            {onConfigure ? (
              <button type="button" className="door-card-configure" onClick={onConfigure} title="Configure this door">
                {drawing}
                <span>Configure</span>
              </button>
            ) : drawing}
            <figcaption>Exterior view, for illustration</figcaption>
          </figure>
        ) : null}
        {specs.length ? (
          <dl className="door-card-specs">
            {specs.map((line, i) => {
              const pair = specPair(line);
              return pair ? <div key={i}><dt>{pair[0]}</dt><dd>{pair[1]}</dd></div> : <div key={i}><dd className="door-card-spec-note">{line}</dd></div>;
            })}
          </dl>
        ) : parts.length ? partsList : null}
      </div>
      {specs.length && parts.length ? partsList : null}
    </article>
  );
}
