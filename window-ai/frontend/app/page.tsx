import QuoteBuilder from "@/components/QuoteBuilder";
import ProjectAccessGate from "@/components/ProjectAccessGate";
import Link from "next/link";

export default function HomePage({ searchParams }: { searchParams?: { projectId?: string | string[] } }) {
  const projectId = typeof searchParams?.projectId === "string" ? searchParams.projectId : undefined;

  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Build a catalog-backed window quote
        </h2>
        <p className="mt-2 text-slate-600">
          Window City v18 is the pricing authority. Create a project first, then add one or more window quotes to that project alongside any door quotes.
        </p>
        {!projectId ? <Link href="/projects/new" className="mt-4 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Create a project</Link> : null}
      </div>
      {projectId ? <QuoteBuilder projectId={projectId} /> : <ProjectAccessGate product="window" />}
    </div>
  );
}
