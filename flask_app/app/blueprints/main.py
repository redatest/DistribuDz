"""
Blueprint principal : Tableau de bord, répertoire des magasins, carte interactive,
fiche magasin enrichie, suivi de leads CRM et export CSV/Excel.
"""
from flask import Blueprint, Response, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from app import db
from app.models import Lead, LeadHistory, Store, Wilaya, haversine_km
from app.services.matching import (
    build_dashboard_stats,
    compute_recommendations,
    export_stores_csv_bytes,
    export_stores_xlsx_bytes,
)

main_bp = Blueprint("main", __name__)


def _query_filtered_stores():
    """Applique les filtres de recherche avancés depuis les paramètres GET."""
    wilaya_id = request.args.get("wilaya_id", type=int)
    store_type = request.args.get("store_type", "").strip()
    q = request.args.get("q", "").strip().lower()
    min_rating = request.args.get("min_rating", type=float)
    has_phone = request.args.get("has_phone") == "1"
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    radius_km = request.args.get("radius_km", default=50.0, type=float)

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
        query = query.filter(
            db.or_(
                Store.name.ilike(like),
                Store.address.ilike(like),
                Store.main_products.ilike(like),
            )
        )

    stores = query.order_by(Store.rating.desc().nullslast()).all()
    if lat is not None and lng is not None:
        stores = [
            s for s in stores if haversine_km(lat, lng, s.latitude, s.longitude) <= radius_km
        ]
    return stores


@main_bp.route("/")
@login_required
def dashboard():
    stats = build_dashboard_stats()
    recent_stores = (
        Store.query.join(Wilaya)
        .filter(Wilaya.is_active.is_(True))
        .order_by(Store.updated_at.desc())
        .limit(6)
        .all()
    )
    recommendations = compute_recommendations(current_user, limit=6)
    return render_template(
        "main/dashboard.html",
        stats=stats,
        recent_stores=recent_stores,
        recommendations=recommendations,
    )


@main_bp.route("/stores")
@login_required
def stores_list():
    wilayas = Wilaya.query.filter_by(is_active=True).order_by(Wilaya.priority_order).all()
    stores = _query_filtered_stores()
    return render_template("main/stores.html", stores=stores, wilayas=wilayas)


@main_bp.route("/map")
@login_required
def map_view():
    wilayas = Wilaya.query.filter_by(is_active=True).order_by(Wilaya.priority_order).all()
    stores = _query_filtered_stores()
    stores_json = [s.to_dict() for s in stores]
    return render_template("main/map.html", stores_json=stores_json, wilayas=wilayas)


@main_bp.route("/stores/<int:store_id>", methods=["GET", "POST"])
@login_required
def store_detail(store_id):
    store = db.session.get(Store, store_id)
    if not store:
        flash("Magasin introuvable.", "warning")
        return redirect(url_for("main.stores_list"))

    lead = Lead.query.filter_by(user_id=current_user.id, store_id=store.id).first()

    if request.method == "POST":
        status = request.form.get("status", "interesse")
        notes = request.form.get("notes", "").strip()
        if status in {"interesse", "contacte", "client", "non_interesse"}:
            if not lead:
                lead = Lead(user_id=current_user.id, store_id=store.id, status=status, notes=notes)
                db.session.add(lead)
                db.session.flush()
            else:
                lead.status = status
                lead.notes = notes
            db.session.add(LeadHistory(lead_id=lead.id, status=status, note=notes))
            db.session.commit()
            flash("Suivi commercial mis à jour.", "success")

    return render_template("main/store_detail.html", store=store, lead=lead)


@main_bp.route("/export/<fmt>")
@login_required
def export_data(fmt):
    stores = _query_filtered_stores()
    if fmt == "xlsx":
        data = export_stores_xlsx_bytes(stores)
        return Response(
            data,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=distribdz_magasins.xlsx"},
        )
    data = export_stores_csv_bytes(stores)
    return Response(
        data,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=distribdz_magasins.csv"},
    )
