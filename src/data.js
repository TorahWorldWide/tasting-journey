// ============================================================
// מסע טעימות — data module (exact, verified). Edit catalog/stores here.
// NOTE: persisted state overrides these defaults on an existing install
// (load merges { ...DEFAULT_STATE, ...parsed } and parsed.categories wins).
// New items added here only reach a fresh install or after Reset.
// ============================================================

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const STORAGE_KEY = 'tasting-journey-v2';

// --- Milk catalog: 16 items (15 original + almond-coconut blend) ---
export const MILK_ITEMS = [
  // animal — מן החי
  { name: 'חלב פרה טרי 1%', type: 'animal', desc: 'דל שומן, הכי נפוץ.', where: 'כל סופר' },
  { name: 'חלב פרה טרי 3%', type: 'animal', desc: 'הקלאסי, מלא וקטיפתי.', where: 'כל סופר' },
  { name: 'חלב עמיד 3% (UHT)', type: 'animal', desc: 'נשמר חודשים בלי קירור.', where: 'כל סופר' },
  { name: 'חלב ללא לקטוז', type: 'animal', desc: 'לרגישים ללקטוז, מעט מתקתק.', where: 'שופרסל / סופר הצינור' },
  { name: 'חלב מועשר סידן + D', type: 'animal', desc: 'אותו חלב, מועשר.', where: 'שופרסל' },
  { name: 'חלב עיזים טרי', type: 'animal', desc: 'טעם חזק, נחשב קל יותר לעיכול.', where: 'כליל הטבע / עמליה' },
  { name: 'חלב כבשים', type: 'animal', desc: 'שומני ועשיר, נדיר.', where: 'חנויות טבע / שווקים' },
  { name: 'חלב מרוכז ממותק (עלית)', type: 'animal', desc: 'סמיך ומתוק — לקפה וקינוחים.', where: 'כל סופר' },
  { name: 'לֶבֶּן / חלב חמוץ', type: 'animal', desc: 'חלב מותסס, חמצמץ.', where: 'כל סופר' },
  // plant — משקאות צמחיים
  { name: 'משקה שקדים', type: 'plant', desc: 'קליל, טעם אגוזי עדין.', where: 'כל סופר / עמליה' },
  { name: 'משקה סויה', type: 'plant', desc: 'חלבון גבוה, טעם ניטרלי.', where: 'כל סופר' },
  { name: 'משקה שיבולת שועל', type: 'plant', desc: 'מתקתק, מצוין בקפה.', where: 'כל סופר / כליל הטבע' },
  { name: 'משקה אורז', type: 'plant', desc: 'מתוק וקליל, ללא אלרגנים נפוצים.', where: 'חנויות טבע' },
  { name: 'משקה קוקוס', type: 'plant', desc: 'טעם קוקוס בולט, שומני.', where: 'כל סופר' },
  { name: 'משקה קשיו', type: 'plant', desc: 'קרמי ועשיר.', where: 'חנויות טבע' },
  { name: 'משקה שקדים-קוקוס', type: 'plant', desc: 'שילוב עדין של שקדים וקוקוס (למשל Alpro).', where: 'שופרסל / כל סופר' },
];

// Build full item objects with default status fields.
const makeItem = (raw) => ({
  id: uid(),
  name: raw.name,
  type: raw.type,
  desc: raw.desc,
  where: raw.where,
  status: 'todo',      // todo | list | tasted
  score: 0,            // 0..5
  verdict: '',         // '' | daily | maybe | pass
  bought: false,       // distinct from taste verdict
  image: '',           // url or data-url
  imageSource: '',     // user | off | web | url
  barcode: '',
});

// --- Stores: REAL data, Harish + nearby. hours[getDay()] => {o,c} decimal hrs or null ---
export const STORES = [
  { id: 's1', name: 'שופרסל דיל', addr: 'דרך ארץ 2, חריש',
    lat: 32.4705928, lng: 35.0391716,
    note: 'הכי גדול בחריש — כל חלבי הפרה + צמחי נפוץ',
    hours: [{o:8,c:21},{o:8,c:21},{o:8,c:21},{o:8,c:22},{o:8,c:22},{o:7,c:15.5},null],
    delivery: true, deliveryUrl: 'https://www.shufersal.co.il/online/he/A',
    inventoryUrl: 'https://www.shufersal.co.il/online/he/search?text=' },
  { id: 's2', name: 'סופר הצינור', addr: 'דרך ארץ 28, חריש',
    lat: 32.464241, lng: 35.0411454,
    note: 'דיסקאונט — מוצרי חלב זולים יותר',
    hours: [{o:7.5,c:22},{o:7.5,c:22},{o:7.5,c:22},{o:7.5,c:22},{o:7.5,c:22},{o:7.5,c:15},null],
    delivery: false, deliveryUrl: '', inventoryUrl: '' },
  { id: 's3', name: 'כליל הטבע', addr: 'דרך ארץ 51, חריש',
    lat: 32.4618211, lng: 35.0460919,
    note: 'חנות טבע — משקאות צמחיים וחלב עיזים',
    hours: [{o:8,c:20},{o:8,c:20},{o:8,c:20},{o:8,c:20},{o:8,c:20},{o:8,c:14},null],
    delivery: false, deliveryUrl: '', inventoryUrl: '' },
  { id: 's4', name: 'עמליה — חנות טבע', addr: 'טורקיז 5, חריש',
    lat: 32.4624565, lng: 35.0470177,
    note: 'אלטרנטיבות טבעוניות ומשקאות צמחיים',
    hours: [{o:8,c:17},{o:8,c:17},{o:8,c:17},{o:8,c:17},{o:8,c:17},{o:8,c:15},null],
    delivery: false, deliveryUrl: '', inventoryUrl: '' },
  { id: 's5', name: 'רמי לוי ביג — פרדס חנה', addr: 'תדהר 1, פרדס חנה-כרכור',
    lat: 32.4888176, lng: 34.9705182,
    note: 'מבחר ענק — שווה נסיעה לסבב גדול',
    hours: [{o:8,c:22},{o:8,c:22},{o:8,c:22},{o:7.5,c:23},{o:7.5,c:23},{o:7,c:13},{o:20.5,c:23}],
    delivery: true, deliveryUrl: 'https://www.rami-levy.co.il/he/online/market',
    inventoryUrl: 'https://www.rami-levy.co.il/he/online/market/search?q=' },
  { id: 's6', name: 'יוחננוף — חדרה', addr: 'צה״ל 35, חדרה',
    lat: 32.4414918, lng: 34.930406,
    note: 'גדול, עגלות חכמות, מבחר רחב',
    hours: [{o:8,c:21},{o:8,c:21.5},{o:8,c:22},{o:8,c:22.5},{o:8,c:23},{o:7,c:15},null],
    delivery: true, deliveryUrl: 'https://www.yochananof.co.il/',
    inventoryUrl: 'https://www.yochananof.co.il/' },
];

export const DEFAULT_STATE = {
  categories: [
    { id: 'milk', name: 'חלב', emoji: '🥛', items: MILK_ITEMS.map(makeItem) },
  ],
  customList: {},      // { [categoryId]: [ { id, name, note, done } ] }
  stores: STORES.map((s) => ({ ...s })),
  activeCat: 'milk',
};

// --- helpers ---
export const fmt = (h) => {
  if (h == null) return '';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${mm.toString().padStart(2, '0')}`;
};

// returns true (open) / false (closed) / null (no structured hours)
export const storeOpen = (store) => {
  if (!store.hours || !Array.isArray(store.hours)) return null;
  const now = new Date();
  const today = store.hours[now.getDay()];
  if (!today) return false;
  const t = now.getHours() + now.getMinutes() / 60;
  return t >= today.o && t < today.c;
};

export const wazeUrl = (s) =>
  s.lat && s.lng
    ? `https://waze.com/ul?ll=${s.lat},${s.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(s.addr)}&navigate=yes`;

export const mapsUrl = (s) =>
  s.lat && s.lng
    ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.addr)}`;

export const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

/* big supermarkets vs health/natural shops (by id) for the default Harish set */
const SUPERMARKET_IDS = ['s1', 's2', 's5', 's6'];
const HEALTH_IDS = ['s3', 's4'];

/* Map a product to the local stores likely to carry it, from its `where` hint.
   Approximate (real per-branch inventory comes later from price-transparency feeds). */
export function storesForItem(item, stores) {
  if (!item || !stores) return [];
  const where = item.where || '';
  const ids = new Set();
  // direct name match (first word of each store name)
  stores.forEach((s) => {
    const w = (s.name || '').split(' ')[0];
    if (w && where.includes(w)) ids.add(s.id);
  });
  if (/כל סופר|סופר/.test(where)) SUPERMARKET_IDS.forEach((id) => ids.add(id));
  if (/טבע|חנויות טבע/.test(where)) HEALTH_IDS.forEach((id) => ids.add(id));
  // fallback: if nothing matched, assume the big supermarkets
  if (!ids.size) SUPERMARKET_IDS.forEach((id) => ids.add(id));
  return stores.filter((s) => ids.has(s.id));
}

/* haversine distance in km between two [lat,lng] */
export function distKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const la1 = toRad(a[0]), la2 = toRad(b[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
