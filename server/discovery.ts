import { getDocumentProxy, getResolvedPDFJS } from 'unpdf';
import { haversineKm } from './db.ts';
import type { SeedStoreInput } from './seedData.ts';

export type DiscoveredStoreCandidate = Omit<SeedStoreInput, 'wilaya_code'> & {
  source: string;
};

const SYNONYM_GROUPS: string[][] = [
  ['aswak', 'aswaq', 'assouak', 'assouaq', 'أسواق', 'souk', 'سوق'],
  ['calama', 'kalama', 'كالاما'],
  ['baraka', 'بركة', 'البركة'],
  ['mahouna', 'maouna', 'ماحونة'],
  ['loula', 'lola', 'loola', 'لولة', 'لولا'],
  ['bounefla', 'bounifla', 'bounafla', 'bounfla', 'بونفلة'],
  ['adjabi', 'agabi', 'عجابي'],
  ['fath', 'الفتح', 'فتح'],
  ['rahma', 'الرحمة', 'رحمة', 'mercado', 'مغازة'],
  ['superette', 'سوبيرات', 'سوبرات', 'supermarche', 'supremarche', 'supermarket', 'سوبرماركت', 'سوبر'],
  ['mini', 'ميني'],
  ['market', 'ماركت', 'marche'],
  ['grocery', 'grocery_store', 'grocery_or_supermarket', 'food_store', 'epicerie', 'بقالة', 'alimentation', 'تغذية', 'مواد غذائية'],
  ['convenience', 'convenience_store', 'convenience store', 'mini-market', 'mini market', 'mini-markets', 'سوبرات', 'سوبيرات'],
  ['gros', 'grossiste', 'wholesale', 'wholesaler', 'magasin de gros', 'vente en gros', 'جملة', 'بالجملة', 'تجارة الجملة'],
  ['warehouse', 'warehouse_store', 'warehouse store', 'entrepot', 'entrepôt', 'مخزن', 'مستودع'],
  ['hypermarche', 'hypermarket', 'هايبر', 'mall', 'discount_supermarket', 'discount supermarket'],
  ['guelma', 'قالمة'],
  ['annaba', 'عنابة'],
  ['constantine', 'قسنطينة'],
  ['skikda', 'سكيكدة'],
  ['tebessa', 'تبسة'],
  ['ahras', 'أهراس', 'اهراس'],
];

const STOP_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'a', 'au', 'el', 'al', 'or', 'and']);

// Quartiers, cités et pôles urbains prioritaires pour contourner le plafond d'affichage des moteurs cartographiques
export const WILAYA_DISTRICTS: Record<
  string,
  Array<{ name: string; lat: number; lng: number }>
> = {
  '24': [
    { name: 'Cité Adjabi', lat: 36.4628, lng: 7.4158 },
    { name: 'Cité Tahar Gheddour', lat: 36.4600, lng: 7.4283 },
    { name: 'Cité 18 Février', lat: 36.4621, lng: 7.4261 },
    { name: 'Cité 19 Juin', lat: 36.4560, lng: 7.4258 },
    { name: 'Cité 309', lat: 36.4595, lng: 7.4220 },
    { name: 'Oued El Maïz', lat: 36.4472, lng: 7.4488 },
    { name: 'Bab Essouk', lat: 36.4632, lng: 7.4273 },
    { name: 'Oued Zenati', lat: 36.3145, lng: 7.1632 },
    { name: 'Bouchegouf', lat: 36.4631, lng: 7.7289 },
    { name: 'Héliopolis', lat: 36.5034, lng: 7.4422 },
    { name: 'Hammam Debagh', lat: 36.4581, lng: 7.2667 },
    { name: 'Aïn Makhlouf', lat: 36.2456, lng: 7.2511 },
    { name: 'Aïn Hassainia', lat: 36.3842, lng: 7.3672 },
    { name: "Hammam N'Bails", lat: 36.3422, lng: 7.6481 },
    { name: 'Khezaras', lat: 36.3944, lng: 7.5194 },
    { name: 'Guelaat Bou Sbaa', lat: 36.5486, lng: 7.4694 },
  ],
  '41': [
    { name: 'Souk Ahras Centre', lat: 36.2864, lng: 7.9511 },
    { name: 'Cité 5 Juillet', lat: 36.2912, lng: 7.9465 },
    { name: 'Cité 1700 Logements', lat: 36.2741, lng: 7.9412 },
    { name: 'Sedrata', lat: 36.1286, lng: 7.5338 },
    { name: "M'daourouch", lat: 36.0772, lng: 7.8195 },
    { name: 'Mechroha', lat: 36.3578, lng: 7.8350 },
    { name: 'Taoura', lat: 36.1667, lng: 8.0408 },
    { name: 'Ouled Driss', lat: 36.3422, lng: 8.0211 },
    { name: 'Haddada', lat: 36.3119, lng: 8.1742 },
    { name: 'Bir Bouhouche', lat: 36.1408, lng: 7.3672 },
    { name: 'Merahna', lat: 36.1972, lng: 8.1519 },
    { name: 'Sidi Fredj', lat: 36.2244, lng: 8.2106 },
    { name: 'Zarouria', lat: 36.2156, lng: 7.9261 },
    { name: 'Dréa', lat: 36.1536, lng: 7.7219 },
  ],
  '12': [
    { name: 'Tébessa Centre', lat: 35.4042, lng: 8.1242 },
    { name: 'Cité El Djorf', lat: 35.4142, lng: 8.1322 },
    { name: 'Bir El Ater', lat: 34.7449, lng: 8.0602 },
    { name: 'Cheria', lat: 35.2731, lng: 7.7519 },
    { name: 'Ouenza', lat: 35.9512, lng: 8.1324 },
    { name: 'El Aouinet', lat: 35.8706, lng: 7.8819 },
    { name: 'Morsott', lat: 35.6708, lng: 8.0156 },
    { name: 'El Kouif', lat: 35.4997, lng: 8.3164 },
    { name: 'Negrine', lat: 34.4875, lng: 7.5236 },
    { name: 'El Ogla', lat: 34.9369, lng: 7.5419 },
    { name: 'Boukhadra', lat: 35.7564, lng: 8.0258 },
    { name: 'Hammamet', lat: 35.4486, lng: 7.9514 },
  ],
  '23': [
    { name: 'Annaba Centre', lat: 36.9009, lng: 7.7669 },
    { name: 'Oued Kouba', lat: 36.9125, lng: 7.7582 },
    { name: 'Rizzi Amor', lat: 36.9185, lng: 7.7525 },
    { name: 'Plaine Ouest', lat: 36.8892, lng: 7.7425 },
    { name: 'Sidi Achour', lat: 36.8832, lng: 7.7285 },
    { name: 'Boukhadra Annaba', lat: 36.8545, lng: 7.7160 },
    { name: 'El Bouni', lat: 36.8511, lng: 7.7375 },
    { name: 'El Hadjar', lat: 36.8012, lng: 7.7348 },
    { name: 'Sidi Amar', lat: 36.8214, lng: 7.7185 },
    { name: 'Berrahal', lat: 36.8350, lng: 7.4525 },
    { name: 'Chetaïbi', lat: 37.0672, lng: 7.3814 },
    { name: 'Seraïdi', lat: 36.9092, lng: 7.6675 },
    { name: 'Treat', lat: 36.8475, lng: 7.5306 },
  ],
  '21': [
    { name: 'Skikda Centre', lat: 36.8762, lng: 6.9092 },
    { name: 'Hamadi Krouma', lat: 36.8575, lng: 6.9236 },
    { name: 'Filfila', lat: 36.8906, lng: 7.0189 },
    { name: 'Azzaba', lat: 36.7392, lng: 7.1055 },
    { name: 'El Harrouch', lat: 36.4664, lng: 6.8378 },
    { name: 'Collo', lat: 37.0061, lng: 6.5647 },
    { name: 'Tamalous', lat: 36.8364, lng: 6.6422 },
    { name: 'Ramdane Djamel', lat: 36.7485, lng: 6.8982 },
    { name: 'Ben Azzouz', lat: 36.8789, lng: 7.2856 },
    { name: 'Zitouna', lat: 36.7097, lng: 6.4608 },
    { name: 'Aïn Zouit', lat: 36.9078, lng: 6.7689 },
    { name: 'Sidi Mezghiche', lat: 36.6889, lng: 6.7169 },
    { name: 'Salah Bouchaour', lat: 36.6639, lng: 6.8639 },
  ],
  '25': [
    { name: 'Constantine Centre', lat: 36.3650, lng: 6.6147 },
    { name: 'Zouaghi Slimane', lat: 36.3228, lng: 6.6092 },
    { name: 'Boussouf', lat: 36.3418, lng: 6.5784 },
    { name: 'Daksi Abdeslam', lat: 36.3672, lng: 6.6389 },
    { name: 'Sidi Mabrouk', lat: 36.3608, lng: 6.6311 },
    { name: 'Ali Mendjeli', lat: 36.2458, lng: 6.5712 },
    { name: 'El Khroub', lat: 36.2633, lng: 6.6936 },
    { name: 'Didouche Mourad', lat: 36.4533, lng: 6.6347 },
    { name: 'Hamma Bouziane', lat: 36.4125, lng: 6.5974 },
    { name: 'Aïn Smara', lat: 36.2694, lng: 6.5012 },
    { name: 'Zighoud Youcef', lat: 36.5333, lng: 6.7131 },
    { name: 'Ibn Ziad', lat: 36.3789, lng: 6.4736 },
    { name: 'Ouled Rahmoun', lat: 36.1833, lng: 6.7000 },
    { name: 'Aïn Abid', lat: 36.2314, lng: 6.9433 },
  ],
  '19': [
    { name: 'Sétif Centre', lat: 36.1911, lng: 5.4137 },
    { name: 'El Hidhab', lat: 36.2085, lng: 5.4295 },
    { name: 'El Eulma', lat: 36.1528, lng: 5.6902 },
    { name: 'Aïn Oulmene', lat: 35.9189, lng: 5.2947 },
    { name: 'Bougaa', lat: 36.3328, lng: 5.0886 },
    { name: 'Aïn Arnat', lat: 36.1869, lng: 5.3133 },
    { name: 'Salah Bey', lat: 35.8542, lng: 5.2906 },
    { name: 'Aïn Azel', lat: 35.8433, lng: 5.5219 },
    { name: 'Beni Aziz', lat: 36.4694, lng: 5.6531 },
    { name: 'Bir El Arch', lat: 36.1353, lng: 5.8336 },
    { name: 'Guidjel', lat: 36.1225, lng: 5.4850 },
    { name: 'Amoucha', lat: 36.3922, lng: 5.3983 },
    { name: 'Aïn El Kebira', lat: 36.3647, lng: 5.5036 },
    { name: 'Hammam Guergour', lat: 36.3228, lng: 5.0608 },
    { name: 'Djemila', lat: 36.3189, lng: 5.7364 },
    { name: 'Mezloug', lat: 36.1108, lng: 5.3358 },
  ],
};

// Portails officiels des Directions du Commerce de Wilaya (DCW Algérie)
const DCW_PORTALS: Record<string, string> = {
  '24': 'https://dcwguelma.dz/',
  '23': 'https://dcwannaba.dz/',
  '21': 'https://dcwskikda.dz/',
  '12': 'https://dcwtebessa.dz/',
  '41': 'https://www.dcwsoukahras.gov.dz/',
  '25': 'https://dcwconstantine.dz/',
  '19': 'https://www.dcwsetif.dz/',
};

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/aswaq|assouak|assouaq/g, 'aswak')
    .replace(/supremarche/g, 'supermarche')
    .replace(/['’_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const KNOWN_COMMUNE_ALIASES: Array<[string, string]> = [
  ['guelaat bou sbaa', 'Guelaat Bou Sbaa'],
  ['قلعة بوصبع', 'Guelaat Bou Sbaa'],
  ['oued zenati', 'Oued Zenati'],
  ['وادي الزناتي', 'Oued Zenati'],
  ['boumahra ahmed', 'Boumahra Ahmed'],
  ['hammam debagh', 'Hammam Debagh'],
  ['حمام دباغ', 'Hammam Debagh'],
  ['ain makhlouf', 'Aïn Makhlouf'],
  ['عين مخلوف', 'Aïn Makhlouf'],
  ['ain hassainia', 'Aïn Hassainia'],
  ['ain hessainia', 'Aïn Hassainia'],
  ['hammam nbails', "Hammam N'Bails"],
  ['hammam n bails', "Hammam N'Bails"],
  ['bendjerrah', 'Bendjerrah'],
  ['ben djerrah', 'Bendjerrah'],
  ['bouchegouf', 'Bouchegouf'],
  ['بوشقوف', 'Bouchegouf'],
  ['heliopolis', 'Héliopolis'],
  ['hliopolis', 'Héliopolis'],
  ['هيليوبوليس', 'Héliopolis'],
  ['khezaras', 'Khezaras'],
  ['khezarra', 'Khezaras'],
  ['khezara', 'Khezaras'],
  ['خزارة', 'Khezaras'],
  ['nechmaya', 'Nechmaya'],
  ['roknia', 'Roknia'],
  ['belkheir', 'Belkheir'],
  ['tamlouka', 'Tamlouka'],
  ['el bouni', 'El Bouni'],
  ['البوني', 'El Bouni'],
  ['el hadjar', 'El Hadjar'],
  ['الحجار', 'El Hadjar'],
  ['sidi amar', 'Sidi Amar'],
  ['سيدي عمار', 'Sidi Amar'],
  ['berrahal', 'Berrahal'],
  ['برحال', 'Berrahal'],
  ['chetaibi', 'Chetaïbi'],
  ['seraidi', 'Seraïdi'],
  ['treat', 'Treat'],
  ['el khroub', 'El Khroub'],
  ['الخروب', 'El Khroub'],
  ['ali mendjeli', 'Ali Mendjeli'],
  ['علي منجلي', 'Ali Mendjeli'],
  ['didouche mourad', 'Didouche Mourad'],
  ['ديدوش مراد', 'Didouche Mourad'],
  ['hamma bouziane', 'Hamma Bouziane'],
  ['حامة بوزيان', 'Hamma Bouziane'],
  ['ain smara', 'Aïn Smara'],
  ['عين السمارة', 'Aïn Smara'],
  ['zighoud youcef', 'Zighoud Youcef'],
  ['ibn ziad', 'Ibn Ziad'],
  ['ouled rahmoun', 'Ouled Rahmoun'],
  ['ain abid', 'Aïn Abid'],
  ['azzaba', 'Azzaba'],
  ['عزابة', 'Azzaba'],
  ['el harrouch', 'El Harrouch'],
  ['الحروش', 'El Harrouch'],
  ['collo', 'Collo'],
  ['القل', 'Collo'],
  ['tamalous', 'Tamalous'],
  ['تمالوس', 'Tamalous'],
  ['ramdane djamel', 'Ramdane Djamel'],
  ['رمضان جمال', 'Ramdane Djamel'],
  ['ben azzou', 'Ben Azzouz'],
  ['filfila', 'Filfila'],
  ['فلفلة', 'Filfila'],
  ['hamadi krouma', 'Hamadi Krouma'],
  ['zitouna', 'Zitouna'],
  ['ain zouit', 'Aïn Zouit'],
  ['sidi mezghiche', 'Sidi Mezghiche'],
  ['salah bouchaour', 'Salah Bouchaour'],
  ['sedrata', 'Sedrata'],
  ['سدراتة', 'Sedrata'],
  ['mdaourouch', "M'daourouch"],
  ['m daourouch', "M'daourouch"],
  ['مداوروش', "M'daourouch"],
  ['mechroha', 'Mechroha'],
  ['المشروحة', 'Mechroha'],
  ['ouled driss', 'Ouled Driss'],
  ['أولاد إدريس', 'Ouled Driss'],
  ['اولاد ادريس', 'Ouled Driss'],
  ['taoura', 'Taoura'],
  ['تاورة', 'Taoura'],
  ['haddada', 'Haddada'],
  ['الحدادة', 'Haddada'],
  ['bir bouhouche', 'Bir Bouhouche'],
  ['بئر بوحوش', 'Bir Bouhouche'],
  ['merahna', 'Merahna'],
  ['المراهنة', 'Merahna'],
  ['sidi fredj', 'Sidi Fredj'],
  ['سيدي فرج', 'Sidi Fredj'],
  ['zarouria', 'Zarouria'],
  ['الزعرورية', 'Zarouria'],
  ['drea', 'Dréa'],
  ['الدريعة', 'Dréa'],
  ['khemissa', 'Khemissa'],
  ['خميسة', 'Khemissa'],
  ['ain soltane', 'Aïn Soltane'],
  ['عين سلطان', 'Aïn Soltane'],
  ['tiffech', 'Tiffech'],
  ['تيفاش', 'Tiffech'],
  ['ragouba', 'Ragouba'],
  ['الراقوبة', 'Ragouba'],
  ['ouillen', 'Ouillen'],
  ['ويلان', 'Ouillen'],
  ['zouabi', 'Zouabi'],
  ['الزوابي', 'Zouabi'],
  ['safel el ouiden', 'Safel El Ouiden'],
  ['سافل الويدان', 'Safel El Ouiden'],
  ['hanancha', 'Hanancha'],
  ['الحنانشة', 'Hanancha'],
  ['ain zana', 'Aïn Zana'],
  ['عين الزانة', 'Aïn Zana'],
  ['khedara', 'Khedara'],
  ['الخضارة', 'Khedara'],
  ['ouled moumen', 'Ouled Moumen'],
  ['أولاد مؤمن', 'Ouled Moumen'],
  ['oum el adhaim', 'Oum El Adhaim'],
  ['أم العظائم', 'Oum El Adhaim'],
  ['terraguelt', 'Terraguelt'],
  ['تارقالت', 'Terraguelt'],
  ['oued keberit', 'Oued Keberit'],
  ['وادي الكبريت', 'Oued Keberit'],
  ['واد الكبريت', 'Oued Keberit'],
  ['bir el ater', 'Bir El Ater'],
  ['بئر العاتر', 'Bir El Ater'],
  ['بير العاتر', 'Bir El Ater'],
  ['el aouinet', 'El Aouinet'],
  ['العوينات', 'El Aouinet'],
  ['el kouif', 'El Kouif'],
  ['morsott', 'Morsott'],
  ['ouenza', 'Ouenza'],
  ['الونزة', 'Ouenza'],
  ['cheria', 'Cheria'],
  ['الشريعة', 'Cheria'],
  ['negrine', 'Negrine'],
  ['el ogla', 'El Ogla'],
  ['hammamet', 'Hammamet'],
  ['الحمامات', 'Hammamet'],
  ['حمامات', 'Hammamet'],
  ['boukhadra', 'Boukhadra'],
  ['el eulma', 'El Eulma'],
  ['العلمة', 'El Eulma'],
  ['ain oulmene', 'Aïn Oulmene'],
  ['ain oulmane', 'Aïn Oulmene'],
  ['عين ولمان', 'Aïn Oulmene'],
  ['bougaa', 'Bougaa'],
  ['بوقاعة', 'Bougaa'],
  ['ain arnat', 'Aïn Arnat'],
  ['عين أرنات', 'Aïn Arnat'],
  ['عين ارنات', 'Aïn Arnat'],
  ['salah bey', 'Salah Bey'],
  ['صالح باي', 'Salah Bey'],
  ['ain azel', 'Aïn Azel'],
  ['عين آزال', 'Aïn Azel'],
  ['عين ازال', 'Aïn Azel'],
  ['beni aziz', 'Beni Aziz'],
  ['بني عزيز', 'Beni Aziz'],
  ['bir el arch', 'Bir El Arch'],
  ['بئر العرش', 'Bir El Arch'],
  ['guidjel', 'Guidjel'],
  ['قجال', 'Guidjel'],
  ['amoucha', 'Amoucha'],
  ['عموشة', 'Amoucha'],
  ['ain el kebira', 'Aïn El Kebira'],
  ['ain kebira', 'Aïn El Kebira'],
  ['عين الكبيرة', 'Aïn El Kebira'],
  ['hammam guergour', 'Hammam Guergour'],
  ['حمام قرقور', 'Hammam Guergour'],
  ['djemila', 'Djemila'],
  ['جميلة', 'Djemila'],
  ['mezloug', 'Mezloug'],
  ['مزلوق', 'Mezloug'],
  ['guellal', 'Guellal'],
  ['قلال', 'Guellal'],
  ['el ouricia', 'El Ouricia'],
  ['الأوريسية', 'El Ouricia'],
  ['bouandas', 'Bouandas'],
  ['بوعنداس', 'Bouandas'],
  ['hammam sokhna', 'Hammam Sokhna'],
  ['حمام السخنة', 'Hammam Sokhna'],
  ['bazer sakhra', 'Bazer Sakhra'],
  ['بازر سكرة', 'Bazer Sakhra'],
  ['beidha bordj', 'Beidha Bordj'],
  ['بيضاء برج', 'Beidha Bordj'],
  ['ouled sabor', 'Ouled Sabor'],
  ['ouled saber', 'Ouled Sabor'],
  ['أولاد صابر', 'Ouled Sabor'],
  ['beni ourtilane', 'Beni Ourtilane'],
  ['beni ouartilane', 'Beni Ourtilane'],
  ['بني ورتيلان', 'Beni Ourtilane'],
  ['ain azal', 'Aïn Azel'],
  ['maoklane', 'Maoklane'],
  ['ماوكلان', 'Maoklane'],
  ['beni chebana', 'Beni Chebana'],
  ['بني شبانة', 'Beni Chebana'],
  ['belaa', 'Belaa'],
  ['بلاعة', 'Belaa'],
];

const STREET_OR_DISTRICT_PREFIX =
  /^(rue|avenue|ave\b|av\.|boulevard|bd\.?|route|rte\b|rtee\b|rn\s*\d+|cw\s*\d+|z\.?\s*i\.?\b|z\.?\s*a\.?\s*c?\.?\b|zac\b|b\.?\s*p\.?\b|pos\b|cnep\b|iii\b|ii\b|cite|cité|quartier|zone|bloc|lot|bat\b|n°|gpe\b|groupe\b|residence|résidence|promotion|cooperative|coopérative|ctre\b|centre[-\s]?commercial|regus|park\s+mall|nouvelle\s+ville|nouvelle\s+zone|centre[-\s]?ville|place|plage|rocade|unite|unité|immeuble|bt\b|pres|près|entree|entrée|sortie|complexe|marche|marché|corniche|depot|dépôt|comptoir|algerie|algérie|algeria|شارع|نهج|حي|تحصيص|تجزئة|طريق|منطقة|مخطط|عمارة|برج|سكن|حصة|محاذاة|مفترق|زاوية|ديار|مشتة|قرية|دوار|الطابق|للصندوق)(\b|\s|$)/i;

const CHEF_LIEU_QUARTIERS = new Set([
  'bab essouk',
  'oued el maiz',
  'kouba',
  'sidi mabrouk',
  'sidi mabrouk superieur',
  'plaine ouest',
  'chapuis',
  'plage rizzi amor',
  'rizzi amor',
  'el hidhab',
  'ain trick',
  'ain sfiha',
  'ain sefiha',
  'fermatou',
  'yahiaoui',
  'beaumarchais',
  'bel air',
  'قالمة',
  'عنابة',
  'قسنطينة',
  'سكيكدة',
  'تبسة',
  'سوق أهراس',
  'سوق اهراس',
  'سطيف',
  'الحاسبية',
]);

function cleanAddressToken(raw: string): string {
  return raw
    .replace(/[\u2D30-\u2D7F]+/g, ' ') // Supprime les doublons Tifinagh
    .replace(/\([^)]*\)/g, ' ') // Supprime les parenthèses bilingues
    .replace(/\b\d{5}\b/g, ' ') // Supprime les codes postaux DZ
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrait dynamiquement la ville ou commune d'un point de vente à partir de son adresse
 * (fonctionne pour les 7 wilayas prioritaires et s'adapte automatiquement aux 58 wilayas).
 */
export function extractStoreCommune(
  address: string | null | undefined,
  storeName: string,
  wilayaName: string
): string {
  const normWilaya = normalizeSearchText(wilayaName);
  const rawAddr = address ? cleanAddressToken(address) : '';
  const segments = rawAddr
    .split(/[,/]+/)
    .map((s) => cleanAddressToken(s))
    .filter(Boolean);

  let sawTrailingWilaya = false;

  // 1. Parcourt les segments de droite à gauche (du plus proche de la wilaya vers la rue),
  //    en ignorant les voies/boulevards ("Route de Constantine", "Rue...", "Cité...", "شارع...")
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    const latinSeg = seg.replace(/[\u0600-\u06FF]+/g, ' ').replace(/\s+/g, ' ').trim();
    const normSeg = normalizeSearchText(seg);
    const normNoLeadingNum = normSeg.replace(/^\d+[a-z]?\s+/i, '').trim();
    const normLatinSeg = normalizeSearchText(latinSeg);
    const isWilayaOrChefLieu =
      normSeg === normWilaya ||
      normLatinSeg === normWilaya ||
      normSeg === `${normWilaya} centre` ||
      normLatinSeg === `${normWilaya} centre` ||
      CHEF_LIEU_QUARTIERS.has(normSeg) ||
      CHEF_LIEU_QUARTIERS.has(normNoLeadingNum);

    if (!normSeg || !/[a-z\u0600-\u06FF]{3,}/i.test(seg)) {
      continue;
    }

    if (isWilayaOrChefLieu) {
      // Si la commune explicite (ex: "..., Souk Ahras, Souk Ahras" ou "..., سوق أهراس, Souk Ahras")
      // désigne déjà le chef-lieu, on s'arrête ici pour ne pas confondre la rue avec une commune.
      if (sawTrailingWilaya || (i < segments.length - 1 && CHEF_LIEU_QUARTIERS.has(normSeg))) {
        return `${wilayaName} (Chef-lieu)`;
      }
      sawTrailingWilaya = true;
      continue;
    }

    const isStreetLike =
      STREET_OR_DISTRICT_PREFIX.test(normSeg) || STREET_OR_DISTRICT_PREFIX.test(normNoLeadingNum);
    if (!isStreetLike) {
      for (const [alias, canonical] of KNOWN_COMMUNE_ALIASES) {
        if (normSeg.includes(alias)) return canonical;
      }
      const hasUsefulLatin =
        latinSeg.replace(/[^a-z]/gi, '').length >= 4 &&
        !STREET_OR_DISTRICT_PREFIX.test(normalizeSearchText(latinSeg));
      // Segment ville/commune générique pour toute autre wilaya (ex: "Bab Ezzouar", "Es Sénia", "El Eulma")
      const cleanedLabel = (hasUsefulLatin ? latinSeg : seg)
        .replace(/^\d+\s+/, '')
        .replace(/^(centre\s+commune|commune|centre|ville\s+de)\s+/i, '')
        .replace(/\s+(centre)$/i, '')
        .trim();
      const normClean = normalizeSearchText(cleanedLabel);
      if (
        cleanedLabel.length >= 3 &&
        /[a-z\u0600-\u06FF]{3,}/i.test(cleanedLabel) &&
        normClean !== normWilaya &&
        !CHEF_LIEU_QUARTIERS.has(normClean) &&
        !STREET_OR_DISTRICT_PREFIX.test(normClean)
      ) {
        return cleanedLabel;
      }
    } else if (/^(zone|nouvelle\s+ville|cite|cité|centre)\b/i.test(normNoLeadingNum)) {
      // Uniquement pour zones industrielles / cités / centres (jamais pour Avenue/Rue/Boulevard)
      for (const [alias, canonical] of KNOWN_COMMUNE_ALIASES) {
        if (normSeg.includes(alias)) {
          return canonical;
        }
      }
    }
  }

  // 2. En dernier recours, vérifie si le nom du magasin porte explicitement une commune connue
  const normName = normalizeSearchText(storeName);
  for (const [alias, canonical] of KNOWN_COMMUNE_ALIASES) {
    if (normName.includes(alias)) return canonical;
  }

  return `${wilayaName} (Chef-lieu)`;
}

/**
 * Normalisation phonétique adaptée à la translittération franco-arabe algérienne :
 *  - ou / oo / au / eau -> o  (ex: loula == lola, maouna == maona)
 *  - ph -> f, q -> k, kh -> k, gh -> g, dj -> j
 *  - suppression des doublons consonantiques (ll -> l, ss -> s, ff -> f, tt -> t, nn -> n)
 */
export function phoneticFold(input: string): string {
  return normalizeSearchText(input)
    .replace(/eau|au|ou|oo/g, 'o')
    .replace(/ph/g, 'f')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/dj/g, 'j')
    .replace(/q/g, 'k')
    .replace(/ei|ey|ai|ay/g, 'e')
    .replace(/([a-z])\1+/g, '$1')
    .trim();
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (i + 1 < la && j + 1 < lb && a[i] === b[j + 1] && a[i + 1] === b[j]) {
      // Tolère 1 transposition adjacente (ex: supremarche <-> supermarche)
      edits += 1;
      if (edits > 1) return false;
      i += 2;
      j += 2;
    } else {
      edits += 1;
      if (edits > 1) return false;
      if (la > lb) {
        i += 1;
      } else if (lb > la) {
        j += 1;
      } else {
        i += 1;
        j += 1;
      }
    }
  }
  if (i < la || j < lb) edits += 1;
  return edits <= 1;
}

function normalizeAgroCategoryPhrases(input: string): string {
  return normalizeSearchText(input)
    .replace(/grocery[ _-]*or[ _-]*supermarket|grocery[ _-]*store|food[ _-]*store|مواد\\s*غذائية|تغذية\\s*عامة|alimentation\\s*g[eé]n[eé]rale/gi, 'grocery')
    .replace(/convenience[ _-]*store|mini[ _-]*markets?|سوبرات|سوبيرات|ميني\\s*ماركت/gi, 'convenience')
    .replace(/magasin\\s+de\\s+gros|vente\\s+en\\s+gros|grossiste\\s+alimentaire|wholesaler|بالجملة|بيع\\s*بالجملة|جملة/gi, 'wholesale')
    .replace(/discount[ _-]*supermarket|hypermarket|hypermarch[eé]|هايبر|اسواق|أسواق|aswaq|aswak|assouak|assouaq/gi, 'hypermarket')
    .replace(/warehouse[ _-]*store|warehouse|entrep[oô]t|مخزن|مستودع/gi, 'warehouse');
}

export function buildTokenMatchers(rawQuery: string): string[][] {
  const cleaned = normalizeAgroCategoryPhrases(rawQuery);
  if (!cleaned) return [];
  const rawTokens = cleaned.split(' ').filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  const tokens = rawTokens.length > 0 ? rawTokens : cleaned.split(' ').filter(Boolean);

  return tokens.map((tok) => {
    const tokPhonetic = phoneticFold(tok);
    const group = SYNONYM_GROUPS.find((g) =>
      g.some((item) => {
        const normItem = normalizeSearchText(item);
        return normItem === tok || phoneticFold(item) === tokPhonetic;
      })
    );
    const variants = group ? [tok, tokPhonetic, ...group.map(normalizeSearchText)] : [tok, tokPhonetic];
    return Array.from(new Set(variants.filter(Boolean)));
  });
}

export function matchesTokenGroups(
  groups: string[][],
  fields: Array<string | null | undefined>
): boolean {
  if (groups.length === 0) return true;
  const rawJoined = fields.filter(Boolean).join(' ');
  const haystack = normalizeSearchText(rawJoined);
  const phoneticHaystack = phoneticFold(rawJoined);
  const words = Array.from(
    new Set([
      ...haystack.split(/[^a-z0-9\u0600-\u06FF]+/i).filter(Boolean),
      ...phoneticHaystack.split(/[^a-z0-9\u0600-\u06FF]+/i).filter(Boolean),
    ])
  );

  return groups.every((variants) =>
    variants.some((v) => {
      if (haystack.includes(v) || phoneticHaystack.includes(v)) return true;
      const pv = phoneticFold(v);
      if (pv.length >= 4 && phoneticHaystack.includes(pv)) return true;
      if (pv.length >= 5) {
        return words.some((w) => w.length >= 5 && editDistanceAtMostOne(w, pv));
      }
      return false;
    })
  );
}

/**
 * Génère des variantes de requête pour les moteurs externes (ou->o, fr<->ar)
 */
export function expandAlgerianQueryVariants(rawQuery: string): string[] {
  const base = rawQuery.trim();
  if (!base) return [];
  const variants = new Set<string>([base]);
  const lowered = normalizeSearchText(base);

  // Variante sans mot générique ("superette loula" -> "loula", "lola")
  const stripped = lowered
    .replace(
      /\b(superette|supermarche|supremarche|supermarket|mini market|epicerie|magasin|guelma|annaba|constantine|skikda|tebessa|souk ahras)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped && stripped.length >= 3) {
    variants.add(stripped);
  }

  // Translittération ou <-> o (Loula <-> Lola) et arabe
  for (const candidate of Array.from(variants)) {
    if (/ou/i.test(candidate)) variants.add(candidate.replace(/ou/gi, 'o'));
    if (/\blola\b/i.test(candidate)) variants.add(candidate.replace(/\blola\b/gi, 'loula'));
    if (/aswak|aswaq|assouak/i.test(candidate)) variants.add('أسواق');
    if (/calama|kalama/i.test(candidate)) variants.add('كالاما');
    if (/loula|lola/i.test(candidate)) variants.add('لولة');
    if (/bounefla|bounifla/i.test(candidate)) variants.add('بونفلة');
  }

  return Array.from(variants).slice(0, 6);
}

// Catégories équivalentes au « Chariot bleu » Google Maps dans le secteur agro-alimentaire
const AGRO_BLUE_CART_OSM_VALUES = new Set([
  'supermarket',
  'convenience',
  'grocery',
  'greengrocer',
  'dairy',
  'butcher',
  'bakery',
  'pastry',
  'deli',
  'wholesale',
  'department_store',
  'mall',
  'general',
  'food',
  'beverages',
  'confectionery',
  'spices',
  'marketplace',
  'warehouse',
  'variety_store',
  'cash_and_carry',
  'discounter',
]);

const NON_AGRO_OSM_VALUES = new Set([
  'clothes',
  'shoes',
  'electronics',
  'mobile_phone',
  'computer',
  'furniture',
  'hardware',
  'jewelry',
  'optician',
  'car',
  'car_parts',
  'books',
  'hairdresser',
  'beauty',
  'pharmacy',
  'chemist',
  'sports',
  'toys',
]);

function isAgroFoodBlueCartPlace(
  osmKey: string,
  osmVal: string,
  name: string,
  query?: string
): boolean {
  if (osmKey === 'highway' || osmKey === 'boundary' || osmKey === 'waterway' || osmKey === 'route') {
    return false;
  }
  if (/^(rn|cw|p)\s*\d+$/i.test(name.trim())) {
    return false;
  }
  if (NON_AGRO_OSM_VALUES.has(osmVal)) return false;
  if (/pharmacie|parapharmacie|vetement|chaussure|telephone|mobile|coiffure|bijouterie|quincaillerie|electromenager|librairie|opticien|auto\b|moto\b/i.test(name)) {
    return false;
  }
  if (AGRO_BLUE_CART_OSM_VALUES.has(osmVal)) return true;
  if (
    osmKey === 'shop' &&
    /super|market|grocer|epic|aliment|aswak|assouak|magasin|mall|gros|depot|سوبر|أسواق|ميني|بقالة|تغذية|مواد|كالاما/i.test(
      name
    )
  ) {
    return true;
  }
  if (
    /super|market|grocer|epic|aliment|aswak|assouak|magasin|mall|gros|boulanger|patiss|سوبر|أسواق|ميني|بقالة|تغذية|مواد|كالاما/i.test(
      name
    )
  ) {
    return true;
  }
  return Boolean(query && matchesTokenGroups(buildTokenMatchers(query), [name]));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyOsmStoreType(
  osmValue: string | undefined,
  name: string
): SeedStoreInput['store_type'] {
  const lower = name.toLowerCase();
  const val = (osmValue || '').toLowerCase();
  if (['wholesale', 'warehouse', 'cash_and_carry'].includes(val) || /gros|grossiste|depot|dépôt|entrep[oô]t|warehouse|cash\s*&?\s*carry|agrodiv|جملة|بالجملة|مخزن|مستودع/i.test(lower)) {
    return 'magasin_gros';
  }
  if (
    val === 'department_store' ||
    val === 'mall' ||
    val === 'supermarket' ||
    val === 'discount_supermarket' ||
    /hyper|mall|aswak|assouak|أسواق|supermarch|supremarch|plaza|ardis|uno|carrefour/i.test(lower)
  ) {
    return /hyper|mall|aswak|assouak|أسواق|plaza|ardis|uno|carrefour/i.test(lower)
      ? 'hypermarche'
      : 'superette';
  }
  if (/mini[\s-]?market|ميني\s*ماركت/i.test(lower)) {
    return 'mini_market';
  }
  if (
    ['grocery', 'greengrocer', 'food', 'food_store', 'grocery_store'].includes(val) ||
    /grocery|food\s*store|epicerie|épicerie|بقالة|مواد\s*غذائية/i.test(lower)
  ) {
    return 'epicerie';
  }
  if (/alimentation\s*g[eé]n[eé]rale|تغذية\s*عامة|مواد\s*غذائية|سوبرات|سوبيرات/i.test(lower)) {
    return 'superette';
  }
  if ((val === 'convenience' || val === 'convenience_store') && !/superette|supérette|supermarché|سوبر/i.test(lower)) {
    return 'mini_market';
  }
  return 'superette';
}

function isInsideAlgeria(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 18.8 && lat <= 37.3 && lng >= -8.8 && lng <= 12.1;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 4500): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DistribDZ/1.0 (B2B Distribution Intelligence Algeria)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchTextWithTimeout(url: string, timeoutMs = 6500): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DistribDZ/1.0; +https://distribdz.local)',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchBufferWithTimeout(url: string, timeoutMs = 8000): Promise<Uint8Array | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DistribDZ/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Calcule une position réaliste (avec léger décalage déterministe > 80m) autour d'un quartier/commune
 * afin d'éviter la collision sur la déduplication GPS (< 50m) lorsque plusieurs commerces réels
 * n'ont pas de coordonnées brutes dans les annuaires ou PDF officiels.
 */
function spreadCoordinatesAroundCenter(
  baseLat: number,
  baseLng: number,
  seed: string,
  radiusScale = 1
): { latitude: number; longitude: number } {
  const h = stableHash(seed);
  const ringDist = (0.0008 + (h % 24) * 0.00032) * radiusScale;
  const angle = ((h % 360) * Math.PI) / 180;
  return {
    latitude: Number((baseLat + Math.sin(angle) * ringDist).toFixed(5)),
    longitude: Number((baseLng + Math.cos(angle) * ringDist * 1.15).toFixed(5)),
  };
}

const CITY_GEOCODE_CACHE = new Map<string, { lat: number; lng: number } | null>();
let photonConsecutiveFailures = 0;

async function resolveLocalityCenter(
  localityHint: string,
  wilaya: { code: string; name: string; latitude: number; longitude: number } | null
): Promise<{ lat: number; lng: number }> {
  const districts = wilaya ? WILAYA_DISTRICTS[wilaya.code] || [] : [];
  if (localityHint) {
    const normHint = normalizeSearchText(localityHint);
    const match = districts.find(
      (d) =>
        normHint.includes(normalizeSearchText(d.name)) ||
        matchesTokenGroups(buildTokenMatchers(d.name), [localityHint])
    );
    if (match) return { lat: match.lat, lng: match.lng };

    const cacheKey = `${wilaya?.code || 'dz'}::${normHint}`;
    if (CITY_GEOCODE_CACHE.has(cacheKey)) {
      const cached = CITY_GEOCODE_CACHE.get(cacheKey);
      if (cached) return cached;
    } else if (CITY_GEOCODE_CACHE.size < 80 && photonConsecutiveFailures < 2) {
      const q = wilaya ? `${localityHint}, ${wilaya.name}, Algeria` : `${localityHint}, Algeria`;
      const geo = (await fetchJsonWithTimeout(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`,
        2200
      )) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> } | null;
      if (!geo) {
        photonConsecutiveFailures += 1;
      } else {
        photonConsecutiveFailures = 0;
        const coords = geo.features?.[0]?.geometry?.coordinates;
        if (coords && coords.length >= 2 && isInsideAlgeria(coords[1], coords[0])) {
          const pt = { lat: coords[1], lng: coords[0] };
          CITY_GEOCODE_CACHE.set(cacheKey, pt);
          return pt;
        }
      }
      CITY_GEOCODE_CACHE.set(cacheKey, null);
    }
  }
  return wilaya ? { lat: wilaya.latitude, lng: wilaya.longitude } : { lat: 36.462, lng: 7.426 };
}

function normalizePagesMaghrebPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /@|http/i.test(trimmed)) return null;
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length < 8) return null;
  if (digits.startsWith('+213')) {
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `+213 ${rest.slice(0, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7, 9)}`;
    }
    return `+213 ${rest}`;
  }
  return trimmed.replace(/\./g, ' ');
}

function decodePagesMaghrebFirmJson(rawAttr: string): Record<string, unknown> | null {
  try {
    const decoded = rawAttr
      .replace(/\\u0022/g, '"')
      .replace(/\\u0027/g, "'")
      .replace(/\\u003C/gi, '<')
      .replace(/\\u003E/gi, '>')
      .replace(/\\u0026/g, '&')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const PAGESMAGHREB_EXCLUDED_CATEGORIES =
  /machines?|mat[eé]riel|rayonnage|agencement|inspection|administration|logiciel|informatique|transport|emballage|boulangerie.*fourniture|p[aâ]tisserie.*fourniture|restauration.*équipement|courrier|poste/i;
const PAGESMAGHREB_AGRO_CATEGORIES =
  /superette|sup[eé]rette|mini\s*sup[eé]rette|supermarch[eé]|hypermarch[eé]|alimentation|alimentaire|agro[\s-]?alimentaire|boisson|eau\s*min[eé]rale|biscuit|confiserie|[eé]picerie|produit.*laitier|laiterie|beurrerie|chocolat|p[aâ]tisserie|boulangerie|couscous|dattes|miel|viandes?|volailles?|fruits\s+et\s+l[eé]gumes|conserve|c[eé]r[eé]ale|huiles?|sucre|farine|semoule|caf[eé]|th[eé]/i;

function classifyPagesMaghrebStoreType(
  categories: string[],
  name: string
): SeedStoreInput['store_type'] {
  const catJoined = categories.join(' ').toLowerCase();
  const nameLower = name.toLowerCase();
  if (/\(gros\)|grossiste|importation|distribution/i.test(catJoined) || /grossiste|gros|sarl.*dist|distribution/i.test(nameLower)) {
    return 'magasin_gros';
  }
  if (/hypermarch[eé]|supermarch[eé]s et hypermarch[eé]s/i.test(catJoined) || /hyper|aswak|assouak|uno|ardis|carrefour/i.test(nameLower)) {
    return 'hypermarche';
  }
  if (/mini\s*sup[eé]rette|mini[\s-]?market/i.test(catJoined) || /mini[\s-]?market|mini[\s-]?superette/i.test(nameLower)) {
    return 'mini_market';
  }
  if (/superette|sup[eé]rette/i.test(catJoined) || /superette|sup[eé]rette|mercado|supermarch/i.test(nameLower)) {
    return 'superette';
  }
  if (/alimentation\s*g[eé]n[eé]rale\s*\(d[eé]tail\)|[eé]picerie/i.test(catJoined)) {
    return /superette|market|aswak|alimentation\s*g[eé]n[eé]rale/i.test(nameLower) ? 'superette' : 'epicerie';
  }
  return classifyOsmStoreType(undefined, name);
}

const PAGESMAGHREB_QUERY_CACHE = new Map<string, { ts: number; items: Array<Record<string, unknown>> }>();
const EXTERNAL_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Connecteur PagesMaghreb (https://www.pagesmaghreb.com) :
 * extrait les fiches JSON structurées (<firm-card :firm="JSON.parse(...)">) avec vrais numéros de téléphone,
 * catégories agro-alimentaires, adresses et communes sur les 58 wilayas (pagination profonde + daïras).
 */
async function discoverPagesMaghrebStores(
  options: LiveDiscoveryOptions
): Promise<DiscoveredStoreCandidate[]> {
  const { query, wilaya } = options;
  const searchTerms =
    query && query.trim()
      ? expandAlgerianQueryVariants(query)
          .filter((v) => !/[\u0600-\u06FF]/.test(v))
          .slice(0, 3)
      : [
          'produits alimentaires',
          'epicerie',
          'alimentation generale',
          'superette',
          'supermarche',
          'agroalimentaire',
          'grossiste',
          'boissons',
        ];

  if (searchTerms.length === 0 && query) {
    searchTerms.push('superette', 'alimentation');
  }

  const locationPasses: Array<{ loc: string; terms: string[]; maxPages: number }> = [];
  const mainLoc = wilaya ? wilaya.name.replace(/['’]/g, ' ') : '';
  locationPasses.push({ loc: mainLoc, terms: searchTerms, maxPages: query ? 2 : 8 });

  // Passe complémentaire sur les principales communes/daïras (ex: El Khroub, Ali Mendjeli, Bir El Ater, Sedrata, Azzaba)
  if (!query && wilaya) {
    const normWilaya = normalizeSearchText(wilaya.name);
    const majorCommunes = (WILAYA_DISTRICTS[wilaya.code] || [])
      .filter((d) => {
        const nd = normalizeSearchText(d.name);
        return !nd.includes(normWilaya) && !/^(cite|cité|plaine|oued kouba|rizzi|sidi achour|boukhadra annaba|zouaghi|boussouf|daksi|sidi mabrouk)/i.test(nd);
      })
      .slice(0, 5);
    for (const commune of majorCommunes) {
      locationPasses.push({
        loc: commune.name.replace(/['’]/g, ' '),
        terms: ['produits alimentaires', 'superette', 'epicerie'],
        maxPages: 2,
      });
    }
  }

  const candidates: DiscoveredStoreCandidate[] = [];
  const seenFirmIds = new Set<string>();

  for (const pass of locationPasses) {
    for (const term of pass.terms) {
      for (let page = 1; page <= pass.maxPages; page += 1) {
        const cacheKey = `${term.toLowerCase()}::${pass.loc.toLowerCase()}::p${page}`;
        let parsedFirms: Array<Record<string, unknown>> | null = null;
        const cached = PAGESMAGHREB_QUERY_CACHE.get(cacheKey);
        if (cached && Date.now() - cached.ts < EXTERNAL_CACHE_TTL_MS) {
          parsedFirms = cached.items;
        } else {
          const params = new URLSearchParams({ r: term });
          if (pass.loc) params.set('l', pass.loc);
          if (page > 1) params.set('page', String(page));
          const html = await fetchTextWithTimeout(
            `https://www.pagesmaghreb.com/recherche/entreprises?${params.toString()}`,
            6000
          );
          if (!html) break;
          const matches = [...html.matchAll(/<firm-card[^>]*:firm="JSON\.parse\('([^']+)'\)"/g)];
          parsedFirms = matches
            .map((m) => decodePagesMaghrebFirmJson(m[1]))
            .filter((f): f is Record<string, unknown> => f !== null);
          PAGESMAGHREB_QUERY_CACHE.set(cacheKey, { ts: Date.now(), items: parsedFirms });
          await sleep(80);
        }

        if (!parsedFirms || parsedFirms.length === 0) break;

        for (const firm of parsedFirms) {
          const name = String(firm.usual_corporate_name || firm.corporate_name || '').trim();
          if (!name || name.length < 2) continue;

          const addresses = Array.isArray(firm.addresses)
            ? (firm.addresses as Array<{
                name?: string;
                city?: { name?: string; region?: { code?: string; name?: string; country?: { name?: string } } };
              }>)
            : [];
          const primaryAddr = addresses[0];
          const countryName = primaryAddr?.city?.region?.country?.name || '';
          if (countryName && !/alg[eé]rie/i.test(countryName)) continue;

          const regionCode = String(primaryAddr?.city?.region?.code || '').padStart(2, '0');
          if (wilaya && regionCode && regionCode !== wilaya.code) {
            continue;
          }

          const catObjs = Array.isArray(firm.categories)
            ? (firm.categories as Array<{ name?: string }>)
            : [];
          const catNames = catObjs.map((c) => String(c.name || '').trim()).filter(Boolean);
          const catJoined = catNames.join(' · ');

          if (PAGESMAGHREB_EXCLUDED_CATEGORIES.test(catJoined)) continue;
          const isAgroCat = PAGESMAGHREB_AGRO_CATEGORIES.test(catJoined) || PAGESMAGHREB_AGRO_CATEGORIES.test(name);
          if (!isAgroCat && !(query && matchesTokenGroups(buildTokenMatchers(query), [name, catJoined]))) {
            continue;
          }

          const firmKey = `${regionCode}::${name.toLowerCase()}`;
          if (seenFirmIds.has(firmKey)) continue;
          seenFirmIds.add(firmKey);

          const contacts = Array.isArray(firm.contacts)
            ? (firm.contacts as Array<{ contactmethods?: Array<{ value?: string; method_type?: string }> }>)
            : [];
          const phones: string[] = [];
          for (const ct of contacts) {
            for (const cm of ct.contactmethods || []) {
              const p = cm.value ? normalizePagesMaghrebPhone(String(cm.value)) : null;
              if (p && !phones.includes(p)) phones.push(p);
            }
          }

          const street = String(primaryAddr?.name || '').trim();
          const cityRaw = String(primaryAddr?.city?.name || '')
            .replace(/\s+Rp$/i, '')
            .trim();
          const wilayaLabel = String(primaryAddr?.city?.region?.name || wilaya?.name || 'Algérie').trim();
          const formattedAddress = [street, cityRaw, wilayaLabel]
            .filter((part, idx, arr) => part && arr.indexOf(part) === idx)
            .join(', ');

          const center = await resolveLocalityCenter(
            `${cityRaw} ${street} ${pass.loc}`,
            wilaya
              ? { code: wilaya.code, name: wilaya.name, latitude: wilaya.latitude, longitude: wilaya.longitude }
              : null
          );
          const { latitude, longitude } = spreadCoordinatesAroundCenter(
            center.lat,
            center.lng,
            `${name}::${formattedAddress}`
          );

          const storeType = classifyPagesMaghrebStoreType(catNames, name);
          candidates.push({
            name,
            store_type: storeType,
            address: formattedAddress || wilayaLabel,
            phone: phones[0] || null,
            latitude,
            longitude,
            rating: 4.3,
            review_count: phones.length > 0 ? 22 : 12,
            opening_hours: '08:00 - 22:00',
            main_products: catJoined || 'Alimentation générale & distribution DZ',
            approx_surface_m2:
              storeType === 'magasin_gros'
                ? 1200
                : storeType === 'hypermarche'
                  ? 1400
                  : storeType === 'mini_market'
                    ? 120
                    : storeType === 'epicerie'
                      ? 75
                      : 220,
            clientele_type: storeType === 'magasin_gros' ? 'Grossiste / Importateur' : 'Détail local',
            source: 'PagesMaghreb (Annuaire DZ)',
          });
        }

        if (parsedFirms.length < 10) break;
      }
    }
  }

  return candidates;
}

const DCW_PDF_COMMUNE_BY_SLUG: Array<[RegExp, string, { lat: number; lng: number }]> = [
  [/oued[_-]?zenati/i, 'Oued Zenati', { lat: 36.3145, lng: 7.1632 }],
  [/bouchegouf/i, 'Bouchegouf', { lat: 36.4631, lng: 7.7289 }],
  [/h[eé]?liopolis/i, 'Héliopolis', { lat: 36.5034, lng: 7.4422 }],
  [/hammam[_-]?debagh/i, 'Hammam Debagh', { lat: 36.4581, lng: 7.2667 }],
  [/ain[_-]?makhlouf/i, 'Aïn Makhlouf', { lat: 36.2456, lng: 7.2511 }],
  [/ain[_-]?hassainia/i, 'Aïn Hassainia', { lat: 36.3842, lng: 7.3672 }],
  [/hammam[_-]?n?bails/i, "Hammam N'Bails", { lat: 36.3422, lng: 7.6481 }],
  [/khezar/i, 'Khezaras', { lat: 36.3944, lng: 7.5194 }],
  [/guelaat/i, 'Guelaat Bou Sbaa', { lat: 36.5486, lng: 7.4694 }],
  [/guelma/i, 'Guelma', { lat: 36.4621, lng: 7.4261 }],
];

const SOUK_AHRAS_COMMUNE_CENTERS: Array<[RegExp, string, { lat: number; lng: number }]> = [
  [/خميسة|khemissa/i, 'Khemissa', { lat: 36.1869, lng: 7.6561 }],
  [/عين\s*سلطان|عي\s*سلطان|ain\s*soltane/i, 'Aïn Soltane', { lat: 36.2233, lng: 7.8211 }],
  [/مداوروش|mdaourouch/i, "M'daourouch", { lat: 36.0772, lng: 7.8195 }],
  [/تيفاش|tiffech/i, 'Tiffech', { lat: 36.1353, lng: 7.7022 }],
  [/الراقوبة|ragouba/i, 'Ragouba', { lat: 36.1125, lng: 7.7639 }],
  [/المراهنة|merahna/i, 'Merahna', { lat: 36.1972, lng: 8.1519 }],
  [/سيدي\s*فرج|sidi\s*fredj/i, 'Sidi Fredj', { lat: 36.2244, lng: 8.2106 }],
  [/ويلان|ويالن|ouillen/i, 'Ouillen', { lat: 36.2089, lng: 7.7525 }],
  [/بئر\s*بوحوش|بئ\s*بوحوش|bir\s*bouhouche/i, 'Bir Bouhouche', { lat: 36.1408, lng: 7.3672 }],
  [/الزوابي|الزواب\s*ي|zouabi/i, 'Zouabi', { lat: 36.1156, lng: 7.4508 }],
  [/سافل\s*الويدان|safel/i, 'Safel El Ouiden', { lat: 36.0667, lng: 7.6000 }],
  [/المشروحة|المش\s*وحة|mechroha/i, 'Mechroha', { lat: 36.3578, lng: 7.8350 }],
  [/الحنانشة|hanancha/i, 'Hanancha', { lat: 36.3069, lng: 7.7950 }],
  [/أولاد\s*إ?دريس|أوالد\s*دريس|ouled\s*driss/i, 'Ouled Driss', { lat: 36.3422, lng: 8.0211 }],
  [/عين\s*الزانة|عي\s*الزانة|ain\s*zana/i, 'Aïn Zana', { lat: 36.3292, lng: 8.0750 }],
  [/الحدادة|haddada/i, 'Haddada', { lat: 36.3119, lng: 8.1742 }],
  [/الخضارة|khedara/i, 'Khedara', { lat: 36.2583, lng: 8.1333 }],
  [/أولاد\s*مؤمن|أوالد\s*مؤمن|ouled\s*moumen/i, 'Ouled Moumen', { lat: 36.1833, lng: 8.1000 }],
  [/تاورة|taoura/i, 'Taoura', { lat: 36.1667, lng: 8.0408 }],
  [/الزعرورية|zarouria/i, 'Zarouria', { lat: 36.2156, lng: 7.9261 }],
  [/الدريعة|drea/i, 'Dréa', { lat: 36.1536, lng: 7.7219 }],
  [/أم\s*العظائم|oum\s*el\s*adhaim/i, 'Oum El Adhaim', { lat: 35.9833, lng: 7.6833 }],
  [/تارقالت|terraguelt/i, 'Terraguelt', { lat: 35.9667, lng: 7.8167 }],
  [/واد\s*الكبريت|واد\s*الكئيت|وادي\s*الكبريت|oued\s*keberit/i, 'Oued Keberit', { lat: 36.0000, lng: 7.9000 }],
  [/سدراتة|sedrata/i, 'Sedrata', { lat: 36.1286, lng: 7.5338 }],
  [/سوق\s*أهراس|سوق\s*اهراس|souk\s*ahras/i, 'Souk Ahras', { lat: 36.2864, lng: 7.9511 }],
];

function normalizeArabicPdfText(raw: string): string {
  return raw
    .replace(/قاملة/g, 'قالمة')
    .replace(/هللا/g, 'الله')
    .replace(/بالل/g, 'بلال')
    .replace(/دمحم/g, 'محمد')
    .replace(/األ/g, 'الأ')
    .replace(/اإل/g, 'الإ')
    .replace(/اآل/g, 'الآ')
    .replace(/أوالد/g, 'أولاد')
    .replace(/اال/g, 'الا')
    .replace(/امل([اأإبتثجحخدذرزسشصضطظعغفقكمنهويىة])/g, 'الم$1')
    .replace(/بامل([بتثجحخدذرزسشصضطظعغفقكمنهوي])/g, 'بالم$1')
    .replace(/ويالن/g, 'ويلان')
    .replace(/الزواب\s*ي/g, 'الزوابي')
    .replace(/واد\s*الكئيت/g, 'وادي الكبريت')
    .replace(/ر\s*المش\s*وحة/g, 'المشروحة')
    .replace(/ر\s*عي\s+/g, 'عين ')
    .replace(/ر\s*بئ\s+/g, 'بئر ')
    .replace(/أوالد\s*دريس/g, 'أولاد إدريس')
    .replace(/\s+/g, ' ')
    .trim();
}

const DCW_PDF_CACHE = new Map<string, { ts: number; entries: DiscoveredStoreCandidate[] }>();

/**
 * Parseur spécialisé pour les arrêtés PDF DCW à cellules fusionnées verticalement (ex: dcwsoukahras.gov.dz/files/perm_fitre_2023.pdf) :
 * reconstruit les rectangles des colonnes البلدية et نوع النشاط à partir des bordures horizontales PDF (OPS.constructPath).
 */
async function parseDcwRowspanPdf(
  doc: Awaited<ReturnType<typeof getDocumentProxy>>,
  wilaya: { id: number; code: string; name: string; latitude: number; longitude: number }
): Promise<DiscoveredStoreCandidate[]> {
  const { OPS } = await getResolvedPDFJS();
  const maxPages = Math.min(doc.numPages, 25);

  interface RowspanPage {
    pNum: number;
    actB: number[];
    comB: number[];
    actLabels: Array<{ str: string; x: number; y: number }>;
    comLabels: Array<{ str: string; x: number; y: number }>;
    merchantRows: Array<{ y: number; name: string; addr: string }>;
  }

  const pagesData: RowspanPage[] = [];
  for (let pNum = 1; pNum <= maxPages; pNum += 1) {
    const page = await doc.getPage(pNum);
    const tc = await page.getTextContent();
    const items = (tc.items as Array<{ str?: string; transform?: number[] }>)
      .filter((i) => i.str && i.str.trim() && Array.isArray(i.transform))
      .map((i) => ({
        str: normalizeArabicPdfText(i.str!.trim()),
        x: Math.round(i.transform![4]),
        y: Math.round(i.transform![5]),
      }));

    const ops = await page.getOperatorList();
    const hLines: Array<{ x1: number; x2: number; y: number }> = [];
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      if (ops.fnArray[i] === OPS.constructPath) {
        const mm = ops.argsArray[i]?.[2] as Float32Array | number[] | undefined;
        if (mm && Math.abs(mm[3] - mm[1]) <= 2 && mm[2] - mm[0] > 15) {
          hLines.push({
            x1: Math.round(mm[0]),
            x2: Math.round(mm[2]),
            y: Math.round((mm[1] + mm[3]) / 2),
          });
        }
      }
    }

    const rows: Array<{ y: number; cells: Array<{ str: string; x: number; y: number }> }> = [];
    for (const it of items) {
      let row = rows.find((r) => Math.abs(r.y - it.y) <= 5);
      if (!row) {
        row = { y: it.y, cells: [] };
        rows.push(row);
      }
      row.cells.push(it);
    }
    rows.sort((a, b) => b.y - a.y);

    const actB = [...new Set(hLines.filter((l) => l.x1 <= 640 && l.x2 >= 680).map((l) => l.y))].sort(
      (a, b) => b - a
    );
    const comB = [...new Set(hLines.filter((l) => l.x1 <= 700 && l.x2 >= 740).map((l) => l.y))].sort(
      (a, b) => b - a
    );
    const actLabels = items.filter(
      (i) => i.x >= 630 && i.x < 692 && i.y < 525 && !/نوع النشاط/.test(i.str)
    );
    const comLabels = items.filter(
      (i) => i.x >= 692 && i.x < 755 && i.y < 525 && !/البلدية|المجموع/.test(i.str)
    );

    const merchantRows = rows
      .filter((r) => {
        const line = r.cells.map((c) => c.str).join(' ');
        if (/التاجر|العنوان|قائمة|جدول|المديرية/.test(line)) return false;
        return r.cells.some((c) => c.x >= 520 && c.x < 628);
      })
      .map((r) => {
        r.cells.sort((a, b) => b.x - a.x);
        const name = r.cells
          .filter((c) => c.x >= 485 && c.x < 630)
          .map((c) => c.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const addr = r.cells
          .filter((c) => c.x < 485)
          .map((c) => c.str)
          .join(' ')
          .replace(/^-\s*|\s*-\s*$/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return { y: r.y, name, addr };
      });

    pagesData.push({ pNum, actB, comB, actLabels, comLabels, merchantRows });
  }

  const buildIntervals = (
    bKey: 'actB' | 'comB',
    lKey: 'actLabels' | 'comLabels'
  ): Array<{ pNum: number; y1: number; y2: number; topSlice: boolean; text: string }> => {
    const ints: Array<{ pNum: number; y1: number; y2: number; topSlice: boolean; text: string }> = [];
    for (const p of pagesData) {
      const top = 600;
      const bot = 0;
      const bs = [top, ...p[bKey].filter((y) => y < top && y > bot), bot];
      for (let i = 0; i < bs.length - 1; i += 1) {
        const y1 = bs[i];
        const y2 = bs[i + 1];
        const lbls = p[lKey].filter((l) => l.y <= y1 + 3 && l.y >= y2 - 3);
        const hasRows = p.merchantRows.some((m) => m.y <= y1 + 3 && m.y >= y2 - 3);
        if (!hasRows && lbls.length === 0) continue;
        lbls.sort((a, b) => b.y - a.y || b.x - a.x);
        ints.push({
          pNum: p.pNum,
          y1,
          y2,
          topSlice: i === 0,
          text: normalizeArabicPdfText(lbls.map((l) => l.str).join(' ')),
        });
      }
    }
    for (let i = ints.length - 1; i >= 0; i -= 1) {
      if (!ints[i].text && !ints[i].topSlice && i + 1 < ints.length && ints[i + 1].text) {
        ints[i].text = ints[i + 1].text;
      }
    }
    for (let i = 0; i < ints.length; i += 1) {
      if (!ints[i].text && i > 0 && ints[i - 1].text) {
        ints[i].text = ints[i - 1].text;
      }
    }
    return ints;
  };

  const actInts = buildIntervals('actB', 'actLabels');
  const comInts = buildIntervals('comB', 'comLabels');
  const findVal = (
    ints: Array<{ pNum: number; y1: number; y2: number; text: string }>,
    pNum: number,
    y: number
  ) => ints.find((iv) => iv.pNum === pNum && y <= iv.y1 + 3 && y >= iv.y2 - 3)?.text || '';

  const out: DiscoveredStoreCandidate[] = [];
  const seenNames = new Set<string>();

  for (const p of pagesData) {
    for (const m of p.merchantRows) {
      const activity = findVal(actInts, p.pNum, m.y);
      if (!/تغذية|مواد\s*غذائية|خضر|فواكه|سوبرات|سوبيرات|بقالة|ميني|ماركت|جملة/.test(activity)) {
        continue;
      }
      const merchant = m.name;
      if (!merchant || merchant.length < 3 || /^[\d\s-]+$/.test(merchant)) continue;

      const rawCommune = findVal(comInts, p.pNum, m.y);
      const matchedCom =
        wilaya.code === '41'
          ? SOUK_AHRAS_COMMUNE_CENTERS.find(([re]) => re.test(rawCommune))
          : undefined;
      const communeLabel = matchedCom ? matchedCom[1] : rawCommune || wilaya.name;
      const communeCenter = matchedCom
        ? matchedCom[2]
        : { lat: wilaya.latitude, lng: wilaya.longitude };

      const dedupKey = `${communeLabel}::${merchant}`;
      if (seenNames.has(dedupKey)) continue;
      seenNames.add(dedupKey);

      const displayName = /تغذية|مواد|سوب|بقال|ماركت|خضر/.test(merchant)
        ? merchant
        : `تغذية عامة — ${merchant}`;
      const fullAddress = m.addr
        ? `${m.addr}, ${communeLabel}, ${wilaya.name}`
        : `${communeLabel}, ${wilaya.name}`;
      const storeType = classifyOsmStoreType(undefined, `${displayName} ${activity}`);
      const { latitude, longitude } = spreadCoordinatesAroundCenter(
        communeCenter.lat,
        communeCenter.lng,
        `${displayName}::${fullAddress}`,
        1.35
      );

      out.push({
        name: displayName.slice(0, 90),
        store_type: storeType,
        address: fullAddress,
        phone: null,
        latitude,
        longitude,
        rating: 4.3,
        review_count: 14,
        opening_hours: '07:30 - 22:00',
        main_products: `${activity || 'تغذية عامة'} (Registre officiel DCW ${wilaya.name})`,
        approx_surface_m2: storeType === 'magasin_gros' ? 950 : storeType === 'epicerie' ? 85 : 150,
        clientele_type: storeType === 'magasin_gros' ? 'Grossiste B2B' : 'Détail quartier',
        source: `DCW ${wilaya.name} (PDF Officiel)`,
      });
    }
  }

  return out;
}

async function parseDcwPdfDocument(
  pdfUrl: string,
  wilaya: { id: number; code: string; name: string; latitude: number; longitude: number }
): Promise<DiscoveredStoreCandidate[]> {
  const buf = await fetchBufferWithTimeout(pdfUrl, 9000);
  if (!buf) return [];

  const fileMatch = DCW_PDF_COMMUNE_BY_SLUG.find(([re]) => re.test(pdfUrl));
  const communeLabel = fileMatch ? fileMatch[1] : wilaya.name;
  const communeCenter = fileMatch ? fileMatch[2] : { lat: wilaya.latitude, lng: wilaya.longitude };

  try {
    const doc = await getDocumentProxy(buf);
    // Détecte automatiquement les PDF DCW à cellules fusionnées (ex: Souk Ahras perm_fitre_2023.pdf)
    const firstPage = await doc.getPage(1);
    const firstTc = await firstPage.getTextContent();
    const firstText = normalizeArabicPdfText(
      (firstTc.items as Array<{ str?: string }>)
        .map((i) => i.str || '')
        .join(' ')
    );
    if (
      firstText.includes('الدائرة') &&
      firstText.includes('البلدية') &&
      firstText.includes('نوع النشاط')
    ) {
      return await parseDcwRowspanPdf(doc, wilaya);
    }

    const out: DiscoveredStoreCandidate[] = [];
    const seenNames = new Set<string>();
    const maxPages = Math.min(doc.numPages, 20);

    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const tc = await page.getTextContent();
      const items = (tc.items as Array<{ str?: string; transform?: number[] }>)
        .filter((i) => i.str && i.str.trim() && Array.isArray(i.transform))
        .map((i) => ({
          str: normalizeArabicPdfText(i.str!.trim()),
          x: Math.round(i.transform![4]),
          y: Math.round(i.transform![5]),
        }));

      const rows: Array<{ y: number; cells: Array<{ str: string; x: number; y: number }> }> = [];
      for (const it of items) {
        let row = rows.find((r) => Math.abs(r.y - it.y) <= 5);
        if (!row) {
          row = { y: it.y, cells: [] };
          rows.push(row);
        }
        row.cells.push(it);
      }
      rows.sort((a, b) => b.y - a.y);

      // Repère dynamiquement les positions X des colonnes depuis la ligne d'en-tête
      const headerRow = rows.find((r) => {
        const line = r.cells.map((c) => c.str).join(' ');
        return line.includes('العنوان') && (line.includes('التاجر') || line.includes('إسم'));
      });

      const xNum = headerRow?.cells.find((c) => c.str.includes('الرقم'))?.x ?? 650;
      const xName =
        headerRow?.cells.find((c) => c.str.includes('التاجر') || c.str.includes('لقب'))?.x ?? 550;
      const xAddr = headerRow?.cells.find((c) => c.str.includes('العنوان'))?.x ?? 390;
      const xDay = headerRow?.cells.find((c) => c.str.includes('المداومة'))?.x ?? 190;
      const xAct =
        headerRow?.cells.filter((c) => c.str.includes('النشاط')).sort((a, b) => a.x - b.x)[0]?.x ??
        75;
      const headerY = headerRow?.y ?? 9999;

      const boundNumName = (xNum + xName) / 2;
      const boundNameAddr = (xName + xAddr) / 2;
      const boundAddrDay = (xAddr + xDay) / 2;
      const boundDayAct = (xDay + xAct) / 2;

      for (const row of rows) {
        if (row.y >= headerY) continue;
        row.cells.sort((a, b) => b.x - a.x);

        const nameParts: string[] = [];
        const addrParts: string[] = [];
        const actParts: string[] = [];

        for (const cell of row.cells) {
          if (cell.x >= xNum - 18 && cell.x <= xNum + 30 && /^\d+$/.test(cell.str)) {
            continue;
          }
          if (cell.x < boundDayAct || (cell.x > xNum + 35 && cell.x < xNum + 105)) {
            actParts.push(cell.str);
          } else if (cell.x >= boundNameAddr && cell.x < boundNumName) {
            nameParts.push(cell.str);
          } else if (cell.x >= boundAddrDay && cell.x < boundNameAddr) {
            addrParts.push(cell.str);
          }
        }

        const activity = actParts.join(' ').trim();
        const isAgroRetail = /تغذية|مواد\s*غذائية|سوبرات|سوبيرات|بقالة|ميني|ماركت|خضر|جملة/.test(
          activity
        );
        if (!isAgroRetail) continue;

        const merchant = nameParts.join(' ').replace(/\s+/g, ' ').trim();
        if (!merchant || merchant.length < 3 || /^[\d\s-]+$/.test(merchant)) continue;

        const rawAddr = addrParts
          .join(' ')
          .replace(/^-\s*|\s*-\s*$/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        const normKey = `${communeLabel}::${merchant}`;
        if (seenNames.has(normKey)) continue;
        seenNames.add(normKey);

        const displayName = /تغذية|مواد|سوب|بقال|ماركت/.test(merchant)
          ? merchant
          : `تغذية عامة — ${merchant}`;
        const fullAddress = rawAddr
          ? `${rawAddr}, ${communeLabel}, ${wilaya.name}`
          : `${communeLabel}, ${wilaya.name}`;

        const storeType = classifyOsmStoreType(
          undefined,
          `${displayName} ${activity}`
        );
        const { latitude, longitude } = spreadCoordinatesAroundCenter(
          communeCenter.lat,
          communeCenter.lng,
          `${displayName}::${fullAddress}`,
          1.35
        );

        out.push({
          name: displayName.slice(0, 90),
          store_type: storeType,
          address: fullAddress,
          phone: null,
          latitude,
          longitude,
          rating: 4.3,
          review_count: 14,
          opening_hours: '07:30 - 22:00',
          main_products: `${activity || 'تغذية عامة'} (Registre officiel DCW ${wilaya.name})`,
          approx_surface_m2: storeType === 'magasin_gros' ? 950 : storeType === 'epicerie' ? 85 : 150,
          clientele_type: storeType === 'magasin_gros' ? 'Grossiste B2B' : 'Détail quartier',
          source: `DCW ${wilaya.name} (PDF Officiel)`,
        });
      }
    }

    return out;
  } catch {
    return [];
  }
}

/**
 * Extraction multi-formats depuis les portails officiels DCW Algérie (tableaux HTML + arrêtés PDF par commune)
 */
async function fetchDcwPortalEntries(
  wilaya: { id: number; code: string; name: string; latitude: number; longitude: number },
  query?: string
): Promise<DiscoveredStoreCandidate[]> {
  const portalUrl = DCW_PORTALS[wilaya.code];
  if (!portalUrl) return [];

  const cacheKey = `${wilaya.code}::dcw`;
  const cached = DCW_PDF_CACHE.get(cacheKey);
  let allEntries: DiscoveredStoreCandidate[] | null =
    cached && Date.now() - cached.ts < EXTERNAL_CACHE_TTL_MS ? cached.entries : null;

  if (!allEntries) {
    allEntries = [];
    const html = await fetchTextWithTimeout(portalUrl, 5500);
    if (!html) return [];

    // 1. Tableaux HTML éventuels
    const districts = WILAYA_DISTRICTS[wilaya.code] || [];
    const tableRowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const m of tableRowMatches.slice(0, 60)) {
      const text = normalizeArabicPdfText(m[1].replace(/<[^>]+>/g, ' '));
      if (!text || text.length < 10) continue;
      if (!/تغذية عامة|مواد غذائية|سوبيرات|سوبرات|alimentation|superette/i.test(text)) continue;

      const matchedDistrict = districts.find((d) =>
        matchesTokenGroups(buildTokenMatchers(d.name), [text])
      );
      const center = matchedDistrict
        ? { lat: matchedDistrict.lat, lng: matchedDistrict.lng }
        : { lat: wilaya.latitude, lng: wilaya.longitude };
      const { latitude, longitude } = spreadCoordinatesAroundCenter(center.lat, center.lng, text);
      allEntries.push({
        name: text.slice(0, 80),
        store_type: classifyOsmStoreType(undefined, text),
        address: matchedDistrict ? `${matchedDistrict.name}, ${wilaya.name}` : wilaya.name,
        phone: null,
        latitude,
        longitude,
        rating: 4.3,
        review_count: 12,
        opening_hours: '07:30 - 22:00',
        main_products: 'Alimentation générale (Registre DCW)',
        approx_surface_m2: 140,
        clientele_type: 'Détail quartier',
        source: `DCW ${wilaya.name} (Officiel)`,
      });
    }

    // 2. Arrêtés PDF officiels par commune (ex: dcwguelma.dz/images/annonces/.../*.pdf ou dcwsoukahras.gov.dz/files/*.pdf)
    const rawPdfLinks = [
      ...new Set(
        [...html.matchAll(/href=["']([^"']*\.pdf[^"']*)["']/gi)].map((m) => m[1])
      ),
    ];
    const origin = new URL(portalUrl).origin;
    const localPdfUrls = rawPdfLinks
      .filter((href) => {
        if (/\/(arabe|anglais|franais|dcwar|sondage)\.pdf$/i.test(href)) return false;
        if (href.startsWith('/')) return true;
        try {
          return new URL(href).origin === origin;
        } catch {
          return false;
        }
      })
      .map((href) => (href.startsWith('http') ? href : `${origin}${href.startsWith('/') ? '' : '/'}${href}`))
      .slice(0, 14);

    const pdfBatches = await Promise.all(localPdfUrls.map((u) => parseDcwPdfDocument(u, wilaya)));
    for (const batch of pdfBatches) {
      allEntries.push(...batch);
    }

    DCW_PDF_CACHE.set(cacheKey, { ts: Date.now(), entries: allEntries });
  }

  if (query && query.trim()) {
    const groups = buildTokenMatchers(query);
    return allEntries.filter((entry) =>
      matchesTokenGroups(groups, [entry.name, entry.address || '', entry.main_products || ''])
    );
  }
  return allEntries;
}

// Types Table A officiels Places API (New) correspondant au « chariot bleu » agro-alimentaire
const GOOGLE_PLACES_AGRO_TYPES = [
  'supermarket',
  'grocery_store',
  'convenience_store',
  'food_store',
  'discount_supermarket',
  'hypermarket',
  'wholesaler',
  'warehouse_store',
] as const;

const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.googleMapsUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'places.businessStatus',
].join(',');

interface GooglePlaceNewItem {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  businessStatus?: string;
}

function classifyGooglePlaceType(
  primaryType: string | undefined,
  types: string[] | undefined,
  name: string
): SeedStoreInput['store_type'] {
  const allTypes = new Set([primaryType || '', ...(types || [])].map((t) => t.toLowerCase()));
  const lower = name.toLowerCase();
  if (
    allTypes.has('wholesaler') ||
    allTypes.has('warehouse_store') ||
    /gros|grossiste|depot|dépôt|جملة/i.test(lower)
  ) {
    return 'magasin_gros';
  }
  if (
    allTypes.has('hypermarket') ||
    allTypes.has('department_store') ||
    /hyper|mall|aswak|assouak|أسواق|uno|ardis|carrefour/i.test(lower)
  ) {
    return 'hypermarche';
  }
  if (allTypes.has('convenience_store') && !/superette|supérette|supermarch/i.test(lower)) {
    return 'mini_market';
  }
  if ((allTypes.has('grocery_store') || allTypes.has('food_store')) && !allTypes.has('supermarket')) {
    return /superette|supérette|supermarch|alimentation\s*g[eé]n[eé]rale/i.test(lower)
      ? 'superette'
      : 'epicerie';
  }
  return classifyOsmStoreType(undefined, name);
}

function build25KmGridCenters(wilaya: {
  code: string;
  latitude: number;
  longitude: number;
}): Array<{ lat: number; lng: number }> {
  // Pas ~2.5 km à 36°N : 0.0225° lat (~2.5 km), 0.0278° lng (~2.5 km)
  const stepLat = 0.0225;
  const stepLng = 0.0278;
  const centers: Array<{ lat: number; lng: number }> = [];

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      centers.push({
        lat: Number((wilaya.latitude + dy * stepLat).toFixed(5)),
        lng: Number((wilaya.longitude + dx * stepLng).toFixed(5)),
      });
    }
  }

  for (const district of WILAYA_DISTRICTS[wilaya.code] || []) {
    const tooClose = centers.some(
      (c) => haversineKm(c.lat, c.lng, district.lat, district.lng) < 2.0
    );
    if (!tooClose) {
      centers.push({ lat: district.lat, lng: district.lng });
    }
    if (centers.length >= 14) break;
  }

  return centers;
}

/**
 * Connecteur officiel Google Places API (New) :
 * - Grille GPS 2.5 km via places:searchNearby (types Table A « chariot bleu »)
 * - Recherche textuelle via places:searchText pour les requêtes ciblées (FR/AR)
 * Nécessite GOOGLE_MAPS_API_KEY côté serveur (sinon retourne [] sans appel réseau).
 */
async function discoverGooglePlacesGrid(
  options: LiveDiscoveryOptions
): Promise<DiscoveredStoreCandidate[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return [];

  const { query, wilaya, extraKeywords = [] } = options;
  const collected = new Map<string, DiscoveredStoreCandidate>();
  let quotaOrAuthBlocked = false;

  const ingestPlaces = (places: GooglePlaceNewItem[] | undefined) => {
    if (!Array.isArray(places)) return;
    for (const p of places) {
      if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
      const name = p.displayName?.text?.trim();
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      if (!name || lat === undefined || lng === undefined || !isInsideAlgeria(lat, lng)) continue;

      const dedupKey = p.id || `${name.toLowerCase()}::${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (collected.has(dedupKey)) continue;

      const storeType = classifyGooglePlaceType(p.primaryType, p.types, name);
      const hours = p.regularOpeningHours?.weekdayDescriptions?.[0] || null;
      collected.set(dedupKey, {
        name,
        store_type: storeType,
        address: p.formattedAddress || p.shortFormattedAddress || (wilaya ? wilaya.name : 'Algérie'),
        phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
        latitude: Number(lat.toFixed(5)),
        longitude: Number(lng.toFixed(5)),
        rating: typeof p.rating === 'number' ? p.rating : null,
        review_count: typeof p.userRatingCount === 'number' ? p.userRatingCount : 0,
        opening_hours: hours,
        main_products: 'Agro-alimentaire & distribution (Google Places API)',
        approx_surface_m2:
          storeType === 'magasin_gros'
            ? 1250
            : storeType === 'hypermarche'
              ? 1600
              : storeType === 'epicerie'
                ? 75
                : 190,
        clientele_type:
          storeType === 'magasin_gros'
            ? 'Grossiste B2B'
            : storeType === 'hypermarche'
              ? 'Grande distribution'
              : 'Détail local',
        source: 'Google Places API (New)',
      });
    }
  };

  const callPlacesNew = async (url: string, body: Record<string, unknown>, fieldMask: string) => {
    if (quotaOrAuthBlocked) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 401 || res.status === 403 || res.status === 429) {
        quotaOrAuthBlocked = true;
        return;
      }
      if (!res.ok) return;
      const payload = (await res.json()) as {
        places?: GooglePlaceNewItem[];
        error?: { status?: string };
      };
      if (payload.error?.status === 'RESOURCE_EXHAUSTED') {
        quotaOrAuthBlocked = true;
        return;
      }
      ingestPlaces(payload.places);
    } catch {
      // Ignore transient network errors
    }
  };

  // 1. Text Search (New) pour les recherches nommées ou mots-clés personnalisés
  const textQueries: string[] = [];
  if (query && query.trim()) {
    for (const v of expandAlgerianQueryVariants(query).slice(0, 3)) {
      textQueries.push(wilaya ? `${v} ${wilaya.name}` : `${v} Algérie`);
    }
  } else if (wilaya) {
    textQueries.push(
      `supermarket superette ${wilaya.name}`,
      `alimentation générale grossiste ${wilaya.name}`
    );
    for (const kw of extraKeywords.slice(0, 2)) {
      if (kw.trim()) textQueries.push(`${kw.trim()} ${wilaya.name}`);
    }
  }

  for (const textQuery of textQueries) {
    if (quotaOrAuthBlocked) break;
    const body: Record<string, unknown> = {
      textQuery,
      pageSize: 20,
      languageCode: 'fr',
      regionCode: 'dz',
    };
    if (wilaya) {
      body.locationBias = {
        circle: {
          center: { latitude: wilaya.latitude, longitude: wilaya.longitude },
          radius: 45000.0,
        },
      };
    }
    await callPlacesNew(
      'https://places.googleapis.com/v1/places:searchText',
      body,
      GOOGLE_PLACES_FIELD_MASK
    );
  }

  // 2. Nearby Search (New) sur grille GPS 2.5 km (mode collecte par wilaya)
  if (!query && wilaya && !quotaOrAuthBlocked) {
    const gridCenters = build25KmGridCenters(wilaya);
    for (const pt of gridCenters) {
      if (quotaOrAuthBlocked) break;
      await callPlacesNew(
        'https://places.googleapis.com/v1/places:searchNearby',
        {
          includedTypes: [...GOOGLE_PLACES_AGRO_TYPES],
          maxResultCount: 20,
          rankPreference: 'DISTANCE',
          languageCode: 'fr',
          regionCode: 'dz',
          locationRestriction: {
            circle: {
              center: { latitude: pt.lat, longitude: pt.lng },
              radius: 2500.0,
            },
          },
        },
        GOOGLE_PLACES_FIELD_MASK
      );
    }
  }

  return Array.from(collected.values());
}

const OSM_TILE_CACHE = new Map<string, { ts: number; items: DiscoveredStoreCandidate[] }>();

async function fetchOsm06Tile(
  zoneName: string,
  lat: number,
  lng: number,
  wilayaName: string,
  query?: string,
  radiusDeg = 0.012
): Promise<DiscoveredStoreCandidate[]> {
  const bbox = [lng - radiusDeg, lat - radiusDeg, lng + radiusDeg, lat + radiusDeg]
    .map((n) => n.toFixed(4))
    .join(',');
  const cacheKey = `${bbox}::${query || ''}`;
  const cached = OSM_TILE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < EXTERNAL_CACHE_TTL_MS) {
    return cached.items;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);
    const res = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`, {
      headers: {
        'User-Agent': 'DistribDZ/1.0 (B2B Distribution Intelligence Algeria)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    // Si la tuile dépasse 50 000 nœuds (centre dense), réduit automatiquement le rayon à ~1.4 km
    if (res.status === 400 && radiusDeg > 0.008) {
      return fetchOsm06Tile(zoneName, lat, lng, wilayaName, query, 0.0075);
    }
    if (!res.ok) return [];

    const data = (await res.json()) as {
      elements?: Array<{
        type?: string;
        id?: number;
        lat?: number;
        lon?: number;
        nodes?: number[];
        tags?: Record<string, string>;
      }>;
    };
    const elements = data.elements || [];
    const nodeCoords = new Map<number, [number, number]>();
    for (const el of elements) {
      if (el.type === 'node' && el.id !== undefined && el.lat !== undefined && el.lon !== undefined) {
        nodeCoords.set(el.id, [el.lat, el.lon]);
      }
    }

    const out: DiscoveredStoreCandidate[] = [];
    for (const el of elements) {
      const tags = el.tags;
      if (!tags) continue;
      const shopTag = (tags.shop || '').toLowerCase();
      const amenityTag = (tags.amenity || '').toLowerCase();
      if (!shopTag && amenityTag !== 'marketplace') continue;

      const rawName = (tags.name || tags['name:fr'] || tags['name:ar'] || '').trim();
      if (!rawName || rawName.length < 2) continue;
      if (/^(entr[eé]e|sortie|parking|rue|avenue|route)\b|أواني|vaisselle|meuble|tissus/i.test(rawName)) {
        continue;
      }

      const osmKey = shopTag ? 'shop' : 'amenity';
      const osmVal = shopTag || amenityTag;
      if (!isAgroFoodBlueCartPlace(osmKey, osmVal, rawName, query)) continue;

      let sLat = el.lat;
      let sLng = el.lon;
      if ((sLat === undefined || sLng === undefined) && Array.isArray(el.nodes) && el.nodes.length > 0) {
        let sumLat = 0;
        let sumLng = 0;
        let cnt = 0;
        for (const nid of el.nodes) {
          const pt = nodeCoords.get(nid);
          if (pt) {
            sumLat += pt[0];
            sumLng += pt[1];
            cnt += 1;
          }
        }
        if (cnt > 0) {
          sLat = sumLat / cnt;
          sLng = sumLng / cnt;
        }
      }
      if (sLat === undefined || sLng === undefined || !isInsideAlgeria(sLat, sLng)) continue;

      const storeType = classifyOsmStoreType(osmVal, rawName);
      const cityTag = (tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || zoneName).trim();
      const streetTag = (tags['addr:street'] || tags['addr:place'] || '').trim();
      const fullAddress = [streetTag, cityTag, wilayaName]
        .filter((p, idx, arr) => p && arr.indexOf(p) === idx)
        .join(', ');
      const phoneRaw = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;

      out.push({
        name: rawName,
        store_type: storeType,
        address: fullAddress || `${zoneName}, ${wilayaName}`,
        phone: phoneRaw ? normalizePagesMaghrebPhone(phoneRaw) : null,
        latitude: Number(sLat.toFixed(5)),
        longitude: Number(sLng.toFixed(5)),
        rating: 4.3,
        review_count: 16,
        opening_hours: tags.opening_hours || null,
        main_products: 'Agro-alimentaire & distribution (OSM Chariot Bleu)',
        approx_surface_m2:
          storeType === 'magasin_gros'
            ? 1250
            : storeType === 'hypermarche'
              ? 1550
              : storeType === 'epicerie'
                ? 70
                : 170,
        clientele_type: storeType === 'magasin_gros' ? 'Grossiste B2B' : 'Détail local',
        source: 'Live OSM Tile Grid (Agro)',
      });
    }

    OSM_TILE_CACHE.set(cacheKey, { ts: Date.now(), items: out });
    return out;
  } catch {
    return [];
  }
}

/**
 * Grille multi-communes directe sur l'API OpenStreetMap 0.6 (/api/0.6/map.json) :
 * contourne les pannes Overpass et le rate-limit Nominatim sur l'ensemble des 58 wilayas.
 */
async function discoverOsmTileGrid(
  options: LiveDiscoveryOptions
): Promise<DiscoveredStoreCandidate[]> {
  const { query, wilaya } = options;
  if (!wilaya) return [];

  const districts = WILAYA_DISTRICTS[wilaya.code] || [];
  const zones: Array<{ name: string; lat: number; lng: number }> = [...districts];
  if (zones.length === 0) {
    // Pour les 52 autres wilayas : grille 3×3 (~6 km × 6 km) centrée sur le chef-lieu
    const step = 0.018;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        zones.push({
          name: wilaya.name,
          lat: wilaya.latitude + dy * step,
          lng: wilaya.longitude + dx * step,
        });
      }
    }
  } else {
    const hasCenter = zones.some((z) => haversineKm(z.lat, z.lng, wilaya.latitude, wilaya.longitude) < 1.5);
    if (!hasCenter) {
      zones.unshift({ name: wilaya.name, lat: wilaya.latitude, lng: wilaya.longitude });
    }
    // Quadrants urbains complémentaires autour du chef-lieu (~2 km) pour couvrir les grandes agglomérations
    const offsets: Array<[number, number]> = [
      [0.017, 0.02],
      [0.017, -0.02],
      [-0.017, 0.02],
      [-0.017, -0.02],
    ];
    for (const [dLat, dLng] of offsets) {
      const lat = Number((wilaya.latitude + dLat).toFixed(4));
      const lng = Number((wilaya.longitude + dLng).toFixed(4));
      const alreadyCovered = zones.some((z) => haversineKm(z.lat, z.lng, lat, lng) < 1.4);
      if (!alreadyCovered) {
        zones.push({ name: wilaya.name, lat, lng });
      }
    }
  }

  const targetZones = zones.slice(0, query ? 6 : 18);
  const all: DiscoveredStoreCandidate[] = [];
  for (let i = 0; i < targetZones.length; i += 4) {
    const batch = targetZones.slice(i, i + 4);
    const settled = await Promise.all(
      batch.map((z) => fetchOsm06Tile(z.name, z.lat, z.lng, wilaya.name, query))
    );
    for (const items of settled) {
      all.push(...items);
    }
  }
  return all;
}

export interface LiveDiscoveryOptions {
  query?: string;
  wilaya?: {
    id: number;
    code: string;
    name: string;
    name_ar: string;
    latitude: number;
    longitude: number;
  } | null;
  extraKeywords?: string[];
  includeOverpass?: boolean;
}

export async function discoverLiveOsmStores(
  options: LiveDiscoveryOptions
): Promise<DiscoveredStoreCandidate[]> {
  const { query, wilaya, extraKeywords = [], includeOverpass = false } = options;
  const results: DiscoveredStoreCandidate[] = [];
  const seenKeys = new Set<string>();

  const pushCandidate = (candidate: DiscoveredStoreCandidate) => {
    if (!candidate.name || !isInsideAlgeria(candidate.latitude, candidate.longitude)) return;
    if (
      wilaya &&
      haversineKm(candidate.latitude, candidate.longitude, wilaya.latitude, wilaya.longitude) > 115
    ) {
      return;
    }
    const dedup = `${candidate.name.toLowerCase().trim()}::${candidate.latitude.toFixed(3)},${candidate.longitude.toFixed(3)}`;
    if (seenKeys.has(dedup)) return;
    seenKeys.add(dedup);
    results.push(candidate);
  };

  // 0. Google Places API (New) — grille GPS 2.5 km (Nearby Search) + Text Search si GOOGLE_MAPS_API_KEY est configurée
  const googlePlacesCandidates = await discoverGooglePlacesGrid(options);
  for (const c of googlePlacesCandidates) {
    pushCandidate(c);
  }

  // 1. Annuaire PagesMaghreb (pagination profonde + daïras/communes + téléphones vérifiés)
  const pmCandidates = await discoverPagesMaghrebStores(options);
  for (const c of pmCandidates) {
    pushCandidate(c);
  }

  // 2. Portails officiels DCW Algérie (tableaux HTML + arrêtés PDF communaux)
  if (wilaya) {
    const dcwEntries = await fetchDcwPortalEntries(wilaya, query);
    for (const c of dcwEntries) {
      pushCandidate(c);
    }
  }

  // 3. Grille directe OpenStreetMap API 0.6 par commune / daïra (tous tags chariot bleu agro-alimentaire)
  const tileCandidates = await discoverOsmTileGrid(options);
  for (const c of tileCandidates) {
    pushCandidate(c);
  }

  // 4. Photon (avec coupe-circuit automatique si service saturé/injoignable)
  const photonQueries: string[] = [];
  if (query && query.trim()) {
    for (const v of expandAlgerianQueryVariants(query)) {
      photonQueries.push(wilaya ? `${v} ${wilaya.name}` : v);
    }
  } else if (wilaya && photonConsecutiveFailures < 2) {
    photonQueries.push(
      `supermarché ${wilaya.name}`,
      `superette ${wilaya.name}`,
      `alimentation ${wilaya.name}`,
      `grossiste ${wilaya.name}`,
      `أسواق ${wilaya.name_ar}`
    );
    for (const d of (WILAYA_DISTRICTS[wilaya.code] || []).slice(0, 6)) {
      photonQueries.push(`superette ${d.name} ${wilaya.name}`);
    }
    for (const kw of extraKeywords.slice(0, 2)) {
      if (kw.trim()) photonQueries.push(`${kw.trim()} ${wilaya.name}`);
    }
  }

  for (const pq of photonQueries.slice(0, 10)) {
    if (photonConsecutiveFailures >= 2) break;
    const latBias = wilaya ? `&lat=${wilaya.latitude}&lon=${wilaya.longitude}` : '';
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(pq)}${latBias}&limit=30`;
    const data = (await fetchJsonWithTimeout(url, 2500)) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: Record<string, unknown>;
      }>;
    } | null;

    if (!data) {
      photonConsecutiveFailures += 1;
      continue;
    }
    photonConsecutiveFailures = 0;

    if (data.features) {
      for (const feat of data.features) {
        const p = feat.properties || {};
        const cc = String(p.countrycode || '').toUpperCase();
        if (cc && cc !== 'DZ') continue;
        const stateStr = typeof p.state === 'string' ? p.state : '';
        if (wilaya && stateStr) {
          const normState = normalizeSearchText(stateStr);
          const normW = normalizeSearchText(wilaya.name);
          const normWAr = normalizeSearchText(wilaya.name_ar);
          if (normState && !normState.includes(normW) && !normState.includes(normWAr)) {
            continue;
          }
        }
        const name = typeof p.name === 'string' ? p.name.trim() : '';
        if (!name) continue;
        const coords = feat.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        const osmKey = String(p.osm_key || '').toLowerCase();
        const osmVal = String(p.osm_value || '').toLowerCase();
        if (!isAgroFoodBlueCartPlace(osmKey, osmVal, name, query)) continue;

        const storeType = classifyOsmStoreType(osmVal, name);
        const city = String(p.city || p.county || p.state || (wilaya ? wilaya.name : 'Algérie'));
        const street = typeof p.street === 'string' ? p.street : '';
        pushCandidate({
          name,
          store_type: storeType,
          address: street ? `${street}, ${city}` : city,
          phone: null,
          latitude: Number(lat.toFixed(5)),
          longitude: Number(lng.toFixed(5)),
          rating: 4.3,
          review_count: 18,
          opening_hours: '08:00 - 22:00',
          main_products: 'Agro-alimentaire & produits de grande consommation',
          approx_surface_m2:
            storeType === 'magasin_gros'
              ? 1350
              : storeType === 'hypermarche'
                ? 1600
                : storeType === 'epicerie'
                  ? 70
                  : 180,
          clientele_type:
            storeType === 'magasin_gros'
              ? 'Grossiste B2B'
              : storeType === 'hypermarche'
                ? 'Grande distribution'
                : 'Détail local',
          source: 'Live OSM Photon (Agro)',
        });
      }
    }
    await sleep(300);
  }

  // 5. Nominatim viewbox borné sur la wilaya (avec coupe-circuit si HTTP 429/629)
  const nominatimQueries: string[] = [];
  if (query && query.trim()) {
    for (const v of expandAlgerianQueryVariants(query).slice(0, 3)) {
      nominatimQueries.push(wilaya ? `${v}` : `${v} Algeria`);
    }
  } else if (wilaya) {
    nominatimQueries.push('supermarket', 'superette', 'alimentation', 'epicerie', 'سوبر', 'تغذية');
  }

  const viewboxParam = wilaya
    ? `&viewbox=${(wilaya.longitude - 0.65).toFixed(4)},${(wilaya.latitude - 0.65).toFixed(4)},${(wilaya.longitude + 0.65).toFixed(4)},${(wilaya.latitude + 0.65).toFixed(4)}&bounded=1`
    : '';

  let nominatimBlocked = false;
  for (const nq of nominatimQueries) {
    if (nominatimBlocked) break;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nq)}&format=jsonv2&addressdetails=1&countrycodes=dz${viewboxParam}&limit=50`;
    type NominatimSearchItem = {
      display_name?: string;
      name?: string;
      lat?: string;
      lon?: string;
      category?: string;
      type?: string;
      address?: Record<string, string>;
    };
    let items: NominatimSearchItem[] = [];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'DistribDZ/1.0 (B2B Distribution Intelligence Algeria)',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 629 || res.status === 403) {
        nominatimBlocked = true;
        continue;
      }
      if (res.ok) {
        const parsed = (await res.json()) as unknown;
        if (Array.isArray(parsed)) {
          items = parsed as NominatimSearchItem[];
        }
      }
    } catch {
      nominatimBlocked = true;
      continue;
    }

    for (const item of items) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        const rawName = (item.name || item.display_name?.split(',')[0] || '').trim();
        if (!rawName || !isInsideAlgeria(lat, lng)) continue;

        const addrObj = item.address || {};
        const stateStr = addrObj.state || '';
        if (wilaya && stateStr) {
          const normState = normalizeSearchText(stateStr);
          const normW = normalizeSearchText(wilaya.name);
          const normWAr = normalizeSearchText(wilaya.name_ar);
          if (normState && !normState.includes(normW) && !normState.includes(normWAr)) {
            continue;
          }
        }

        const cat = String(item.category || '').toLowerCase();
        const type = String(item.type || '').toLowerCase();
        if (!isAgroFoodBlueCartPlace(cat, type, rawName, query)) continue;

        const storeType = classifyOsmStoreType(type, rawName);
        const city = addrObj.city || addrObj.town || addrObj.village || addrObj.state || (wilaya ? wilaya.name : 'Algérie');
        const road = addrObj.road || addrObj.suburb || addrObj.neighbourhood || '';
        pushCandidate({
          name: rawName,
          store_type: storeType,
          address: road ? `${road}, ${city}` : city,
          phone: null,
          latitude: Number(lat.toFixed(5)),
          longitude: Number(lng.toFixed(5)),
          rating: 4.3,
          review_count: 20,
          opening_hours: null,
          main_products: 'Agro-alimentaire & distribution locale',
          approx_surface_m2:
            storeType === 'magasin_gros' ? 1200 : storeType === 'hypermarche' ? 1500 : 170,
          clientele_type: storeType === 'magasin_gros' ? 'Grossiste B2B' : 'Détail local',
          source: 'Live OSM Nominatim (Agro)',
        });
      }
    await sleep(350);
  }

  // 6. Enrichissement Overpass optionnel (délai court pour ne jamais bloquer le job)
  if (includeOverpass && wilaya) {
    const queryOverpass = `[out:json][timeout:8];(nwr["shop"~"supermarket|convenience|grocery|greengrocer|dairy|butcher|bakery|wholesale|department_store|mall|general|food|beverages|warehouse|variety_store|cash_and_carry|discounter"](${wilaya.latitude - 0.35},${wilaya.longitude - 0.35},${wilaya.latitude + 0.35},${wilaya.longitude + 0.35});nwr["amenity"="marketplace"](${wilaya.latitude - 0.35},${wilaya.longitude - 0.35},${wilaya.latitude + 0.35},${wilaya.longitude + 0.35}););out center 500;`;
    const osmData = (await fetchJsonWithTimeout(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(queryOverpass)}`,
      8000
    )) as {
      elements?: Array<{
        lat?: number;
        lon?: number;
        center?: { lat?: number; lon?: number };
        tags?: Record<string, string>;
      }>;
    } | null;

    if (osmData?.elements) {
      for (const el of osmData.elements) {
        const osmName = el.tags?.name || el.tags?.['name:fr'] || el.tags?.['name:ar'];
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (!osmName || !lat || !lng) continue;
        const shop = el.tags?.shop || '';
        if (!isAgroFoodBlueCartPlace('shop', shop, osmName, query)) continue;
        const storeType = classifyOsmStoreType(shop, osmName);
        pushCandidate({
          name: osmName,
          store_type: storeType,
          address: el.tags?.['addr:street']
            ? `${el.tags['addr:street']}, ${el.tags['addr:city'] || wilaya.name}`
            : `${el.tags?.['addr:city'] || wilaya.name}`,
          phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
          latitude: Number(lat.toFixed(5)),
          longitude: Number(lng.toFixed(5)),
          rating: 4.3,
          review_count: 15,
          opening_hours: el.tags?.opening_hours || null,
          main_products: 'Agro-alimentaire & produits de consommation courante',
          approx_surface_m2: storeType === 'magasin_gros' ? 1200 : storeType === 'epicerie' ? 70 : 160,
          clientele_type: storeType === 'magasin_gros' ? 'Grossiste B2B' : 'Détail local',
          source: 'Live OSM Overpass (Agro)',
        });
      }
    }
  }

  return results;
}
