import Link from "next/link";

export default function ProjectAccessGate({ product }: { product: "window" | "door" }) {
  const label = product === "window" ? "window" : "door";

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-brand-200 bg-brand-50 p-8 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Project first workflow</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-900">Create or open a project before quoting</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {`A ${label} quote is assigned to a project so windows and doors for the same customer stay together.`}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/projects/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Create project
        </Link>
        <Link href="/projects" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Open existing project
        </Link>
      </div>
    </div>
  );
}
