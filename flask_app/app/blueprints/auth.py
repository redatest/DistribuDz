"""
Blueprint d'authentification : connexion, inscription producteur, configuration initiale admin et profil.
"""
from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from app import db
from app.models import User, Wilaya

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))

    has_admin = User.query.filter_by(role="admin").first() is not None

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = User.query.filter_by(email=email).first()

        if not user or not user.check_password(password):
            flash("Identifiants incorrects.", "danger")
        elif not user.is_active:
            flash("Ce compte a été désactivé par l'administrateur.", "danger")
        else:
            login_user(user)
            return redirect(url_for("main.dashboard"))

    return render_template("auth/login.html", has_admin=has_admin)


@auth_bp.route("/bootstrap-admin", methods=["POST"])
def bootstrap_admin():
    """Route à usage unique pour créer le premier administrateur si aucun n'existe."""
    if User.query.filter_by(role="admin").first() is not None:
        flash("Un administrateur existe déjà.", "warning")
        return redirect(url_for("auth.login"))

    full_name = request.form.get("full_name", "").strip()
    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")

    if not full_name or "@" not in email or len(password) < 6:
        flash("Nom complet, email valide et mot de passe (6 car. min.) requis.", "danger")
        return redirect(url_for("auth.login"))

    admin = User(
        full_name=full_name,
        email=email,
        role="admin",
        company_name="DistribDZ Administration",
        sector="Administration",
    )
    admin.set_password(password)
    admin.issue_api_token()
    db.session.add(admin)
    db.session.commit()

    login_user(admin)
    flash("Compte administrateur initialisé.", "success")
    return redirect(url_for("main.dashboard"))


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))

    wilayas = Wilaya.query.filter_by(is_active=True).order_by(Wilaya.priority_order).all()

    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        company_name = request.form.get("company_name", "").strip()
        sector = request.form.get("sector", "").strip()
        preferred_wilaya_id = request.form.get("preferred_wilaya_id", type=int)

        if User.query.filter_by(email=email).first():
            flash("Un compte utilise déjà cet email.", "danger")
            return render_template("auth/register.html", wilayas=wilayas)

        user = User(
            full_name=full_name,
            email=email,
            role="producer",
            company_name=company_name,
            sector=sector,
            preferred_wilaya_id=preferred_wilaya_id,
        )
        user.set_password(password)
        user.issue_api_token()
        if preferred_wilaya_id:
            w = db.session.get(Wilaya, preferred_wilaya_id)
            if w:
                user.territories.append(w)

        db.session.add(user)
        db.session.commit()
        login_user(user)
        return redirect(url_for("main.dashboard"))

    return render_template("auth/register.html", wilayas=wilayas)


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("auth.login"))


@auth_bp.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    wilayas = Wilaya.query.filter_by(is_active=True).order_by(Wilaya.priority_order).all()
    if request.method == "POST":
        current_user.full_name = request.form.get("full_name", current_user.full_name).strip()
        current_user.company_name = request.form.get("company_name", "").strip()
        current_user.sector = request.form.get("sector", "").strip()
        current_user.phone = request.form.get("phone", "").strip()
        current_user.preferred_wilaya_id = request.form.get("preferred_wilaya_id", type=int)

        new_pass = request.form.get("new_password", "")
        if new_pass:
            if len(new_pass) < 6:
                flash("Le nouveau mot de passe doit contenir au moins 6 caractères.", "danger")
                return render_template("auth/profile.html", wilayas=wilayas)
            current_user.set_password(new_pass)

        db.session.commit()
        flash("Profil mis à jour.", "success")

    return render_template("auth/profile.html", wilayas=wilayas)
