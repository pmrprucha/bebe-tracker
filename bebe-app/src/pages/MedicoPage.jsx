import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

const UNIDADES = ['ml', 'mg', 'comprimido', 'gota', 'capsula', 'supositorio', 'aplicacao']
const PERIODICIDADES = [
  { label: 'A cada 4h',  horas: 4 },
  { label: 'A cada 6h',  horas: 6 },
  { label: 'A cada 8h',  horas: 8 },
  { label: 'A cada 12h', horas: 12 },
  { label: '1x por dia', horas: 24 },
  { label: '2x por dia', horas: 12 },
  { label: '3x por dia', horas: 8 },
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
    const atrasadoMin = Math.floor(-diff / 60000)
    if (atrasadoMin < 60) return `Atrasado ${atrasadoMin}min`
    return `Atrasado ${Math.floor(atrasadoMin/60)}h${atrasadoMin%60>0?' '+atrasadoMin%60+'min':''}`
  }
  const diffMin = Math.floor(diff / 60000)
  if (diffMin < 60) return `Em ${diffMin}min`
  const h = Math.floor(diffMin/60), m = diffMin%60
  return `Em ${h}h${m>0?' '+m+'min':''}`
}

function isAtrasado(lastTs, periodoH) {
  if (!lastTs) return true // nunca tomou = em atraso
  const next = new Date(lastTs).getTime() + periodoH * 3600000
  return Date.now() > next
}

export default function MedicoPage() {
  const { activeChild, profile, session, showToast } = useApp()
  const [tab, setTab] = useState('tratamentos') // tratamentos | historico
  const [treatments, setTreatments] = useState([])
  const [logs, setLogs] = useState({}) // { treatment_id: [logs] }
  const [loading, setLoading] = useState(true)

  // Form novo tratamento
  const [showForm, setShowForm] = useState(false)
  const [editTreatment, setEditTreatment] = useState(null)
  const [formMed, setFormMed] = useState('')
  const [formDose, setFormDose] = useState('')
  const [formUnidade, setFormUnidade] = useState('ml')
  const [formPeriodo, setFormPeriodo] = useState(8)
  const [formPeriodoCustom, setFormPeriodoCustom] = useState('')
  const [formIsCustom, setFormIsCustom] = useState(false)
  const [formInicio, setFormInicio] = useState(new Date().toISOString().slice(0,10))
  const [formFim, setFormFim] = useState('')
  const [formNotas, setFormNotas] = useState('')
  const [saving, setSaving] = useState(false)

  // Confirmar toma
  const [confirmToma, setConfirmToma] = useState(null) // treatment object
  const [tomaNotas, setTomaNotas] = useState('')

  // Delete
  const [deleteId, setDeleteId] = useState(null)

  // Ticker para atualizar countdowns
  const [tick, setTick] = useState(0)
  const tickRef = useRef(null)

  useEffect(() => {
    tickRef.current = setInterval(() => setTick(t => t+1), 30000)
    return () => clearInterval(tickRef.current)
  }, [])

  useEffect(() => { if (activeChild) loadAll() }, [activeChild])

  const loadAll = async () => {
    setLoading(true)
    const { data: treats } = await sb
      .from('treatments')
      .select('*')
      .eq('child_id', activeChild.id)
      .eq('ativo', true)
      .order('created_at', { ascending: false })

    setTreatments(treats || [])

    // Para cada tratamento, buscar o ultimo log
    if (treats?.length) {
      const { data: allLogs } = await sb
        .from('treatment_logs')
        .select('*, profiles(name)')
        .in('treatment_id', treats.map(t => t.id))
        .order('tomado_em', { ascending: false })

      const byTreatment = {}
      for (const log of (allLogs || [])) {
        if (!byTreatment[log.treatment_id]) byTreatment[log.treatment_id] = []
        byTreatment[log.treatment_id].push(log)
      }
      setLogs(byTreatment)
    }
    setLoading(false)
  }

  // ── Abrir form ─────────────────────────────────────
  const openForm = (treatment = null) => {
    if (treatment) {
      setEditTreatment(treatment)
      setFormMed(treatment.medicamento)
      setFormDose(treatment.dose || '')
      setFormUnidade(treatment.unidade || 'ml')
      const pMatch = PERIODICIDADES.find(p => p.horas === treatment.periodicidade_horas)
      if (pMatch && pMatch.horas !== null) {
        setFormPeriodo(treatment.periodicidade_horas); setFormIsCustom(false)
      } else {
        setFormIsCustom(true); setFormPeriodoCustom(String(treatment.periodicidade_horas))
      }
      setFormInicio(treatment.data_inicio || '')
      setFormFim(treatment.data_fim || '')
      setFormNotas(treatment.notas || '')
    } else {
      setEditTreatment(null)
      setFormMed(''); setFormDose(''); setFormUnidade('ml')
      setFormPeriodo(8); setFormIsCustom(false); setFormPeriodoCustom('')
      setFormInicio(new Date().toISOString().slice(0,10)); setFormFim(''); setFormNotas('')
    }
    setShowForm(true)
  }

  // ── Guardar tratamento ─────────────────────────────
  const guardar = async () => {
    if (!formMed.trim()) { showToast('Indica o medicamento'); return }
    setSaving(true)
    const periodo = formIsCustom ? parseFloat(formPeriodoCustom) : formPeriodo
    const payload = {
      child_id: activeChild.id,
      medicamento: formMed.trim(),
      dose: formDose.trim() || null,
      unidade: formUnidade,
      periodicidade_horas: periodo,
      data_inicio: formInicio,
      data_fim: formFim || null,
      notas: formNotas.trim() || null,
      ativo: true,
    }

    let error
    if (editTreatment) {
      const res = await sb.from('treatments').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editTreatment.id)
      error = res.error
    } else {
      const res = await sb.from('treatments').insert({ ...payload, created_by: profile?.id })
      error = res.error
    }

    setSaving(false)
    if (!error) {
      showToast(editTreatment ? 'Atualizado' : 'Tratamento criado')
      setShowForm(false); loadAll()
    } else showToast('Erro ao guardar')
  }

  // ── Registar toma ──────────────────────────────────
  const registarToma = async () => {
    if (!confirmToma) return
    const { error } = await sb.from('treatment_logs').insert({
      treatment_id: confirmToma.id,
      child_id: activeChild.id,
      tomado_em: new Date().toISOString(),
      registered_by: profile?.id,
      notas: tomaNotas.trim() || null
    })
    if (!error) {
      showToast(confirmToma.medicamento + ' — toma registada')
      setConfirmToma(null); setTomaNotas(''); loadAll()
    } else showToast('Erro ao registar')
  }

  // ── Desactivar tratamento ──────────────────────────
  const desactivar = async (id) => {
    await sb.from('treatments').update({ ativo: false }).eq('id', id)
    showToast('Tratamento encerrado'); setDeleteId(null); loadAll()
  }

  if (!activeChild) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">🩺</div><p>Seleciona uma criança primeiro</p></div>
    </div>
  )

  const atrasados = treatments.filter(t => isAtrasado(logs[t.id]?.[0]?.tomado_em, t.periodicidade_horas))

  return (
    <div className="page-content">

      {/* ── ALERTAS EM ATRASO ── */}
      {atrasados.length > 0 && (
        <div style={{
          background: 'rgba(224,112,112,0.1)',
          border: '2px solid rgba(224,112,112,0.4)',
          borderRadius: 14, padding: '14px 16px', marginBottom: 14,
          animation: 'alertPulse 2s ease-in-out infinite'
        }}>
          <style>{`@keyframes alertPulse { 0%,100%{border-color:rgba(224,112,112,0.4)} 50%{border-color:rgba(224,112,112,0.9)} }`}</style>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: atrasados.length > 0 ? 10 : 0 }}>
            <span style={{ fontSize:24 }}>💊</span>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--danger)' }}>
                {atrasados.length === 1 ? '1 medicamento em atraso' : `${atrasados.length} medicamentos em atraso`}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Toca em "Confirmar toma" abaixo</div>
            </div>
          </div>
          {atrasados.map(t => (
            <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(255,255,255,0.6)', borderRadius:10, padding:'10px 12px', marginBottom:6 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--deep)' }}>{t.medicamento}</div>
                <div style={{ fontSize:12, color:'var(--danger)', fontWeight:600 }}>
                  {fmtProxima(logs[t.id]?.[0]?.tomado_em, t.periodicidade_horas)}
                </div>
              </div>
              <button onClick={() => { setConfirmToma(t); setTomaNotas('') }} style={{
                padding:'9px 16px', borderRadius:10, border:'none',
                background:'var(--danger)', color:'white',
                fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit'
              }}>
                Confirmar toma
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── TABS ── */}
      <div style={{ display:'flex', background:'var(--warm)', borderRadius:12, padding:4, marginBottom:14 }}>
        {[['tratamentos','Tratamentos'],['historico','Historico']].map(([k,l]) => (
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

      {/* ── TRATAMENTOS ── */}
      {tab === 'tratamentos' && (
        <>
          {!showForm && (
            <button onClick={() => openForm()} style={{
              width:'100%', padding:'13px', borderRadius:12, border:'1px dashed var(--bark)',
              background:'var(--warm)', color:'var(--earth)', fontSize:14, fontWeight:600,
              cursor:'pointer', fontFamily:'inherit', marginBottom:14
            }}>+ Novo tratamento</button>
          )}

          {/* Form */}
          {showForm && (
            <div className="card" style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div className="card-title" style={{ marginBottom:0 }}>
                  {editTreatment ? 'Editar tratamento' : 'Novo tratamento'}
                </div>
                <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer' }}>✕</button>
              </div>

              <div style={{ marginBottom:12 }}>
                <div className="section-label">Medicamento *</div>
                <input type="text" value={formMed} onChange={e => setFormMed(e.target.value)}
                  placeholder="ex: Brufen, Benesin, Amoxicilina..." />
              </div>

              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div className="section-label">Dose</div>
                  <input type="text" value={formDose} onChange={e => setFormDose(e.target.value)} placeholder="ex: 5" />
                </div>
                <div style={{ flex:1 }}>
                  <div className="section-label">Unidade</div>
                  <select value={formUnidade} onChange={e => setFormUnidade(e.target.value)}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom:12 }}>
                <div className="section-label">Periodicidade</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom: formIsCustom ? 8 : 0 }}>
                  {PERIODICIDADES.map(p => (
                    <button key={p.label} onClick={() => {
                      if (p.horas === null) { setFormIsCustom(true) }
                      else { setFormIsCustom(false); setFormPeriodo(p.horas) }
                    }} style={{
                      padding:'7px 12px', borderRadius:8, border:'1px solid',
                      borderColor: (!formIsCustom && formPeriodo === p.horas) || (formIsCustom && p.horas === null) ? 'var(--earth)' : 'var(--border)',
                      background: (!formIsCustom && formPeriodo === p.horas) || (formIsCustom && p.horas === null) ? 'rgba(139,111,71,0.1)' : 'var(--warm)',
                      color: (!formIsCustom && formPeriodo === p.horas) || (formIsCustom && p.horas === null) ? 'var(--earth)' : 'var(--muted)',
                      fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit'
                    }}>{p.label}</button>
                  ))}
                </div>
                {formIsCustom && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                    <input type="number" value={formPeriodoCustom} onChange={e => setFormPeriodoCustom(e.target.value)}
                      placeholder="ex: 6" min="0.5" step="0.5" style={{ width:100 }} />
                    <span style={{ fontSize:13, color:'var(--muted)' }}>horas</span>
                  </div>
                )}
              </div>

              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div className="section-label">Inicio</div>
                  <input type="date" value={formInicio} onChange={e => setFormInicio(e.target.value)} />
                </div>
                <div style={{ flex:1 }}>
                  <div className="section-label">Fim (opcional)</div>
                  <input type="date" value={formFim} onChange={e => setFormFim(e.target.value)} />
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div className="section-label">Notas</div>
                <textarea value={formNotas} onChange={e => setFormNotas(e.target.value)}
                  placeholder="instrucoes, cuidados..." style={{ minHeight:60 }} />
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setShowForm(false)} className="btn btn-secondary" style={{ flex:1 }}>Cancelar</button>
                <button onClick={guardar} disabled={saving} style={{
                  flex:2, padding:'13px', borderRadius:12, border:'none',
                  background:'var(--earth)', color:'white', fontSize:15, fontWeight:600,
                  cursor:'pointer', fontFamily:'inherit', opacity: saving ? 0.6 : 1
                }}>{saving ? '...' : (editTreatment ? 'Guardar' : 'Criar tratamento')}</button>
              </div>
            </div>
          )}

          {/* Lista de tratamentos */}
          {loading ? (
            <div className="empty-state"><div className="e-icon">⏳</div><p>A carregar...</p></div>
          ) : treatments.length === 0 ? (
            <div className="empty-state"><div className="e-icon">💊</div><p>Sem tratamentos activos</p></div>
          ) : treatments.map(t => {
            const lastLog = logs[t.id]?.[0]
            const atrasado = isAtrasado(lastLog?.tomado_em, t.periodicidade_horas)
            const proxima = fmtProxima(lastLog?.tomado_em, t.periodicidade_horas)
            const totalTomas = logs[t.id]?.length || 0

            return (
              <div key={t.id} style={{
                background: atrasado ? 'rgba(224,112,112,0.05)' : 'var(--surface)',
                border: `1px solid ${atrasado ? 'rgba(224,112,112,0.3)' : 'var(--border)'}`,
                borderRadius:14, padding:'14px 16px', marginBottom:10
              }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:22 }}>💊</span>
                      <div>
                        <div style={{ fontSize:16, fontWeight:700, color:'var(--deep)' }}>{t.medicamento}</div>
                        {t.dose && <div style={{ fontSize:13, color:'var(--muted)' }}>{t.dose} {t.unidade}</div>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => openForm(t)} style={{
                      padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)',
                      background:'var(--warm)', color:'var(--earth)', fontSize:12, cursor:'pointer', fontFamily:'inherit'
                    }}>✏️</button>
                    <button onClick={() => setDeleteId(t.id)} style={{
                      padding:'6px 10px', borderRadius:8, border:'1px solid rgba(192,97,78,0.3)',
                      background:'rgba(192,97,78,0.06)', color:'var(--danger)', fontSize:12, cursor:'pointer', fontFamily:'inherit'
                    }}>✕</button>
                  </div>
                </div>

                {/* Info periodicidade */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                  <span style={{ fontSize:12, background:'var(--warm)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', color:'var(--earth)' }}>
                    A cada {t.periodicidade_horas}h
                  </span>
                  {t.data_fim && <span style={{ fontSize:12, background:'var(--warm)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', color:'var(--muted)' }}>
                    ate {t.data_fim.split('-').reverse().join('/')}
                  </span>}
                  <span style={{ fontSize:12, background:'var(--warm)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', color:'var(--muted)' }}>
                    {totalTomas} toma{totalTomas !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Proxima dose */}
                <div style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  background: atrasado ? 'rgba(224,112,112,0.08)' : 'rgba(122,158,126,0.08)',
                  borderRadius:10, padding:'10px 12px'
                }}>
                  <div>
                    <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                      {atrasado ? 'Em atraso' : 'Proxima dose'}
                    </div>
                    <div style={{ fontSize:14, fontWeight:700, color: atrasado ? 'var(--danger)' : 'var(--sage)', marginTop:2 }}>
                      {proxima}
                    </div>
                    {lastLog && (
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                        Ultima: {fmtDateTime(lastLog.tomado_em)}
                        {lastLog.profiles?.name ? ' · ' + lastLog.profiles.name : ''}
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setConfirmToma(t); setTomaNotas('') }} style={{
                    padding:'10px 14px', borderRadius:10, border:'none',
                    background: atrasado ? 'var(--danger)' : 'var(--sage)',
                    color:'white', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                    flexShrink:0
                  }}>
                    Confirmar toma
                  </button>
                </div>

                {t.notas && (
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:8, fontStyle:'italic' }}>📝 {t.notas}</div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* ── HISTORICO ── */}
      {tab === 'historico' && (
        <div className="card">
          <div className="card-title">Historico de tomas</div>
          {treatments.length === 0 ? (
            <div className="empty-state" style={{ padding:'20px 0' }}>
              <div className="e-icon">📋</div><p>Sem tratamentos registados</p>
            </div>
          ) : treatments.map(t => {
            const tLogs = logs[t.id] || []
            if (!tLogs.length) return null
            return (
              <div key={t.id} style={{ marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--earth)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                  <span>💊</span> {t.medicamento} {t.dose ? `${t.dose}${t.unidade}` : ''}
                </div>
                {tLogs.slice(0,10).map(log => (
                  <div key={log.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontFamily:'monospace', fontSize:13, fontWeight:600, color:'var(--sky)', minWidth:80 }}>
                      {String(new Date(log.tomado_em).getHours()).padStart(2,'0')}:{String(new Date(log.tomado_em).getMinutes()).padStart(2,'0')}
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>
                      {new Date(log.tomado_em).getDate()}/{new Date(log.tomado_em).getMonth()+1}
                    </div>
                    {log.profiles?.name && (
                      <div style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>{log.profiles.name}</div>
                    )}
                    {log.notas && <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic' }}>{log.notas}</div>}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL CONFIRMAR TOMA ── */}
      {confirmToma && (
        <div className="modal-overlay" onClick={() => setConfirmToma(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:48, marginBottom:10 }}>💊</div>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:20, fontWeight:400, marginBottom:6 }}>
                {confirmToma.medicamento}
              </h3>
              {confirmToma.dose && (
                <div style={{ fontSize:16, color:'var(--earth)', fontWeight:600, marginBottom:8 }}>
                  {confirmToma.dose} {confirmToma.unidade}
                </div>
              )}
              <p style={{ fontSize:14, color:'var(--muted)' }}>Confirma que {activeChild.name} tomou agora?</p>
            </div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Notas (opcional)</div>
              <textarea value={tomaNotas} onChange={e => setTomaNotas(e.target.value)}
                placeholder="ex: tomou sem problemas, vomitou parte..."
                style={{ minHeight:60 }} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmToma(null)} style={{
                flex:1, padding:'14px', borderRadius:12, border:'1px solid var(--border)',
                background:'var(--warm)', color:'var(--text)', fontSize:15, fontWeight:600,
                cursor:'pointer', fontFamily:'inherit'
              }}>Cancelar</button>
              <button onClick={registarToma} style={{
                flex:2, padding:'14px', borderRadius:12, border:'none',
                background:'var(--sage)', color:'white', fontSize:15, fontWeight:700,
                cursor:'pointer', fontFamily:'inherit'
              }}>Confirmar toma</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ENCERRAR TRATAMENTO ── */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🏁</div>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:400, marginBottom:8 }}>Encerrar tratamento?</h3>
              <p style={{ fontSize:14, color:'var(--muted)' }}>O historico fica guardado mas os alertas param.</p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex:1, padding:'13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--text)', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
              <button onClick={() => desactivar(deleteId)} style={{ flex:1, padding:'13px', borderRadius:12, border:'none', background:'var(--danger)', color:'white', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Encerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
