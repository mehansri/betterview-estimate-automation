import DoorQuoteBuilder from "@/components/DoorQuoteBuilder";

export const metadata = {
  title: "Door Quotes · Betterview",
  description: "Deterministic fiberglass and steel door quotes from the Palma price book.",
};

export default function DoorsPage() {
  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Build a door quote from the Palma price book
        </h2>
        <p className="mt-2 text-slate-600">
          Choose only catalog-backed door, glass, hardware, transom, and installation options. Add openings to a project and generate the customer total with the full internal breakdown.
        </p>
      </div>
      <DoorQuoteBuilder />
    </div>
  );
}
