"""Toronto, Mississauga and Oakville permit sources, model names and variants."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from db.init_db import init_db
from db.session import reset_engine
from services.home_models import build_lineup, differences, group_neighbours, relation, subject_permit
from services.permits import PermitRecord, mississauga, oakville, source_for, toronto
from services.permits.model_names import model_key, parse_description, parse_legal

JAN_12_2023 = 1673568000000


# ------------------------------------------------------------------ model names
@pytest.mark.parametrize("text, model, key, elevation, flags", [
    ("Construction of a new two storey single detached dwelling. Model - C38E Thorncliffe - Elevation CN: 5bdrm. "
     "Options: Next Step W/Raised Basement Ceiling, 5 Bedroom Plan.", "C38E THORNCLIFFE", "C38E", "CN", {"raised_ceiling"}),
    ("New SFD, Model: 38-1. This Lot is Elev. &quot;C/4bdrm/alt 2nd flr&quot;, House area: 222.60m2", "38-1", "381", "C", set()),
    ('MODEL NAME "CORNER UNIT" ELEVATION "END" ', "CORNER UNIT", "CORNERUNIT", "END", {"corner", "end"}),
    ("Model: Olive, Elevation C", "OLIVE", "OLIVE", "C", set()),
    ("2-storey, 190.45 m2 Model: 'Wellwood Grande'", "WELLWOOD GRANDE", "WELLWOODGRANDE", None, set()),
    ("Model - Model F34B Coxland- Elevation TA ... Lookout Deck", "F34B COXLAND", "F34B", "TA", {"lookout"}),
    ("Model &ndash; C38A Brookdale Corner - Elevation FR", "C38A BROOKDALE CORNER", "C38A", "FR", {"corner"}),
    ("MODEL A45F, The Snapdragon, elevation EM, 4BR", "A45F", "A45F", "EM", set()),
    ("Model Oak 362 Glen Dale, elevation A reverse", "OAK 362 GLEN DALE", "OAK362", "A", {"reversed"}),
    ('Model &quot;Ridgevale 7&quot; Elevations 1 and 2. This lot Elev. 2', "RIDGEVALE 7", "RIDGEVALE7", "2", set()),
    ("Model 44-01 (The Anchor) w/ elev A, B, C ... Lot 17 Options: Elev. B ... rear LOB deck", "44-01", "4401", "B", {"lookout"}),
    ("Model 2602 - Oxford ... Lot 144 Right - Selected Options: Elevation A, Reversed layout", "2602 - OXFORD", "2602", "A", {"reversed"}),
    ("Model KTHC, The Laurel &ndash; Elev EM, FR, TA ... Blk 57-4 Opts: Elev FR", "KTHC", "KTHC", "FR", set()),
    ("Model DRLD The Chestnut End - Elevation TA", "DRLD THE CHESTNUT END", "DRLD", "TA", {"end"}),
    ("Construction of New 2 Story Residential Dwelling w. finished basement", None, "", None, set()),
])
def test_parse_description(text, model, key, elevation, flags):
    info = parse_description(text)
    assert info.model == model
    assert model_key(info.model) == key
    assert info.elevation == elevation
    assert set(info.flags) == flags


def test_repeat_of_parent_permit_and_lot_options():
    info = parse_description("REPEAT of model 42-03 (25-118155) Lot 9 Options: Elev. B, Third Flr Loft w/balcony, Bsmt Walk-up, Reverse layout")
    assert info.parent_permit == "25-118155"
    assert info.elevation == "B"
    assert set(info.flags) == {"loft", "walk_up", "reversed"}
    assert parse_description("Lot 76- Repat of Model F34C- The Giddings (25-107980), Elev TA").parent_permit == "25-107980"


def test_parse_legal():
    assert parse_legal("PLAN M1255 LOT 51") == ("M1255", "51")
    assert parse_legal("PLAN M1265 PT BLK 1 RP 20R22769 PART 2") == ("M1265", None)


# ------------------------------------------------------------------ variants
def _home(address, **fields) -> PermitRecord:
    base = dict(permit_number=f"P-{address}", address=address, address_key=address.upper(), dwelling_type="Single Family Detached Dwelling",
                work="New Construction", builder=None, gfa=283.0, storeys=2, bedrooms=None, issue_date=date(2023, 1, 12),
                lat=43.4588, lng=-79.7613, plan="M1255", new_build=True)
    return PermitRecord(**{**base, **fields})


def test_relation_uses_model_names_then_floor_area():
    subject = _home("3140 Harasym Trail", model="C38E THORNCLIFFE", elevation="CN")
    assert relation(subject, _home("1 A St", model="C38E Thorncliffe", elevation="CN", gfa=290)) == "same"
    assert relation(subject, _home("2 A St", model="C38E", elevation="FR")) == "similar"
    assert relation(subject, _home("3 A St", model="C38G WINDFIELD", gfa=283.0)) is None
    assert relation(subject, _home("4 A St", model="C38E THORNCLIFFE", plan="M1300")) is None  # another subdivision
    assert relation(subject, _home("5 A St", dwelling_type="Row or Town House", model="C38E")) is None
    no_names = _home("6 A St")
    assert relation(no_names, _home("7 A St", gfa=283.0)) == "same"
    assert relation(no_names, _home("8 A St", gfa=288.0)) == "similar"
    assert relation(no_names, _home("9 A St", gfa=300.0)) is None
    brampton = _home("10 A St", builder="MATTAMY HOMES", plan=None)
    assert relation(brampton, _home("11 A St", builder="GREENPARK", plan=None)) is None


def test_differences_flag_what_to_check_on_site():
    subject = _home("A", model="C38E", elevation="CN", flags=("corner",))
    other = _home("B", model="C38E", elevation="FR", flags=("reversed", "walk_out"), gfa=284.5)
    notes = differences(subject, other)
    assert "elevation FR (this home CN): front windows differ" in notes
    assert "mirror image: use mirrored" in notes
    assert "corner lot on this home only" in notes
    assert "walk-out basement on that home only" in notes
    assert "floor area 284.5 m² vs 283 m²" in notes


def test_lineup_lists_models_and_elevations_on_the_plan():
    subject = _home("3140 Harasym Trail", model="C38E THORNCLIFFE", elevation="CN")
    nearby = [
        _home("1 A St", model="C38E Thorncliffe", elevation="FR"),
        _home("2 A St", model="C38G WINDFIELD", elevation="CN", gfa=268.1),
        _home("3 A St", model="C38G Windfield", elevation="EM", gfa=268.9),
        _home("4 A St", model="C38G WINDFIELD", elevation="CN", gfa=300.9, flags=("reversed",)),
        _home("5 A St", model="C38H WOODBURY", elevation="FR", plan="M9999"),  # other plan: not in this lineup
        _home("6 A St", gfa=210.0), _home("7 A St", gfa=211.5), _home("8 A St", gfa=240.0),
    ]
    lineup = build_lineup(subject, nearby)
    assert lineup[0]["key"] == "C38E" and lineup[0]["includes_subject"] and lineup[0]["count"] == 2
    assert lineup[0]["elevations"] == {"CN": 1, "FR": 1}
    windfield = next(item for item in lineup if item["key"] == "C38G")
    assert windfield["count"] == 3 and windfield["gfa_min"] == 268.1 and windfield["gfa_max"] == 300.9
    assert windfield["elevations"] == {"CN": 2, "EM": 1} and windfield["flags"] == {"reversed": 1}
    unnamed = [item for item in lineup if item["model"] is None]
    assert [(item["gfa_min"], item["count"]) for item in unnamed] == [(210.0, 2), (240.0, 1)]
    assert not any(item["key"] == "C38H" for item in lineup)


# ------------------------------------------------------------------ Oakville
def _oakville_feature(name, description, gfa=283, *, legal="PLAN M1255 LOT 51", issued=JAN_12_2023, work="New Construction",
                      subtype="Single Family Detached Dwelling", folder=None):
    return {
        "attributes": {
            "CUSTOMFOLDERNUMBER": folder or f"2022 {abs(hash(name)) % 999999:06d} 000 00 RN", "FOLDERNAME": name,
            "FOLDERDESCRIPTION": description, "Subtype": subtype, "AdjustedWorktype": work, "ISSUEDATE": issued,
            "GFA": gfa, "Number_of_Storeys": 2, "LEGALDESC": legal, "Status": "Closed",
        },
        "geometry": {"x": -79.76135, "y": 43.45880},
    }


OAKVILLE = [
    _oakville_feature("3140 Harasym Trail", "Model - C38E Thorncliffe - Elevation CN: 5bdrm", folder="2022 132737 000 00 RN"),
    _oakville_feature("3144 Harasym Trail", "Model - C38E Thorncliffe - Elevation FR: 4bdrm. Options: Side Door Entry", gfa=285.2),
    _oakville_feature("3148 Harasym Trail", "Model - C38E Thorncliffe - Elevation CN, reversed layout"),
    _oakville_feature("3152 Harasym Trail", "Model - C38G Windfield - Elevation CN", gfa=268.1),
    _oakville_feature("3156 Harasym Trail", "Model - C38E Thorncliffe - Elevation CN", legal="PLAN M1300 LOT 2"),
]


def oakville_fetch(params):
    where = params["where"]
    if "LIKE" in where and "FOLDERNAME" in where:
        prefix = where.split("LIKE '")[1].rstrip("%'")
        return {"features": [f for f in OAKVILLE if f["attributes"]["FOLDERNAME"].upper().startswith(prefix)]}
    assert "geometry" in params and "New Construction" in where
    return {"features": OAKVILLE}


def test_oakville_source_parses_models_and_plan(monkeypatch):
    monkeypatch.setattr(oakville, "fetch_json", oakville_fetch)
    source = source_for("OAKVILLE")
    subject = subject_permit(source.lookup("3140 HARASYM TRAIL"))
    assert (subject.model, subject.elevation, subject.plan, subject.lot, subject.gfa) == ("C38E THORNCLIFFE", "CN", "M1255", "51", 283.0)
    assert subject.builder is None and subject.address == "3140 Harasym Trail, Oakville, ON"
    groups = group_neighbours(subject, source.nearby_new_builds(subject, 600))
    assert [r.address_key for r in groups["same"]] == ["3148 HARASYM TRAIL"]
    assert [r.address_key for r in groups["similar"]] == ["3144 HARASYM TRAIL"]
    assert "reversed" in groups["same"][0].flags


# ------------------------------------------------------------------ Mississauga
def test_mississauga_source_reads_plan_and_blank_plan():
    record = mississauga.parse_feature({
        "attributes": {"BuildingPermitNumber": "BP 9NEW 21 1", "IssuedDate": "2022-01-07", "BuildingPermitType": "Detached Dwelling",
                       "BuildingPermitScope": "New Building", "Address": "2087 Primate RD", "ResidentialGFA_m2": 256.13,
                       "ResidentialUnits": 1, "MPlanNumber": "M-2115"},
        "geometry": {"x": -79.7, "y": 43.6},
    })
    assert (record.address_key, record.gfa, record.plan, record.issue_date, record.is_new_build) == (
        "2087 PRIMATE RD", 256.13, "M-2115", date(2022, 1, 7), True)
    blank = mississauga.parse_feature({"attributes": {"Address": "1 A DR", "MPlanNumber": "\xa0", "BuildingPermitScope": "Alteration"}})
    assert blank.plan is None and not blank.is_new_build


# ------------------------------------------------------------------ Toronto
def _toronto_row(num, name, geo_id, gfa, **extra):
    return {
        "PERMIT_NUM": f"21 {geo_id} BLD", "REVISION_NUM": "00", "PERMIT_TYPE": "New Houses", "STRUCTURE_TYPE": "SFD - Townhouse",
        "WORK": "New Building", "STREET_NUM": num, "STREET_NAME": name, "STREET_TYPE": "ST", "STREET_DIRECTION": " ",
        "POSTAL": "M4M", "GEO_ID": str(geo_id), "ISSUED_DATE": "2021-06-21", "STATUS": "Closed",
        "DESCRIPTION": "new three storey townhouse", "RESIDENTIAL": gfa, "BUILDER_NAME": "LEWIS STREET INC", **extra,
    }


TORONTO_ROWS = [
    _toronto_row("45", "CUMMINGS", 101, 187.2),
    _toronto_row("43", "CUMMINGS", 102, 187.2),
    _toronto_row("43 B", "CUMMINGS", 103, 183.0),
    _toronto_row("12", "LEWIS", 104, 187.2, BUILDER_NAME="OTHER BUILDER"),
    _toronto_row("14", "LEWIS", 105, 187.2, STATUS="Cancelled"),
    _toronto_row("90", "FAR", 106, 187.2),
]
POINTS = {101: (-79.3461, 43.6628), 102: (-79.3462, 43.6629), 103: (-79.3463, 43.6630), 104: (-79.3460, 43.6627),
          105: (-79.3460, 43.6627), 106: (-79.30, 43.70)}


def toronto_fetch(params):
    if params["resource_id"] == toronto.ADDRESS_POINTS:
        ids = json.loads(params["filters"])["ADDRESS_POINT_ID"]
        return {"records": [{"ADDRESS_POINT_ID": i, "geometry": json.dumps({"type": "Point", "coordinates": list(POINTS[i])})} for i in ids]}
    if params["resource_id"] == toronto.ACTIVE:
        return {"records": []}
    wanted = json.loads(params["q"])
    return {"records": [row for row in TORONTO_ROWS if all(str(row[k]).split(" ")[0] == str(v).split(" ")[0] for k, v in wanted.items())]}


def test_toronto_source_joins_address_points_and_filters_neighbours(monkeypatch):
    monkeypatch.setattr(toronto, "fetch_json", toronto_fetch)
    source = source_for("TORONTO")
    assert source_for("NORTH YORK") is source and source_for("YORK REGION") is None
    subject = subject_permit(source.lookup("45 CUMMINGS ST"))
    assert (subject.gfa, subject.builder, subject.postal, subject.lat) == (187.2, "LEWIS STREET INC", "M4M", 43.6628)
    nearby = source.nearby_new_builds(subject, 600)
    keys = sorted(record.address_key for record in nearby)
    # Other builder, a cancelled permit and a far-away house are dropped.
    assert keys == ["43 CUMMINGS ST", "43B CUMMINGS ST", "45 CUMMINGS ST"]
    groups = group_neighbours(subject, nearby)
    assert [r.address_key for r in groups["same"]] == ["43 CUMMINGS ST"]
    assert [r.address_key for r in groups["similar"]] == ["43B CUMMINGS ST"]


# ------------------------------------------------------------------ API
def _client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'sources.db'}")
    monkeypatch.setattr(oakville, "fetch_json", oakville_fetch)
    reset_engine()
    init_db()
    from api.main import app

    return TestClient(app)


def _window():
    return {"id": "w1", "location": "Kitchen", "description": "",
            "spec": {"type": "window", "style": "WC-100", "width": 30, "height": 48, "qty": 3, "colour_ext": "white",
                     "glazing": {"loe180": True, "gas": "argon"}, "accessories": []}}


def test_oakville_model_template_matches_by_model_name(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    measured = client.post("/api/customer-estimates", json={
        "customer_name": "Measured", "project_address": "3148 Harasym Trail, Oakville, ON L6M 0W1", "windows": [_window()]}).json()
    saved = client.post(f"/api/home-models/from-estimate/{measured['id']}", json={})
    assert saved.status_code == 200, saved.text
    model = saved.json()
    assert (model["builder"], model["model_name"], model["elevation"], model["plan"]) == ("", "C38E THORNCLIFFE", "CN", "M1255")
    assert model["variant_flags"] == ["reversed"]

    match = client.get("/api/model-match", params={"address": "3140 Harasym Trail, Oakville, ON"}).json()
    assert match["source"]["key"] == "oakville" and "model name" in match["source"]["match_basis"]
    assert match["subject"]["label"] == "C38E Thorncliffe · elevation CN · 283 m² · 2-storey · single family detached dwelling"
    assert [(m["id"], m["relation"]) for m in match["home_models"]] == [(model["id"], "same")]
    assert match["home_models"][0]["differences"] == ["mirror image: use mirrored"]
    assert match["measured_jobs"][0]["estimate_id"] == measured["id"]
    assert match["lineup"][0]["key"] == "C38E" and match["lineup"][0]["count"] == 3

    # A house of the same model on another plan is not matched to the template.
    other = client.get("/api/model-match", params={"address": "3156 Harasym Trail, Oakville, ON"}).json()
    assert other["home_models"] == []
