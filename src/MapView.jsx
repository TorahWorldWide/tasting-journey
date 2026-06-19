import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { storeOpen, fmt, mapsUrl, DAY_NAMES, storesForItem, distKm } from './data.js'
import { SVG_STORE, SVG_DROP } from './icons.jsx'
import { Icon } from './icons.jsx'

/* Harish center (used as the trip start when GPS is unavailable) */
const CENTER = [32.4663, 35.0435]

function markerColor(s) {
  const o = storeOpen(s)
  if (o === true) return '#2ee6a0'
  if (o === false) return '#ff5d7a'
  return '#2ee6d6'
}

function storeIcon(s, active, inRoute, order) {
  const c = markerColor(s)
  const badge = inRoute ? `<div class="mk2-order">${order}</div>` : ''
  const html = `
    <div class="mk2 ${active ? 'mk2-active' : ''} ${inRoute ? 'mk2-route' : ''}">
      <div class="mk2-shadow"></div>
      <div class="mk2-body" style="--mc:${c}">
        <div class="mk2-ring"></div>
        <div class="mk2-disc">${SVG_STORE}</div>
        ${badge}
      </div>
    </div>`
  return L.divIcon({ html, className: 'mk2-wrap', iconSize: [62, 78], iconAnchor: [31, 66], popupAnchor: [0, -60] })
}

/* greedy set-cover: fewest stores that cover all list items */
function chooseStores(listItems, stores) {
  const need = new Map() // itemId -> set of storeIds that carry it
  listItems.forEach((it) => {
    const ss = storesForItem(it, stores).map((s) => s.id)
    need.set(it.id, new Set(ss))
  })
  const uncovered = new Set(listItems.map((it) => it.id))
  const chosen = []
  while (uncovered.size) {
    let best = null, bestCount = 0
    stores.forEach((s) => {
      if (chosen.includes(s.id)) return
      let cnt = 0
      uncovered.forEach((iid) => { if (need.get(iid)?.has(s.id)) cnt++ })
      if (cnt > bestCount) { bestCount = cnt; best = s.id }
    })
    if (!best) break // some item has no store
    chosen.push(best)
    uncovered.forEach((iid) => { if (need.get(iid)?.has(best)) uncovered.delete(iid) })
  }
  return stores.filter((s) => chosen.includes(s.id))
}

/* nearest-neighbour ordering from a start point (fallback if OSRM fails) */
function nnOrder(start, pts) {
  const remaining = [...pts]
  const order = []
  let cur = start
  while (remaining.length) {
    let bi = 0, bd = Infinity
    remaining.forEach((p, i) => { const d = distKm(cur, [p.lat, p.lng]); if (d < bd) { bd = d; bi = i } })
    const nx = remaining.splice(bi, 1)[0]
    order.push(nx); cur = [nx.lat, nx.lng]
  }
  return order
}

export default function MapView({ stores, items, listItems, imgSrc, onEnterStore, onNavigate }) {
  const mapRef = useRef(null)
  const elRef = useRef(null)
  const markersRef = useRef({})
  const routeLayerRef = useRef(null)
  const [sel, setSel] = useState(null)
  const [located, setLocated] = useState(false)
  const [route, setRoute] = useState(null) // { order:[store], coords:[[lat,lng]], km, min }
  const [planning, setPlanning] = useState(false)
  const startRef = useRef(CENTER)
  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (mapRef.current || !elRef.current) return
    const map = L.map(elRef.current, { center: CENTER, zoom: 14, zoomControl: false, attributionControl: true })
    mapRef.current = map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd', className: 'pogo-tiles', attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd', className: 'pogo-labels',
    }).addTo(map)
    L.control.zoom({ position: 'topright' }).addTo(map)
    const pts = stores.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng])
    if (pts.length) map.fitBounds(pts, { padding: [70, 70], maxZoom: 14 })
    setTimeout(() => map.invalidateSize(), 120)
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    Object.values(markersRef.current).forEach((m) => m.remove())
    markersRef.current = {}
    const routeIds = route ? route.order.map((s) => s.id) : []
    stores.forEach((s) => {
      if (!s.lat || !s.lng) return
      const ri = routeIds.indexOf(s.id)
      const mk = L.marker([s.lat, s.lng], { icon: storeIcon(s, s.id === sel, ri >= 0, ri + 1), riseOnHover: true })
      mk.on('click', () => selectStore(s.id))
      mk.addTo(map)
      markersRef.current[s.id] = mk
    })
  }, [stores, sel, route]) // eslint-disable-line

  const selectStore = (id) => {
    setSel(id)
    const s = stores.find((x) => x.id === id)
    const map = mapRef.current
    if (s && s.lat && map) map.flyTo([s.lat, s.lng], 16, { duration: reduced ? 0 : 0.9 })
  }

  const locate = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) { alert('הדפדפן לא תומך במיקום.'); resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = [pos.coords.latitude, pos.coords.longitude]
          startRef.current = p
          const map = mapRef.current
          if (map) map.flyTo(p, 15, { duration: reduced ? 0 : 0.9 })
          setLocated(true); resolve(p)
        },
        () => { alert('לא הצלחתי לאתר מיקום — אשתמש בחריש כנקודת התחלה.'); resolve(null) },
        { enableHighAccuracy: true, timeout: 8000 }
      )
    })

  /* ---- the heart: build the optimal multi-stop route ---- */
  const planRoute = async () => {
    if (!listItems.length) return
    setPlanning(true)
    try {
      const start = startRef.current || CENTER
      const needed = chooseStores(listItems, stores).filter((s) => s.lat && s.lng)
      if (!needed.length) { alert('לא נמצאו חנויות למוצרים ברשימה.'); setPlanning(false); return }

      let ordered = null, coords = null, km = 0, min = 0
      // try OSRM /trip for optimal order + road geometry
      try {
        const all = [start, ...needed.map((s) => [s.lat, s.lng])]
        const cstr = all.map((p) => `${p[1]},${p[0]}`).join(';')
        const url = `https://router.project-osrm.org/trip/v1/driving/${cstr}?source=first&roundtrip=false&overview=full&geometries=geojson`
        const r = await fetch(url)
        const j = await r.json()
        if (j.code === 'Ok' && j.trips?.[0]) {
          const wp = j.waypoints // each has waypoint_index (visit order)
          // build ordered store list (skip index 0 = start)
          const seq = needed
            .map((s, i) => ({ s, order: wp[i + 1]?.waypoint_index ?? i + 1 }))
            .sort((a, b) => a.order - b.order)
            .map((x) => x.s)
          ordered = seq
          coords = j.trips[0].geometry.coordinates.map((c) => [c[1], c[0]])
          km = j.trips[0].distance / 1000
          min = j.trips[0].duration / 60
        }
      } catch { /* fall through */ }

      if (!ordered) {
        ordered = nnOrder(start, needed)
        coords = [start, ...ordered.map((s) => [s.lat, s.lng])]
        let prev = start
        ordered.forEach((s) => { km += distKm(prev, [s.lat, s.lng]); prev = [s.lat, s.lng] })
        min = km * 2 // rough estimate
      }

      // draw
      const map = mapRef.current
      if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null }
      if (map && coords) {
        const line = L.polyline(coords, { color: '#22e0c8', weight: 5, opacity: .9, lineJoin: 'round', className: 'routeline' })
        const glow = L.polyline(coords, { color: '#22e0c8', weight: 12, opacity: .22 })
        routeLayerRef.current = L.layerGroup([glow, line]).addTo(map)
        map.fitBounds(L.polyline(coords).getBounds(), { padding: [70, 120] })
      }
      setRoute({ order: ordered, coords, km, min })
    } finally {
      setPlanning(false)
    }
  }

  const clearRoute = () => {
    if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null }
    setRoute(null)
  }

  const selStore = stores.find((s) => s.id === sel)

  return (
    <div className="mapview">
      <div ref={elRef} className="mapcanvas" />
      <div className="mapvignette" />

      <div className={`avatar${located ? ' avatar-found' : ''}`}>
        <div className="avatar-reach" />
        <div className="avatar-disc" />
        <div className="avatar-char" dangerouslySetInnerHTML={{ __html: SVG_DROP }} />
      </div>

      <div className="mapbrand"><Icon name="drop" size={15} fill /> מסע טעימות</div>
      <button className="locbtn" onClick={locate} title="המיקום שלי"><Icon name="pin" size={22} /></button>

      {/* route planner bar */}
      {listItems.length > 0 && !route && (
        <div className="routebar">
          <div className="routebar-txt">{listItems.length} מוצרים ברשימה</div>
          <button className="planbtn" disabled={planning} onClick={async () => { await locate(); planRoute() }}>
            {planning ? 'מחשב…' : <><Icon name="compass" size={16} /> חשב מסלול</>}
          </button>
        </div>
      )}

      {route && (
        <div className="routecard">
          <button className="routeclose" onClick={clearRoute}>×</button>
          <div className="routestats">
            <span>{route.km.toFixed(1)} ק״מ</span>
            <span>~{Math.round(route.min)} דק׳</span>
            <span>{route.order.length} חנויות</span>
          </div>
          <div className="routestops">
            {route.order.map((s, i) => (
              <button key={s.id} className="routestop" onClick={() => selectStore(s.id)}>
                <span className="routenum">{i + 1}</span> {s.name}
              </button>
            ))}
          </div>
          <button className="gobtn" onClick={() => onNavigate(route)}>
            <span className="gopulse" /> GO
          </button>
        </div>
      )}

      {selStore && (
        <StoreSheet s={selStore} items={items} imgSrc={imgSrc}
          onClose={() => setSel(null)} onEnter={() => onEnterStore(selStore)} />
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
        <div className="storeaddr"><Icon name="pin" size={14} /> {s.addr}</div>
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
          <Icon name="door" size={18} /> כניסה לחנות {linked.length ? `(${linked.length} מוצרים)` : ''}
        </button>
        <div className="sheetbtns">
          <a className="navbtn maps" href={mapsUrl(s)} target="_blank" rel="noreferrer"><Icon name="map" size={15} /> מפה</a>
          {s.inventoryUrl && <a className="navbtn inv" href={s.inventoryUrl} target="_blank" rel="noreferrer"><Icon name="box" size={15} /> מלאי אונליין</a>}
          {s.delivery && <a className="navbtn deliv" href={s.deliveryUrl} target="_blank" rel="noreferrer"><Icon name="truck" size={15} /> משלוח</a>}
        </div>
      </div>
    </div>
  )
}
