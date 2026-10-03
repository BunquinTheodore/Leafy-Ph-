"""Import every model so Base.metadata is complete for Alembic and tests."""

from app.db.models.catalog import (
    Disease,
    DiseaseAffectedSpecies,
    DiseaseEntry,
    DiseaseImage,
    EntryKind,
    PathogenType,
    Plant,
)
from app.db.models.scan import Scan, ScanFeedback, ScanStage, ScanStatus, ScanVerdict
from app.db.models.tokens import AuthToken, AuthTokenType, RefreshToken, StorageDeletion
from app.db.models.user import OAuthIdentity, OAuthProvider, User

__all__ = [
    "AuthToken",
    "AuthTokenType",
    "Disease",
    "DiseaseAffectedSpecies",
    "DiseaseEntry",
    "DiseaseImage",
    "EntryKind",
    "OAuthIdentity",
    "OAuthProvider",
    "PathogenType",
    "Plant",
    "RefreshToken",
    "Scan",
    "ScanFeedback",
    "ScanStage",
    "ScanStatus",
    "ScanVerdict",
    "StorageDeletion",
    "User",
]
