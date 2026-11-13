import { DoorGeometryDrawing } from "@/components/DoorDrawing";
import { doorCardHeading } from "@/components/estimate/DoorOpeningCard";
import type { DoorOptionOpening, DoorOptions, TierSummary } from "@/lib/api";

type OptionTier = Pick<TierSummary, "id" | "name" | "description" | "subtotal" | "hst" | "total"> & { error?: string };

/** The doors only one option has (what the customer is choosing between), for each door option. */
export function doorOptionCards(doorOptions: DoorOptions, tiers: OptionTier[]) {
  return doorOptions.option_ids
    .map((id) => tiers.find((tier) => tier.id === id && !tier.error))
    .filter((tier): tier is OptionTier => Boolean(tier))
    .map((tier) => ({
      tier,
      doors: doorOptions.openings.filter((opening) => !opening.in_every_option && opening.options.some((option) => option.id === tier.id)),
    }));
}

/** "Option A · Front entry", or "Item 3 · Side door · in every option" for a door every option has. */
export function doorOptionKicker(opening: DoorOptionOpening, index: number): string {
  const place = (opening.location || "").trim();
  if (opening.in_every_option) return [`Item ${index}`, place, "in every option"].filter(Boolean).join(" · ");
  return [opening.options.map((option) => option.name).join(" / "), place].filter(Boolean).join(" · ");
}

/**
 * The door options side by side, as page 2 of the custom door estimates: each option's door,
 * its name and its price, so the customer compares them at a glance before the details.
 */
export function DoorOptionsStrip({ doorOptions, tiers, taxLabel, money }: {
  doorOptions: DoorOptions;
  tiers: OptionTier[];
  taxLabel: string;
  money: (value: number | null | undefined) => string;
}) {
  const cards = doorOptionCards(doorOptions, tiers);
  if (!cards.length) return null;
  return (
    <div className="door-options-strip">
      {cards.map(({ tier, doors }) => {
        const door = doors[0];
        const heading = door ? doorCardHeading(door, 1) : null;
        return (
          <div key={tier.id} className="door-option-tile">
            <p className="door-card-kicker">{tier.name}</p>
            <p className="door-option-title">{tier.description || heading?.title || ""}</p>
            <div className="door-option-drawing">
              {door?.drawing ? <DoorGeometryDrawing geometry={door.drawing} size={180} dimensions title={`${tier.name}, viewed from outside`} /> : null}
            </div>
            {heading?.sub ? <p className="door-option-sub">{heading.sub.replace(/^To supply and install · /, "")}</p> : null}
            <p className="door-option-price"><strong>{money(tier.subtotal)}</strong> <span>+ {taxLabel}</span></p>
          </div>
        );
      })}
    </div>
  );
}

/** Every option's price, subtotal / tax / total (the custom door estimates' pricing summary). */
export function OptionsPricingTable({ tiers, taxLabel, money, quotedId }: {
  tiers: OptionTier[];
  taxLabel: string;
  money: (value: number | null | undefined) => string;
  /** The option picked as the main price, marked as such. */
  quotedId?: string | null;
}) {
  const rows = tiers.filter((tier) => !tier.error);
  if (!rows.length) return null;
  return (
    <table className="estimate-table door-options-pricing">
      <thead><tr><th>Option</th><th className="text-right">Subtotal</th><th className="text-right">{taxLabel}</th><th className="text-right">Total</th></tr></thead>
      <tbody>
        {rows.map((tier) => (
          <tr key={tier.id}>
            <td data-label="Option"><strong>{tier.name}</strong>{tier.description ? <> — {tier.description}</> : null}{quotedId === tier.id ? <span className="block text-xs text-slate-500">Main price</span> : null}</td>
            <td data-label="Subtotal" className="text-right">{money(tier.subtotal)}</td>
            <td data-label={taxLabel} className="text-right">{money(tier.hst)}</td>
            <td data-label="Total" className="text-right font-semibold">{money(tier.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
