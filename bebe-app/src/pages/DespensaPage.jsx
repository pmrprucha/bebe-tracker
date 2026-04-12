import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

// ── Constantes ─────────────────────────────────────
const TARGETS = [
  { value: 'martim', label: 'Martim',  icon: '👶', color: '#6aaec8' },
  { value: 'vera',   label: 'Vera',    icon: '👧', color: '#e8906a' },
  { value: 'ambos',  label: 'Ambos',   icon: '👶👧', color: '#8b6f47' },
  { value: 'todos',  label: 'Familia', icon: '👨‍👩‍👧‍👦', color: '#7a9e7e' },
]

const LOCAIS = [
  { value: 'frigorifico', label: 'Frigorifico', icon: '🧊' },
  { value: 'congelador',  label: 'Congelador',  icon: '❄️' },
  { value: 'outro',       label: 'Outro',       icon: '📦' },
]

function hoje() { return new Date().toISOString().slice(0,10) }

function diasAteValidade(dataValidade) {
  if (!dataValidade) return null
  const d = new Date(dataValidade + 'T12:00')
  const now = new Date(); now.setHours(12,0,0,0)
  return Math.round((d - now) / 86400000)
}

function badgeValidade(dias) {
  if (dias === null) return null
  if (dias < 0)  return { label: 'Expirado', bg: 'rgba(224,112,112,0.15)', color: 'var(--danger)', border: 'rgba(224,112,112,0.4)' }
  if (dias === 0) return { label: 'Expira hoje!', bg: 'rgba(232,184,75,0.15)', color: 'var(--warn)', border: 'rgba(232,184,75,0.4)' }
  if (dias === 1) return { label: 'Expira amanha', bg: 'rgba(232,184,75,0.12)', color: 'var(--warn)', border: 'rgba(232,184,75,0.3)' }
  if (dias <= 3)  return { label: `${dias}d`, bg: 'rgba(232,184,75,0.08)', color: 'var(--warn)', border: 'rgba(232,184,75,0.2)' }
  return { label: `${dias}d`, bg: 'rgba(109,184,138,0.08)', color: 'var(--sage)', border: 'rgba(109,184,138,0.2)' }
}

function fmtData(d) {
  if (!d) return '—'
  return d.split('-').reverse().join('/')
}

export default function DespensaPage() {
  const { profile, session, showToast } = useApp()
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [filterTarget, setFilterTarget] = useState('all')
  const [filterLocal, setFilterLocal]   = useState('all')
  const [showConsumed, setShowConsumed] = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [editItem, setEditItem]         = useState(null)

  // Form state
  const [fDesc, setFDesc]       = useState('')
  const [fTarget, setFTarget]   = useState('todos')
  const [fLocal, setFLocal]     = useState('frigorifico')
  const [fLocalOutro, setFLocalOutro] = useState('')
  const [fInsercao, setFInsercao] = useState(hoje())
  const [fValidade, setFValidade] = useState('')
  const [fNotas, setFNotas]     = useState('')
  const [fPhotos, setFPhotos]   = useState([]) // { file, preview }
  const [saving, setSaving]     = useState(false)

  // Detalhe / fotos
  const [viewItem, setViewItem] = useState(null)
  const [viewPhotos, setViewPhotos] = useState([])

  // Confirmar consumido
  const [confirmConsumed, setConfirmConsumed] = useState(null)

  useEffect(() => { loadItems() }, [filterTarget, filterLocal, showConsumed])

  const loadItems = async () => {
    setLoading(true)
    let q = sb.from('food_items')
      .select('*, food_photos(id, photo_url, ordem)')
      .eq('consumido', showConsumed)
      .order('data_validade', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (filterTarget !== 'all') q = q.eq('child_target', filterTarget)
    if (filterLocal  !== 'all') q = q.eq('local', filterLocal)

    const { data } = await q
    setItems(data || [])
    setLoading(false)
  }

  // ── Abrir form ─────────────────────────────────────
  const openForm = (item = null) => {
    if (item) {
      setEditItem(item)
      setFDesc(item.descricao || '')
      setFTarget(item.child_target || 'todos')
      setFLocal(item.local || 'frigorifico')
      setFLocalOutro(item.local_outro || '')
      setFInsercao(item.data_insercao || hoje())
      setFValidade(item.data_validade || '')
      setFNotas(item.notas || '')
      setFPhotos([])
    } else {
      setEditItem(null)
      setFDesc(''); setFTarget('todos'); setFLocal('frigorifico')
      setFLocalOutro(''); setFInsercao(hoje()); setFValidade(''); setFNotas('')
      setFPhotos([])
    }
    setShowForm(true)
  }

  // ── Fotos ───────────────────────────────────────────
  const handlePhotoAdd = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        setFPhotos(prev => [...prev, { file, preview: ev.target.result }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removePhoto = (idx) => setFPhotos(prev => prev.filter((_,i) => i !== idx))

  const uploadPhoto = async (file, itemId, ordem) => {
    const ext = file.name.split('.').pop()
    const path = `food/${itemId}/${Date.now()}_${ordem}.${ext}`
    const { error } = await sb.storage.from('food').upload(path, file, { upsert: false })
    if (error) return null
    const { data } = sb.storage.from('food').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Guardar ─────────────────────────────────────────
  const guardar = async () => {
    if (!fDesc.trim()) { showToast('Indica a descricao'); return }
    setSaving(true)

    const payload = {
      descricao: fDesc.trim(),
      child_target: fTarget,
      local: fLocal,
      local_outro: fLocal === 'outro' ? fLocalOutro.trim() : null,
      data_insercao: fInsercao,
      data_validade: fValidade || null,
      notas: fNotas.trim() || null,
    }

    let itemId = editItem?.id
    let error

    if (editItem) {
      const res = await sb.from('food_items').update(payload).eq('id', editItem.id)
      error = res.error
    } else {
      const res = await sb.from('food_items').insert({ ...payload, created_by: profile?.id }).select().single()
      error = res.error
      if (!error) itemId = res.data.id
    }

    if (error) { setSaving(false); showToast('Erro ao guardar'); return }

    // Upload fotos novas
    for (let i = 0; i < fPhotos.length; i++) {
      const url = await uploadPhoto(fPhotos[i].file, itemId, i)
      if (url) {
        await sb.from('food_photos').insert({ food_item_id: itemId, photo_url: url, ordem: i })
      }
    }

    setSaving(false)
    showToast(editItem ? 'Atualizado' : 'Adicionado')
    setShowForm(false)
    loadItems()
  }

  // ── Marcar consumido ────────────────────────────────
  const marcarConsumido = async (item) => {
    await sb.from('food_items').update({ consumido: true, consumido_em: new Date().toISOString() }).eq('id', item.id)
    showToast(`#${item.numero} marcado como consumido`)
    setConfirmConsumed(null)
    loadItems()
  }

  // ── Apagar foto ─────────────────────────────────────
  const apagarFoto = async (fotoId) => {
    await sb.from('food_photos').delete().eq('id', fotoId)
    if (viewItem) {
      setViewPhotos(prev => prev.filter(f => f.id !== fotoId))
    }
    showToast('Foto removida')
  }

  // ── Ver detalhe ─────────────────────────────────────
  const verItem = (item) => {
    setViewItem(item)
    const fotos = item.food_photos || []
    setViewPhotos(fotos.sort((a,b) => a.ordem - b.ordem))
  }

  // ── Alertas validade ────────────────────────────────
  const alertas = items.filter(i => {
    const d = diasAteValidade(i.data_validade)
    return d !== null && d <= 2
  })

  const targetInfo = (v) => TARGETS.find(t => t.value === v) || TARGETS[3]
  const localInfo  = (v) => LOCAIS.find(l => l.value === v) || LOCAIS[0]

  return (
    <div className="page-content">

      {/* ── ALERTAS ── */}
      {alertas.length > 0 && !showConsumed && (
        <div style={{ background:'rgba(232,184,75,0.1)', border:'1px solid rgba(232,184,75,0.35)', borderRadius:12, padding:'12px 16px', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--warn)', marginBottom:6 }}>
            ⚠️ {alertas.length} {alertas.length === 1 ? 'item a expirar' : 'itens a expirar'}
          </div>
          {alertas.map(i => {
            const d = diasAteValidade(i.data_validade)
            return (
              <div key={i.id} style={{ fontSize:12, color:'var(--muted)', display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--warn)', fontSize:14 }}>#{i.numero}</span>
                <span>{i.descricao}</span>
                <span style={{ marginLeft:'auto', color: d < 0 ? 'var(--danger)' : 'var(--warn)', fontWeight:600 }}>
                  {d < 0 ? 'Expirado' : d === 0 ? 'Hoje!' : `${d}d`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── FILTROS ── */}
      <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, marginBottom:8 }}>
        <button onClick={() => setFilterTarget('all')} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid', borderColor: filterTarget==='all'?'var(--earth)':'var(--border)', background: filterTarget==='all'?'rgba(139,111,71,0.1)':'var(--warm)', color: filterTarget==='all'?'var(--earth)':'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Todos</button>
        {TARGETS.map(t => (
          <button key={t.value} onClick={() => setFilterTarget(filterTarget === t.value ? 'all' : t.value)} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid', borderColor: filterTarget===t.value?t.color:'var(--border)', background: filterTarget===t.value?t.color+'18':'var(--warm)', color: filterTarget===t.value?t.color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:12 }}>
        {LOCAIS.map(l => (
          <button key={l.value} onClick={() => setFilterLocal(filterLocal === l.value ? 'all' : l.value)} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid', borderColor: filterLocal===l.value?'var(--sky)':'var(--border)', background: filterLocal===l.value?'rgba(106,174,200,0.1)':'var(--warm)', color: filterLocal===l.value?'var(--sky)':'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
            {l.icon} {l.label}
          </button>
        ))}
        <button onClick={() => setShowConsumed(!showConsumed)} style={{ marginLeft:'auto', padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', background: showConsumed?'var(--warm)':'transparent', color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
          {showConsumed ? '← Activos' : '✓ Consumidos'}
        </button>
      </div>

      {/* ── BOTÃO NOVO ── */}
      {!showForm && !showConsumed && (
        <button onClick={() => openForm()} style={{ width:'100%', padding:'13px', borderRadius:12, border:'1px dashed var(--bark)', background:'var(--warm)', color:'var(--earth)', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit', marginBottom:14 }}>
          + Adicionar comida
        </button>
      )}

      {/* ── FORM ── */}
      {showForm && (
        <div className="card" style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div className="card-title" style={{ marginBottom:0 }}>{editItem ? 'Editar' : '🍱 Nova entrada'}</div>
            <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
          </div>

          {/* Descricao */}
          <div style={{ marginBottom:12 }}>
            <div className="section-label">O que e? *</div>
            <input type="text" value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="ex: Puré de batata, Sopa de legumes..." />
          </div>

          {/* Para quem */}
          <div style={{ marginBottom:12 }}>
            <div className="section-label">Para quem?</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {TARGETS.map(t => (
                <button key={t.value} onClick={() => setFTarget(t.value)} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid', borderColor: fTarget===t.value?t.color:'var(--border)', background: fTarget===t.value?t.color+'18':'var(--warm)', color: fTarget===t.value?t.color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Local */}
          <div style={{ marginBottom:12 }}>
            <div className="section-label">Onde esta?</div>
            <div style={{ display:'flex', gap:6 }}>
              {LOCAIS.map(l => (
                <button key={l.value} onClick={() => setFLocal(l.value)} style={{ flex:1, padding:'8px', borderRadius:10, border:'1px solid', borderColor: fLocal===l.value?'var(--sky)':'var(--border)', background: fLocal===l.value?'rgba(106,174,200,0.12)':'var(--warm)', color: fLocal===l.value?'var(--sky)':'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textAlign:'center' }}>
                  <div>{l.icon}</div>
                  <div style={{ fontSize:11, marginTop:2 }}>{l.label}</div>
                </button>
              ))}
            </div>
            {fLocal === 'outro' && (
              <input type="text" value={fLocalOutro} onChange={e => setFLocalOutro(e.target.value)} placeholder="Onde esta?" style={{ marginTop:8 }} />
            )}
          </div>

          {/* Datas */}
          <div style={{ display:'flex', gap:10, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <div className="section-label">Preparado em</div>
              <input type="date" value={fInsercao} onChange={e => setFInsercao(e.target.value)} />
            </div>
            <div style={{ flex:1 }}>
              <div className="section-label">Validade ate</div>
              <input type="date" value={fValidade} onChange={e => setFValidade(e.target.value)} />
            </div>
          </div>

          {/* Notas */}
          <div style={{ marginBottom:14 }}>
            <div className="section-label">Notas</div>
            <textarea value={fNotas} onChange={e => setFNotas(e.target.value)} placeholder="ingredientes, temperatura, porcoes..." style={{ minHeight:50 }} />
          </div>

          {/* Fotos */}
          <div style={{ marginBottom:14 }}>
            <div className="section-label">Fotos</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              {fPhotos.map((p, i) => (
                <div key={i} style={{ position:'relative' }}>
                  <img src={p.preview} alt="" style={{ width:72, height:72, borderRadius:10, objectFit:'cover', border:'1px solid var(--border)' }} />
                  <button onClick={() => removePhoto(i)} style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'var(--danger)', color:'white', border:'none', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                </div>
              ))}
              <label style={{ width:72, height:72, borderRadius:10, border:'1px dashed var(--bark)', background:'var(--warm)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', gap:4 }}>
                <span style={{ fontSize:24 }}>📷</span>
                <span style={{ fontSize:10, color:'var(--muted)' }}>Foto</span>
                <input type="file" accept="image/*" capture="environment" multiple style={{ display:'none' }} onChange={handlePhotoAdd} />
              </label>
            </div>
          </div>

          {/* Botoes */}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowForm(false)} className="btn btn-secondary" style={{ flex:1 }}>Cancelar</button>
            <button onClick={guardar} disabled={saving} style={{ flex:2, padding:'13px', borderRadius:12, border:'none', background:'var(--earth)', color:'white', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit', opacity:saving?0.6:1 }}>
              {saving ? '...' : (editItem ? 'Guardar' : 'Adicionar')}
            </button>
          </div>
        </div>
      )}

      {/* ── LISTA ── */}
      {loading ? (
        <div className="empty-state"><div className="e-icon">⏳</div><p>A carregar...</p></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="e-icon">🍱</div>
          <p>{showConsumed ? 'Sem itens consumidos' : 'Despensa vazia'}</p>
        </div>
      ) : items.map(item => {
        const ti = targetInfo(item.child_target)
        const li = localInfo(item.local)
        const dias = diasAteValidade(item.data_validade)
        const badge = badgeValidade(dias)
        const fotos = (item.food_photos || []).sort((a,b) => a.ordem - b.ordem)
        const primeiraFoto = fotos[0]?.photo_url

        return (
          <div key={item.id} onClick={() => verItem(item)} style={{
            background: badge?.bg || 'var(--surface)',
            border: `1px solid ${badge?.border || 'var(--border)'}`,
            borderRadius:16, padding:'14px 16px', marginBottom:10,
            cursor:'pointer', display:'flex', gap:12, alignItems:'flex-start'
          }}>
            {/* Foto ou placeholder */}
            <div style={{ width:64, height:64, borderRadius:10, overflow:'hidden', flexShrink:0, background:'var(--warm)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>
              {primeiraFoto
                ? <img src={primeiraFoto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : '🍱'}
            </div>

            {/* Info */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                {/* Numero em destaque */}
                <div style={{ fontFamily:'monospace', fontSize:18, fontWeight:700, color:'var(--earth)', background:'rgba(139,111,71,0.1)', borderRadius:8, padding:'2px 8px', flexShrink:0 }}>
                  #{item.numero}
                </div>
                <div style={{ fontSize:15, fontWeight:600, color:'var(--deep)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {item.descricao}
                </div>
              </div>

              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
                <span style={{ fontSize:11, background:'rgba(255,255,255,0.5)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 7px', color:ti.color, fontWeight:600 }}>
                  {ti.icon} {ti.label}
                </span>
                <span style={{ fontSize:11, background:'rgba(255,255,255,0.5)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 7px', color:'var(--muted)' }}>
                  {li.icon} {item.local === 'outro' && item.local_outro ? item.local_outro : li.label}
                </span>
                {badge && (
                  <span style={{ fontSize:11, background: badge.bg, border:`1px solid ${badge.border}`, borderRadius:6, padding:'2px 7px', color:badge.color, fontWeight:600 }}>
                    {badge.label}
                  </span>
                )}
                {fotos.length > 1 && (
                  <span style={{ fontSize:11, color:'var(--muted)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 7px' }}>
                    📷 {fotos.length}
                  </span>
                )}
              </div>

              <div style={{ fontSize:11, color:'var(--muted)' }}>
                Preparado: {fmtData(item.data_insercao)}
                {item.data_validade ? ' · Val: ' + fmtData(item.data_validade) : ''}
              </div>
            </div>

            {/* Acoes rapidas */}
            {!showConsumed && (
              <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => openForm(item)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--earth)', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✏️</button>
                <button onClick={() => setConfirmConsumed(item)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid rgba(122,158,126,0.3)', background:'rgba(122,158,126,0.08)', color:'var(--sage)', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✓</button>
              </div>
            )}
          </div>
        )
      })}

      {/* ── MODAL DETALHE ── */}
      {viewItem && (
        <div className="modal-overlay" onClick={() => setViewItem(null)}>
          <div className="modal-sheet" style={{ maxHeight:'85vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontFamily:'monospace', fontSize:22, fontWeight:700, color:'var(--earth)', background:'rgba(139,111,71,0.1)', borderRadius:8, padding:'3px 10px' }}>
                  #{viewItem.numero}
                </div>
                <div style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:400 }}>{viewItem.descricao}</div>
              </div>
              <button onClick={() => setViewItem(null)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>

            {/* Fotos */}
            {viewPhotos.length > 0 && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                {viewPhotos.map(foto => (
                  <div key={foto.id} style={{ position:'relative' }}>
                    <img src={foto.photo_url} alt="" style={{ width:100, height:100, borderRadius:12, objectFit:'cover', border:'1px solid var(--border)' }} />
                    {session && (
                      <button onClick={() => apagarFoto(foto.id)} style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'var(--danger)', color:'white', border:'none', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Detalhes */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                ['Para quem', targetInfo(viewItem.child_target).icon + ' ' + targetInfo(viewItem.child_target).label],
                ['Local', localInfo(viewItem.local).icon + ' ' + (viewItem.local === 'outro' && viewItem.local_outro ? viewItem.local_outro : localInfo(viewItem.local).label)],
                ['Preparado em', fmtData(viewItem.data_insercao)],
                ['Validade', fmtData(viewItem.data_validade)],
                viewItem.notas ? ['Notas', viewItem.notas] : null,
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                  <div style={{ fontSize:12, color:'var(--muted)', fontWeight:600, minWidth:90 }}>{label}</div>
                  <div style={{ fontSize:14, color:'var(--text)', flex:1 }}>{value}</div>
                </div>
              ))}
            </div>

            {!showConsumed && session && (
              <div style={{ display:'flex', gap:8, marginTop:20 }}>
                <button onClick={() => { setViewItem(null); openForm(viewItem) }} className="btn btn-secondary" style={{ flex:1 }}>✏️ Editar</button>
                <button onClick={() => { setViewItem(null); setConfirmConsumed(viewItem) }} style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:'var(--sage)', color:'white', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>✓ Consumido</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL CONSUMIDO ── */}
      {confirmConsumed && (
        <div className="modal-overlay" onClick={() => setConfirmConsumed(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:48, marginBottom:10 }}>✅</div>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:400, marginBottom:8 }}>
                #{confirmConsumed.numero} consumido?
              </h3>
              <p style={{ fontSize:14, color:'var(--muted)' }}>{confirmConsumed.descricao}</p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmConsumed(null)} style={{ flex:1, padding:'13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--text)', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
              <button onClick={() => marcarConsumido(confirmConsumed)} style={{ flex:2, padding:'13px', borderRadius:12, border:'none', background:'var(--sage)', color:'white', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
