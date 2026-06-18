import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { storeOpen, fmt, wazeUrl, mapsUrl, DAY_NAMES } from './data.js'

/* Harish center */
const CENTER = [32.4663, 35.0435]

/* status -> marker color */
function markerColor(s) {
  const o = storeOpen(s)
  if (o === true) return '#3C6E3C'   // open green
  if (o === false) return '#9A4444'  // closed red
  return '#2F6F73'                   // unknown teal
}

/* build an animated divIcon (pulse ring + pin) */
function storeIcon(s, active) {
  const c = markerColor(s)
  const html = `
    <div class="mk ${active ? 'mk-active' : ''}">
      <div class="mk-pulse" style="--mc:${c}"></div>
      <div class="mk-pin" style="--mc:${c}">🏪</div>
    </div>`
  return L.divIcon({ html, className: 'mk-wrap', iconSize: [46, 46], iconAnchor: [23, 42], popupAnchor: [0, -40] })
}

export default function MapView({ stores, items, imgSrc, onEnterStore }) {
  const mapRef = useRef(null)
  const elRef = useRef(null)
  const markersRef = useRef({})
  const userRef = useRef(null)
  const [sel, setSel] = useState(null) // selected store id
  const [reduced] = useState(() =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  /* init map once */
  useEffect(() => {
    if (mapRef.current || !elRef.current) return
    const map = L.map(elRef.current, {
      center: CENTER, zoom: 13, zoomControl: false, attributionControl: true,
    })
    mapRef.current = map
    // stylized, free, no-key tiles (CartoDB Voyager — playful, like a game map)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map)
    L.control.zoom({ position: 'topleft' }).addTo(map)
    // fit to all stores
    const pts = stores.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng])
    if (pts.length) map.fitBounds(pts, { padding: [60, 60], maxZoom: 14 })
    setTimeout(() => map.invalidateSize(), 100)
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line

  /* (re)draw store markers */
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
    if (s && s.lat && map) {
      map.flyTo([s.lat, s.lng], 15, { duration: reduced ? 0 : 0.9 })
    }
  }

  /* user location */
  const locate = () => {
    if (!navigator.geolocation) { alert('הדפדפן לא תומך במיקום.'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: la, longitude: lo } = pos.coords
        const map = mapRef.current
        if (!map) return
        if (userRef.current) userRef.current.remove()
        const ic = L.divIcon({ html: '<div class="userdot"><div class="userdot-core"></div></div>', className: 'userdot-wrap', iconSize: [24, 24], iconAnchor: [12, 12] })
        userRef.current = L.marker([la, lo], { icon: ic, interactive: false }).addTo(map)
        map.flyTo([la, lo], 14, { duration: reduced ? 0 : 0.9 })
      },
      () => alert('לא הצלחתי לאתר מיקום — אשר הרשאת מיקום בדפדפן.'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const selStore = stores.find((s) => s.id === sel)

  return (
    <div className="mapview">
      <div ref={elRef} className="mapcanvas" />
      <button className="locbtn" onClick={locate} title="המיקום שלי">📍</button>

      {selStore && (
        <StoreSheet
          s={selStore} items={items} imgSrc={imgSrc}
          onClose={() => setSel(null)}
          onEnter={() => onEnterStore(selStore)}
        />
      )}
    </div>
  )
}

/* ---------- bottom sheet ---------- */
function StoreSheet({ s, items, imgSrc, onClose, onEnter }) {
  const status = storeOpen(s)
  const today = new Date().getDay()
  const th = s.hours?.[today]
  const [showHours, setShowHours] = useState(false)
  // products linked to this store via where-substring
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
