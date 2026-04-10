import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { today, nowHHMM } from '../lib/sleep'

// ── Saude ─────────────────────────────────────────
const TIPOS = [
  { value: 'sintoma',     label: 'Sintoma',     icon: '🤒', color: '#c06050' },
  { value: 'medicamento', label: 'Medicamento', icon: '💊', color: '#8b6f47' },
  { value: 'consulta',    label: 'Consulta',    icon: '👨‍⚕️', color: '#7a9e7e' },
  { value: 'vacina',      label: 'Vacina',      icon: '💉', color: '#8fb3c8' },
  { value: 'outro',       label: 'Outro',       icon: '📋', color: '#9b7d5e' },
]
const SINTOMAS_RAPIDOS = ['Febre','Tosse','Constipacao','Dor barriga','Diarreia','Vomito','Otite','Irritabilidade','Erupcao cutanea']

// ── Tratamentos ───────────────────────────────────
const UNIDADES = ['ml','mg','comprimido','gota','capsula','supositorio','aplicacao']
const PERIODICIDADES = [
  { label: 'A cada 4h',     horas: 4 },
  { label: 'A cada 6h',     horas: 6 },
  { label: 'A cada 8h',     horas: 8 },
  { label: 'A cada 12h',    horas: 12 },
  { label: '1x por dia',    horas: 24 },
  { label: 'Personalizado', horas: null },
]

function fmtDateTime(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') +
    ' · ' + d.getDate() + '/' + (d.getMonth()+1)
}

function fmtProxima(lastTs, periodoH) {
  if (!lastTs) return 'Ainda nao tomou'
  const next = new Date(lastTs).getTime() + periodoH * 3600000
  const now = Date.now()
  const diff = next - now
  if (diff < 0) {
    const min = Math.floor(-diff / 60000)
    if (min < 60) return `Atrasado ${min}min`
    return `Atrasado ${Math.floor(min/60)}h${min%60>0?' '+min%60+'min':''}`
  }
  const m = Math.floor(diff / 60000)
  if (m < 60) return `Em ${m}min`
  return `Em ${Math.floor(m/60)}h${m%60>0?' '+m%60+'min':''}`
}

function isAtrasado(lastTs, periodoH) {
  if (!lastTs) return true
  return Date.now() > new Date(lastTs).getTime() + periodoH * 3600000
}

// Data/hora local para input datetime-local
function toLocalDatetimeInput(date = new Date()) {
  const pad = n => String(n).padStart(2,'0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function MedicoPage() {
  const { activeChild, profile, showToast } = useApp()
  const [tab, setTab] = useState('saude')

  // ── SAUDE state ───────────────────────────────────
  const [records, setRecords]       = useState([])
  const [showForm, setShowForm]     = useState(false)
  const [tipo, setTipo]             = useState('sintoma')
  const [titulo, setTitulo]         = useState('')
  const [descricao, setDescricao]   = useState('')
  const [valor, setValor]           = useState('')
  const [hora, setHora]             = useState(nowHHMM())
  const [dataReg, setDataReg]       = useState(today())
  const [saving, setSaving]         = useState(false)
  const [filterTipo, setFilterTipo] = useState('all')

  // ── TRATAMENTOS state ─────────────────────────────
  const [treatments, setTreatments] = useState([])
  const [logs, setLogs]             = useState({})
  const [loadingT, setLoadingT]     = useState(true)
  const [showTForm, setShowTForm]   = useState(false)
  const [editT, setEditT]           = useState(null)
  const [tMed, setTMed]             = useState('')
  const [tDose, setTDose]           = useState('')
  const [tUnidade, setTUnidade]     = useState('ml')
  const [tPeriodo, setTPeriodo]     = useState(8)
  const [tCustom, setTCustom]       = useState('')
  const [tIsCustom, setTIsCustom]   = useState(false)
  const [tInicio, setTInicio]       = useState(new Date().toISOString().slice(0,10))
  const [tFim, setTFim]             = useState('')
  const [tNotas, setTNotas]         = useState('')
  const [savingT, setSavingT]       = useState(false)
  const [confirmToma, setConfirmToma] = useState(null)
  const [tomaNotas, setTomaNotas]   = useState('')
  const [tomaDatetime, setTomaDatetime] = useState('') // data/hora manual da toma
  const [deleteT, setDeleteT]       = useState(null)

  const tickRef = useRef(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    tickRef.current = setInterval(() => setTick(t => t+1), 30000)
    return () => clearInterval(tickRef.current)
  }, [])

  useEffect(() => { if (activeChild) { loadRecords(); loadTreatments() } }, [activeChild, filterTipo])

  // ── SAUDE ─────────────────────────────────────────
  const loadRecords = async () => {
    let q = sb.from('medical_records').select('*, profiles(name)')
      .eq('child_id', activeChild.id)
      .order('data_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (filterTipo !== 'all') q = q.eq('tipo', filterTipo)
    const { data } = await q
    setRecords(data || [])
  }

  const guardarRegisto = async () => {
    if (!titulo) { showToast('Indica o titulo'); return }
    setSaving(true)
    const { error } = await sb.from('medical_records').insert({
      child_id: activeChild.id, data_date: dataReg, hora,
      tipo, titulo, descricao, valor, recorded_by: profile?.id
    })
    setSaving(false)
    if (error) { showToast('Erro ao guardar'); return }
    showToast('Registo guardado')
    setShowForm(false)
    setTitulo(''); setDescricao(''); setValor(''); setHora(nowHHMM()); setDataReg(today())
    loadRecords()
  }

  // ── TRATAMENTOS ───────────────────────────────────
  const loadTreatments = async () => {
    setLoadingT(true)
    const { data: treats } = await sb.from('treatments').select('*')
      .eq('child_id', activeChild.id).eq('ativo', true)
      .order('created_at', { ascending: false })
    setTreatments(treats || [])
    if (treats?.length) {
      const { data: allLogs } = await sb.from('treatment_logs')
        .select('*')
        .in('treatment_id', treats.map(t => t.id))
        .order('tomado_em', { ascending: false })
      const byT = {}
      for (const l of (allLogs || [])) {
        if (!byT[l.treatment_id]) byT[l.treatment_id] = []
        byT[l.treatment_id].push(l)
      }
      setLogs(byT)
    }
    setLoadingT(false)
  }

  const openTForm = (t = null) => {
    if (t) {
      setEditT(t); setTMed(t.medicamento); setTDose(t.dose||''); setTUnidade(t.unidade||'ml')
      const pm = PERIODICIDADES.find(p => p.horas === t.periodicidade_horas)
      if (pm?.horas !== null) { setTIsCustom(false); setTPeriodo(t.periodicidade_horas) }
      else { setTIsCustom(true); setTCustom(String(t.periodicidade_horas)) }
      setTInicio(t.data_inicio||''); setTFim(t.data_fim||''); setTNotas(t.notas||'')
    } else {
      setEditT(null); setTMed(''); setTDose(''); setTUnidade('ml')
      setTPeriodo(8); setTIsCustom(false); setTCustom('')
      setTInicio(new Date().toISOString().slice(0,10)); setTFim(''); setTNotas('')
    }
    setShowTForm(true)
  }

  const guardarTratamento = async () => {
    if (!tMed.trim()) { showToast('Indica o medicamento'); return }
    setSavingT(true)
    const periodo = tIsCustom ? parseFloat(tCustom) : tPeriodo
    const payload = {
      child_id: activeChild.id, medicamento: tMed.trim(),
      dose: tDose.trim()||null, unidade: tUnidade,
      periodicidade_horas: periodo,
      data_inicio: tInicio, data_fim: tFim||null,
      notas: tNotas.trim()||null, ativo: true
    }
    const { error } = editT
      ? await sb.from('treatments').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editT.id)
      : await sb.from('treatments').insert({ ...payload, created_by: profile?.id })
    setSavingT(false)
    if (!error) { showToast(editT ? 'Atualizado' : 'Tratamento criado'); setShowTForm(false); loadTreatments() }
    else showToast('Erro ao guardar')
  }

  const abrirConfirmToma = (t) => {
    setConfirmToma(t)
    setTomaNotas('')
    setTomaDatetime(toLocalDatetimeInput()) // default = agora
  }

  const registarToma = async () => {
    if (!confirmToma) return
    // Usar a data/hora manual se preenchida, senão agora
    const tomadoEm = tomaDatetime
      ? new Date(tomaDatetime).toISOString()
      : new Date().toISOString()

    const { error } = await sb.from('treatment_logs').insert({
      treatment_id: confirmToma.id,
      child_id: activeChild.id,
      tomado_em: tomadoEm,
      registered_by: profile?.id,
      notas: tomaNotas.trim()||null
    })
    if (!error) {
      showToast(confirmToma.medicamento + ' — toma registada')
      setConfirmToma(null); setTomaNotas(''); loadTreatments()
    } else showToast('Erro ao registar')
  }

  const desactivarT = async (id) => {
    await sb.from('treatments').update({ ativo: false }).eq('id', id)
    showToast('Tratamento encerrado'); setDeleteT(null); loadTreatments()
  }

  const tipoInfo = (t) => TIPOS.find(x => x.value === t) || TIPOS[4]
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']
  const fmtDate = d => { const dt = new Date(d + 'T12:00'); return days[dt.getDay()] + ', ' + d.split('-').reverse().join('/') }

  const atrasados = treatments.filter(t => isAtrasado(logs[t.id]?.[0]?.tomado_em, t.periodicidade_horas))

  if (!activeChild) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">👶</div><p>Seleciona uma criança primeiro</p></div>
    </div>
  )

  return (
    <div className="page-content">

      {/* TABS */}
      <div style={{ display:'flex', background:'var(--warm)', borderRadius:12, padding:4, marginBottom:14 }}>
        {[
          ['saude', '🩺 Saude'],
          ['tratamentos', `💊 Tratamentos${atrasados.length > 0 ? ' 🔴' : ''}`]
        ].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex:1, padding:'9px', borderRadius:9, border:'none',
            fontFamily:'Instrument Sans, sans-serif', fontSize:13, fontWeight:600,
            cursor:'pointer', transition:'all 0.2s',
            background: tab === k ? 'white' : 'transparent',
            color: tab === k ? 'var(--earth)' : 'var(--muted)',
            boxShadow: tab === k ? 'var(--shadow)' : 'none'
          }}>{l}</button>
        ))}
      </div>

      {/* ═══════════ SAUDE ═══════════ */}
      {tab === 'saude' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ flex:1 }}>+ Novo registo</button>
          </div>
          <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, marginBottom:12 }}>
            <button onClick={() => setFilterTipo('all')} style={{ padding:'6px 12px', borderRadius:20, border:'1px solid', borderColor: filterTipo==='all'?'var(--earth)':'var(--border)', background: filterTipo==='all'?'rgba(139,111,71,0.1)':'var(--warm)', color: filterTipo==='all'?'var(--earth)':'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Todos</button>
            {TIPOS.map(t => (
              <button key={t.value} onClick={() => setFilterTipo(t.value)} style={{ padding:'6px 12px', borderRadius:20, border:'1px solid', borderColor: filterTipo===t.value?t.color:'var(--border)', background: filterTipo===t.value?t.color+'18':'var(--warm)', color: filterTipo===t.value?t.color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>{t.icon} {t.label}</button>
            ))}
          </div>
          {records.length === 0 ? (
            <div className="empty-state"><div className="e-icon">📋</div><p>Ainda sem registos medicos</p></div>
          ) : records.map(r => {
            const ti = tipoInfo(r.tipo)
            return (
              <div key={r.id} className="card" style={{ padding:'14px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:ti.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{ti.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:14, fontWeight:600, color:'var(--deep)' }}>{r.titulo}</span>
                      {r.valor && <span style={{ fontSize:12, fontFamily:'monospace', color:ti.color, fontWeight:600 }}>{r.valor}</span>}
                    </div>
                    {r.descricao && <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.4, marginBottom:6 }}>{r.descricao}</p>}
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(r.data_date)}{r.hora?' · '+r.hora:''}</span>
                      {r.profiles?.name && <span style={{ fontSize:11, color:'var(--earth)', fontWeight:600 }}>por {r.profiles.name}</span>}
                      <span className="badge" style={{ borderColor:ti.color+'40', color:ti.color, background:ti.color+'12' }}>{ti.label}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {showForm && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
              <div className="modal-sheet">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <h3 style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:400 }}>Novo registo medico</h3>
                  <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:20, color:'var(--muted)', cursor:'pointer' }}>✕</button>
                </div>
                <div className="section-label">Tipo</div>
                <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
                  {TIPOS.map(t => (
                    <button key={t.value} onClick={() => setTipo(t.value)} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid', borderColor: tipo===t.value?t.color:'var(--border)', background: tipo===t.value?t.color+'18':'var(--warm)', color: tipo===t.value?t.color:'var(--text)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{t.icon} {t.label}</button>
                  ))}
                </div>
                {tipo === 'sintoma' && (
                  <div style={{ marginBottom:12 }}>
                    <div className="section-label">Sintomas rapidos</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {SINTOMAS_RAPIDOS.map(s => (
                        <button key={s} onClick={() => setTitulo(s)} style={{ padding:'6px 10px', borderRadius:20, border:'1px solid', borderColor: titulo===s?'var(--blush)':'var(--border)', background: titulo===s?'rgba(232,165,152,0.15)':'var(--warm)', color: titulo===s?'var(--danger)':'var(--text)', fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ marginBottom:10 }}><div className="section-label">Titulo *</div><input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="titulo..." /></div>
                <div style={{ marginBottom:10 }}><div className="section-label">{tipo==='sintoma'?'Valor (ex: 38.5C)':'Valor'}</div><input type="text" value={valor} onChange={e => setValor(e.target.value)} placeholder="opcional" /></div>
                <div style={{ marginBottom:10 }}><div className="section-label">Descricao</div><textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="detalhes..." /></div>
                <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                  <div style={{ flex:1 }}><div className="section-label">Data</div><input type="date" value={dataReg} onChange={e => setDataReg(e.target.value)} /></div>
                  <div style={{ flex:1 }}><div className="section-label">Hora</div><input type="time" value={hora} onChange={e => setHora(e.target.value)} /></div>
                </div>
                <button className="btn btn-primary" onClick={guardarRegisto} disabled={saving}>{saving?'...':'Guardar'}</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════ TRATAMENTOS ═══════════ */}
      {tab === 'tratamentos' && (
        <>
          {atrasados.length > 0 && (
            <div style={{ background:'rgba(224,112,112,0.1)', border:'2px solid rgba(224,112,112,0.4)', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <span style={{ fontSize:24 }}>💊</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--danger)' }}>
                    {atrasados.length === 1 ? '1 medicamento em atraso' : `${atrasados.length} medicamentos em atraso`}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Confirma a toma abaixo</div>
                </div>
              </div>
              {atrasados.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(255,255,255,0.6)', borderRadius:10, padding:'10px 12px', marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700 }}>{t.medicamento}</div>
                    <div style={{ fontSize:12, color:'var(--danger)', fontWeight:600 }}>{fmtProxima(logs[t.id]?.[0]?.tomado_em, t.periodicidade_horas)}</div>
                  </div>
                  <button onClick={() => abrirConfirmToma(t)} style={{ padding:'9px 16px', borderRadius:10, border:'none', background:'var(--danger)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    Confirmar toma
                  </button>
                </div>
              ))}
            </div>
          )}

          {!showTForm && (
            <button onClick={() => openTForm()} style={{ width:'100%', padding:'13px', borderRadius:12, border:'1px dashed var(--bark)', background:'var(--warm)', color:'var(--earth)', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit', marginBottom:14 }}>
              + Novo tratamento
            </button>
          )}

          {showTForm && (
            <div className="card" style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div className="card-title" style={{ marginBottom:0 }}>{editT ? 'Editar' : 'Novo tratamento'}</div>
                <button onClick={() => setShowTForm(false)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ marginBottom:12 }}><div className="section-label">Medicamento *</div><input type="text" value={tMed} onChange={e => setTMed(e.target.value)} placeholder="ex: Brufen, Benesin..." /></div>
              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <div style={{ flex:1 }}><div className="section-label">Dose</div><input type="text" value={tDose} onChange={e => setTDose(e.target.value)} placeholder="ex: 5" /></div>
                <div style={{ flex:1 }}><div className="section-label">Unidade</div><select value={tUnidade} onChange={e => setTUnidade(e.target.value)}>{UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
              </div>
              <div style={{ marginBottom:12 }}>
                <div className="section-label">Periodicidade</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom: tIsCustom?8:0 }}>
                  {PERIODICIDADES.map(p => (
                    <button key={p.label} onClick={() => { if(p.horas===null){setTIsCustom(true)}else{setTIsCustom(false);setTPeriodo(p.horas)} }} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid', borderColor: (!tIsCustom&&tPeriodo===p.horas)||(tIsCustom&&p.horas===null)?'var(--earth)':'var(--border)', background: (!tIsCustom&&tPeriodo===p.horas)||(tIsCustom&&p.horas===null)?'rgba(139,111,71,0.1)':'var(--warm)', color: (!tIsCustom&&tPeriodo===p.horas)||(tIsCustom&&p.horas===null)?'var(--earth)':'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{p.label}</button>
                  ))}
                </div>
                {tIsCustom && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                    <input type="number" value={tCustom} onChange={e => setTCustom(e.target.value)} placeholder="ex: 6" min="0.5" step="0.5" style={{ width:100 }} />
                    <span style={{ fontSize:13, color:'var(--muted)' }}>horas</span>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <div style={{ flex:1 }}><div className="section-label">Inicio</div><input type="date" value={tInicio} onChange={e => setTInicio(e.target.value)} /></div>
                <div style={{ flex:1 }}><div className="section-label">Fim (opcional)</div><input type="date" value={tFim} onChange={e => setTFim(e.target.value)} /></div>
              </div>
              <div style={{ marginBottom:14 }}><div className="section-label">Notas</div><textarea value={tNotas} onChange={e => setTNotas(e.target.value)} placeholder="instrucoes, cuidados..." style={{ minHeight:50 }} /></div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setShowTForm(false)} className="btn btn-secondary" style={{ flex:1 }}>Cancelar</button>
                <button onClick={guardarTratamento} disabled={savingT} style={{ flex:2, padding:'13px', borderRadius:12, border:'none', background:'var(--earth)', color:'white', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit', opacity:savingT?0.6:1 }}>
                  {savingT ? '...' : (editT ? 'Guardar' : 'Criar tratamento')}
                </button>
              </div>
            </div>
          )}

          {loadingT ? (
            <div className="empty-state"><div className="e-icon">⏳</div><p>A carregar...</p></div>
          ) : treatments.length === 0 ? (
            <div className="empty-state"><div className="e-icon">💊</div><p>Sem tratamentos activos</p></div>
          ) : treatments.map(t => {
            const lastLog = logs[t.id]?.[0]
            const atrasado = isAtrasado(lastLog?.tomado_em, t.periodicidade_horas)
            const proxima = fmtProxima(lastLog?.tomado_em, t.periodicidade_horas)
            const totalTomas = logs[t.id]?.length || 0
            return (
              <div key={t.id} style={{ background: atrasado?'rgba(224,112,112,0.05)':'var(--surface)', border:`1px solid ${atrasado?'rgba(224,112,112,0.3)':'var(--border)'}`, borderRadius:14, padding:'14px 16px', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:22 }}>💊</span>
                    <div>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--deep)' }}>{t.medicamento}</div>
                      {t.dose && <div style={{ fontSize:13, color:'var(--muted)' }}>{t.dose} {t.unidade}</div>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => openTForm(t)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--earth)', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✏️</button>
                    <button onClick={() => setDeleteT(t.id)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid rgba(192,97,78,0.3)', background:'rgba(192,97,78,0.06)', color:'var(--danger)', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                  <span style={{ fontSize:12, background:'var(--warm)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', color:'var(--earth)' }}>A cada {t.periodicidade_horas}h</span>
                  {t.data_fim && <span style={{ fontSize:12, background:'var(--warm)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', color:'var(--muted)' }}>ate {t.data_fim.split('-').reverse().join('/')}</span>}
                  <span style={{ fontSize:12, background:'var(--warm)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', color:'var(--muted)' }}>{totalTomas} toma{totalTomas!==1?'s':''}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background: atrasado?'rgba(224,112,112,0.08)':'rgba(122,158,126,0.08)', borderRadius:10, padding:'10px 12px' }}>
                  <div>
                    <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>{atrasado?'Em atraso':'Proxima dose'}</div>
                    <div style={{ fontSize:14, fontWeight:700, color: atrasado?'var(--danger)':'var(--sage)', marginTop:2 }}>{proxima}</div>
                    {lastLog && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Ultima: {fmtDateTime(lastLog.tomado_em)}</div>}
                  </div>
                  <button onClick={() => abrirConfirmToma(t)} style={{ padding:'10px 14px', borderRadius:10, border:'none', background: atrasado?'var(--danger)':'var(--sage)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
                    Confirmar toma
                  </button>
                </div>
                {t.notas && <div style={{ fontSize:12, color:'var(--muted)', marginTop:8, fontStyle:'italic' }}>📝 {t.notas}</div>}
              </div>
            )
          })}
        </>
      )}

      {/* ── MODAL CONFIRMAR TOMA ── */}
      {confirmToma && (
        <div className="modal-overlay" onClick={() => setConfirmToma(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <div style={{ fontSize:48, marginBottom:8 }}>💊</div>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:20, fontWeight:400, marginBottom:4 }}>{confirmToma.medicamento}</h3>
              {confirmToma.dose && <div style={{ fontSize:15, color:'var(--earth)', fontWeight:600 }}>{confirmToma.dose} {confirmToma.unidade}</div>}
            </div>

            {/* Data/hora — permite registar toma passada */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4, fontWeight:600 }}>
                Quando tomou?
              </div>
              <input
                type="datetime-local"
                value={tomaDatetime}
                onChange={e => setTomaDatetime(e.target.value)}
                style={{ width:'100%' }}
              />
              <div style={{ display:'flex', gap:8, marginTop:6 }}>
                <button onClick={() => setTomaDatetime(toLocalDatetimeInput())} style={{ flex:1, padding:'7px', borderRadius:8, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--earth)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  Agora
                </button>
                <button onClick={() => {
                  const d = new Date(); d.setHours(d.getHours()-confirmToma.periodicidade_horas)
                  setTomaDatetime(toLocalDatetimeInput(d))
                }} style={{ flex:1, padding:'7px', borderRadius:8, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  -{confirmToma.periodicidade_horas}h
                </button>
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Notas (opcional)</div>
              <textarea value={tomaNotas} onChange={e => setTomaNotas(e.target.value)}
                placeholder="ex: tomou bem, vomitou parte..." style={{ minHeight:50 }} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmToma(null)} style={{ flex:1, padding:'14px', borderRadius:12, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--text)', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
              <button onClick={registarToma} style={{ flex:2, padding:'14px', borderRadius:12, border:'none', background:'var(--sage)', color:'white', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Confirmar toma</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ENCERRAR TRATAMENTO ── */}
      {deleteT && (
        <div className="modal-overlay" onClick={() => setDeleteT(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🏁</div>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:400, marginBottom:8 }}>Encerrar tratamento?</h3>
              <p style={{ fontSize:14, color:'var(--muted)' }}>O historico fica guardado mas os alertas param.</p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteT(null)} style={{ flex:1, padding:'13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--text)', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
              <button onClick={() => desactivarT(deleteT)} style={{ flex:1, padding:'13px', borderRadius:12, border:'none', background:'var(--danger)', color:'white', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Encerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
