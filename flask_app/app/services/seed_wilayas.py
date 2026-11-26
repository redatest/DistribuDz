"""
Initialisation dynamique des 58 wilayas d'Algérie et des premiers magasins
sur les 6 wilayas prioritaires : Souk Ahras, Tébessa, Annaba, Guelma, Skikda, Constantine.
"""
from app import db
from app.models import Store, Wilaya, normalize_store_key

ALL_58_WILAYAS = [
    ("01", "Adrar", "أدرار", "Sud", 27.8742, -0.2939, False, 50),
    ("02", "Chlef", "الشلف", "Centre", 36.1653, 1.3345, False, 20),
    ("03", "Laghouat", "الأغواط", "Sud", 33.8000, 2.8651, False, 40),
    ("04", "Oum El Bouaghi", "أم البواقي", "Est", 35.8754, 7.1135, False, 12),
    ("05", "Batna", "باتنة", "Est", 35.5559, 6.1741, False, 10),
    ("06", "Béjaïa", "بجاية", "Est", 36.7509, 5.0567, False, 11),
    ("07", "Biskra", "بسكرة", "Sud", 34.8504, 5.7280, False, 30),
    ("08", "Béchar", "بشار", "Sud", 31.6167, -2.2167, False, 45),
    ("09", "Blida", "البليدة", "Centre", 36.4700, 2.8277, False, 15),
    ("10", "Bouira", "البويرة", "Centre", 36.3749, 3.9020, False, 22),
    ("11", "Tamanrasset", "تمنراست", "Sud", 22.7850, 5.5228, False, 55),
    ("12", "Tébessa", "تبسة", "Est", 35.4042, 8.1242, True, 2),
    ("13", "Tlemcen", "تلمسان", "Ouest", 34.8783, -1.3150, False, 25),
    ("14", "Tiaret", "تيارت", "Ouest", 35.3710, 1.3170, False, 28),
    ("15", "Tizi Ouzou", "تيزي وزو", "Centre", 36.7118, 4.0459, False, 18),
    ("16", "Alger", "الجزائر", "Centre", 36.7538, 3.0588, False, 7),
    ("17", "Djelfa", "الجلفة", "Sud", 34.6728, 3.2630, False, 35),
    ("18", "Jijel", "جيجل", "Est", 36.8206, 5.7667, False, 13),
    ("19", "Sétif", "سطيف", "Est", 36.1911, 5.4137, False, 8),
    ("20", "Saïda", "سعيدة", "Ouest", 34.8303, 0.1517, False, 33),
    ("21", "Skikda", "سكيكدة", "Est", 36.8762, 6.9092, True, 5),
    ("22", "Sidi Bel Abbès", "سيدي بلعباس", "Ouest", 35.1899, -0.6308, False, 26),
    ("23", "Annaba", "عنابة", "Est", 36.9000, 7.7667, True, 3),
    ("24", "Guelma", "قالمة", "Est", 36.4621, 7.4261, True, 4),
    ("25", "Constantine", "قسنطينة", "Est", 36.3650, 6.6147, True, 6),
    ("26", "Médéa", "المدية", "Centre", 36.2642, 2.7539, False, 24),
    ("27", "Mostaganem", "مستغانم", "Ouest", 35.9312, 0.0892, False, 27),
    ("28", "M'Sila", "المسيلة", "Centre", 35.7058, 4.5419, False, 29),
    ("29", "Mascara", "معسكر", "Ouest", 35.3966, 0.1403, False, 31),
    ("30", "Ouargla", "ورقلة", "Sud", 31.9493, 5.3250, False, 38),
    ("31", "Oran", "وهران", "Ouest", 35.6969, -0.6331, False, 9),
    ("32", "El Bayadh", "البيض", "Sud", 33.6832, 1.0193, False, 44),
    ("33", "Illizi", "إليزي", "Sud", 26.4833, 8.4667, False, 56),
    ("34", "Bordj Bou Arréridj", "برج بوعريريج", "Est", 36.0732, 4.7611, False, 16),
    ("35", "Boumerdès", "بومرداس", "Centre", 36.7664, 3.4772, False, 17),
    ("36", "El Tarf", "الطارف", "Est", 36.7672, 8.3138, False, 14),
    ("37", "Tindouf", "تندوف", "Sud", 27.6711, -8.1474, False, 58),
    ("38", "Tissemsilt", "تيسمسيلت", "Ouest", 35.6072, 1.8108, False, 36),
    ("39", "El Oued", "الوادي", "Sud", 33.3683, 6.8674, False, 34),
    ("40", "Khenchela", "خنشلة", "Est", 35.4358, 7.1433, False, 19),
    ("41", "Souk Ahras", "سوق أهراس", "Est", 36.2864, 7.9511, True, 1),
    ("42", "Tipaza", "تيبازة", "Centre", 36.5897, 2.4475, False, 21),
    ("43", "Mila", "ميلة", "Est", 36.4503, 6.2644, False, 23),
    ("44", "Aïn Defla", "عين الدفلى", "Centre", 36.2640, 1.9679, False, 32),
    ("45", "Naâma", "النعامة", "Ouest", 33.2667, -0.3167, False, 46),
    ("46", "Aïn Témouchent", "عين تموشنت", "Ouest", 35.2975, -1.1404, False, 37),
    ("47", "Ghardaïa", "غرداية", "Sud", 32.4909, 3.6735, False, 39),
    ("48", "Relizane", "غليزان", "Ouest", 35.7373, 0.5560, False, 41),
    ("49", "Timimoun", "تيميمون", "Sud", 29.2639, 0.2309, False, 51),
    ("50", "Bordj Badji Mokhtar", "برج باجي مختار", "Sud", 21.3289, 0.9558, False, 57),
    ("51", "Ouled Djellal", "أولاد جلال", "Sud", 34.4333, 5.0667, False, 42),
    ("52", "Béni Abbès", "بني عباس", "Sud", 30.1319, -2.1667, False, 52),
    ("53", "In Salah", "عين صالح", "Sud", 27.1935, 2.4607, False, 53),
    ("54", "In Guezzam", "عين قزام", "Sud", 19.5667, 5.7667, False, 54),
    ("55", "Touggourt", "تقرت", "Sud", 33.1053, 6.0580, False, 43),
    ("56", "Djanet", "جانت", "Sud", 24.5542, 9.4844, False, 49),
    ("57", "El M'Ghair", "المغير", "Sud", 33.9506, 5.9242, False, 47),
    ("58", "El Meniaa", "المنيعة", "Sud", 30.5792, 2.8792, False, 48),
]


def seed_all_58_wilayas_and_initial_stores():
    """Peuple les 58 wilayas si la table est vide, ainsi qu'un jeu initial pour les 6 wilayas Est."""
    if Wilaya.query.count() == 0:
        for code, name, name_ar, region, lat, lng, active, order in ALL_58_WILAYAS:
            db.session.add(
                Wilaya(
                    code=code,
                    name=name,
                    name_ar=name_ar,
                    region=region,
                    latitude=lat,
                    longitude=lng,
                    is_active=active,
                    priority_order=order,
                )
            )
        db.session.commit()

    if Store.query.count() == 0:
        samples = [
            ("Superette El Baraka Taghaste", "41", "superette", "Rue de la Liberté, Souk Ahras", "+213 37 74 18 22", 36.2848, 7.9531, 4.5, 84, "07:30 - 22:30", "Produits laitiers, Boissons, Huiles", 240, "Détail urbain"),
            ("Dépôt Gros Alimentaire Madaure", "41", "magasin_gros", "Zone Industrielle Route d'Annaba, Souk Ahras", "+213 550 42 19 80", 36.2981, 7.9345, 4.7, 52, "07:00 - 17:30", "Farine, Semoule, Sucre, Conserves", 1450, "Grossiste B2B"),
            ("Comptoir Gros Nememcha Distribution", "12", "magasin_gros", "Zone d'Activités Route de Constantine, Tébessa", "+213 550 77 32 19", 35.4215, 8.0964, 4.8, 64, "06:30 - 17:00", "Semoule, Pâtes, Limonades", 2100, "Grossiste régional"),
            ("Hypermarket Seybouse Plaza", "23", "hypermarche", "Boulevard 1er Novembre, Annaba", "+213 38 45 12 90", 36.8794, 7.7215, 4.7, 342, "08:30 - 23:30", "FMCG complet, Boissons, Laiterie", 2400, "Grande consommation"),
            ("Superette Maouna Express", "24", "superette", "Avenue Ali Chorfi, Guelma", "+213 37 26 44 18", 36.4638, 7.4282, 4.6, 95, "07:30 - 22:30", "Laiterie, Biscuits, Eaux minérales", 260, "Détail urbain"),
            ("Grossiste Azzaba Centrale Agro", "21", "magasin_gros", "RN 44 Zone Logistique, Azzaba, Skikda", "+213 550 88 23 41", 36.7392, 7.1055, 4.8, 74, "06:30 - 17:30", "Huiles, Sucre, Farine, Eaux", 2300, "Grossiste B2B"),
            ("Centrale Gros El Khroub Palma", "25", "magasin_gros", "Zone Industrielle Palma, El Khroub, Constantine", "+213 550 31 44 99", 36.2861, 6.6914, 4.9, 134, "06:00 - 17:30", "Distribution gros multi-marques", 3800, "Hub Grossiste Est"),
        ]
        for name, w_code, stype, addr, phone, lat, lng, rating, reviews, hours, prod, surf, cli in samples:
            w = Wilaya.query.filter_by(code=w_code).first()
            if not w:
                continue
            db.session.add(
                Store(
                    name=name,
                    normalized_key=normalize_store_key(name, w.id),
                    wilaya_id=w.id,
                    store_type=stype,
                    address=addr,
                    phone=phone,
                    latitude=lat,
                    longitude=lng,
                    rating=rating,
                    review_count=reviews,
                    opening_hours=hours,
                    google_maps_url=f"https://www.google.com/maps/search/?api=1&query={lat},{lng}",
                    main_products=prod,
                    approx_surface_m2=surf,
                    clientele_type=cli,
                )
            )
        db.session.commit()
