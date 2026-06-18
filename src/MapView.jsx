import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { storeOpen, fmt, wazeUrl, mapsUrl, DAY_NAMES } from './data.js'

/* Harish center */
const CENTER = [32.4663, 35.0435]

/* status -> marker accent color */
function markerColor(s) {
  const o = storeOpen(s)
  if (o === true) return '#2ee6a0'   // open – neon mint
  if (o === false) return '#ff5d7a'  // closed – neon rose
  return '#2ee6d6'                   // unknown – neon cyan
}

/* billboard-style floating store marker (original design, game-like vibe) */
function storeIcon(s, active) {
  const c = markerColor(s)
  const html = `
    <div class="mk2 ${active ? 'mk2-active' : ''}">
      <div class="mk2-shadow"></div>
      <div class="mk2-body" style="--mc:${c}">
        <div class="mk2-ring"></div>
        <div class="mk2-disc">🏪</div>
      </div>
    </div>`
  return L.divIcon({ html, className: 'mk2-wrap', iconSize: [62, 74], iconAnchor: [31, 66], popupAnchor: [0, -60] })
}

export default function MapView({ stores, items, imgSrc, onEnterStore }) {
  const mapRef = useRef(null)
  const elRef = useRef(null)
  const markersRef = useRef({})
  const userRef = useRef(null)
  const [sel, setSel] = useState(null)
  const [located, setLocated] = useState(false)
  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  /* init map once */
  useEffect(() => {
    if (mapRef.current || !elRef.current) return
    const map = L.map(elRef.current, { center: CENTER, zoom: 14, zoomControl: false, attributionControl: true })
    mapRef.current = map
    // DARK basemap (CartoDB Dark Matter) — cool, moody, game-like; free, no key
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd', className: 'pogo-tiles',
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map)
    // labels on a separate pane so they stay crisp above the filtered terrain
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd', className: 'pogo-labels',
    }).addTo(map)
    L.control.zoom({ position: 'topright' }).addTo(map)
    const pts = stores.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng])
    if (pts.length) map.fitBounds(pts, { padding: [70, 70], maxZoom: 14 })
    setTimeout(() => map.invalidateSize(), 120)
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line

  /* (re)draw markers */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Object.values(markersRef.current).forEach((m) => m.remove())
    markersRef.current = {}
    stores.forEach((s) => {
      if (!s.lat || !s.lng) return
      const mk = L.marker([s.lat, s.lng], { icon: storeIcon(s, s.id === sel), riseOnHover: true })
      mk.on('click', () => selectStore(s.id))
      mk.addTo(map)
      markersRef.current[s.id] = mk
    })
  }, [stores, sel]) // eslint-disable-line

  const selectStore = (id) => {
    setSel(id)
    const s = stores.find((x) => x.id === id)
    const map = mapRef.current
    if (s && s.lat && map) map.flyTo([s.lat, s.lng], 16, { duration: reduced ? 0 : 0.9 })
  }

  const locate = () => {
    if (!navigator.geolocation) { alert('הדפדפן לא תומך במיקום.'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: la, longitude: lo } = pos.coords
        const map = mapRef.current
        if (!map) return
        if (userRef.current) userRef.current.remove()
        // invisible anchor marker so the avatar can sit at real GPS while we keep it visually centered
        map.flyTo([la, lo], 15, { duration: reduced ? 0 : 0.9 })
        setLocated(true)
      },
      () => alert('לא הצלחתי לאתר מיקום — אשר הרשאת מיקום בדפדפן.'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const selStore = stores.find((s) => s.id === sel)

  return (
    <div className="mapview">
      <div ref={elRef} className="mapcanvas" />
      <div className="mapvignette" />

      {/* player avatar — the PoGo-style "you", centered, with a glowing reach ring (themed: milk-drop hero) */}
      <div className={`avatar${located ? ' avatar-found' : ''}`}>
        <div className="avatar-reach" />
        <div className="avatar-disc" />
        <div className="avatar-char">💧</div>
        <div className="avatar-foot" />
      </div>

      {/* floating brand badge */}
      <div className="mapbrand"><span>💧</span> מסע טעימות</div>

      <button className="locbtn" onClick={locate} title="המיקום שלי">📍</button>

      {selStore && (
        <StoreSheet s={selStore} items={items} imgSrc={imgSrc}
          onClose={() => setSel(null)} onEnter={() => onEnterStore(selStore)} />
      )}
    </div>
  )
}

/* ---------- bottom sheet (game-UI styled) ---------- */
function StoreSheet({ s, items, imgSrc, onClose, onEnter }) {
  const status = storeOpen(s)
  const today = new Date().getDay()
  const th = s.hours?.[today]
  const [showHours, setShowHours] = useState(false)
  const firstWord = (s.name || '').split(' ')[0]
  const linked = items.filter((it) => it.where && firstWord && it.where.includes(firstWord))
  return (
    <div className="sheet" onClick={(e) => e.target.classList.contains('sheet') && onClose()}>
      <div className="sheetbox">
        <div className="sheetgrip" />
        <button className="vclose" onClick={onClose}>×</button>
        <div className="sheethead">
          <h3>{s.name}</h3>
          {status === true && <span className="pill open">פתוח עכשיו</span>}
          {status === false && <span className="pill closed">סגור</span>}
        </div>
        <div className="storeaddr">📍 {s.addr}</div>
        {s.note && <div className="storenote">{s.note}</div>}
        {s.hours ? (
          <div className="hoursline">היום: {th ? `${fmt(th.o)}–${fmt(th.c)}` : 'סגור'}
            <button className="linkbtn" onClick={() => setShowHours((v) => !v)}>{showHours ? 'הסתר' : 'כל השעות'}</button>
          </div>
        ) : s.hoursText ? <div className="hoursline">{s.hoursText}</div> : null}
        {showHours && s.hours && (
          <ul className="weekhours">
            {s.hours.map((h, i) => (
              <li key={i} className={i === today ? 'todayh' : ''}>
                <span>{DAY_NAMES[i]}</span><span>{h ? `${fmt(h.o)}–${fmt(h.c)}` : 'סגור'}</span>
              </li>
            ))}
          </ul>
        )}
        <button className="enterbtn" onClick={onEnter}>
          🚪 כניסה לחנות {linked.length ? `(${linked.length} מוצרים)` : ''}
        </button>
        <div className="sheetbtns">
          <a className="navbtn waze" href={wazeUrl(s)} target="_blank" rel="noreferrer">Waze</a>
          <a className="navbtn maps" href={mapsUrl(s)} target="_blank" rel="noreferrer">Maps</a>
          {s.delivery && <a className="navbtn deliv" href={s.deliveryUrl} target="_blank" rel="noreferrer">🚚</a>}
        </div>
      </div>
    </div>
  )
}
