import DoorQuoteBuilder from "@/components/DoorQuoteBuilder";
import ProjectAccessGate from "@/components/ProjectAccessGate";

export const metadata = {
  title: "Door Quotes · Betterview",
  description: "Deterministic fiberglass and steel door quotes from the Palma price book.",
};

export default function DoorsPage({ searchParams }: { searchParams?: { projectId?: string | string[]; editDoors?: string | string[] } }) {
  const projectId = typeof searchParams?.projectId === "string" ? searchParams.projectId : undefined;
  const editDoors = typeof searchParams?.editDoors === "string" ? searchParams.editDoors === "1" || searchParams.editDoors === "true" : false;

  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Build a door quote from the Palma price book
        </h2>
        <p className="mt-2 text-slate-600">
          Choose catalog-backed door, glass, hardware, transom, and installation options. Create or open a project first so door openings can be assigned alongside windows for the same customer.
        </p>
      </div>
      {projectId ? <DoorQuoteBuilder projectId={projectId} editDoors={editDoors} /> : <ProjectAccessGate product="door" />}
    </div>
  );
}
