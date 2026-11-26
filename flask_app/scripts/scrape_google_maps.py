"""
Script autonome et paramétrable d'extraction Google Maps (Playwright) pour DistribDZ.
Usage :
  python scripts/scrape_google_maps.py --wilayas "Guelma" --limit 0
  python scripts/scrape_google_maps.py --wilayas "Souk Ahras,Tébessa,Annaba,Guelma,Skikda,Constantine" --categories "superette,mini market,grocery store,épicerie,magasin de gros,hypermarché" --limit 0
"""
import argparse
import os
import re
import sys
import time
from urllib.parse import quote_plus

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from playwright.sync_api import sync_playwright  # noqa: E402
from app import create_app, db  # noqa: E402
from app.models import ScrapingJob, Store, Wilaya, haversine_km, normalize_store_key  # noqa: E402


CATEGORY_MAP = {
    "superette": "superette",
    "supérette": "superette",
    "supermarché": "superette",
    "supermarche": "superette",
    "supermarket": "superette",
    "grocery_or_supermarket": "superette",
    "grocery or supermarket": "superette",
    "discount supermarket": "hypermarche",
    "discount_supermarket": "hypermarche",
    "hypermarket": "hypermarche",
    "mini market": "mini_market",
    "minimarket": "mini_market",
    "mini-market": "mini_market",
    "convenience store": "mini_market",
    "convenience_store": "mini_market",
    "mini-markets": "mini_market",
    "épicerie": "epicerie",
    "epicerie": "epicerie",
    "grocery store": "epicerie",
    "grocery": "epicerie",
    "grocery_store": "epicerie",
    "food_store": "epicerie",
    "alimentation générale": "superette",
    "alimentation generale": "superette",
    "magasin d'alimentation": "superette",
    "magasin alimentation": "superette",
    "تغذية عامة": "superette",
    "مواد غذائية": "superette",
    "سوبرات": "superette",
    "سوبيرات": "superette",
    "libre service": "superette",
    "magasin de gros": "magasin_gros",
    "grossiste": "magasin_gros",
    "grossiste alimentaire": "magasin_gros",
    "wholesale grocer": "magasin_gros",
    "wholesale": "magasin_gros",
    "wholesaler": "magasin_gros",
    "warehouse": "magasin_gros",
    "warehouse_store": "magasin_gros",
    "warehouse store": "magasin_gros",
    "vente en gros": "magasin_gros",
    "hypermarché": "hypermarche",
    "hypermarche": "hypermarche",
    "hypermarket": "hypermarche",
    "aswak": "hypermarche",
    "assouak": "hypermarche",
    "أسواق": "hypermarche",
    "اسواق": "hypermarche",
    "aswaq": "hypermarche",
    "assouaq": "hypermarche",
    "سوبرات": "superette",
    "محل مواد غذائية": "epicerie",
    "مواد غذائية": "epicerie",
    "بيع بالجملة": "magasin_gros",
    "جملة": "magasin_gros",
    "سوبر ماركت": "superette",
    "ميني ماركت": "mini_market",
    "بقالة": "epicerie",
}

# Catégories Google Maps associées au marqueur « Chariot bleu » (commerce agro-alimentaire)
AGRO_BLUE_CART_KEYWORDS = (
    "supermarch", "supérette", "superette", "hypermarch", "hypermarket", "supermarket",
    "épicerie", "epicerie", "grocery", "convenience", "alimentation", "alimentaire",
    "grossiste", "wholesale", "marché", "market", "boulanger", "pâtisser", "crémerie", "warehouse", "discount supermarket", "cash and carry", "wholesaler",
    "boucherie", "fromagerie", "boisson", "سوبر", "سوبيرات", "بقالة", "تغذية", "مواد غذائية", "أسواق",
)

NON_AGRO_CATEGORIES = (
    "vêtement", "chaussure", "électronique", "téléphone", "pharmacie", "meuble",
    "quincaillerie", "coiffure", "bijouterie", "automobile", "optique", "librairie",
    "clothing", "electronics", "furniture", "hardware",
)

# Découpage multi-communes + quartiers/cités pour contourner le plafond d'affichage (~120 fiches)
# et capter les commerces de quartier absents des recherches globales par wilaya
WILAYA_COMMUNES = {
    "Guelma": [
        "Guelma",
        "Cité Adjabi Guelma",
        "Cité Tahar Gheddour Guelma",
        "Cité 18 Février Guelma",
        "Cité 19 Juin Guelma",
        "Oued El Maïz Guelma",
        "Oued Zenati",
        "Bouchegouf",
        "Héliopolis",
        "Hammam Debagh",
        "Guelaat Bou Sbaa",
        "Khezaras",
        "Aïn Makhlouf",
        "Nechmaya",
        "Roknia",
        "Belkheir",
        "Boumahra Ahmed",
        "Tamlouka",
    ],
    "Souk Ahras": [
        "Souk Ahras",
        "Sedrata",
        "M'Daourouch",
        "Taoura",
        "Mechroha",
        "Ouillen",
        "Bir Bouhouche",
    ],
    "Tébessa": [
        "Tébessa",
        "Bir El Ater",
        "Cheria",
        "El Aouinet",
        "Ouenza",
        "El Ogla",
        "Negrine",
    ],
    "Annaba": [
        "Annaba",
        "El Bouni",
        "El Hadjar",
        "Sidi Amar",
        "Berrahal",
        "Seraïdi",
        "Chetaïbi",
    ],
    "Skikda": [
        "Skikda",
        "Azzaba",
        "El Harrouch",
        "Collo",
        "Tamalous",
        "Ramdane Djamel",
        "Ben Azzouz",
    ],
    "Constantine": [
        "Constantine",
        "El Khroub",
        "Ali Mendjeli",
        "Ain Smara",
        "Didouche Mourad",
        "Hamma Bouziane",
        "Zighoud Youcef",
    ],
}


def extract_coords_from_url(url: str):
    """Extrait latitude et longitude depuis une URL Google Maps (@lat,lng)."""
    match = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if match:
        return float(match.group(1)), float(match.group(2))
    return None, None


def is_duplicate(name: str, wilaya_id: int, lat: float, lng: float) -> bool:
    """Vérifie les doublons par nom normalisé ou proximité GPS (< 50 mètres)."""
    key = normalize_store_key(name, wilaya_id)
    if Store.query.filter_by(normalized_key=key).first():
        return True
    for existing in Store.query.filter_by(wilaya_id=wilaya_id).all():
        if haversine_km(lat, lng, existing.latitude, existing.longitude) < 0.05:
            return True
    return False


def scroll_feed_until_end(page, limit: int):
    """Fait défiler le panneau Google Maps jusqu'à la fin de la liste ou jusqu'à la limite."""
    feed_selector = 'div[role="feed"]'
    if page.locator(feed_selector).count() == 0:
        return

    last_count = 0
    stagnant_rounds = 0
    for _ in range(45):
        page.locator(feed_selector).evaluate("el => el.scrollBy(0, 1800)")
        page.wait_for_timeout(1200)

        current_count = page.locator('a[href*="/maps/place/"]').count()
        if limit > 0 and current_count >= limit:
            break

        # Vérifie le marqueur de fin de résultats Google Maps
        end_reached = (
            page.locator("text=Vous êtes arrivé à la fin de la liste").count() > 0
            or page.locator("text=You've reached the end of the list").count() > 0
        )
        if end_reached:
            break

        if current_count == last_count:
            stagnant_rounds += 1
            if stagnant_rounds >= 5:
                break
        else:
            stagnant_rounds = 0
            last_count = current_count


def scrape_query(wilaya: Wilaya, commune: str, search_term: str, store_type: str, limit: int, headless: bool):
    """Scrape Google Maps pour une commune, une wilaya et une catégorie données."""
    found = 0
    inserted = 0
    duplicates = 0
    location_label = commune if commune.lower() == wilaya.name.lower() else f"{commune} {wilaya.name}"
    query = f"{search_term} {location_label} Algérie"
    url = f"https://www.google.com/maps/search/{quote_plus(query)}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(locale="fr-FR")
        page.goto(url, timeout=60000)
        page.wait_for_timeout(3000)

        scroll_feed_until_end(page, limit)

        cards = page.locator('a[href*="/maps/place/"]')
        total_cards = cards.count() if limit <= 0 else min(limit, cards.count())

        for idx in range(total_cards):
            try:
                card = cards.nth(idx)
                href = card.get_attribute("href") or ""
                card.click()
                page.wait_for_timeout(1800)

                name = page.locator("h1").first.inner_text(timeout=3000).strip()
                lat, lng = extract_coords_from_url(page.url or href)
                if not name or lat is None or lng is None:
                    continue

                # Vérifie la catégorie Google Maps (« Chariot bleu » agro-alimentaire)
                gmaps_category = ""
                cat_btn = page.locator('button[jsaction*="category"]')
                if cat_btn.count() > 0:
                    gmaps_category = cat_btn.first.inner_text().strip().lower()
                if gmaps_category:
                    if any(bad in gmaps_category for bad in NON_AGRO_CATEGORIES):
                        continue
                    if not any(ok in gmaps_category for ok in AGRO_BLUE_CART_KEYWORDS) and not any(
                        ok in name.lower() for ok in AGRO_BLUE_CART_KEYWORDS
                    ):
                        continue

                resolved_type = store_type
                if "hyper" in gmaps_category or "aswak" in name.lower() or "assouak" in name.lower():
                    resolved_type = "hypermarche"
                elif "gros" in gmaps_category or "wholesale" in gmaps_category:
                    resolved_type = "magasin_gros"
                elif "mini" in name.lower() or "convenience" in gmaps_category:
                    resolved_type = "mini_market"
                elif "épicerie" in gmaps_category or "grocery" in gmaps_category or "بقالة" in gmaps_category:
                    resolved_type = "epicerie"

                found += 1
                if is_duplicate(name, wilaya.id, lat, lng):
                    duplicates += 1
                    continue

                address = None
                phone = None
                addr_btn = page.locator('button[data-item-id="address"]')
                if addr_btn.count() > 0:
                    address = addr_btn.first.inner_text().strip()

                phone_btn = page.locator('button[data-item-id^="phone:"]')
                if phone_btn.count() > 0:
                    phone = phone_btn.first.inner_text().strip()

                store = Store(
                    name=name,
                    normalized_key=normalize_store_key(name, wilaya.id),
                    wilaya_id=wilaya.id,
                    store_type=resolved_type,
                    address=address,
                    phone=phone,
                    latitude=lat,
                    longitude=lng,
                    google_maps_url=page.url,
                    source=f"Google Maps Playwright ({commune})",
                )
                db.session.add(store)
                db.session.commit()
                inserted += 1
                time.sleep(0.4)
            except Exception as exc:
                print(f"[Avertissement] Fiche ignorée ({exc})")
                db.session.rollback()

        browser.close()

    return found, inserted, duplicates


def main():
    parser = argparse.ArgumentParser(description="Scraper Google Maps complet et multi-communes DistribDZ")
    parser.add_argument(
        "--wilayas",
        default="Souk Ahras,Tébessa,Annaba,Guelma,Skikda,Constantine",
        help="Noms des wilayas séparés par des virgules",
    )
    parser.add_argument(
        "--categories",
        default="supermarché,superette,supermarket,discount supermarket,hypermarket,mini market,mini-markets,grocery store,grocery_or_supermarket,grocery_store,food_store,convenience_store,convenience store,alimentation générale,alimentation,épicerie,magasin d'alimentation,aswak,aswaq,assouak,assouaq,أسواق,اسواق,تغذية عامة,مواد غذائية,بقالة,سوبرات,سوبيرات,سوبر ماركت,ميني ماركت,wholesale,wholesaler,magasin de gros,grossiste alimentaire,warehouse_store,warehouse,بيع بالجملة,جملة",
        help="Mots-clés de recherche séparés par des virgules",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Nombre max de résultats par requête (0 = illimité, extrait toute la liste)",
    )
    parser.add_argument(
        "--single-city",
        action="store_true",
        help="Désactiver le découpage multi-communes et rechercher uniquement au chef-lieu de wilaya",
    )
    parser.add_argument("--headed", action="store_true", help="Afficher le navigateur Chromium")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        wilaya_names = [w.strip() for w in args.wilayas.split(",") if w.strip()]
        categories = [c.strip() for c in args.categories.split(",") if c.strip()]

        total_found = total_inserted = total_dups = 0
        for w_name in wilaya_names:
            wilaya = Wilaya.query.filter(Wilaya.name.ilike(w_name)).first()
            if not wilaya:
                print(f"[Erreur] Wilaya inconnue : {w_name}")
                continue
            if not wilaya.is_active:
                wilaya.is_active = True
                db.session.commit()

            communes = (
                [wilaya.name]
                if args.single_city
                else WILAYA_COMMUNES.get(wilaya.name, [wilaya.name])
            )

            for commune in communes:
                for cat in categories:
                    mapped_type = CATEGORY_MAP.get(cat.lower(), "autre")
                    print(f"Extraction en cours : {wilaya.name} ({commune}) — {cat}...")
                    f, i, d = scrape_query(
                        wilaya,
                        commune,
                        cat,
                        mapped_type,
                        args.limit,
                        headless=not args.headed,
                    )
                    total_found += f
                    total_inserted += i
                    total_dups += d

        db.session.add(
            ScrapingJob(
                wilaya_names=", ".join(wilaya_names),
                categories=", ".join(categories),
                found_count=total_found,
                inserted_count=total_inserted,
                duplicate_count=total_dups,
                status="termine",
            )
        )
        db.session.commit()
        print(f"Terminé : {total_found} analysés, {total_inserted} ajoutés, {total_dups} doublons.")


if __name__ == "__main__":
    main()
