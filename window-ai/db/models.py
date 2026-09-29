"""SQLAlchemy models for estimates, windows, and import audit logs."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


# JSONB on Postgres, plain JSON elsewhere (sqlite for local/tests)
JSONType = JSON().with_variant(JSONB(), "postgresql")


class Estimate(Base):
    __tablename__ = "estimates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    customer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    project_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    salesperson: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    estimate_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    total_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    source_filename: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    source_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    parsed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    raw_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONType, nullable=True)

    windows: Mapped[list["Window"]] = relationship(
        "Window", back_populates="estimate", cascade="all, delete-orphan"
    )
    import_logs: Mapped[list["ImportLog"]] = relationship(
        "ImportLog", back_populates="estimate"
    )

    __table_args__ = (Index("ix_estimates_estimate_date", "estimate_date"),)


class Window(Base):
    __tablename__ = "windows"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimates.id", ondelete="CASCADE"), nullable=False
    )
    window_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    width: Mapped[Optional[float]] = mapped_column(Numeric(10, 3), nullable=True)
    height: Mapped[Optional[float]] = mapped_column(Numeric(10, 3), nullable=True)
    area: Mapped[Optional[float]] = mapped_column(Numeric(12, 3), nullable=True)
    perimeter: Mapped[Optional[float]] = mapped_column(Numeric(12, 3), nullable=True)
    aspect_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    oversized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    wide_window: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tall_window: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    frame: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    glass: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    grid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tempered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    shape: Mapped[str] = mapped_column(String(64), default="Rectangular", nullable=False)
    installation: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    hardware: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Manufacturer options that drive price on Window City / Keystone orders
    brickmould: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    wood_jamb: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    screen: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mulled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    nailing_flange: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    gas_fill: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    spacer: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    low_e: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    interior_finish: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    exterior_finish: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    glass_layers: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Unknown / unmapped fields — never throw information away
    extras: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONType, nullable=True)
    unit_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    line_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    is_valid_for_training: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    estimate: Mapped["Estimate"] = relationship("Estimate", back_populates="windows")

    __table_args__ = (
        Index("ix_windows_type_frame_glass", "type", "frame", "glass"),
        Index("ix_windows_estimate_id", "estimate_id"),
        Index("ix_windows_type_price", "type", "unit_price"),
    )


class ImportLog(Base):
    __tablename__ = "import_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    source_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)  # success|failed|warning
    estimate_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimates.id", ondelete="SET NULL"), nullable=True
    )
    estimate_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    window_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warnings: Mapped[Optional[list[Any]]] = mapped_column(JSONType, nullable=True)
    errors: Mapped[Optional[list[Any]]] = mapped_column(JSONType, nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    estimate: Mapped[Optional["Estimate"]] = relationship(
        "Estimate", back_populates="import_logs"
    )

    __table_args__ = (
        Index("ix_import_logs_status", "status"),
        Index("ix_import_logs_created_at", "created_at"),
    )


class QuoteRecord(Base):
    """Immutable deterministic quote request/result audit record."""

    __tablename__ = "quote_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    price_book_version: Mapped[str] = mapped_column(String(128), nullable=False)
    config_version: Mapped[str] = mapped_column(String(64), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="CAD", nullable=False)
    review_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    input_spec: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    result_json: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    outcome: Mapped[Optional["QuoteOutcome"]] = relationship(
        "QuoteOutcome", back_populates="quote", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_quote_records_created_at", "created_at"),)


class QuoteOutcome(Base):
    """Approved/actual amounts captured separately from predicted quote data."""

    __tablename__ = "quote_outcomes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quote_records.id", ondelete="CASCADE"), nullable=False
    )
    actual_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    actual_material: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    actual_install: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    actual_sell: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    actual_hst: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    source_estimate_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimates.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    quote: Mapped["QuoteRecord"] = relationship("QuoteRecord", back_populates="outcome")


class CustomerEstimate(Base):
    """Saved customer-facing project estimate, separate from imported history."""

    __tablename__ = "customer_estimates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_number: Mapped[Optional[str]] = mapped_column(
        String(32), unique=True, nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    company_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    project_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    project_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    salesperson: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    estimate_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    terms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    windows: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list, nullable=False)
    doors: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list, nullable=False)
    commercial: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)
    pricing_snapshot: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONType, nullable=True)
    pricing_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finalized_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Job scope beyond the products, tax jurisdiction, and option tiers.
    province: Mapped[str] = mapped_column(String(8), default="ON", nullable=False)
    adders: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list, nullable=False)
    tiers: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list, nullable=False)
    selected_tier: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Sales lifecycle after finalization.
    public_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    viewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    acceptance: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONType, nullable=True)
    lost_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    lost_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    follow_up_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    revision_of: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    revision_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # The CRM opportunity and contact this project was started from, so the
    # CRM can import it without matching customers by name.
    crm_opportunity_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    crm_contact_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Normalised street address ("47 BROCK DR") for finding jobs on
    # same-model homes (services/address_key.py).
    address_key: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    # Openings copied from a same-model home instead of a site measure.
    home_model_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_preliminary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("ix_customer_estimates_status", "status"),
        Index("ix_customer_estimates_updated_at", "updated_at"),
        Index("ix_customer_estimates_crm_opportunity_id", "crm_opportunity_id"),
        Index("ix_customer_estimates_address_key", "address_key"),
    )


class EstimateEvent(Base):
    """Activity timeline for a customer estimate (priced, sent, viewed, ...)."""

    __tablename__ = "estimate_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    estimate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customer_estimates.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    detail: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_estimate_events_estimate_id", "estimate_id"),)


class EstimatePhoto(Base):
    """Site photo attached to an estimate, optionally tied to one line."""

    __tablename__ = "estimate_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    estimate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customer_estimates.id", ondelete="CASCADE"), nullable=False
    )
    line_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    caption: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_estimate_photos_estimate_id", "estimate_id"),)


class AppSetting(Base):
    """Business settings edited in the app (sales presets, tax, financing...)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONType, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class JobAdder(Base):
    """Priced job-scope item beyond the products (disposal, capping, permits)."""

    __tablename__ = "job_adders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(64), default="General", nullable=False)
    # per_job | per_opening | per_window | per_door | each
    unit: Mapped[str] = mapped_column(String(32), default="each", nullable=False)
    cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class LineTemplate(Base):
    """Saved favourite configuration or whole-estimate package."""

    __tablename__ = "line_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # window | door | estimate
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PermitLookupCache(Base):
    """Cached answers from a city's permit service (they rarely change)."""

    __tablename__ = "permit_lookup_cache"

    # "<source>:<kind>:<query>", e.g. "brampton:address:47 BROCK DR"
    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    payload: Mapped[Any] = mapped_column(JSONType, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HomeModel(Base):
    """One builder house model's openings, reused for every home of that model.

    A model is identified from permit data: same builder, dwelling type and
    gross floor area. The openings come from a measured job, the permit
    drawings, or manual entry.
    """

    __tablename__ = "home_models"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_city: Mapped[str] = mapped_column(String(32), default="brampton", nullable=False)
    # "" where the city records no builder (Oakville, Mississauga).
    builder: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    dwelling_type: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    # 0 when the permit gave no floor area (the model name identifies it).
    gfa: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    storeys: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Named in some cities' permits ("C38E THORNCLIFFE", elevation "CN").
    model_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    elevation: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    # Registered plan of subdivision ("M1255").
    plan: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    # reversed / corner / end / walk_out ... of the home the openings came from.
    variant_flags: Mapped[list[str]] = mapped_column(JSONType, default=list, nullable=False)
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    label: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    windows: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list, nullable=False)
    doors: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list, nullable=False)
    # measured | permit_pdf | manual
    source: Mapped[str] = mapped_column(String(16), default="measured", nullable=False)
    # The home the openings were taken from; others of the model may be mirrored.
    source_address: Mapped[str] = mapped_column(Text, default="", nullable=False)
    source_estimate_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_home_models_builder", "builder"),)


class PriceBookVersion(Base):
    """An imported supplier price-book dataset; the active one overrides the file."""

    __tablename__ = "price_book_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # e.g. "windowcity/windows" or "doors/fiberglass"
    dataset: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    data: Mapped[Any] = mapped_column(JSONType, nullable=False)
    summary: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONType, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_price_book_versions_dataset", "dataset"),)


class CustomerEstimateCounter(Base):
    """Per-year sequence used to assign finalized customer estimate numbers."""

    __tablename__ = "customer_estimate_counters"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
