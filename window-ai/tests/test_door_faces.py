"""Door slab faces (config/door_faces.json, services/doors/faces.py): every model is drawn as its design."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.doors import faces
from services.doors.pipeline import door_drawing, pipeline_catalog, resolve, PipelineError
from services.doors.pricing import load_config, quote

CFG = load_config()
CATALOG = pipeline_catalog(CFG)
ROOT = Path(__file__).resolve().parents[1]


def _selection(material: str, model: str, **overrides) -> dict:
    height = next(m for m in CATALOG["materials"][material]["models"] if m["key"] == model)["offers"][0]["height"]
    black = {"type": "painted", "colour": "Black"}
    selection = {
        "material": material, "width": 36, "height": height, "configuration": "single", "frame_depth": "4.625", "model": model,
        "colours": {"exterior": black, "interior": black}, "glass": {"door": {"glazed": False}}, "standard": {"lock": "double_bore"},
    }
    selection.update(overrides)
    return selection


def _spec(selection: dict) -> dict:
    return {"label": "Front entry", "material": selection["material"], "opening_type": "single_door", "pipeline": selection}


def test_every_catalog_model_has_a_face_and_nothing_else_does():
    for material in ("fiberglass", "steel"):
        keys = {model["key"] for model in CATALOG["materials"][material]["models"]}
        assert keys == set(faces.library()["models"][material]), material


def test_faces_stay_inside_the_slab():
    lib = faces.library()
    groups = [face["elements"] for face in lib["faces"].values()]
    groups += [faces._expand(item) for group in lib["patterns"].values() for item in group["items"].values()]
    for elements in groups:
        for element in elements:
            x, y, w, h = faces.element_box(element)
            assert 0 <= x and 0 <= y and x + w <= 1.0001 and y + h <= 1.0001, element
            for plank in element.get("planks") or []:
                assert element["x"] < plank < element["x"] + element["w"], element


def test_the_browser_reads_the_same_library():
    assert json.loads((ROOT / "frontend/lib/doorFaces.data.json").read_text(encoding="utf-8")) == faces.library()


def test_named_designs_draw_their_shapes():
    plank = faces.door_face("fiberglass", "1-panel-true-plank-dratp")
    assert plank["key"] == "true_plank" and len(plank["elements"]) == 6  # 7 boards
    assert [e["t"] for e in faces.door_face("steel", "linea")["elements"]] == ["slot"] * 5
    assert all(e.get("taper") for e in faces.door_face("steel", "tao")["elements"])
    craftsman = faces.door_face("fiberglass", "craftsman-3p-below-glass-fg4h")["elements"]
    assert len(craftsman) == 4 and all(e["s"] == "shaker" for e in craftsman)
    assert faces.door_face("fiberglass", "2-panel-arch-top-dra2d")["elements"][0]["top"] == "arch"
    assert faces.door_face("steel", "flush")["elements"] == []
    assert faces.door_face("steel", "no-such-door") is None


def test_grooved_and_stainless_oak_take_a_pattern():
    default = faces.door_face("fiberglass", "contemporary-grooved-og-gr")
    assert default["pattern"] == {"code": "WC03", "label": "Four lines", "chosen": False} and len(default["elements"]) == 4
    vertical = faces.door_face("fiberglass", "contemporary-grooved-og-8-gr", "WC07")["elements"]
    assert len(vertical) == 12 and all(e["x1"] == e["x2"] for e in vertical)
    assert len(faces.door_face("fiberglass", "contemporary-grooved-og-gr", "WC05")["elements"]) == 13
    assert len(faces.door_face("fiberglass", "contemporary-grooved-og-gr", "WC06")["elements"]) == 14  # 13 lines + side groove
    inlays = faces.door_face("fiberglass", "contemporary-stainless-steel-og-ss", "WGSS04")["elements"]
    assert {e["t"] for e in inlays} == {"i"} and len(inlays) == 5
    assert [d["code"] for d in faces.slab_designs("fiberglass", "contemporary-stainless-steel-og-8-ss")] == ["WGSS01", "WGSS02", "WGSS03", "WGSS04"]
    assert faces.slab_designs("steel", "london") == []


def test_the_drawing_carries_the_face_and_glass_takes_a_panels_place():
    solid = door_drawing(_spec(_selection("steel", "london")))
    assert solid["face"]["key"] == "london" and len(solid["face"]["elements"]) == 2

    lite = _selection("steel", "london", glass={"door": {"glazed": True, "size": "22x36", "family": "clear"}})
    glazed = door_drawing(_spec(lite))
    # The 22x36 lite takes the top panel's place; the lower panel stays.
    assert len(glazed["face"]["elements"]) == 1 and glazed["face"]["elements"][0]["y"] > 0.5
    # A half-moon over a blank-top door only clips the panels below it: all four stay.
    moon = _selection("steel", "4-panel-bt", glass={"door": {"glazed": True, "size": "Half-Moon", "family": "clear"}})
    assert len(door_drawing(_spec(moon))["face"]["elements"]) == 4


def test_a_slab_design_is_checked_noted_and_drawn():
    grooved = _selection("fiberglass", "contemporary-grooved-og-gr", slab_design="WC07")
    geometry = door_drawing(_spec(grooved))
    assert geometry["face"]["pattern"]["code"] == "WC07" and geometry["face"]["pattern"]["chosen"]
    notes = resolve(grooved, CFG)["notes"]
    assert any(note.startswith("Groove pattern WC07 (Vertical lines). Palma prices every Grooved Oak pattern") for note in notes)

    unpicked = resolve(_selection("fiberglass", "contemporary-grooved-og-gr"), CFG)["notes"]
    assert any("WC03 (Four lines), drawn by default" in note for note in unpicked)

    with pytest.raises(PipelineError, match="has no slab design WGSS01"):
        resolve(_selection("fiberglass", "contemporary-grooved-og-gr", slab_design="WGSS01"), CFG)
    with pytest.raises(PipelineError, match="has no slab design WC07"):
        resolve(_selection("steel", "london", slab_design="WC07"), CFG)

    from services.doors.pipeline import pipeline_spec_lines

    assert "Door slab: 36\" Fiberglass - Contemporary Grooved · OG-GR - Groove pattern WC07 (Vertical lines) - Solid" in pipeline_spec_lines(grooved)

    # One price whatever the pattern.
    prices = {code: quote(_spec(_selection("fiberglass", "contemporary-grooved-og-gr", slab_design=code)), CFG)["sell"] for code in ("WC01", "WC07")}
    assert prices["WC01"] == prices["WC07"]


def test_the_pdf_draws_every_model():
    from services.estimate_documents import door_drawing_flowable

    for material in ("fiberglass", "steel"):
        for model in CATALOG["materials"][material]["models"]:
            for code in [d["code"] for d in model["slab_designs"]] or [None]:
                geometry = door_drawing(_spec(_selection(material, model["key"], slab_design=code)))
                drawing = door_drawing_flowable(geometry, 90, 180)
                assert drawing is not None
                # Slab + brickmould + frame + hinges + handle + sill, plus at least one shape per face element.
                assert len(drawing.contents) >= 9 + len(geometry["face"]["elements"]), model["key"]


def test_the_browser_parity_fixture_is_current():
    """frontend/lib/__tests__/doorFaces.test.ts checks lib/doorFaces.ts resolves every model to these faces."""
    current = {}
    for material, models in faces.library()["models"].items():
        for model in models:
            for code in [d["code"] for d in faces.slab_designs(material, model)] or [None]:
                current[f"{material}/{model}/{code or ''}"] = faces.door_face(material, model, code)
    path = ROOT / "frontend/lib/__tests__/doorFaces.expected.json"
    assert json.loads(path.read_text(encoding="utf-8")) == current, (
        "Regenerate doorFaces.expected.json: json.dump(current, open(path, 'w'), indent=0, sort_keys=True)"
    )
