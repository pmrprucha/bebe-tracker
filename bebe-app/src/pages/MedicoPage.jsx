import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { today, nowHHMM } from '../lib/sleep'

const TIPOS = [
  { value: 'sintoma',      label: 'Sintoma',      icon: '🤒', color: '#c06050' },
  { value: 'medicamento',  label: 'Medicamento',  icon: '💊', color: '#8b6f47' },
  { value: 'consulta',     label: 'Consulta',     icon: '👨‍⚕️', color: '#7a9e7e' },
  { value: 'vacina',       label: 'Vacina',       icon: '💉', color: '#8fb3c8' },
  { value: 'outro',        label: 'Outro',        icon: '📋', color: '#9b7d5e' },
]

const SINTOMAS_RAPIDOS = ['Febre', 'Tosse', 'Constipação', 'Dor barriga', 'Diarreia', 'Vómito', 'Otite', 'Irritabilidade', 'Erupção cutânea']

export default function MedicoPage() {
  const { activeChild, profile, showToast, canViewHistory } = useApp()
  const [records, setRecords]   = useState([])
  const [showForm, setShowForm] = useState(false)
  const [tipo, setTipo]         = useState('sintoma')
  const [titulo, setTitulo]     = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor]       = useState('')
  const [hora, setHora]         = useState(nowHHMM())
  const [dataReg, setDataReg]   = useState(today())
  const [saving, setSaving]     = useState(false)
  const [filterTipo, setFilterTipo] = useState('all')

  useEffect(() => { if (activeChild) loadRecords() }, [activeChild, filterTipo])

  const loadRecords = async () => {
    let q = sb.from('medical_records')
      .select('*, profiles(name)')
      .eq('child_id', activeChild.id)
      .order('data_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filterTipo !== 'all') q = q.eq('tipo', filterTipo)
    const { data } = await q
    setRecords(data || [])
  }

  const guardar = async () => {
    if (!titulo) { showToast('Indica o título'); return }
    setSaving(true)
    const { error } = await sb.from('medical_records').insert({
      child_id: activeChild.id,
      data_date: dataReg,
      hora,
      tipo,
      titulo,
      descricao,
      valor,
      recorded_by: profile?.id
    })
    setSaving(false)
    if (error) { showToast('Erro ao guardar'); return }
    showToast('Registo guardado ✓')
    setShowForm(false)
    setTitulo(''); setDescricao(''); setValor(''); setHora(nowHHMM()); setDataReg(today())
    loadRecords()
  }

  const tipoInfo = (t) => TIPOS.find(x => x.value === t) || TIPOS[4]

  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const fmtDate = d => {
    const dt = new Date(d + 'T12:00')
    return days[dt.getDay()] + ', ' + d.split('-').reverse().join('/')
  }

  if (!activeChild) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">👶</div><p>Seleciona uma criança primeiro</p></div>
    </div>
  )

  return (
    <div className="page-content">

      {/* Header action */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ flex: 1 }}>
          + Novo registo
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
        <button onClick={() => setFilterTipo('all')} style={{
          padding: '6px 12px', borderRadius: 20, border: '1px solid',
          borderColor: filterTipo === 'all' ? 'var(--earth)' : 'var(--border)',
          background: filterTipo === 'all' ? 'rgba(139,111,71,0.1)' : 'var(--warm)',
          color: filterTipo === 'all' ? 'var(--earth)' : 'var(--muted)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
        }}>Todos</button>
        {TIPOS.map(t => (
          <button key={t.value} onClick={() => setFilterTipo(t.value)} style={{
            padding: '6px 12px', borderRadius: 20, border: '1px solid',
            borderColor: filterTipo === t.value ? t.color : 'var(--border)',
            background: filterTipo === t.value ? t.color + '18' : 'var(--warm)',
            color: filterTipo === t.value ? t.color : 'var(--muted)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Records list */}
      {records.length === 0 ? (
        <div className="empty-state"><div className="e-icon">📋</div><p>Ainda sem registos médicos</p></div>
      ) : records.map(r => {
        const ti = tipoInfo(r.tipo)
        return (
          <div key={r.id} className="card" style={{ padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: ti.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {ti.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--deep)' }}>{r.titulo}</span>
                  {r.valor && <span style={{ fontSize: 12, fontFamily: 'monospace', color: ti.color, fontWeight: 600 }}>{r.valor}</span>}
                </div>
                {r.descricao && <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, marginBottom: 6 }}>{r.descricao}</p>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(r.data_date)}{r.hora ? ' · ' + r.hora : ''}</span>
                  {r.profiles?.name && <span style={{ fontSize: 11, color: 'var(--earth)', fontWeight: 600 }}>por {r.profiles.name}</span>}
                  <span className="badge" style={{ borderColor: ti.color + '40', color: ti.color, background: ti.color + '12' }}>{ti.label}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Form modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal-sheet">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 400 }}>Novo registo médico</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Tipo */}
            <div className="section-label">Tipo</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {TIPOS.map(t => (
                <button key={t.value} onClick={() => setTipo(t.value)} style={{
                  padding: '8px 12px', borderRadius: 10, border: '1px solid',
                  borderColor: tipo === t.value ? t.color : 'var(--border)',
                  background: tipo === t.value ? t.color + '18' : 'var(--warm)',
                  color: tipo === t.value ? t.color : 'var(--text)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                }}>{t.icon} {t.label}</button>
              ))}
            </div>

            {/* Sintomas rápidos */}
            {tipo === 'sintoma' && (
              <div style={{ marginBottom: 12 }}>
                <div className="section-label">Sintomas rápidos</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SINTOMAS_RAPIDOS.map(s => (
                    <button key={s} onClick={() => setTitulo(s)} style={{
                      padding: '6px 10px', borderRadius: 20, border: '1px solid',
                      borderColor: titulo === s ? 'var(--blush)' : 'var(--border)',
                      background: titulo === s ? 'rgba(232,165,152,0.15)' : 'var(--warm)',
                      color: titulo === s ? 'var(--danger)' : 'var(--text)',
                      fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <div className="section-label">Título *</div>
              <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder={tipo === 'sintoma' ? 'ex: Febre' : tipo === 'medicamento' ? 'ex: Paracetamol' : 'Título…'} />
            </div>

            {/* Valor (febre, dosagem) */}
            <div style={{ marginBottom: 10 }}>
              <div className="section-label">{tipo === 'sintoma' ? 'Valor (ex: 38.5°C)' : tipo === 'medicamento' ? 'Dosagem' : 'Valor'}</div>
              <input type="text" value={valor} onChange={e => setValor(e.target.value)} placeholder="opcional" />
            </div>

            <div style={{ marginBottom: 10 }}>
              <div className="section-label">Descrição</div>
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="detalhes adicionais…" />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div className="section-label">Data</div>
                <input type="date" value={dataReg} onChange={e => setDataReg(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="section-label">Hora</div>
                <input type="time" value={hora} onChange={e => setHora(e.target.value)} />
              </div>
            </div>

            <button className="btn btn-primary" onClick={guardar} disabled={saving}>
              {saving ? '…' : '💾 Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
