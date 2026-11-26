"""
Configuration de l'application DistribDZ (Flask + SQLite).
"""
import os
import secrets

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    # Clé secrète CSRF & sessions (lue depuis .env ou générée dynamiquement)
    SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'distribdz.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    WTF_CSRF_ENABLED = True
    # Clé optionnelle d'administration pour le premier démarrage
    ADMIN_PASSCODE = os.environ.get("ADMIN_PASSCODE", "")
