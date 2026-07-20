import QuoteBuilder from "@/components/QuoteBuilder";

export default function HomePage() {
  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Build a window quote in seconds
        </h2>
        <p className="mt-2 text-slate-600">
          Select specs for each opening. The model predicts unit prices from
          historical manufacturer estimates so you can share a ballpark before
          remoting into the full configurator.
        </p>
      </div>
      <QuoteBuilder />
    </div>
  );
}
