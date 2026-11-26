"""
Blueprint d'administration :
- Ajout, modification et suppression de magasins (avec contrôle anti-doublon)
- Gestion des 58 wilayas (activation / désactivation dynamique)
- Gestion des utilisateurs et attribution des territoires
"""
from functools import wraps
from flask import Blueprint, abort, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from app import db
from app.models import ScrapingJob, Store, User, Wilaya, normalize_store_key

admin_bp = Blueprint("admin", __name__)


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        if not current_user.is_admin:
            abort(403)
        return fn(*args, **kwargs)

    return wrapper


@admin_bp.route("/stores/new", methods=["POST"])
@admin_required
def create_store():
    name = request.form.get("name", "").strip()
    wilaya_id = request.form.get("wilaya_id", type=int)
    store_type = request.form.get("store_type", "superette")
    lat = request.form.get("latitude", type=float)
    lng = request.form.get("longitude", type=float)

    if not name or not wilaya_id or lat is None or lng is None:
        flash("Nom, wilaya et coordonnées GPS sont obligatoires.", "danger")
        return redirect(url_for("main.stores_list"))

    key = normalize_store_key(name, wilaya_id)
    if Store.query.filter_by(normalized_key=key).first():
        flash("Doublon détecté : ce magasin existe déjà dans cette wilaya.", "warning")
        return redirect(url_for("main.stores_list"))

    store = Store(
        name=name,
        normalized_key=key,
        wilaya_id=wilaya_id,
        store_type=store_type,
        address=request.form.get("address", "").strip() or None,
        phone=request.form.get("phone", "").strip() or None,
        latitude=lat,
        longitude=lng,
        rating=request.form.get("rating", type=float),
        opening_hours=request.form.get("opening_hours", "").strip() or None,
        main_products=request.form.get("main_products", "").strip() or None,
        approx_surface_m2=request.form.get("approx_surface_m2", type=int),
        clientele_type=request.form.get("clientele_type", "").strip() or None,
        google_maps_url=f"https://www.google.com/maps/search/?api=1&query={lat},{lng}",
    )
    db.session.add(store)
    db.session.commit()
    flash(f"Magasin '{store.name}' ajouté.", "success")
    return redirect(url_for("main.stores_list"))


@admin_bp.route("/stores/<int:store_id>/delete", methods=["POST"])
@admin_required
def delete_store(store_id):
    store = db.session.get(Store, store_id)
    if store:
        db.session.delete(store)
        db.session.commit()
        flash("Magasin supprimé.", "success")
    return redirect(url_for("main.stores_list"))


@admin_bp.route("/wilayas", methods=["GET", "POST"])
@admin_required
def manage_wilayas():
    if request.method == "POST":
        wilaya_id = request.form.get("wilaya_id", type=int)
        w = db.session.get(Wilaya, wilaya_id)
        if w:
            w.is_active = not w.is_active
            db.session.commit()
            flash(f"Wilaya {w.name} {'activée' if w.is_active else 'désactivée'}.", "success")
        return redirect(url_for("admin.manage_wilayas"))

    wilayas = Wilaya.query.order_by(Wilaya.is_active.desc(), Wilaya.priority_order, Wilaya.code).all()
    jobs = ScrapingJob.query.order_by(ScrapingJob.created_at.desc()).limit(10).all()
    return render_template("admin/wilayas.html", wilayas=wilayas, jobs=jobs)


@admin_bp.route("/users", methods=["GET", "POST"])
@admin_required
def manage_users():
    if request.method == "POST":
        action = request.form.get("action")
        user_id = request.form.get("user_id", type=int)
        user = db.session.get(User, user_id)

        if action == "toggle" and user and user.id != current_user.id:
            user.is_active = not user.is_active
            db.session.commit()
        elif action == "territories" and user:
            selected_ids = request.form.getlist("territory_ids", type=int)
            user.territories = Wilaya.query.filter(Wilaya.id.in_(selected_ids)).all()
            db.session.commit()
            flash(f"Territoires mis à jour pour {user.full_name}.", "success")

        return redirect(url_for("admin.manage_users"))

    users = User.query.order_by(User.role, User.created_at.desc()).all()
    active_wilayas = Wilaya.query.filter_by(is_active=True).order_by(Wilaya.priority_order).all()
    return render_template("admin/users.html", users=users, active_wilayas=active_wilayas)
