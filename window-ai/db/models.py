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
