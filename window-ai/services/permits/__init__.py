"""Municipal building-permit sources used to find same-model homes."""
from __future__ import annotations

from typing import Optional

from services.permits.base import PermitRecord, PermitSource, PermitSourceError, distance_m, dwelling_class
from services.permits.brampton import BramptonPermits
from services.permits.mississauga import MississaugaPermits
from services.permits.oakville import OakvillePermits
from services.permits.toronto import TorontoPermits

SOURCES: list[PermitSource] = [BramptonPermits(), TorontoPermits(), MississaugaPermits(), OakvillePermits()]


def source_for(city: Optional[str]) -> Optional[PermitSource]:
    return next((source for source in SOURCES if source.supports(city)), None)


def supported_cities() -> list[str]:
    return [source.label for source in SOURCES]


__all__ = [
    "PermitRecord", "PermitSource", "PermitSourceError", "SOURCES", "distance_m", "dwelling_class",
    "source_for", "supported_cities",
]
