"""PDF/JSON estimate import API."""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile

from api.schemas.quote import ImportResult
from services.import_pipeline import (
    import_estimate_file,
    import_uploads_batch,
    reprocess_estimate,
)
from utils.paths import UPLOADS_DIR, ensure_dirs

router = APIRouter(prefix="/api", tags=["import"])


@router.post("/import-estimate", response_model=ImportResult)
async def import_estimate(file: UploadFile = File(...)) -> ImportResult:
    ensure_dirs()
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".pdf", ".json"}:
        raise HTTPException(status_code=400, detail="Only PDF or JSON files supported")
    dest = UPLOADS_DIR / f"{uuid.uuid4().hex}_{Path(file.filename).name}"
    content = await file.read()
    dest.write_bytes(content)
    result = import_estimate_file(dest)
    return ImportResult(**result)


@router.post("/import-estimate/batch")
def import_batch() -> dict:
    results = import_uploads_batch()
    return {
        "processed": len(results),
        "results": results,
        "success": sum(1 for r in results if r.get("status") in ("success", "warning")),
        "failed": sum(1 for r in results if r.get("status") == "failed"),
    }


@router.post("/estimates/{estimate_id}/reprocess", response_model=ImportResult)
def reprocess(estimate_id: str) -> ImportResult:
    result = reprocess_estimate(estimate_id)
    if result.get("status") == "failed" and "not found" in " ".join(result.get("errors") or []).lower():
        raise HTTPException(status_code=404, detail=result.get("errors"))
    return ImportResult(**{k: result.get(k) for k in ImportResult.model_fields.keys()})
