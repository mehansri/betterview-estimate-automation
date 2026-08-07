import QuoteBuilder from "@/components/QuoteBuilder";
import Link from "next/link";

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
        <Link href="/projects/new" className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Create a combined project estimate
        </Link>
      </div>
      <QuoteBuilder />
    </div>
  );
}
