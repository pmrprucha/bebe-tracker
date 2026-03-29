import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import {
  getPlanoByWeeks, getWeeks, calcSestas,
  fromMins, toMins, formatDur, today, nowHHMM, fmtSecs
} from '../lib/sleep'

function fmtSinceShort(secs) {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const h = Math.floor(m / 60)
  if (h === 0) return `${m}min`
  return `${h}h ${m % 60 > 0 ? m % 60 + 'min' : ''}`
}

function horaToMs(hora) {
  if (!hora) return null
  const [h, m] = hora.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export default function SonoPage() {
  const { activeChild, profile, showToast, setSyncState } = useApp()
  const [acordou, setAcordou]     = useState('')
  const [planoSel, setPlanoSel]   = useState('auto')
  const [realTimes, setRealTimes] = useState({ s1_ini:'', s1_fim:'', s2_ini:'', s2_fim:'', s3_ini:'', s3_fim:'' })
  const [dormiu, setDormiu]       = useState('')
  const [obs, setObs]             = useState('')
  const [activeTimer, setActiveTimer] = useState(null)
  const [timerDisplay, setTimerDisplay] = useState('00:00')
  const [awakeSecs, setAwakeSecs] = useState(null) // contador acordado ao vivo
  const [saving, setSaving]       = useState(false)
  const timerRef  = useRef(null)
  const awakeRef  = useRef(null)

  const child     = activeChild
  const semanas   = child ? getWeeks(child.birthdate) : 0
  const planoAuto = getPlanoByWeeks(semanas)
  const numSestas = planoSel === 'auto' ? planoAuto.sestas : parseInt(planoSel)
  const calc      = acordou ? calcSestas(toMins(acordou), { ...planoAuto, sestas: numSestas }, realTimes) : null

  useEffect(() => { if (child) loadToday() }, [child])
  useEffect(() => () => { clearInterval(timerRef.current); clearInterval(awakeRef.current) }, [])

  const loadToday = async () => {
    const { data } = await sb.from('sleep_events').select('*')
      .eq('child_id', child.id).eq('data_date', today()).single()
    if (data?.payload) {
      const p = data.payload
      setAcordou(p.acordou || '')
      setPlanoSel(p.plano || 'auto')
      setRealTimes({ s1_ini: p.s1_ini||'', s1_fim: p.s1_fim||'', s2_ini: p.s2_ini||'', s2_fim: p.s2_fim||'', s3_ini: p.s3_ini||'', s3_fim: p.s3_fim||'' })
      setDormiu(p.dormiu || '')
      setObs(p.obs || '')
    }
  }

  // ── Contador "acordado desde" ──────────────────────
  // Calcula o último momento em que o bebé acordou (fim da última sesta, ou hora de acordar de manhã)
  useEffect(() => {
    clearInterval(awakeRef.current)

    // Determinar referência: fim da última sesta concluída, ou hora de acordar se sem sestas
    const ultimoFim = (() => {
      for (const n of [3, 2, 1]) {
        const fim = realTimes[`s${n}_fim`]
        if (fim) return horaToMs(fim)
      }
      return null
    })()

    // Se está numa sesta agora, não mostra acordado
    const sestaAtiva = activeTimer !== null
    const emSesta = [1,2,3].some(n => realTimes[`s${n}_ini`] && !realTimes[`s${n}_fim`])

    if (sestaAtiva || emSesta) { setAwakeSecs(null); return }

    const refMs = ultimoFim || horaToMs(acordou)
    if (!refMs) { setAwakeSecs(null); return }

    const tick = () => setAwakeSecs(Math.max(0, Math.floor((Date.now() - refMs) / 1000)))
    tick()
    awakeRef.current = setInterval(tick, 10000)
    return () => clearInterval(awakeRef.current)
  }, [acordou, realTimes, activeTimer])

  // ── Sesta timer ────────────────────────────────────
  const stopSestaTimer = () => {
    if (!activeTimer) return
    const { sesta } = activeTimer
    setRealTimes(prev => ({ ...prev, [`s${sesta}_fim`]: nowHHMM() }))
    clearInterval(timerRef.current)
    setActiveTimer(null)
  }

  useEffect(() => {
    if (!activeTimer) return
    const iv = setInterval(() => {
      setTimerDisplay(fmtSecs(Math.floor((Date.now() - activeTimer.start) / 1000)))
    }, 1000)
    return () => clearInterval(iv)
  }, [activeTimer])

  // ── Save ───────────────────────────────────────────
  const guardar = async () => {
    if (!child || !acordou) { showToast('Preenche a hora de acordar'); return }
    setSaving(true); setSyncState('syncing')
    const payload = {
      acordou, plano: planoSel, dormiu, obs, ...realTimes,
      alvo1: calc?.sestas[0] ? fromMins(calc.sestas[0].alvo) : '',
      alvo2: calc?.sestas[1] ? fromMins(calc.sestas[1].alvo) : '',
      alvo3: calc?.sestas[2] ? fromMins(calc.sestas[2].alvo) : '',
      deitar: calc?.deitar ? fromMins(calc.deitar) : '',
      alertas: calc?.alertas || [],
    }
    const { error } = await sb.from('sleep_events').upsert({
      child_id: child.id, data_date: today(),
      payload, recorded_by: profile?.id, updated_at: new Date().toISOString()
    }, { onConflict: 'child_id,data_date' })
    setSaving(false)
    if (error) { setSyncState('err'); showToast('Erro ao guardar'); return }
    setSyncState('ok'); showToast('Sono guardado ✓')
  }

  const setRT = (key, val) => setRealTimes(prev => ({ ...prev, [key]: val }))

  // Cor do contador acordado: verde < 2h, amarelo 2-3h, vermelho > 3h
  const awakeColor = awakeSecs == null ? null
    : awakeSecs < 7200  ? { bg: 'rgba(168,197,171,0.15)', border: 'rgba(122,158,126,0.3)', text: 'var(--sage)' }
    : awakeSecs < 10800 ? { bg: 'rgba(245,216,122,0.15)', border: 'rgba(196,162,64,0.35)', text: 'var(--warn)' }
    : { bg: 'rgba(232,165,152,0.15)', border: 'rgba(232,165,152,0.4)', text: 'var(--danger)' }

  if (!child) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">👶</div><p>Adiciona uma criança para começar</p></div>
    </div>
  )

  return (
    <div className="page-content">

      {/* Contador acordado */}
      {awakeSecs !== null && awakeColor && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
          background: awakeColor.bg, border: `1px solid ${awakeColor.border}`,
          borderRadius: 12, padding: '12px 16px', marginBottom: 12
        }}>
          <span style={{ fontSize: 20 }}>☀️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: awakeColor.text }}>
              Acordado há {fmtSinceShort(awakeSecs)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {awakeSecs < 7200 ? 'Dentro da janela normal' : awakeSecs < 10800 ? 'A aproximar do limite de sesta' : 'Pode estar com sono — hora de sesta!'}
            </div>
          </div>
        </div>
      )}

      {/* Plano evolutivo */}
      <div className="alert alert-info" style={{ marginBottom: 12 }}>
        🌱 <span><strong>{planoAuto.label}</strong> — {planoAuto.desc}</span>
      </div>

      {/* Dados do dia */}
      <div className="card">
        <div className="card-title">📅 Hoje</div>
        <div className="field-row">
          <div className="field-label">Acordou</div>
          <input type="time" value={acordou} onChange={e => setAcordou(e.target.value)}
            style={{ width: 'auto', minWidth: 110 }} />
        </div>
        <div className="field-row">
          <div className="field-label">Plano</div>
          <select value={planoSel} onChange={e => setPlanoSel(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
            <option value="auto">Auto ({planoAuto.sestas} sestas)</option>
            <option value="3">3 sestas</option>
            <option value="2">2 sestas</option>
            <option value="1">1 sesta</option>
          </select>
        </div>
      </div>

      {/* Alertas */}
      {calc?.alertas?.map((a, i) => (
        <div key={i} className="alert alert-warn">⚠️ {a}</div>
      ))}

      {/* Sestas */}
      {Array.from({ length: numSestas }, (_, idx) => {
        const n = idx + 1
        const s = calc?.sestas[idx]
        const ini = realTimes[`s${n}_ini`]
        const fim = realTimes[`s${n}_fim`]
        const isTimerActive = activeTimer?.sesta === n
        const durAlvo = s?.durAlvo ? formatDur(s.durAlvo) : '–'

        return (
          <div key={n} style={{ background: 'var(--warm)', border: '1px solid var(--border)', borderRadius: 14, padding: '13px 14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--earth)' }}>{n}ª Sesta</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {s && <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, background: 'white', color: 'var(--sage)', border: '1px solid var(--sage-light)', borderRadius: 8, padding: '3px 9px' }}>
                  ⏰ {fromMins(s.alvo)}
                </span>}
                <span style={{ fontSize: 11, color: 'var(--muted)', background: 'white', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 7px' }}>~{durAlvo}</span>
              </div>
            </div>

            {isTimerActive && (
              <div style={{ background: 'var(--sky)', borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>⏱ A dormir…</span>
                <span style={{ fontFamily: 'monospace', fontSize: 20, color: 'white', fontWeight: 600 }}>{timerDisplay}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="time" value={ini} onChange={e => setRT(`s${n}_ini`, e.target.value)}
                style={{ flex: 1, textAlign: 'center', fontSize: 15 }} placeholder="início" />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>→</span>
              <input type="time" value={fim} onChange={e => setRT(`s${n}_fim`, e.target.value)}
                style={{ flex: 1, textAlign: 'center', fontSize: 15 }} placeholder="fim" />
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {!isTimerActive && !ini && (
                <button onClick={() => { setRT(`s${n}_ini`, nowHHMM()); setActiveTimer({ sesta: n, start: Date.now() }) }}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--sky-light)', background: 'rgba(143,179,200,0.1)', color: 'var(--sky)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ▶ Começou
                </button>
              )}
              {isTimerActive && (
                <button onClick={stopSestaTimer}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid rgba(192,97,78,0.3)', background: 'rgba(192,97,78,0.08)', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ⏹ Acordou
                </button>
              )}
              {ini && !isTimerActive && !fim && (
                <button onClick={() => setRT(`s${n}_fim`, nowHHMM())}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid rgba(122,158,126,0.3)', background: 'rgba(122,158,126,0.08)', color: 'var(--sage)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✓ Acordou agora
                </button>
              )}
            </div>

            {s?.quality && fim && ini && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="quality-pill" style={{ background: s.quality.bg, color: s.quality.color }}>
                  {s.quality.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Real: {formatDur(s.durReal)} / Ideal: ~{formatDur(s.durAlvo)}
                </span>
              </div>
            )}
          </div>
        )
      })}

      {/* Deitar */}
      {calc?.deitar && (
        <div style={{
          background: 'linear-gradient(135deg, #7a9e7e 0%, #5a8a7a 100%)',
          borderRadius: 16, padding: '18px 20px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(122,158,126,0.25)'
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Deitar — alvo</div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 300, color: 'white', letterSpacing: -1 }}>{fromMins(calc.deitar)}</div>
          </div>
          <div style={{ fontSize: 36, opacity: 0.6 }}>🌙</div>
        </div>
      )}

      {/* Dormiu + obs */}
      <div className="card">
        <div className="field-row" style={{ marginBottom: 12 }}>
          <div className="field-label">Dormiu às<small>hora real de adormecer</small></div>
          <input type="time" value={dormiu} onChange={e => setDormiu(e.target.value)} style={{ width: 'auto', minWidth: 110 }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Observações</div>
        <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="notas do dia…" />
      </div>

      <button className="btn btn-primary" onClick={guardar} disabled={saving}>
        {saving ? '…' : '💾 Guardar dia'}
      </button>
    </div>
  )
}
