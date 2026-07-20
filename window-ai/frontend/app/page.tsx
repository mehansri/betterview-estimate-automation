import QuoteBuilder from "@/components/QuoteBuilder";

export default function HomePage() {
  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Build a window quote in seconds
        </h2>
        <p className="mt-2 text-slate-600">
          Estimates use historical similarity from imported manufacturer orders
          (with optional ML fallback). Import more PDFs under Admin → Estimates
          to improve coverage.
        </p>
      </div>
      <QuoteBuilder />
    </div>
  );
}
