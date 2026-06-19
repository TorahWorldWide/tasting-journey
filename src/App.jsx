import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import {
  uid, STORAGE_KEY, DEFAULT_STATE, fmt, storeOpen, wazeUrl, mapsUrl, DAY_NAMES,
} from './data.js'
import MapView from './MapView.jsx'
import { Icon } from './icons.jsx'
import './App.css'

/* ---------- Google Fonts injection ---------- */
function useFonts() {
  useEffect(() => {
    if (document.getElementById('tj-fonts')) return
    const l = document.createElement('link')
    l.id = 'tj-fonts'
    l.rel = 'stylesheet'
    l.href =
      'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&family=Secular+One&display=swap'
    document.head.appendChild(l)
  }, [])
}

/* ---------- IndexedDB photo store ---------- */
const DB_NAME = 'tasting-journey-photos'
const DB_STORE = 'photos'
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idbPutPhoto(id, dataUrl) {
  try { const db = await openDB(); return await new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(dataUrl, id)
    tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error) }) } catch { return false }
}
async function idbGetPhoto(id) {
  try { const db = await openDB(); return await new Promise((res) => {
    const tx = db.transaction(DB_STORE, 'readonly'); const g = tx.objectStore(DB_STORE).get(id)
    g.onsuccess = () => res(g.result || null); g.onerror = () => res(null) }) } catch { return null }
}
async function idbDelPhoto(id) {
  try { const db = await openDB(); return await new Promise((res) => {
    const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).delete(id)
    tx.oncomplete = () => res(true); tx.onerror = () => res(false) }) } catch { return false }
}
async function idbClear() {
  try { const db = await openDB(); return await new Promise((res) => {
    const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).clear()
    tx.oncomplete = () => res(true); tx.onerror = () => res(false) }) } catch { return false }
}

/* ---------- image downscale ---------- */
function fileToScaledDataUrl(file, max = 1000, q = 0.8) {
  return new Promise((res, rej) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      let { width: w, height: h } = img
      if (w > h && w > max) { h = Math.round((h * max) / w); w = max }
      else if (h >= w && h > max) { w = Math.round((w * max) / h); h = max }
      const c = document.createElement('canvas'); c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      try { res(c.toDataURL('image/jpeg', q)) } catch (e) { rej(e) }
    }
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e) }
    img.src = url
  })
}

const TYPE_LABEL = { animal: 'חלב מן החי', plant: 'משקאות צמחיים', other: 'נוסף' }
const TYPE_ORDER = ['animal', 'plant', 'other']
const VERDICT = {
  daily: { label: 'נכנס ליומיום', cls: 'v-daily' },
  maybe: { label: 'אולי', cls: 'v-maybe' },
  pass: { label: 'לא בשבילי', cls: 'v-pass' },
}

/* ===================================================================== */
export default function App() {
  useFonts()
  const [state, setState] = useState(DEFAULT_STATE)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState('map')
  const [photoCache, setPhotoCache] = useState({}) // itemId -> dataUrl
  const [viewerIdx, setViewerIdx] = useState(null)
  const [modal, setModal] = useState(null) // 'addItem' | 'addCat' | 'addStore'
  const [enteredStore, setEnteredStore] = useState(null)
  const [nav, setNav] = useState(null) // active navigation route

  /* load */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setState({ ...DEFAULT_STATE, ...JSON.parse(raw) })
    } catch { /* keep default */ }
    setLoaded(true)
  }, [])

  /* save */
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* quota */ }
  }, [state, loaded])

  const activeCategory = state.categories.find((c) => c.id === state.activeCat) || state.categories[0]
  const items = activeCategory ? activeCategory.items : []

  /* ----- mutators ----- */
  const updateItem = useCallback((itemId, patch) => {
    setState((s) => ({
      ...s,
      categories: s.categories.map((c) =>
        c.id !== s.activeCat ? c : { ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }),
    }))
  }, [])

  const addItem = (raw) => {
    const it = { id: uid(), name: raw.name, type: raw.type, desc: raw.desc || '', where: raw.where || '',
      status: 'todo', score: 0, verdict: '', bought: false, image: raw.image || '', imageSource: raw.imageSource || '', barcode: raw.barcode || '' }
    setState((s) => ({ ...s, categories: s.categories.map((c) => c.id !== s.activeCat ? c : { ...c, items: [...c.items, it] }) }))
  }
  const deleteItem = async (itemId) => {
    await idbDelPhoto(itemId)
    setState((s) => ({ ...s, categories: s.categories.map((c) => c.id !== s.activeCat ? c : { ...c, items: c.items.filter((it) => it.id !== itemId) }) }))
  }
  const addCategory = (name, emoji) => {
    const id = uid()
    setState((s) => ({ ...s, categories: [...s.categories, { id, name, emoji: emoji || '🍽️', items: [] }], activeCat: id }))
  }
  const addStore = (name, addr, hoursText) =>
    setState((s) => ({ ...s, stores: [...s.stores, { id: uid(), name, addr, note: '', hoursText: hoursText || '', hours: null, delivery: false, deliveryUrl: '' }] }))
  const deleteStore = (sid) => setState((s) => ({ ...s, stores: s.stores.filter((x) => x.id !== sid) }))

  const setCustom = (fn) => setState((s) => {
    const list = s.customList[s.activeCat] || []
    return { ...s, customList: { ...s.customList, [s.activeCat]: fn(list) } }
  })

  const resetAll = async () => {
    if (!confirm('לאפס הכול לברירת המחדל? כל הדירוגים, התמונות והרשימות יימחקו.')) return
    await idbClear()
    setPhotoCache({})
    setState(DEFAULT_STATE)
    setTab('catalog')
  }

  /* ----- photo handling ----- */
  const setItemPhotoFromFile = async (itemId, file) => {
    try {
      const dataUrl = await fileToScaledDataUrl(file)
      await idbPutPhoto(itemId, dataUrl)
      setPhotoCache((m) => ({ ...m, [itemId]: dataUrl }))
      updateItem(itemId, { image: 'idb', imageSource: 'user' })
    } catch { alert('לא הצלחתי לטעון את התמונה.') }
  }
  const setItemPhotoByBarcode = async (itemId, barcode) => {
    const code = (barcode || '').replace(/\D/g, '')
    if (!code) return
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,image_front_url`)
      const j = await r.json()
      const url = j?.product?.image_front_url
      if (url) updateItem(itemId, { image: url, imageSource: 'off', barcode: code })
      else alert('לא נמצא מוצר עם הברקוד הזה — נסה לצלם.')
    } catch { alert('שגיאת רשת בחיפוש הברקוד — נסה לצלם.') }
  }
  const setItemPhotoByUrl = (itemId, url) => {
    if (url && /^https?:\/\//.test(url)) updateItem(itemId, { image: url, imageSource: 'url' })
  }
  const removeItemPhoto = async (item) => {
    if (item.imageSource === 'user') { await idbDelPhoto(item.id); setPhotoCache((m) => { const n = { ...m }; delete n[item.id]; return n }) }
    updateItem(item.id, { image: '', imageSource: '', barcode: '' })
  }

  /* lazy-load idb photos for visible items */
  useEffect(() => {
    if (!loaded) return
    items.forEach((it) => {
      if (it.image === 'idb' && photoCache[it.id] === undefined) {
        idbGetPhoto(it.id).then((d) => { if (d) setPhotoCache((m) => ({ ...m, [it.id]: d })) })
      }
    })
  }, [items, loaded, photoCache])

  const imgSrc = (it) => (it.image === 'idb' ? photoCache[it.id] || '' : it.image || '')

  /* badges */
  const badge = {
    catalog: items.filter((i) => i.status === 'todo').length,
    list: items.filter((i) => i.status === 'list').length,
    daily: items.filter((i) => i.verdict === 'daily').length,
  }

  if (!loaded) return <div className="boot">טוען…</div>

  return (
    <div className="app" dir="rtl">
      <Header
        state={state} setState={setState} onReset={resetAll}
        onAddCat={() => setModal('addCat')}
      />

      <main className={`content${tab === 'map' ? ' content-map' : ''}`} key={tab}>
        {tab === 'map' && (
          <MapView stores={state.stores} items={items}
            listItems={items.filter((i) => i.status === 'list')}
            imgSrc={imgSrc}
            onEnterStore={(s) => setEnteredStore(s)}
            onNavigate={(r) => setNav(r)} />
        )}
        {tab === 'catalog' && (
          <Catalog items={items} stores={state.stores} updateItem={updateItem} deleteItem={deleteItem}
            imgSrc={imgSrc} setItemPhotoFromFile={setItemPhotoFromFile}
            setItemPhotoByBarcode={setItemPhotoByBarcode} setItemPhotoByUrl={setItemPhotoByUrl}
            removeItemPhoto={removeItemPhoto} openViewer={(id) => setViewerIdx(items.findIndex((x) => x.id === id))}
            onAddItem={() => setModal('addItem')} />
        )}
        {tab === 'list' && (
          <ShoppingList items={items} stores={state.stores} imgSrc={imgSrc}
            updateItem={updateItem} custom={state.customList[state.activeCat] || []} setCustom={setCustom} />
        )}
        {tab === 'stores' && (
          <Stores stores={state.stores} onAddStore={() => setModal('addStore')} deleteStore={deleteStore} />
        )}
        {tab === 'daily' && <Daily items={items} imgSrc={imgSrc} />}
      </main>

      <nav className="tabbar">
        {[['map', 'מפה', 'map'], ['catalog', 'קטלוג', 'cup'], ['list', 'רשימה', 'list'], ['stores', 'חנויות', 'store'], ['daily', 'היומיום', 'star']].map(([k, label, ic]) => (
          <button key={k} className={`tabbtn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            <span className="tabic"><Icon name={ic} size={22} /></span>
            <span className="tablbl">{label}</span>
            {badge[k] > 0 && <span className="tabbadge">{badge[k]}</span>}
          </button>
        ))}
      </nav>

      {viewerIdx !== null && items[viewerIdx] && (
        <Viewer items={items} idx={viewerIdx} setIdx={setViewerIdx} imgSrc={imgSrc} updateItem={updateItem} />
      )}

      {enteredStore && (
        <StoreInside store={enteredStore} items={items} imgSrc={imgSrc} updateItem={updateItem}
          onClose={() => setEnteredStore(null)} />
      )}

      {nav && <NavView route={nav} onClose={() => setNav(null)} />}

      {modal === 'addItem' && <AddItemModal onClose={() => setModal(null)} onAdd={addItem} />}
      {modal === 'addCat' && <AddCatModal onClose={() => setModal(null)} onAdd={addCategory} />}
      {modal === 'addStore' && <AddStoreModal onClose={() => setModal(null)} onAdd={addStore} />}
    </div>
  )
}

/* ===================== Header ===================== */
function Header({ state, setState, onReset, onAddCat }) {
  return (
    <header className="header">
      <div className="hrow">
        <div className="logo"><span className="logodrop"><Icon name="drop" size={22} fill /></span>מסע טעימות</div>
        <button className="resetbtn" title="איפוס" onClick={onReset}>⟳</button>
      </div>
      <div className="chiprow">
        {state.categories.map((c) => (
          <button key={c.id} className={`chip${state.activeCat === c.id ? ' active' : ''}`}
            onClick={() => setState((s) => ({ ...s, activeCat: c.id }))}>
            {c.name}
          </button>
        ))}
        <button className="chip chipadd" onClick={onAddCat}>+ תחום</button>
      </div>
    </header>
  )
}

/* ===================== Image controls ===================== */
function ImageControls({ item, src, onFile, onBarcode, onUrl, onRemove, onTap }) {
  const fileRef = useRef(null)
  const [bc, setBc] = useState(false)
  const [bcVal, setBcVal] = useState('')
  return (
    <div className="imgwrap">
      {src ? (
        <div className="imgbox" onClick={onTap} role="button" title="הצג / הראה למוכר">
          <img className="prodimg" src={src} alt={item.name} loading="lazy" />
          {item.imageSource === 'off' && <span className="offattr">מקור: Open Food Facts</span>}
          {item.bought && <span className="boughttag">קניתי ✓</span>}
        </div>
      ) : (
        <div className="imgempty"><span><Icon name="drop" size={30} fill /></span><small>אין תמונה</small></div>
      )}
      <div className="imgbtns">
        <button className="imbtn" onClick={() => fileRef.current?.click()}><Icon name="camera" size={16} /> צלם / העלה</button>
        <button className="imbtn" onClick={() => setBc((v) => !v)}><Icon name="search" size={16} /> ברקוד</button>
        <button className="imbtn" onClick={() => { const u = prompt('הדבק קישור לתמונה (https):'); if (u) onUrl(u) }}><Icon name="link" size={16} /> קישור</button>
        {src && <button className="imbtn imdel" onClick={onRemove}>הסר</button>}
      </div>
      {bc && (
        <div className="bcrow">
          <input inputMode="numeric" placeholder="מספר ברקוד" value={bcVal} onChange={(e) => setBcVal(e.target.value)} />
          <button onClick={() => { onBarcode(bcVal); setBc(false); setBcVal('') }}>חפש</button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

/* ===================== Rate box ===================== */
function RateBox({ item, onSave, onCancel }) {
  const [score, setScore] = useState(item.score || 0)
  const [verdict, setVerdict] = useState(item.verdict || '')
  return (
    <div className="ratebox">
      <div className="drops">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={`drop${n <= score ? ' on' : ''}`} onClick={() => setScore(n)}><Icon name="drop" size={22} fill /></button>
        ))}
      </div>
      <div className="verdicts">
        {Object.entries(VERDICT).map(([k, v]) => (
          <button key={k} className={`vchip ${v.cls}${verdict === k ? ' sel' : ''}`} onClick={() => setVerdict(k)}>{v.label}</button>
        ))}
      </div>
      <div className="ratebtns">
        <button className="savebtn" disabled={!score || !verdict}
          onClick={() => onSave({ score, verdict, status: 'tasted' })}>שמור</button>
        <button className="ghostbtn" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  )
}

/* ===================== Catalog ===================== */
function Catalog({ items, stores, updateItem, deleteItem, imgSrc, setItemPhotoFromFile, setItemPhotoByBarcode, setItemPhotoByUrl, removeItemPhoto, openViewer, onAddItem }) {
  const [rating, setRating] = useState(null)
  const [q, setQ] = useState('')
  const query = q.trim()
  const chains = stores.filter((s) => s.inventoryUrl)
  const filtered = query
    ? items.filter((it) => (it.name + ' ' + (it.desc || '')).includes(query))
    : items
  const SearchBar = (
    <div className="searchwrap">
      <div className="searchbar">
        <span className="searchic"><Icon name="search" size={16} /></span>
        <input className="searchinput" placeholder="חפש מוצר (למשל: שקדים, עיזים…)"
          value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="searchx" onClick={() => setQ('')}>×</button>}
      </div>
      {query && (
        <div className="searchchains">
          <span className="searchchains-lbl">חפש "{query}" באונליין:</span>
          {chains.map((s) => (
            <a key={s.id} className="chainlink" target="_blank" rel="noreferrer"
              href={s.inventoryUrl + encodeURIComponent(query)}>{s.name.split(' ')[0]}</a>
          ))}
        </div>
      )}
    </div>
  )
  if (!items.length)
    return <div className="empty">אין עדיין מוצרים בתחום הזה.<br />הוסף את הראשון
      <div style={{ marginTop: 16 }}><button className="bigadd" onClick={onAddItem}>+ הוסף מוצר משלך</button></div></div>
  return (
    <div className="catalog">
      {SearchBar}
      {query && !filtered.length && <div className="empty sm">לא נמצא "{query}" ברשימה שלך — נסה לחפש באונליין למעלה, או הוסף מוצר.</div>}
      {TYPE_ORDER.map((t) => {
        const group = filtered.filter((i) => i.type === t)
        if (!group.length) return null
        return (
          <section key={t} className="grp">
            <h2 className="grph">{TYPE_LABEL[t]}</h2>
            {group.map((it, gi) => (
              <article key={it.id} className="card" style={{ animationDelay: `${gi * 40}ms` }}>
                <button className="cardx" onClick={() => confirm(`למחוק את "${it.name}"?`) && deleteItem(it.id)}>×</button>
                <ImageControls item={it} src={imgSrc(it)}
                  onFile={(f) => setItemPhotoFromFile(it.id, f)}
                  onBarcode={(b) => setItemPhotoByBarcode(it.id, b)}
                  onUrl={(u) => setItemPhotoByUrl(it.id, u)}
                  onRemove={() => removeItemPhoto(it)}
                  onTap={() => openViewer(it.id)} />
                <div className="cardname">{it.name}</div>
                {it.desc && <div className="carddesc">{it.desc}</div>}
                {it.where && <div className="cardwhere"><Icon name="pin" size={13} /> {it.where}</div>}

                {it.status === 'todo' && (
                  <button className="actbtn" onClick={() => updateItem(it.id, { status: 'list' })}>+ לרשימת קניות</button>
                )}
                {it.status === 'list' && (
                  <div className="liststate">
                    <span className="listpill">● ברשימת הקניות</span>
                    <button className="actbtn small" onClick={() => setRating(it.id)}>טעמתי ←</button>
                  </div>
                )}
                {it.status === 'tasted' && rating !== it.id && (
                  <div className="tastedstate">
                    <div className="drops sm">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`drop${n <= it.score ? ' on' : ''}`}><Icon name="drop" size={17} fill /></span>)}</div>
                    {it.verdict && <span className={`vbadge ${VERDICT[it.verdict].cls}`}>{VERDICT[it.verdict].label}</span>}
                    <div className="rowbtns">
                      <button className="ghostbtn xs" onClick={() => setRating(it.id)}>ערוך דירוג</button>
                      <button className="ghostbtn xs" onClick={() => updateItem(it.id, { status: 'todo', score: 0, verdict: '' })}>איפוס</button>
                    </div>
                  </div>
                )}
                {rating === it.id && (
                  <RateBox item={it} onCancel={() => setRating(null)}
                    onSave={(patch) => { updateItem(it.id, patch); setRating(null) }} />
                )}
              </article>
            ))}
          </section>
        )
      })}
      <button className="bigadd" onClick={onAddItem}>+ הוסף מוצר משלך</button>
    </div>
  )
}

/* ===================== Shopping list ===================== */
function ShoppingList({ items, stores, imgSrc, updateItem, custom, setCustom }) {
  const toBuy = items.filter((i) => i.status === 'list')
  // group by store via where-substring match
  const groups = {}
  toBuy.forEach((it) => {
    const st = stores.find((s) => it.where && s.name && it.where.includes(s.name.split(' ')[0]))
    const key = st ? st.name : 'כל סופר / אחר'
    ;(groups[key] = groups[key] || { store: st, items: [] }).items.push(it)
  })
  const [name, setName] = useState(''); const [note, setNote] = useState('')
  return (
    <div className="list">
      <h2 className="grph">לטעימה</h2>
      {!toBuy.length && <div className="empty sm">הרשימה ריקה — סמן מוצרים "+ לרשימת קניות" בקטלוג.</div>}
      {Object.entries(groups).map(([gname, g]) => (
        <section key={gname} className="storegrp">
          <div className="storegrph">
            <span>{gname}</span>
            {g.store?.delivery && <a className="delivlink" href={g.store.deliveryUrl} target="_blank" rel="noreferrer"><Icon name="truck" size={14} /> משלוח</a>}
          </div>
          {g.items.map((it) => (
            <label key={it.id} className="lrow">
              <input type="checkbox" onChange={() => updateItem(it.id, { status: 'tasted', bought: true })} />
              {imgSrc(it) ? <img className="lthumb" src={imgSrc(it)} alt="" /> : <span className="lthumb empty"><Icon name="drop" size={18} fill /></span>}
              <span className="lname">{it.name}</span>
            </label>
          ))}
        </section>
      ))}

      <h2 className="grph" style={{ marginTop: 22 }}>תוספות שלי</h2>
      {custom.map((c) => (
        <div key={c.id} className="lrow">
          <input type="checkbox" checked={c.done} onChange={() => setCustom((l) => l.map((x) => x.id === c.id ? { ...x, done: !x.done } : x))} />
          <span className={`lname${c.done ? ' done' : ''}`}>{c.name}{c.note ? ` — ${c.note}` : ''}</span>
          <button className="cardx static" onClick={() => setCustom((l) => l.filter((x) => x.id !== c.id))}>×</button>
        </div>
      ))}
      <div className="addrow">
        <input placeholder="פריט" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="הערה (לא חובה)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button disabled={!name.trim()} onClick={() => { setCustom((l) => [...l, { id: uid(), name: name.trim(), note: note.trim(), done: false }]); setName(''); setNote('') }}>הוסף</button>
      </div>
    </div>
  )
}

/* ===================== Stores ===================== */
function Stores({ stores, onAddStore, deleteStore }) {
  const sorted = [...stores].sort((a, b) => {
    const rank = (s) => { const o = storeOpen(s); return o === true ? 0 : o === null ? 1 : 2 }
    return rank(a) - rank(b)
  })
  const today = new Date().getDay()
  return (
    <div className="stores">
      {sorted.map((s) => <StoreCard key={s.id} s={s} today={today} onDelete={() => confirm(`למחוק את "${s.name}"?`) && deleteStore(s.id)} />)}
      <button className="bigadd" onClick={onAddStore}>+ הוסף חנות</button>
    </div>
  )
}
function StoreCard({ s, today, onDelete }) {
  const [open, setOpen] = useState(false)
  const status = storeOpen(s)
  const th = s.hours?.[today]
  return (
    <article className="storecard">
      <button className="cardx" onClick={onDelete}>×</button>
      <div className="storetop">
        <h3>{s.name}</h3>
        {status === true && <span className="pill open">פתוח עכשיו</span>}
        {status === false && <span className="pill closed">סגור</span>}
      </div>
      <div className="storeaddr"><Icon name="pin" size={14} /> {s.addr}</div>
      {s.note && <div className="storenote">{s.note}</div>}
      {s.hours ? (
        <div className="hoursline">היום: {th ? `${fmt(th.o)}–${fmt(th.c)}` : 'סגור'}
          <button className="linkbtn" onClick={() => setOpen((v) => !v)}>{open ? 'הסתר שעות' : 'כל השעות'}</button></div>
      ) : s.hoursText ? <div className="hoursline">{s.hoursText}</div> : null}
      {open && s.hours && (
        <ul className="weekhours">
          {s.hours.map((h, i) => (
            <li key={i} className={i === today ? 'todayh' : ''}>
              <span>{DAY_NAMES[i]}</span><span>{h ? `${fmt(h.o)}–${fmt(h.c)}` : 'סגור'}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="storebtns">
        <a className="navbtn waze" href={wazeUrl(s)} target="_blank" rel="noreferrer">Waze</a>
        <a className="navbtn maps" href={mapsUrl(s)} target="_blank" rel="noreferrer">Google Maps</a>
        {s.delivery && <a className="navbtn deliv" href={s.deliveryUrl} target="_blank" rel="noreferrer"><Icon name="truck" size={15} /> משלוח</a>}
      </div>
    </article>
  )
}

/* ===================== Daily ===================== */
function Daily({ items, imgSrc }) {
  const daily = items.filter((i) => i.verdict === 'daily')
  if (!daily.length) return <div className="empty">עדיין לא בחרת מוצרים ליומיום — דרג ובחר "נכנס ליומיום".</div>
  return (
    <div className="daily">
      <h2 className="grph">המוצרים שנכנסו ליומיום</h2>
      {daily.map((it) => (
        <div key={it.id} className="drow">
          {imgSrc(it) ? <img className="lthumb" src={imgSrc(it)} alt="" /> : <span className="lthumb empty"><Icon name="drop" size={18} fill /></span>}
          <span className="lname">{it.name}</span>
          <span className="drops sm">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`drop${n <= it.score ? ' on' : ''}`}><Icon name="drop" size={17} fill /></span>)}</span>
        </div>
      ))}
    </div>
  )
}

/* ===================== Viewer (swipeable) ===================== */
function Viewer({ items, idx, setIdx, imgSrc, updateItem }) {
  const it = items[idx]
  const [pop, setPop] = useState(false)
  const tx = useRef(0)
  const go = (d) => { const n = idx + d; if (n >= 0 && n < items.length) setIdx(n) }
  const onStart = (e) => { tx.current = e.touches[0].clientX }
  const onEnd = (e) => {
    const dx = e.changedTouches[0].clientX - tx.current
    if (dx > 50) go(1)      // RTL: swipe right -> next (previous visually)
    else if (dx < -50) go(-1)
  }
  const buy = () => {
    updateItem(it.id, { bought: !it.bought })
    if (!it.bought) { setPop(true); setTimeout(() => setPop(false), 700) }
  }
  return (
    <div className="viewer" onClick={(e) => e.target.classList.contains('viewer') && setIdx(null)}>
      <div className="vcard" onTouchStart={onStart} onTouchEnd={onEnd}>
        <button className="vclose" onClick={() => setIdx(null)}>×</button>
        <div className="vimg">
          {imgSrc(it) ? <img src={imgSrc(it)} alt={it.name} /> : <div className="imgempty big"><span><Icon name="drop" size={44} fill /></span><small>אין תמונה</small></div>}
          {pop && <Sparkle />}
        </div>
        <div className="vname">{it.name}</div>
        {it.desc && <div className="vdesc">{it.desc}</div>}
        {it.status === 'tasted' && <div className="drops sm center">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`drop${n <= it.score ? ' on' : ''}`}><Icon name="drop" size={17} fill /></span>)}</div>}
        <button className={`buybtn${it.bought ? ' done' : ''}${pop ? ' pop' : ''}`} onClick={buy}>{it.bought ? 'קניתי ✓' : 'קניתי'}</button>
        <div className="vnav">
          <button onClick={() => go(-1)} disabled={idx === 0}>‹ הקודם</button>
          <span className="vcount">{idx + 1}/{items.length}</span>
          <button onClick={() => go(1)} disabled={idx === items.length - 1}>הבא ›</button>
        </div>
      </div>
    </div>
  )
}
function Sparkle() {
  return <div className="sparkle">{Array.from({ length: 10 }).map((_, i) => (
    <span key={i} style={{ '--a': `${i * 36}deg` }} />))}</div>
}

/* ===================== Store interior (enter a store) ===================== */
function StoreInside({ store, items, imgSrc, updateItem, onClose }) {
  const firstWord = (store.name || '').split(' ')[0]
  const linked = items.filter((it) => it.where && firstWord && it.where.includes(firstWord))
  const list = linked.length ? linked : items // fallback: show all if none mapped
  return (
    <div className="inside">
      <div className="insidehead">
        <button className="vclose static" onClick={onClose}>×</button>
        <div className="insidetitle"><Icon name="door" size={22} /> {store.name}</div>
        <div className="insidesub">{linked.length ? 'מוצרים שמשויכים לחנות זו' : 'כל המוצרים בתחום'}</div>
      </div>
      <div className="insidegrid">
        {list.map((it) => (
          <div key={it.id} className={`gcell${it.bought ? ' bought' : ''}`}
            onClick={() => updateItem(it.id, { bought: !it.bought })}>
            <div className="gimg">
              {imgSrc(it) ? <img src={imgSrc(it)} alt={it.name} loading="lazy" /> : <span className="gph"><Icon name="drop" size={34} fill /></span>}
              {it.bought && <span className="gtick">✓</span>}
            </div>
            <div className="gname">{it.name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===================== In-app navigation (no Waze) ===================== */
function NavView({ route, onClose }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const [step, setStep] = useState(0) // current stop index
  useEffect(() => {
    if (mapRef.current || !elRef.current) return
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false })
    mapRef.current = map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, subdomains: 'abcd', className: 'pogo-tiles' }).addTo(map)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, subdomains: 'abcd', className: 'pogo-labels' }).addTo(map)
    if (route.coords?.length) {
      L.polyline(route.coords, { color: '#22e0c8', weight: 12, opacity: .22 }).addTo(map)
      L.polyline(route.coords, { color: '#22e0c8', weight: 5, opacity: .95 }).addTo(map)
    }
    route.order.forEach((s, i) => {
      const ic = L.divIcon({ html: `<div class="navpin">${i + 1}</div>`, className: 'navpin-wrap', iconSize: [30, 30], iconAnchor: [15, 15] })
      L.marker([s.lat, s.lng], { icon: ic }).addTo(map)
    })
    if (route.coords?.length) map.fitBounds(L.polyline(route.coords).getBounds(), { padding: [50, 50] })
    setTimeout(() => map.invalidateSize(), 120)
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line

  const cur = route.order[step]
  const focusStop = (i) => {
    setStep(i)
    const s = route.order[i]
    if (s && mapRef.current) mapRef.current.flyTo([s.lat, s.lng], 16, { duration: 0.7 })
  }
  return (
    <div className="navview">
      <div ref={elRef} className="navmap" />
      <div className="mapvignette" />
      <button className="navback" onClick={onClose}>‹ סיום</button>
      <div className="navhud">
        <div className="navhud-top">
          <span>תחנה {step + 1}/{route.order.length}</span>
          <span>{route.km.toFixed(1)} ק״מ · ~{Math.round(route.min)} דק׳</span>
        </div>
        <div className="navhud-stop">
          <div className="navhud-num">{step + 1}</div>
          <div>
            <div className="navhud-name">{cur?.name}</div>
            <div className="navhud-addr">{cur?.addr}</div>
          </div>
        </div>
        <div className="navhud-btns">
          <button className="ghostbtn" disabled={step === 0} onClick={() => focusStop(step - 1)}>‹ הקודמת</button>
          {step < route.order.length - 1
            ? <button className="gobtn sm" onClick={() => focusStop(step + 1)}>הגעתי — הבאה ›</button>
            : <button className="gobtn sm done" onClick={onClose}>סיימתי הכל ✓</button>}
        </div>
      </div>
    </div>
  )
}

/* ===================== Modals ===================== */
function Modal({ title, onClose, children }) {
  return (
    <div className="mback" onClick={(e) => e.target.classList.contains('mback') && onClose()}>
      <div className="mbox">
        <div className="mhead"><h3>{title}</h3><button className="vclose" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  )
}
function AddItemModal({ onClose, onAdd }) {
  const [name, setName] = useState(''); const [type, setType] = useState('animal')
  const [desc, setDesc] = useState(''); const [where, setWhere] = useState('')
  return (
    <Modal title="הוסף מוצר" onClose={onClose}>
      <input className="finput" placeholder="שם המוצר" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="seg">
        {[['animal', 'מן החי'], ['plant', 'צמחי'], ['other', 'אחר']].map(([k, l]) => (
          <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{l}</button>))}
      </div>
      <input className="finput" placeholder="תיאור (לא חובה)" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <input className="finput" placeholder="איפה קונים (לא חובה)" value={where} onChange={(e) => setWhere(e.target.value)} />
      <button className="savebtn full" disabled={!name.trim()} onClick={() => { onAdd({ name: name.trim(), type, desc, where }); onClose() }}>הוסף</button>
    </Modal>
  )
}
function AddCatModal({ onClose, onAdd }) {
  const [name, setName] = useState(''); const [emoji, setEmoji] = useState('')
  return (
    <Modal title="הוסף תחום" onClose={onClose}>
      <input className="finput" placeholder="שם התחום (למשל גבינות)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="finput" placeholder="אימוג'י (לא חובה)" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
      <button className="savebtn full" disabled={!name.trim()} onClick={() => { onAdd(name.trim(), emoji.trim()); onClose() }}>הוסף</button>
    </Modal>
  )
}
function AddStoreModal({ onClose, onAdd }) {
  const [name, setName] = useState(''); const [addr, setAddr] = useState(''); const [hours, setHours] = useState('')
  return (
    <Modal title="הוסף חנות" onClose={onClose}>
      <input className="finput" placeholder="שם החנות" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="finput" placeholder="כתובת" value={addr} onChange={(e) => setAddr(e.target.value)} />
      <input className="finput" placeholder="שעות פתיחה (טקסט חופשי, לא חובה)" value={hours} onChange={(e) => setHours(e.target.value)} />
      <button className="savebtn full" disabled={!name.trim() || !addr.trim()} onClick={() => { onAdd(name.trim(), addr.trim(), hours.trim()); onClose() }}>הוסף</button>
    </Modal>
  )
}
