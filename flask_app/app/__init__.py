"""
Initialisation de la fabrique d'application Flask (Application Factory).
Configure SQLAlchemy, Flask-Login, la protection CSRF et les Blueprints.
"""
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect

from config import Config

db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    login_manager.init_app(app)
    csrf.init_app(app)

    login_manager.login_view = "auth.login"
    login_manager.login_message = "Veuillez vous connecter pour accéder à DistribDZ."
    login_manager.login_message_category = "warning"

    from app.blueprints.auth import auth_bp
    from app.blueprints.main import main_bp
    from app.blueprints.admin import admin_bp
    from app.blueprints.api import api_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp, url_prefix="/admin")
    app.register_blueprint(api_bp, url_prefix="/api/v1")

    # L'API REST mobile utilise des jetons Bearer plutôt que des cookies CSRF
    csrf.exempt(api_bp)

    with app.app_context():
        from app import models  # noqa: F401
        from app.services.seed_wilayas import seed_all_58_wilayas_and_initial_stores

        db.create_all()
        seed_all_58_wilayas_and_initial_stores()

    return app
