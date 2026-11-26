"""
Blueprint API REST v1 (/api/v1/*) :
Conçu pour alimenter aussi bien le front web que la future application mobile (React Native / Flutter).
Authentification par jeton Bearer.
"""
from functools import wraps
from flask import Blueprint, jsonify, request
from app import db
from app.models import Store, User, Wilaya, haversine_km
from app.services.matching import build_dashboard_stats

api_bp = Blueprint("api", __name__)


def token_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Jeton Bearer requis."}), 401
        token = auth_header[7:].strip()
        user = User.query.filter_by(api_token=token, is_active=True).first()
        if not user:
            return jsonify({"error": "Jeton invalide ou compte désactivé."}), 401
        return fn(user, *args, **kwargs)

    return wrapper


@api_bp.route("/auth/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password) or not user.is_active:
        return jsonify({"error": "Identifiants invalides."}), 401
    if not user.api_token:
        user.issue_api_token()
        db.session.commit()
    return jsonify({"token": user.api_token, "user": user.to_dict()})


@api_bp.route("/auth/logout", methods=["POST"])
@token_required
def api_logout(user):
    user.api_token = None
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.route("/wilayas", methods=["GET"])
def api_wilayas():
    show_all = request.args.get("all") == "1"
    q = Wilaya.query if show_all else Wilaya.query.filter_by(is_active=True)
    wilayas = q.order_by(Wilaya.is_active.desc(), Wilaya.priority_order, Wilaya.code).all()
    return jsonify({"wilayas": [w.to_dict() for w in wilayas]})


@api_bp.route("/stores", methods=["GET"])
@token_required
def api_stores(user):
    wilaya_id = request.args.get("wilaya_id", type=int)
    store_type = request.args.get("store_type", "").strip()
    min_rating = request.args.get("min_rating", type=float)
    q = request.args.get("q", "").strip()
    has_phone = request.args.get("has_phone") == "1"

    query = Store.query.join(Wilaya).filter(Wilaya.is_active.is_(True))
    if wilaya_id:
        query = query.filter(Store.wilaya_id == wilaya_id)
    if store_type:
        query = query.filter(Store.store_type == store_type)
    if min_rating is not None:
        query = query.filter(Store.rating >= min_rating)
    if has_phone:
        query = query.filter(Store.phone.isnot(None), Store.phone != "")
    if q:
        like = f"%{q}%"
        query = query.filter(Store.name.ilike(like) | Store.address.ilike(like))

    stores = query.order_by(Store.rating.desc().nullslast()).all()
    return jsonify({"total": len(stores), "stores": [s.to_dict() for s in stores]})


@api_bp.route("/stores/<int:store_id>", methods=["GET"])
@token_required
def api_store_detail(user, store_id):
    store = db.session.get(Store, store_id)
    if not store:
        return jsonify({"error": "Magasin introuvable."}), 404
    return jsonify({"store": store.to_dict()})


@api_bp.route("/stores/wilaya/<wilaya_code>", methods=["GET"])
@token_required
def api_stores_by_wilaya(user, wilaya_code):
    wilaya = Wilaya.query.filter_by(code=wilaya_code).first()
    if not wilaya:
        return jsonify({"error": "Wilaya introuvable."}), 404
    stores = Store.query.filter_by(wilaya_id=wilaya.id).all()
    return jsonify({"wilaya": wilaya.to_dict(), "stores": [s.to_dict() for s in stores]})


@api_bp.route("/stores/nearby", methods=["GET"])
@token_required
def api_stores_nearby(user):
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    radius_km = request.args.get("radius_km", default=30.0, type=float)
    if lat is None or lng is None:
        return jsonify({"error": "Paramètres lat et lng requis."}), 400

    stores = Store.query.join(Wilaya).filter(Wilaya.is_active.is_(True)).all()
    nearby = []
    for s in stores:
        dist = haversine_km(lat, lng, s.latitude, s.longitude)
        if dist <= radius_km:
            nearby.append(s.to_dict(distance_km=dist))
    nearby.sort(key=lambda x: x["distance_km"])
    return jsonify({"total": len(nearby), "stores": nearby})


@api_bp.route("/stats", methods=["GET"])
@token_required
def api_stats(user):
    return jsonify(build_dashboard_stats())
