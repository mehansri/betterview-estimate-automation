"use client";

import { useParams } from "next/navigation";
import ProjectEstimateBuilder from "@/components/ProjectEstimateBuilder";

export default function ProjectEstimatePage() {
  const params = useParams<{ id: string }>();
  return <ProjectEstimateBuilder estimateId={params.id} />;
}

