# DistribDZ — Plateforme B2B des Points de Vente & Grossistes en Algérie

DistribDZ centralise les informations des superettes, épiceries, hypermarchés et magasins de vente en gros en Algérie pour aider les producteurs et usines industrielles à développer leur réseau de distribution.

Démarre sur les **6 wilayas prioritaires de l'Est** (Souk Ahras, Tébessa, Annaba, Guelma, Skikda, Constantine) et s'étend dynamiquement à l'ensemble des **58 wilayas d'Algérie**.

## Architecture du projet Flask (`flask_app/`)

```text
flask_app/
├── app/
│   ├── __init__.py          # Fabrique Flask, SQLAlchemy, Flask-Login, CSRF
│   ├── models.py            # Modèles Wilaya (58), User, Store, Lead, LeadHistory, ScrapingJob
│   ├── blueprints/
│   │   ├── auth.py          # Connexion, inscription producteur, setup admin, profil
│   │   ├── main.py          # Dashboard, filtres magasins, carte, fiche enrichie, export CSV/XLSX
│   │   ├── admin.py         # Gestion magasins, 58 wilayas, utilisateurs & territoires
│   │   └── api.py           # API REST JSON v1 (prête pour React Native / Flutter)
│   ├── services/
│   │   ├── matching.py      # Moteur de recommandations, qualité des données, exports
│   │   └── seed_wilayas.py  # Seed dynamique des 58 wilayas d'Algérie
│   └── templates/           # Templates Jinja2 + Bootstrap 5 + Chart.js + Leaflet MarkerCluster
├── scripts/
│   └── scrape_google_maps.py # Script Playwright paramétrable par wilaya et catégorie
├── config.py
├── requirements.txt
└── run.py
```

## Installation & Démarrage rapide (Flask Python)

```bash
cd flask_app
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
python run.py
```

Ouvrez ensuite `http://127.0.0.1:5000` dans votre navigateur. Au premier lancement, créez votre compte Administrateur via le formulaire de configuration initiale.

## Lancer le scraping Google Maps par wilaya

```bash
python scripts/scrape_google_maps.py \
  --wilayas "Souk Ahras,Tébessa,Annaba,Guelma,Skikda,Constantine" \
  --categories "superette,magasin de gros,hypermarché" \
  --limit 30
```

## Endpoints API REST v1 (pour application mobile React Native / Flutter)

- `POST /api/v1/auth/login` — Authentification et jeton Bearer
- `POST /api/v1/auth/logout` — Révocation du jeton
- `GET /api/v1/wilayas` — Liste des wilayas actives (`?all=1` pour les 58 wilayas)
- `GET /api/v1/stores` — Liste filtrable (`wilaya_id`, `store_type`, `min_rating`, `has_phone`, `q`)
- `GET /api/v1/stores/<id>` — Détail complet d'un point de vente
- `GET /api/v1/stores/wilaya/<code_wilaya>` — Magasins d'une wilaya
- `GET /api/v1/stores/nearby?lat=36.28&lng=7.95&radius_km=30` — Proximité GPS
- `GET /api/v1/stats` — Statistiques globales et indicateurs de qualité
