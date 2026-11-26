"""
Modèles SQLAlchemy pour DistribDZ :
- Wilaya (extensible dynamiquement aux 58 wilayas d'Algérie)
- User (Admin / Producteur + attribution de territoires)
- Store (Fiches magasins enrichies + détection de doublons + géolocalisation)
- Lead & LeadHistory (Suivi commercial CRM)
- ScrapingJob (Historique des extractions Google Maps)
"""
from datetime import datetime, timezone
import math
import secrets
import unicodedata
import re
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from app import db, login_manager

# Table d'association pour la gestion des territoires assignés aux producteurs/commerciaux
user_territories = db.Table(
    "user_territories",
    db.Column("user_id", db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    db.Column("wilaya_id", db.Integer, db.ForeignKey("wilayas.id", ondelete="CASCADE"), primary_key=True),
)


def utcnow():
    return datetime.now(timezone.utc)


def normalize_store_key(name: str, wilaya_id: int) -> str:
    """Normalise le nom d'un magasin pour empêcher les doublons dans une même wilaya."""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z0-9]+", " ", ascii_only.lower()).strip()
    return f"{wilaya_id}::{cleaned}"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcule la distance orthodromique en kilomètres entre deux points GPS."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return round(r * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))), 2)


class Wilaya(db.Model):
    __tablename__ = "wilayas"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(4), unique=True, nullable=False)
    name = db.Column(db.String(100), unique=True, nullable=False)
    name_ar = db.Column(db.String(100), nullable=False)
    region = db.Column(db.String(20), nullable=False)  # Est, Centre, Ouest, Sud
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    is_active = db.Column(db.Boolean, default=False, nullable=False)
    priority_order = db.Column(db.Integer, default=99, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    stores = db.relationship("Store", back_populates="wilaya", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "name_ar": self.name_ar,
            "region": self.region,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "is_active": self.is_active,
            "store_count": self.stores.count(),
        }


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(180), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    full_name = db.Column(db.String(150), nullable=False)
    role = db.Column(db.String(20), default="producer", nullable=False)  # admin | producer
    company_name = db.Column(db.String(180))
    sector = db.Column(db.String(180))
    phone = db.Column(db.String(40))
    preferred_wilaya_id = db.Column(db.Integer, db.ForeignKey("wilayas.id"))
    preferred_store_types = db.Column(db.String(200), default="superette,magasin_gros")
    api_token = db.Column(db.String(64), unique=True, index=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    territories = db.relationship(
        "Wilaya",
        secondary=user_territories,
        lazy="subquery",
        backref=db.backref("assigned_users", lazy=True),
    )

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def issue_api_token(self) -> str:
        self.api_token = secrets.token_hex(32)
        return self.api_token

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def get_id(self):
        return str(self.id)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "company_name": self.company_name,
            "sector": self.sector,
            "phone": self.phone,
            "territories": [w.name for w in self.territories],
            "is_active": self.is_active,
        }


@login_manager.user_loader
def load_user(user_id):
    user = db.session.get(User, int(user_id))
    if user and user.is_active:
        return user
    return None


class Store(db.Model):
    __tablename__ = "stores"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    normalized_key = db.Column(db.String(240), unique=True, nullable=False)
    wilaya_id = db.Column(db.Integer, db.ForeignKey("wilayas.id"), nullable=False, index=True)
    store_type = db.Column(db.String(40), nullable=False, index=True)
    address = db.Column(db.String(300))
    phone = db.Column(db.String(60))
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    rating = db.Column(db.Float)
    review_count = db.Column(db.Integer, default=0)
    opening_hours = db.Column(db.String(180))
    google_maps_url = db.Column(db.String(350))

    # Champs B2B enrichis
    main_products = db.Column(db.String(350))
    approx_surface_m2 = db.Column(db.Integer)
    clientele_type = db.Column(db.String(150))
    photo_url = db.Column(db.String(300))
    source = db.Column(db.String(80), default="Google Maps")

    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    wilaya = db.relationship("Wilaya", back_populates="stores")

    @property
    def quality_score(self) -> int:
        score = 20
        if self.address:
            score += 15
        if self.phone:
            score += 20
        if self.opening_hours:
            score += 15
        if self.rating is not None:
            score += 10
        if self.main_products:
            score += 10
        if self.approx_surface_m2:
            score += 5
        if self.clientele_type:
            score += 5
        return min(100, score)

    def to_dict(self, distance_km=None):
        return {
            "id": self.id,
            "name": self.name,
            "wilaya_id": self.wilaya_id,
            "wilaya_code": self.wilaya.code if self.wilaya else None,
            "wilaya_name": self.wilaya.name if self.wilaya else None,
            "store_type": self.store_type,
            "address": self.address,
            "phone": self.phone,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "rating": self.rating,
            "review_count": self.review_count,
            "opening_hours": self.opening_hours,
            "google_maps_url": self.google_maps_url,
            "main_products": self.main_products,
            "approx_surface_m2": self.approx_surface_m2,
            "clientele_type": self.clientele_type,
            "photo_url": self.photo_url,
            "quality_score": self.quality_score,
            "distance_km": distance_km,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Lead(db.Model):
    __tablename__ = "leads"
    __table_args__ = (db.UniqueConstraint("user_id", "store_id", name="uq_user_store_lead"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    store_id = db.Column(db.Integer, db.ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    status = db.Column(db.String(30), nullable=False)  # interesse | contacte | client | non_interesse
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    store = db.relationship("Store")
    history = db.relationship(
        "LeadHistory", back_populates="lead", order_by="LeadHistory.created_at.desc()", cascade="all, delete-orphan"
    )


class LeadHistory(db.Model):
    __tablename__ = "lead_history"

    id = db.Column(db.Integer, primary_key=True)
    lead_id = db.Column(db.Integer, db.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    status = db.Column(db.String(30), nullable=False)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utcnow)

    lead = db.relationship("Lead", back_populates="history")


class ScrapingJob(db.Model):
    __tablename__ = "scraping_jobs"

    id = db.Column(db.Integer, primary_key=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    wilaya_names = db.Column(db.String(300), nullable=False)
    categories = db.Column(db.String(200), nullable=False)
    found_count = db.Column(db.Integer, default=0)
    inserted_count = db.Column(db.Integer, default=0)
    duplicate_count = db.Column(db.Integer, default=0)
    status = db.Column(db.String(30), default="termine")
    created_at = db.Column(db.DateTime, default=utcnow)
