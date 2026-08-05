import QuoteBuilder from "@/components/QuoteBuilder";

export default function HomePage() {
  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Build a catalog-backed quote
        </h2>
        <p className="mt-2 text-slate-600">
          Window City v18 is the pricing authority. Historical PDFs remain
          available under Estimates for audit, learning, and future calibration.
        </p>
      </div>
      <QuoteBuilder />
    </div>
  );
}
