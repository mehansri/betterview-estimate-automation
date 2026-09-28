"use client";

import { useParams } from "next/navigation";
import MeasureSheet from "@/components/MeasureSheet";

export default function ProjectMeasurePage() {
  const params = useParams<{ id: string }>();
  return <MeasureSheet estimateId={params.id} />;
}
