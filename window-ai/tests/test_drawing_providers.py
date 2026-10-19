"""Drawing reader providers: Claude (default) and a local Ollama model.

No test reaches Ollama or Anthropic: HTTP calls go to a fake urlopen and the
Claude call is replaced.
"""
from __future__ import annotations

import base64
import io
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from db.init_db import init_db
from db.session import reset_engine
from services import drawing_extraction

TYPED = "living room: 3 casements 29x65, kitchen 28x51 right hinge"
TYPED_ANSWER = {
    "house_model": "", "builder": "",
    "windows": [
        {"tag": "", "elevation": "other", "location": "Living room", "operation": "casement", "width_in": 29,
         "height_in": 65, "size_basis": "unknown", "qty": 3, "confidence": "high", "note": ""},
        {"tag": "", "elevation": "other", "location": "Kitchen", "operation": "casement", "width_in": 28,
         "height_in": 51, "size_basis": "unknown", "qty": 1, "confidence": "medium", "note": "right hinge"},
    ],
    "doors": [], "warnings": [],
}
SCHEDULE_PAGE = {
    "house_model": "The Birch", "builder": "Mattamy Homes",
    "windows": [{"tag": "W1", "elevation": "other", "location": "", "operation": "casement", "width_in": 30,
                 "height_in": 48, "size_basis": "rough_opening", "qty": 4, "confidence": "high", "note": ""}],
    "doors": [], "warnings": [],
}
# What a small local model tends to return: loose enums, sizes as text.
ELEVATION_PAGE = {
    "house_model": "", "builder": "",
    "windows": [
        {"tag": "w1", "elevation": "Rear", "location": "Kitchen", "operation": "Casement", "width_in": "30",
         "height_in": 48, "size_basis": "rough opening", "qty": 2, "confidence": "High", "note": ""},
        {"tag": "", "elevation": "rear", "location": "Family room", "operation": "picture", "width_in": "59 1/2",
         "height_in": None, "size_basis": "unknown", "qty": 0, "confidence": "maybe", "note": "height illegible"},
    ],
    "doors": [{"elevation": "back", "location": "Dining", "kind": "patio_slider", "description": "2-panel slider",
               "width_in": 72, "height_in": 80, "confidence": "medium", "note": ""}],
    "warnings": ["Dimension strings are faint."],
}


class FakeOllama:
    """Stands in for urllib.request.urlopen against an Ollama server."""

    def __init__(self, *, models=("qwen2.5vl:7b", "qwen2.5:7b"), answers=(), down=False):
        self.models = list(models)
        self.answers = list(answers)
        self.down = down
        self.requests: list[dict] = []

    def __call__(self, request, timeout=None):
        body = json.loads(request.data) if request.data else None
        self.requests.append({"url": request.full_url, "method": request.get_method(), "body": body, "timeout": timeout})
        if self.down:
            raise urllib.error.URLError(ConnectionRefusedError(10061, "refused"))
        if request.full_url.endswith("/api/tags"):
            return io.BytesIO(json.dumps({"models": [{"name": name} for name in self.models]}).encode())
        if body["model"] not in self.models:
            raise urllib.error.HTTPError(request.full_url, 404, "Not Found", {},
                                         io.BytesIO(json.dumps({"error": f"model '{body['model']}' not found"}).encode()))
        answer = self.answers.pop(0)
        content = answer if isinstance(answer, str) else json.dumps(answer)
        return io.BytesIO(json.dumps({"message": {"role": "assistant", "content": content}, "done": True, "done_reason": "stop"}).encode())

    @property
    def chats(self):
        return [item for item in self.requests if item["url"].endswith("/api/chat")]


@pytest.fixture(autouse=True)
def reader_env(monkeypatch):
    for name in ["DRAWINGS_PROVIDER", "OLLAMA_URL", "OLLAMA_VISION_MODEL", "OLLAMA_TEXT_MODEL", "OLLAMA_TIMEOUT",
                 "OLLAMA_MAX_PAGES", "OLLAMA_PAGE_PX", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def ollama(monkeypatch):
    fake = FakeOllama()
    monkeypatch.setenv("DRAWINGS_PROVIDER", "ollama")
    monkeypatch.setattr(urllib.request, "urlopen", fake)
    return fake


@pytest.fixture
def fake_claude(monkeypatch):
    calls = []

    def claude_json(system, content, *, unavailable):
        calls.append({"system": system, "content": content})
        return calls_answer[0]

    calls_answer = [TYPED_ANSWER]
    monkeypatch.setattr(drawing_extraction, "_claude_json", claude_json)
    return calls


def _pdf(pages: int) -> bytes:
    pdfium = pytest.importorskip("pypdfium2")
    document = pdfium.PdfDocument.new()
    for _ in range(pages):
        document.new_page(1728, 1152)  # 24" x 16" sheet, in points
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


# ------------------------------------------------------------------ provider switch
def test_claude_is_the_default_provider(monkeypatch):
    fake = FakeOllama()
    monkeypatch.setattr(urllib.request, "urlopen", fake)
    status = drawing_extraction.status()
    assert status["provider"] == "claude" and status["model"] == drawing_extraction.MODEL
    assert status["available"] is False and "ANTHROPIC_API_KEY" in status["message"]
    assert status["background"] is False
    assert fake.requests == []  # Ollama is never contacted unless selected


def test_unknown_provider_falls_back_to_claude(monkeypatch):
    monkeypatch.setenv("DRAWINGS_PROVIDER", "gpt")
    assert drawing_extraction.provider() == "claude"


def test_provider_switch_routes_both_entry_points(monkeypatch, fake_claude):
    fake = FakeOllama(answers=[TYPED_ANSWER, SCHEDULE_PAGE])
    monkeypatch.setattr(urllib.request, "urlopen", fake)

    drawing_extraction.extract_from_text(TYPED)
    drawing_extraction.extract_openings(b"%PDF-1.7 fake")
    assert len(fake_claude) == 2 and fake.requests == []
    assert fake_claude[1]["content"][0]["type"] == "document"

    monkeypatch.setenv("DRAWINGS_PROVIDER", "ollama")
    drawing_extraction.extract_from_text(TYPED)
    drawing_extraction.extract_openings(_pdf(1))
    assert len(fake_claude) == 2
    assert [chat["body"]["model"] for chat in fake.chats] == ["qwen2.5:7b", "qwen2.5vl:7b"]


def test_ollama_status_reports_provider_and_models(ollama):
    status = drawing_extraction.status()
    assert status == {**status, "provider": "ollama", "model": "qwen2.5vl:7b", "text_model": "qwen2.5:7b",
                      "available": True, "text_available": True, "local": True, "background": True, "message": ""}
    assert ollama.requests[0]["url"] == "http://localhost:11434/api/tags" and ollama.requests[0]["timeout"] == 3


def test_ollama_status_names_the_missing_pull(ollama, monkeypatch):
    monkeypatch.setenv("OLLAMA_URL", "http://127.0.0.1:9999/")
    monkeypatch.setenv("OLLAMA_TEXT_MODEL", "llama3.2")
    ollama.models = ["qwen2.5:3b", "llama3.2:latest"]
    status = drawing_extraction.status()
    assert status["available"] is False and status["text_available"] is True
    assert status["message"] == "Pull the local model(s) first: ollama pull qwen2.5vl:7b"
    assert ollama.requests[0]["url"] == "http://127.0.0.1:9999/api/tags"


def test_ollama_status_when_ollama_is_not_running(ollama):
    ollama.down = True
    status = drawing_extraction.status()
    assert status["available"] is False and status["text_available"] is False
    assert "not running at http://localhost:11434" in status["message"]


# ------------------------------------------------------------------ drawings on Ollama
def test_ollama_reads_pages_one_at_a_time_and_merges(ollama):
    ollama.answers = [SCHEDULE_PAGE, ELEVATION_PAGE]
    progress = []
    result = drawing_extraction.extract_openings(_pdf(2), address="47 Brock Dr, Brampton",
                                                 progress=lambda page, pages: progress.append((page, pages)))

    assert progress == [(1, 2), (2, 2)]
    assert len(ollama.chats) == 2
    for number, chat in enumerate(ollama.chats, start=1):
        body = chat["body"]
        assert chat["timeout"] == drawing_extraction.DEFAULT_OLLAMA_TIMEOUT
        assert body["model"] == "qwen2.5vl:7b" and body["format"] == drawing_extraction.SCHEMA and body["stream"] is False
        assert body["messages"][0] == {"role": "system", "content": drawing_extraction.SYSTEM_PROMPT}
        user = body["messages"][1]
        assert f"page {number} of 2" in user["content"] and "47 Brock Dr" in user["content"]
        assert len(user["images"]) == 1
        png = base64.b64decode(user["images"][0])
        assert png.startswith(b"\x89PNG")
        width, height = int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")
        assert max(width, height) <= drawing_extraction.DEFAULT_PAGE_PX

    assert result["provider"] == "ollama" and result["model"] == "qwen2.5vl:7b"
    assert result["house_model"] == "The Birch" and result["builder"] == "Mattamy Homes"
    assert [door["page"] for door in result["doors"]] == [2]
    # Loose answers are coerced to the schema before they become rows.
    kitchen = result["windows"][1]
    assert kitchen == {**kitchen, "elevation": "back", "operation": "casement", "width_in": 30.0,
                       "size_basis": "rough_opening", "confidence": "high", "page": 2}
    family = result["windows"][2]
    assert family == {**family, "operation": "fixed", "width_in": 59.5, "height_in": None, "qty": 1, "confidence": "low"}

    rows = result["rows"]
    assert [row["location"] for row in rows] == [
        "other elevation · W1 · p.1", "Kitchen · back elevation · w1 · p.2", "Family room · back elevation · p.2"]
    assert rows[0] == {**rows[0], "style": "WC-100", "width": "30", "height": "48", "qty": "4", "roughOpening": True}
    assert rows[2]["height"] == "" and rows[2]["note"] == "height illegible"
    # The same mark read on two pages is flagged for the reviewer.
    assert "also read on p.2" in rows[0]["note"] and "also read on p.1" in rows[1]["note"]
    assert "Page 2: Dimension strings are faint." in result["warnings"]
    assert any("W1" in warning and "more than one page" in warning for warning in result["warnings"])


def test_ollama_skips_an_unreadable_page_with_a_warning(ollama):
    ollama.answers = [SCHEDULE_PAGE, "Sorry, I can't read this"]
    result = drawing_extraction.extract_openings(_pdf(2))
    assert len(result["rows"]) == 1
    assert result["warnings"] == ["Page 2 could not be read: the model's answer was not valid JSON."]


def test_ollama_fails_when_no_page_is_readable(ollama):
    ollama.answers = ["nope"]
    with pytest.raises(drawing_extraction.DrawingExtractionError, match="could not read any of the 1 page"):
        drawing_extraction.extract_openings(_pdf(1))


def test_ollama_limits_pages_before_calling_the_model(ollama, monkeypatch):
    monkeypatch.setenv("OLLAMA_MAX_PAGES", "1")
    with pytest.raises(drawing_extraction.DrawingExtractionError, match="has 2 pages"):
        drawing_extraction.extract_openings(_pdf(2))
    assert ollama.chats == []


def test_ollama_missing_model_says_what_to_pull(ollama):
    ollama.models = ["qwen2.5:3b"]
    with pytest.raises(drawing_extraction.DrawingExtractionError, match="ollama pull qwen2.5vl:7b"):
        drawing_extraction.extract_openings(_pdf(1))


def test_ollama_not_running(ollama):
    ollama.down = True
    with pytest.raises(drawing_extraction.DrawingExtractionError, match="Could not reach Ollama"):
        drawing_extraction.extract_from_text(TYPED)


# ------------------------------------------------------------------ typed descriptions
def test_typed_description_on_ollama_becomes_measure_rows(ollama, monkeypatch):
    monkeypatch.setenv("OLLAMA_TIMEOUT", "120")
    ollama.answers = [TYPED_ANSWER]
    result = drawing_extraction.extract_from_text(f"  {TYPED}  ")

    chat = ollama.chats[0]
    assert chat["timeout"] == 120
    assert chat["body"]["model"] == "qwen2.5:7b" and chat["body"]["format"] == drawing_extraction.SCHEMA
    assert chat["body"]["messages"] == [
        {"role": "system", "content": drawing_extraction.TEXT_SYSTEM_PROMPT}, {"role": "user", "content": TYPED}]
    assert result["model"] == "qwen2.5:7b"
    assert [(row["location"], row["style"], row["width"], row["height"], row["qty"]) for row in result["rows"]] == [
        ("Living room", "WC-100", "29", "65", "3"), ("Kitchen", "WC-100", "28", "51", "1")]
    assert result["rows"][1]["note"] == "right hinge"


def test_typed_description_on_claude(fake_claude, monkeypatch):
    result = drawing_extraction.extract_from_text(TYPED)
    assert fake_claude == [{"system": drawing_extraction.TEXT_SYSTEM_PROMPT, "content": [{"type": "text", "text": TYPED}]}]
    assert result["provider"] == "claude" and len(result["rows"]) == 2


def test_typed_description_must_not_be_empty(ollama):
    with pytest.raises(drawing_extraction.DrawingExtractionError, match="Type the windows"):
        drawing_extraction.extract_from_text("   ")
    assert ollama.requests == []


# ------------------------------------------------------------------ API
@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'drawings.db'}")
    reset_engine()
    init_db()
    from api.main import app

    return TestClient(app)


def _wait(client: TestClient, job_id: str) -> dict:
    deadline = time.time() + 10
    while time.time() < deadline:
        job = client.get(f"/api/drawings/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.05)
    raise AssertionError("drawing job did not finish")


def test_status_route_reports_provider(client, ollama):
    body = client.get("/api/drawings/status").json()
    assert body["provider"] == "ollama" and body["model"] == "qwen2.5vl:7b" and body["available"] is True


def test_typed_route_and_background_jobs(client, ollama):
    ollama.answers = [TYPED_ANSWER, SCHEDULE_PAGE, TYPED_ANSWER]
    typed = client.post("/api/drawings/extract-text", data={"text": TYPED})
    assert typed.status_code == 200 and len(typed.json()["rows"]) == 2

    started = client.post("/api/drawings/jobs", files={"file": ("plans.pdf", _pdf(1), "application/pdf")},
                          data={"address": "47 Brock Dr"})
    assert started.status_code == 202
    job = _wait(client, started.json()["job_id"])
    assert job["status"] == "done" and job["kind"] == "drawings" and (job["page"], job["pages"]) == (1, 1)
    assert job["result"]["rows"][0]["location"] == "other elevation · W1 · p.1"

    text_job = _wait(client, client.post("/api/drawings/jobs", data={"text": TYPED}).json()["job_id"])
    assert text_job["status"] == "done" and text_job["result"]["rows"][0]["qty"] == "3"


def test_job_errors_are_reported(client, ollama):
    rejected = client.post("/api/drawings/jobs", files={"file": ("plans.pdf", b"hello", "application/pdf")})
    assert rejected.status_code == 422 and "not a PDF" in rejected.json()["detail"]

    ollama.down = True
    job = _wait(client, client.post("/api/drawings/jobs", data={"text": TYPED}).json()["job_id"])
    assert job["status"] == "error" and "Could not reach Ollama" in job["error"]
    assert client.get("/api/drawings/jobs/unknown").status_code == 404
