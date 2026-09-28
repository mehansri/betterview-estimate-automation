"use client";

import { useEffect, useRef, useState } from "react";
import { CustomerEstimate, EstimatePhoto, deleteEstimatePhoto, fetchEstimatePhotos, uploadEstimatePhoto } from "@/lib/api";

/** Downscale camera photos before upload so site visits stay fast on mobile data. */
async function shrinkImage(file: File, maxSide = 1600): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export default function PhotosCard({ estimate }: { estimate: CustomerEstimate }) {
  const [photos, setPhotos] = useState<EstimatePhoto[]>([]);
  const [lineId, setLineId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lines = [
    ...estimate.windows.map((line, index) => ({ id: line.id, label: `Window ${index + 1}${line.location ? ` · ${line.location}` : ""}` })),
    ...estimate.doors.map((opening, index) => ({ id: opening.id, label: `Door ${index + 1}${opening.location ? ` · ${opening.location}` : ""}` })),
  ];
  const labels = new Map(lines.map((line) => [line.id, line.label]));

  useEffect(() => {
    if (!estimate.id) return;
    fetchEstimatePhotos(estimate.id).then(setPhotos).catch(() => setPhotos([]));
  }, [estimate.id]);

  async function upload(files: FileList | null) {
    if (!files?.length || !estimate.id) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const photo = await uploadEstimatePhoto(estimate.id, await shrinkImage(file), lineId, labels.get(lineId) || "");
        setPhotos((current) => [...current, photo]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The photo could not be uploaded.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(photo: EstimatePhoto) {
    if (!window.confirm("Delete this photo?")) return;
    try {
      await deleteEstimatePhoto(estimate.id, photo.id);
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The photo could not be deleted.");
    }
  }

  if (!estimate.id) return null;
  return (
    <div className="editor-card">
      <div className="card-heading"><div><p className="eyebrow">Site photos</p><h3>Openings &amp; conditions</h3></div><span className="count-badge">{photos.length}</span></div>
      <p className="project-help">Photos stay internal — they are never shown to the customer. Tag a photo with the opening it shows.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="project-field min-w-[12rem] flex-1"><span>Opening</span>
          <select className="project-input" value={lineId} onChange={(event) => setLineId(event.target.value)}>
            <option value="">General / whole job</option>
            {lines.map((line) => <option key={line.id} value={line.id}>{line.label}</option>)}
          </select>
        </label>
        <label className="button secondary cursor-pointer">
          {uploading ? "Uploading…" : "Take / add photos"}
          <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(event) => upload(event.target.files)} disabled={uploading} />
        </label>
      </div>
      {error ? <p className="project-error mt-2">{error}</p> : null}
      {photos.length ? (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.id} className="overflow-hidden rounded-lg border border-slate-200">
              <a href={photo.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.caption || "Site photo"} className="h-28 w-full object-cover" loading="lazy" />
              </a>
              <div className="flex items-center justify-between gap-1 px-2 py-1 text-xs">
                <span className="truncate text-slate-600">{(photo.line_id && labels.get(photo.line_id)) || photo.caption || "General"}</span>
                <button type="button" className="font-semibold text-rose-600 hover:underline" onClick={() => remove(photo)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
