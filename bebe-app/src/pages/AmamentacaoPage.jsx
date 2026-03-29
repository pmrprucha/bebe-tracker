import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { today } from '../lib/sleep'

const LADO_LABELS = { E: 'Esquerdo', D: 'Direito', A: 'Ambos', M: 'Mamadeira' }

function fmtSinceShort(secs) {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const h = Math.floor(m / 60)
  if (h === 0) return `${m}min`
  return `${h}h${m % 60 > 0 ? ` ${m % 60}min` : ''}`
}

function fmtSecs(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

function nowHHMM() {
  const d = new Date()
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function horaToMs(hora) {
  if (!hora) return null
  const [h, m] = hora.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

const TIMER_KEY = 'bebe_feed_timer'

export default function AmamentacaoPage() {
  const { activeChild, profile, session, showToast } = useApp()
  const [feeds, setFeeds]             = useState([])
  const [timerActive, setTimerActive] = useState(false)
  const [timerStartMs, setTimerStartMs] = useState(null) // timestamp absoluto em ms
  const [lado, setLado]               = useState(null)
  const [elapsed, setElapsed]         = useState(0) // segundos desde timerStartMs
  const [sinceSecs, setSinceSecs]     = useState(null)

  const intervalRef = useRef(null)
  const sinceRef    = useRef(null)

  // Edit state
  const [editId, setEditId]         = useState(null)
  const [editHora, setEditHora]     = useState('')
  const [editDurMin, setEditDurMin] = useState('')
  const [editDurSec, setEditDurSec] = useState('')
  const [editLado, setEditLado]     = useState(null)

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null)

  // ── Restaurar timer do localStorage ao montar ─────
  useEffect(() => {
    const saved = localStorage.getItem(TIMER_KEY)
    if (saved) {
      try {
        const { startMs, lado: savedLado } = JSON.parse(saved)
        setTimerStartMs(startMs)
        setLado(savedLado)
        setTimerActive(true)
      } catch (e) {
        localStorage.removeItem(TIMER_KEY)
      }
    }
  }, [])

  useEffect(() => { if (activeChild) loadFeeds() }, [activeChild])

  useEffect(() => () => {
    clearInterval(intervalRef.current)
    clearInterval(sinceRef.current)
  }, [])

  const loadFeeds = async () => {
    const { data } = await sb
      .from('feeds').select('*, profiles(name, id)')
      .eq('child_id', activeChild.id).eq('data_date', today())
      .order('created_at', { ascending: false })
    setFeeds(data || [])
  }

  // ── Timer ao vivo — calcula sempre a partir de Date.now() - startMs ──
  useEffect(() => {
    clearInterval(intervalRef.current)
    if (!timerActive || !timerStartMs) return
    const tick = () => setElapsed(Math.floor((Date.now() - timerStartMs) / 1000))
    tick()
    intervalRef.current = setInterval(tick, 500) // 500ms para precisão
    return () => clearInterval(intervalRef.current)
  }, [timerActive, timerStartMs])

  // ── Contador "desde a última" ──────────────────────
  useEffect(() => {
    clearInterval(sinceRef.current)
    if (!feeds.length || timerActive) { setSinceSecs(null); return }
    const ultima = feeds[0]
    const refMs = ultima.created_at
      ? new Date(ultima.created_at).getTime() + (ultima.duracao_seg || 0) * 1000
      : horaToMs(ultima.hora)
    if (!refMs) return
    const tick = () => setSinceSecs(Math.max(0, Math.floor((Date.now() - refMs) / 1000)))
    tick()
    sinceRef.current = setInterval(tick, 15000)
    return () => clearInterval(sinceRef.current)
  }, [feeds, timerActive])

  // ── Iniciar ────────────────────────────────────────
  const iniciar = (l) => {
    if (timerActive) return
    const startMs = Date.now()
    setLado(l); setTimerStartMs(startMs); setTimerActive(true); setElapsed(0); setSinceSecs(null)
    localStorage.setItem(TIMER_KEY, JSON.stringify({ startMs, lado: l }))
  }

  // ── Terminar ───────────────────────────────────────
  const terminar = async () => {
    if (!timerActive || !timerStartMs) return
    clearInterval(intervalRef.current)
    const duracao_seg = Math.floor((Date.now() - timerStartMs) / 1000)
    const startDate = new Date(timerStartMs)
    const hora = String(startDate.getHours()).padStart(2,'0') + ':' + String(startDate.getMinutes()).padStart(2,'0')

    const { error } = await sb.from('feeds').insert({
      child_id: activeChild.id, data_date: today(),
      hora, duracao_seg, lado, recorded_by: profile?.id
    })

    localStorage.removeItem(TIMER_KEY)
    setTimerActive(false); setTimerStartMs(null); setElapsed(0); setLado(null)

    if (!error) { showToast('Registado: ' + fmtSecs(duracao_seg)); loadFeeds() }
    else showToast('Erro ao guardar')
  }

  // ── Edit ───────────────────────────────────────────
  const openEdit = (f) => {
    setEditId(f.id); setEditHora(f.hora || '')
    setEditDurMin(String(Math.floor((f.duracao_seg || 0) / 60)))
    setEditDurSec(String((f.duracao_seg || 0) % 60))
    setEditLado(f.lado || null)
  }

  const saveEdit = async () => {
    const duracao_seg = (parseInt(editDurMin) || 0) * 60 + (parseInt(editDurSec) || 0)
    const { error } = await sb.from('feeds')
      .update({ hora: editHora, duracao_seg, lado: editLado }).eq('id', editId)
    if (!error) { showToast('Atualizado ✓'); setEditId(null); loadFeeds() }
    else showToast('Erro ao atualizar')
  }

  // ── Delete ─────────────────────────────────────────
  const confirmDelete = async () => {
    const { error } = await sb.from('feeds').delete().eq('id', deleteId)
    if (!error) { showToast('Apagado'); setDeleteId(null); loadFeeds() }
    else showToast('Erro ao apagar')
  }

  // ── Permissões — pode editar se foi quem registou OU é pai/mãe ──
  // Simplificado: qualquer utilizador autenticado pode editar/apagar
  const canEditFeed = () => !!session

  const totalHoje = feeds.reduce((a, f) => a + (f.duracao_seg || 0), 0)

  const sinceColor = sinceSecs == null ? 'rgba(255,255,255,0.6)'
    : sinceSecs < 7200  ? '#a8e6b4'
    : sinceSecs < 10800 ? '#f5d87a'
    : '#f5a0a0'

  // Hora de início formatada para mostrar no timer
  const timerInicioStr = timerStartMs
    ? (() => { const d = new Date(timerStartMs); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') })()
    : ''

  if (!activeChild) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">👶</div><p>Seleciona uma criança primeiro</p></div>
    </div>
  )

  return (
    <div className="page-content">

      {/* Card principal */}
      <div style={{
        background: 'linear-gradient(135deg, #8fb3c8, #7aa4b8)',
        borderRadius: 16, padding: 20, marginBottom: 12,
        color: 'white', textAlign: 'center',
        boxShadow: '0 4px 20px rgba(143,179,200,0.3)'
      }}>

        {sinceSecs !== null && !timerActive && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,0,0,0.18)', borderRadius: 20,
            padding: '5px 14px', marginBottom: 14,
            fontSize: 13, fontWeight: 600, color: sinceColor
          }}>
            🕐 Última há {fmtSinceShort(sinceSecs)}
          </div>
        )}

        {feeds.length === 0 && !timerActive && (
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>Sem registos hoje</div>
        )}

        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', opacity: 0.75 }}>
          {timerActive ? `A amamentar — ${LADO_LABELS[lado] || ''}` : 'Amamentação'}
        </div>

        {/* Cronómetro — calcula sempre de Date.now() */}
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 56, fontWeight: 300, letterSpacing: -2, lineHeight: 1, margin: '14px 0' }}>
          {fmtSecs(elapsed)}
        </div>

        {timerActive && timerInicioStr && (
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14 }}>
            Desde as {timerInicioStr}
          </div>
        )}

        {!timerActive ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => iniciar('E')} style={{
              flex: 1, background: 'rgba(255,255,255,0.95)', color: 'var(--sky)',
              border: 'none', borderRadius: 50, padding: '13px 8px',
              fontFamily: 'Instrument Sans, sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer'
            }}>◀ Esquerdo</button>
            <button onClick={() => iniciar('D')} style={{
              flex: 1, background: 'rgba(255,255,255,0.95)', color: 'var(--sky)',
              border: 'none', borderRadius: 50, padding: '13px 8px',
              fontFamily: 'Instrument Sans, sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer'
            }}>Direito ▶</button>
          </div>
        ) : (
          <button onClick={terminar} style={{
            width: '100%', background: 'rgba(255,255,255,0.15)', color: 'white',
            border: '2px solid rgba(255,255,255,0.4)', borderRadius: 50, padding: '13px',
            fontFamily: 'Instrument Sans, sans-serif', fontSize: 15, fontWeight: 600, cursor: 'pointer'
          }}>⏹ Terminar</button>
        )}
      </div>

      {/* Resumo */}
      {feeds.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 300, color: 'var(--earth)' }}>{feeds.length}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Registos hoje</div>
          </div>
          <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 300, color: 'var(--earth)' }}>{fmtSecs(totalHoje)}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total hoje</div>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="card">
        <div className="card-title">🤱 Amamentações de hoje</div>
        {feeds.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <div className="e-icon">🤱</div><p>Ainda sem registos hoje</p>
          </div>
        ) : feeds.map(f => (
          <div key={f.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
            {editId === f.id ? (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Hora</div>
                    <input type="time" value={editHora} onChange={e => setEditHora(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--warm)', fontFamily: 'monospace', fontSize: 15, color: 'var(--deep)', outline: 'none' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Min</div>
                    <input type="number" value={editDurMin} onChange={e => setEditDurMin(e.target.value)} min="0"
                      style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--warm)', fontSize: 15, color: 'var(--deep)', outline: 'none' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Seg</div>
                    <input type="number" value={editDurSec} onChange={e => setEditDurSec(e.target.value)} min="0" max="59"
                      style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--warm)', fontSize: 15, color: 'var(--deep)', outline: 'none' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {Object.entries(LADO_LABELS).map(([k, v]) => (
                    <button key={k} onClick={() => setEditLado(k)} style={{
                      flex: 1, padding: '7px 2px', borderRadius: 8, border: '1px solid',
                      borderColor: editLado === k ? 'var(--sky)' : 'var(--border)',
                      background: editLado === k ? 'var(--sky)' : 'var(--warm)',
                      color: editLado === k ? 'white' : 'var(--text)',
                      fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>{v}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditId(null)} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--warm)', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                  <button onClick={saveEdit} style={{ flex: 2, padding: '9px', borderRadius: 10, border: 'none', background: 'var(--earth)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Guardar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {f.hora} · <span style={{ fontFamily: 'monospace' }}>{fmtSecs(f.duracao_seg || 0)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {f.lado ? (LADO_LABELS[f.lado] || f.lado) : '–'}
                    {f.profiles?.name ? ' · ' + f.profiles.name : ''}
                  </div>
                </div>
                {canEditFeed() && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(f)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--warm)', color: 'var(--earth)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>✏️</button>
                    <button onClick={() => setDeleteId(f.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(192,97,78,0.3)', background: 'rgba(192,97,78,0.06)', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>🗑</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🗑️</div>
              <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 400, marginBottom: 8 }}>Apagar registo?</h3>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>Esta acção não pode ser desfeita.</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--warm)', color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', background: 'var(--danger)', color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
