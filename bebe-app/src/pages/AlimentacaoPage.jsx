import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { today, nowHHMM } from '../lib/sleep'

const RATINGS = [
  { value: 'bem',    label: 'Correu bem',    icon: '😊', color: '#7a9e7e' },
  { value: 'normal', label: 'Normal',        icon: '😐', color: '#c4a882' },
  { value: 'mal',    label: 'Correu mal',    icon: '😞', color: '#c06050' },
]

function fmtSinceShort(secs) {
  if (!secs || secs < 0) return null
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const h = Math.floor(m / 60)
  if (h === 0) return `${m}min`
  return `${h}h${m % 60 > 0 ? ` ${m % 60}min` : ''}`
}

function horaToMs(hora) {
  if (!hora) return null
  const [h, m] = hora.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export default function AlimentacaoPage() {
  const { activeChild, profile, session, showToast } = useApp()
  const [meals, setMeals]         = useState([])
  const [sinceSecs, setSinceSecs] = useState(null)
  const sinceRef = useRef(null)

  // Form novo registo
  const [showForm, setShowForm]   = useState(false)
  const [formHora, setFormHora]   = useState(nowHHMM())
  const [formObs, setFormObs]     = useState('')
  const [formRating, setFormRating] = useState(null)
  const [formPhoto, setFormPhoto] = useState(null) // File
  const [formPhotoPreview, setFormPhotoPreview] = useState(null)
  const [saving, setSaving]       = useState(false)

  // Edit
  const [editId, setEditId]       = useState(null)
  const [editHora, setEditHora]   = useState('')
  const [editObs, setEditObs]     = useState('')
  const [editRating, setEditRating] = useState(null)

  // Delete
  const [deleteId, setDeleteId]   = useState(null)

  useEffect(() => { if (activeChild) loadMeals() }, [activeChild])
  useEffect(() => () => clearInterval(sinceRef.current), [])

  const loadMeals = async () => {
    const { data } = await sb
      .from('meals').select('*, profiles(name)')
      .eq('child_id', activeChild.id).eq('data_date', today())
      .order('hora', { ascending: false })
    setMeals(data || [])
  }

  // ── Contador "última refeição" ─────────────────────
  useEffect(() => {
    clearInterval(sinceRef.current)
    if (!meals.length) { setSinceSecs(null); return }
    const ultima = meals[0]
    const refMs = horaToMs(ultima.hora)
    if (!refMs) return
    const tick = () => setSinceSecs(Math.max(0, Math.floor((Date.now() - refMs) / 1000)))
    tick()
    sinceRef.current = setInterval(tick, 15000)
    return () => clearInterval(sinceRef.current)
  }, [meals])

  // ── Foto ───────────────────────────────────────────
  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFormPhoto(file)
    const reader = new FileReader()
    reader.onload = (ev) => setFormPhotoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const uploadPhoto = async (file) => {
    if (!file) return null
    const ext = file.name.split('.').pop()
    const path = `meals/${activeChild.id}/${Date.now()}.${ext}`
    const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: false })
    if (error) return null
    const { data } = sb.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Guardar novo ───────────────────────────────────
  const guardar = async () => {
    setSaving(true)
    let photo_url = null
    if (formPhoto) photo_url = await uploadPhoto(formPhoto)

    const { error } = await sb.from('meals').insert({
      child_id: activeChild.id,
      data_date: today(),
      hora: formHora,
      descricao: formObs || '–',
      obs: formObs,
      rating: formRating,
      photo_url,
      recorded_by: profile?.id
    })
    setSaving(false)
    if (!error) {
      showToast('Refeição guardada ✓')
      setShowForm(false)
      setFormObs(''); setFormRating(null); setFormPhoto(null); setFormPhotoPreview(null); setFormHora(nowHHMM())
      loadMeals()
    } else {
      showToast('Erro ao guardar')
    }
  }

  // ── Edit ───────────────────────────────────────────
  const openEdit = (m) => {
    setEditId(m.id); setEditHora(m.hora||''); setEditObs(m.obs||''); setEditRating(m.rating||null)
  }

  const saveEdit = async () => {
    const { error } = await sb.from('meals')
      .update({ hora: editHora, obs: editObs, descricao: editObs||'–', rating: editRating }).eq('id', editId)
    if (!error) { showToast('Atualizado ✓'); setEditId(null); loadMeals() }
    else showToast('Erro ao atualizar')
  }

  // ── Delete ─────────────────────────────────────────
  const confirmDelete = async () => {
    const { error } = await sb.from('meals').delete().eq('id', deleteId)
    if (!error) { showToast('Apagado'); setDeleteId(null); loadMeals() }
    else showToast('Erro ao apagar')
  }

  const sinceColor = sinceSecs == null ? null
    : sinceSecs < 7200  ? { text:'var(--sage)',   bg:'rgba(168,197,171,0.12)' }
    : sinceSecs < 14400 ? { text:'var(--warn)',   bg:'rgba(196,162,64,0.12)' }
    :                     { text:'var(--danger)', bg:'rgba(232,165,152,0.12)' }

  const sinceStr = fmtSinceShort(sinceSecs)

  if (!activeChild) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">👶</div><p>Seleciona uma criança primeiro</p></div>
    </div>
  )

  return (
    <div className="page-content">

      {/* Banner última refeição */}
      {sinceStr && sinceColor && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:sinceColor.bg, border:`1px solid ${sinceColor.text}30`, borderRadius:12, padding:'11px 16px', marginBottom:12 }}>
          <span style={{ fontSize:20 }}>🍽️</span>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:sinceColor.text }}>Última refeição há {sinceStr}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>{meals[0]?.hora} · {meals[0]?.obs || '–'}</div>
          </div>
        </div>
      )}

      {/* Botão novo */}
      {!showForm && (
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setFormHora(nowHHMM()) }} style={{ marginBottom:12 }}>
          + Registar refeição
        </button>
      )}

      {/* Form novo registo */}
      {showForm && (
        <div className="card" style={{ marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div className="card-title" style={{ marginBottom:0 }}>🥣 Nova refeição</div>
            <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
          </div>

          <div className="field-row" style={{ marginBottom:12 }}>
            <div className="field-label">Hora</div>
            <input type="time" value={formHora} onChange={e => setFormHora(e.target.value)} style={{ width:'auto', minWidth:110 }} />
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6 }}>Como correu?</div>
            <div style={{ display:'flex', gap:8 }}>
              {RATINGS.map(r => (
                <button key={r.value} onClick={() => setFormRating(formRating === r.value ? null : r.value)} style={{
                  flex:1, padding:'10px 4px', borderRadius:10, border:'1px solid',
                  borderColor: formRating === r.value ? r.color : 'var(--border)',
                  background: formRating === r.value ? r.color + '18' : 'var(--warm)',
                  cursor:'pointer', fontFamily:'inherit', textAlign:'center'
                }}>
                  <div style={{ fontSize:22 }}>{r.icon}</div>
                  <div style={{ fontSize:10, fontWeight:600, color: formRating === r.value ? r.color : 'var(--muted)', marginTop:3 }}>{r.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Notas</div>
            <textarea value={formObs} onChange={e => setFormObs(e.target.value)} placeholder="o que comeu, quantidade, reacções…" style={{ minHeight:60 }} />
          </div>

          {/* Foto */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6 }}>Foto (opcional)</div>
            {formPhotoPreview ? (
              <div style={{ position:'relative', display:'inline-block' }}>
                <img src={formPhotoPreview} alt="" style={{ width:80, height:80, borderRadius:10, objectFit:'cover', border:'1px solid var(--border)' }} />
                <button onClick={() => { setFormPhoto(null); setFormPhotoPreview(null) }}
                  style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'var(--danger)', color:'white', border:'none', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              </div>
            ) : (
              <label style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, border:'1px dashed var(--bark)', background:'var(--warm)', cursor:'pointer', fontSize:13, color:'var(--earth)', fontFamily:'inherit' }}>
                📷 Adicionar foto
                <input type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handlePhotoChange} />
              </label>
            )}
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowForm(false)} className="btn btn-secondary" style={{ flex:1 }}>Cancelar</button>
            <button onClick={guardar} className="btn btn-primary" disabled={saving} style={{ flex:2 }}>
              {saving ? '…' : '💾 Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="card">
        <div className="card-title">🥣 Refeições de hoje</div>
        {meals.length === 0 ? (
          <div className="empty-state" style={{ padding:'20px 0' }}>
            <div className="e-icon">🥣</div><p>Ainda sem refeições hoje</p>
          </div>
        ) : meals.map(m => {
          const r = RATINGS.find(x => x.value === m.rating)
          return (
            <div key={m.id} style={{ padding:'11px 0', borderBottom:'1px solid var(--border)' }}>
              {editId === m.id ? (
                <div>
                  <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Hora</div>
                      <input type="time" value={editHora} onChange={e => setEditHora(e.target.value)}
                        style={{ width:'100%', padding:'8px', borderRadius:8, border:'1px solid var(--border)', background:'var(--warm)', fontFamily:'monospace', fontSize:15, color:'var(--deep)', outline:'none' }} />
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, marginBottom:10 }}>
                    {RATINGS.map(r => (
                      <button key={r.value} onClick={() => setEditRating(editRating === r.value ? null : r.value)} style={{
                        flex:1, padding:'8px 4px', borderRadius:10, border:'1px solid',
                        borderColor: editRating === r.value ? r.color : 'var(--border)',
                        background: editRating === r.value ? r.color + '18' : 'var(--warm)',
                        cursor:'pointer', fontFamily:'inherit', textAlign:'center'
                      }}>
                        <div style={{ fontSize:18 }}>{r.icon}</div>
                      </button>
                    ))}
                  </div>
                  <textarea value={editObs} onChange={e => setEditObs(e.target.value)} placeholder="notas…" style={{ marginBottom:10, minHeight:50 }} />
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setEditId(null)} style={{ flex:1, padding:'9px', borderRadius:10, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--muted)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
                    <button onClick={saveEdit} style={{ flex:2, padding:'9px', borderRadius:10, border:'none', background:'var(--earth)', color:'white', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Guardar</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  {/* Foto miniatura */}
                  {m.photo_url && (
                    <img src={m.photo_url} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:14, fontWeight:600, fontFamily:'monospace' }}>{m.hora}</span>
                      {r && <span style={{ fontSize:16 }}>{r.icon}</span>}
                      {m.profiles?.name && <span style={{ fontSize:11, color:'var(--muted)' }}>{m.profiles.name}</span>}
                    </div>
                    {m.obs && <div style={{ fontSize:13, color:'var(--text)', marginTop:3 }}>{m.obs}</div>}
                  </div>
                  {session && (
                    <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                      <button onClick={() => openEdit(m)} style={{ padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--earth)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>✏️</button>
                      <button onClick={() => setDeleteId(m.id)} style={{ padding:'5px 8px', borderRadius:7, border:'1px solid rgba(192,97,78,0.3)', background:'rgba(192,97,78,0.06)', color:'var(--danger)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>🗑</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🗑️</div>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:400, marginBottom:8 }}>Apagar refeição?</h3>
              <p style={{ fontSize:14, color:'var(--muted)' }}>Esta acção não pode ser desfeita.</p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex:1, padding:'13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--text)', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
              <button onClick={confirmDelete} style={{ flex:1, padding:'13px', borderRadius:12, border:'none', background:'var(--danger)', color:'white', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
