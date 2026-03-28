import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { today, nowHHMM, fmtSecs } from '../lib/sleep'

const LADO_LABELS = { E: 'Esquerdo', D: 'Direito', A: 'Ambos', M: 'Mamadeira' }

export default function MamadasPage() {
  const { activeChild, profile, showToast } = useApp()
  const [feeds, setFeeds]         = useState([])
  const [timerActive, setTimerActive] = useState(false)
  const [timerStart, setTimerStart]   = useState(null)
  const [timerSecs, setTimerSecs]     = useState(0)
  const [lado, setLado]           = useState(null)
  const [mamaObs, setMamaObs]     = useState('')
  const timerRef = useRef(null)

  useEffect(() => { if (activeChild) loadFeeds() }, [activeChild])

  const loadFeeds = async () => {
    const { data } = await sb
      .from('feeds')
      .select('*, profiles(name)')
      .eq('child_id', activeChild.id)
      .eq('data_date', today())
      .order('created_at', { ascending: false })
    setFeeds(data || [])
  }

  const toggleTimer = async () => {
    if (timerActive) {
      // stop & save
      clearInterval(timerRef.current)
      const d = new Date(timerStart)
      const hora = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
      const { error } = await sb.from('feeds').insert({
        child_id: activeChild.id,
        data_date: today(),
        hora,
        duracao_seg: timerSecs,
        lado,
        obs: mamaObs,
        recorded_by: profile?.id
      })
      if (!error) { showToast('Mamada registada: ' + fmtSecs(timerSecs)); loadFeeds() }
      setTimerActive(false); setTimerStart(null); setTimerSecs(0); setLado(null); setMamaObs('')
    } else {
      setTimerActive(true); setTimerStart(Date.now()); setTimerSecs(0)
      timerRef.current = setInterval(() => {
        setTimerSecs(s => s + 1)
      }, 1000)
    }
  }

  const totalHoje = feeds.reduce((a, f) => a + (f.duracao_seg || 0), 0)

  if (!activeChild) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">👶</div><p>Seleciona uma criança primeiro</p></div>
    </div>
  )

  return (
    <div className="page-content">

      {/* Timer card */}
      <div style={{
        background: 'linear-gradient(135deg, #8fb3c8, #7aa4b8)',
        borderRadius: 16, padding: 20, marginBottom: 12,
        color: 'white', textAlign: 'center',
        boxShadow: '0 4px 20px rgba(143,179,200,0.3)'
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', opacity: 0.75 }}>
          {timerActive ? 'Mamada em curso' : 'Pronto para registar'}
        </div>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 56, fontWeight: 300, letterSpacing: -2, lineHeight: 1, margin: '12px 0' }}>
          {fmtSecs(timerSecs)}
        </div>
        {timerActive && timerStart && (
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            Desde as {String(new Date(timerStart).getHours()).padStart(2,'0')}:{String(new Date(timerStart).getMinutes()).padStart(2,'0')}
          </div>
        )}
        <button onClick={toggleTimer} style={{
          background: timerActive ? 'rgba(255,255,255,0.2)' : 'white',
          color: timerActive ? 'white' : 'var(--sky)',
          border: timerActive ? '2px solid rgba(255,255,255,0.4)' : 'none',
          borderRadius: 50, padding: '13px 32px', width: '100%',
          fontFamily: 'Instrument Sans, sans-serif', fontSize: 15, fontWeight: 600, cursor: 'pointer'
        }}>
          {timerActive ? '⏹ Terminar mamada' : '▶ Iniciar mamada'}
        </button>
      </div>

      {/* Detalhes (só quando timer ativo) */}
      {timerActive && (
        <div className="card">
          <div className="card-title">📝 Detalhes</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Lado</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {Object.entries(LADO_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => setLado(k)} style={{
                flex: 1, padding: '9px 4px', borderRadius: 9, border: '1px solid',
                borderColor: lado === k ? 'var(--sky)' : 'var(--border)',
                background: lado === k ? 'var(--sky)' : 'var(--warm)',
                color: lado === k ? 'white' : 'var(--text)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
              }}>{v}</button>
            ))}
          </div>
          <textarea value={mamaObs} onChange={e => setMamaObs(e.target.value)}
            placeholder="notas…" style={{ minHeight: 50 }} />
        </div>
      )}

      {/* Resumo do dia */}
      {feeds.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 300, color: 'var(--earth)' }}>{feeds.length}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mamadas</div>
          </div>
          <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 300, color: 'var(--earth)' }}>{fmtSecs(totalHoje)}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total hoje</div>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="card">
        <div className="card-title">🍼 Mamadas de hoje</div>
        {feeds.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <div className="e-icon">🍼</div><p>Ainda sem mamadas hoje</p>
          </div>
        ) : feeds.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {f.hora} · <span style={{ fontFamily: 'monospace' }}>{fmtSecs(f.duracao_seg || 0)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {f.lado ? (LADO_LABELS[f.lado] || f.lado) : '–'}
                {f.obs ? ' · ' + f.obs : ''}
                {f.profiles?.name ? ' · ' + f.profiles.name : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
