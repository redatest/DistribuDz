"""
Services métier :
- Moteur de matching / recommandations producteur <-> magasin
- Calcul des indicateurs statistiques et qualité des données
- Export CSV et Excel (.xlsx)
"""
import csv
import io
from openpyxl import Workbook
from app.models import Store, Wilaya


def compute_recommendations(user, limit=12):
    """Calcule un score de pertinence /100 selon territoire, format, secteur et note."""
    stores = Store.query.join(Wilaya).filter(Wilaya.is_active.is_(True)).all()
    territory_ids = {w.id for w in user.territories}
    if user.preferred_wilaya_id:
        territory_ids.add(user.preferred_wilaya_id)

    preferred_types = set((user.preferred_store_types or "").split(","))
    sector_tokens = [t.lower() for t in (user.sector or "").split() if len(t) >= 4]

    results = []
    for store in stores:
        score = 0
        reasons = []

        if store.wilaya_id in territory_ids:
            score += 35
            reasons.append(f"Dans votre territoire ({store.wilaya.name})")
        elif not territory_ids:
            score += 18

        if store.store_type in preferred_types:
            score += 25
            reasons.append("Format de magasin ciblé")
        elif store.store_type == "magasin_gros":
            score += 15
            reasons.append("Volume grossiste B2B")

        prods = (store.main_products or "").lower()
        if any(tok in prods for tok in sector_tokens):
            score += 15
            reasons.append("Rayons compatibles avec votre activité")

        if (store.rating or 0) >= 4.5 and (store.review_count or 0) >= 40:
            score += 15
            reasons.append(f"Forte notoriété ({store.rating}★)")
        elif (store.rating or 0) >= 4.0:
            score += 9

        if store.phone and store.quality_score >= 80:
            score += 10
            reasons.append("Contact téléphonique vérifié")

        results.append({"store": store, "match_score": min(99, score), "reasons": reasons[:3]})

    results.sort(key=lambda x: (x["match_score"], x["store"].rating or 0), reverse=True)
    return results[:limit]


def build_dashboard_stats():
    """Calcule les statistiques globales, par wilaya, par type et la qualité des données."""
    active_wilayas = Wilaya.query.filter_by(is_active=True).order_by(Wilaya.priority_order).all()
    stores = Store.query.join(Wilaya).filter(Wilaya.is_active.is_(True)).all()

    total = len(stores)
    rated = [s.rating for s in stores if s.rating is not None]
    avg_rating = round(sum(rated) / len(rated), 2) if rated else 0.0

    pct = lambda count: round((count / total) * 100) if total else 0
    phone_pct = pct(sum(1 for s in stores if s.phone))
    address_pct = pct(sum(1 for s in stores if s.address))
    hours_pct = pct(sum(1 for s in stores if s.opening_hours))
    enriched_pct = pct(sum(1 for s in stores if s.main_products and s.approx_surface_m2))

    by_wilaya = [
        {"name": w.name, "code": w.code, "count": w.stores.count()}
        for w in active_wilayas
    ]

    type_counts = {}
    for s in stores:
        type_counts[s.store_type] = type_counts.get(s.store_type, 0) + 1

    return {
        "total_stores": total,
        "active_wilayas_count": len(active_wilayas),
        "total_wilayas_count": Wilaya.query.count(),
        "avg_rating": avg_rating,
        "by_wilaya": by_wilaya,
        "by_type": type_counts,
        "quality": {
            "phone_pct": phone_pct,
            "address_pct": address_pct,
            "hours_pct": hours_pct,
            "enriched_pct": enriched_pct,
            "overall_pct": round((phone_pct + address_pct + hours_pct + enriched_pct) / 4),
        },
    }


STORE_TYPE_LABELS = {
    "superette": "Superette",
    "mini_market": "Mini Market",
    "epicerie": "Grocery Store / Épicerie",
    "magasin_gros": "Magasin de gros",
    "hypermarche": "Hypermarché",
    "autre": "Autre",
}


def export_stores_csv_bytes(stores) -> bytes:
    """Exporte une liste de magasins au format CSV UTF-8 BOM."""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(
        ["ID", "Nom", "Wilaya", "Type", "Adresse", "Téléphone", "Latitude", "Longitude", "Note", "Avis", "Horaires", "Produits", "Surface_m2", "Google_Maps"]
    )
    for s in stores:
        writer.writerow([
            s.id, s.name, s.wilaya.name if s.wilaya else "", STORE_TYPE_LABELS.get(s.store_type, s.store_type),
            s.address or "", s.phone or "", s.latitude, s.longitude,
            s.rating or "", s.review_count or 0, s.opening_hours or "",
            s.main_products or "", s.approx_surface_m2 or "", s.google_maps_url or "",
        ])
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def export_stores_xlsx_bytes(stores) -> bytes:
    """Exporte une liste de magasins au format Excel (.xlsx)."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Magasins_DistribDZ"
    ws.append(
        ["ID", "Nom", "Wilaya", "Type", "Adresse", "Téléphone", "Latitude", "Longitude", "Note", "Avis", "Horaires", "Produits", "Surface_m2", "Google_Maps"]
    )
    for s in stores:
        ws.append([
            s.id, s.name, s.wilaya.name if s.wilaya else "", STORE_TYPE_LABELS.get(s.store_type, s.store_type),
            s.address or "", s.phone or "", s.latitude, s.longitude,
            s.rating or "", s.review_count or 0, s.opening_hours or "",
            s.main_products or "", s.approx_surface_m2 or "", s.google_maps_url or "",
        ])
    stream = io.BytesIO()
    wb.save(stream)
    return stream.getvalue()
