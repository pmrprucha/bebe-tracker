import { useState, useEffect, useRef, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import {
  getPlanoByWeeks, getWeeks, calcSestas,
  fromMins, toMins, formatDur, today, nowHHMM, fmtSecs
} from '../lib/sleep'

function fmtAwake(secs) {
  if (!secs || secs < 0) return '–'
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

export default function SonoPage() {
  const { activeChild, profile, showToast, setSyncState } = useApp()
  const [acordou, setAcordou]     = useState('')
  const [planoSel, setPlanoSel]   = useState('auto')
  const [realTimes, setRealTimes] = useState({ s1_ini:'', s1_fim:'', s2_ini:'', s2_fim:'', s3_ini:'', s3_fim:'' })
  const [dormiu, setDormiu]       = useState('')
  const [obs, setObs]             = useState('')
  const [activeTimer, setActiveTimer] = useState(null)
  const [timerDisplay, setTimerDisplay] = useState('00:00')
  const [awakeSecs, setAwakeSecs] = useState(null)
  const [deleteNap, setDeleteNap] = useState(null)

  const timerRef   = useRef(null)
  const awakeRef   = useRef(null)
  const saveDebRef = useRef(null)
  const latestData = useRef({})

  const child     = activeChild
  const semanas   = child ? getWeeks(child.birthdate) : 0
  const planoAuto = getPlanoByWeeks(semanas)
  const numSestas = planoSel === 'auto' ? planoAuto.sestas : parseInt(planoSel)

  const deitarMin = child?.deitar_min ? toMins(child.deitar_min) : 19 * 60 + 30
  const deitarMax = child?.deitar_max ? toMins(child.deitar_max) : 20 * 60
  const sestaFacultativa = child?.sesta_facultativa ?? false

  const calc = acordou
    ? calcSestas(toMins(acordou), { ...planoAuto, sestas: numSestas }, realTimes)
    : null

  const deitarFinal = calc?.deitar
    ? Math.min(Math.max(calc.deitar, deitarMin), deitarMax)
    : null

  // ── Estado de sono nocturno ────────────────────────
  // Se "dormiu às" está preenchido e não há "acordou" de hoje → está a dormir
  // "acordou" é a hora em que acordou de manhã → termina o sono nocturno
  const estADormir = dormiu && !acordou

  useEffect(() => { if (child) loadToday() }, [child])
  useEffect(() => () => {
    clearInterval(timerRef.current)
    clearInterval(awakeRef.current)
    clearTimeout(saveDebRef.current)
  }, [])

  const loadToday = async () => {
    const { data } = await sb.from('sleep_events').select('*')
      .eq('child_id', child.id).eq('data_date', today()).single()
    if (data?.payload) {
      const p = data.payload
      setAcordou(p.acordou || '')
      setPlanoSel(p.plano || 'auto')
      setRealTimes({ s1_ini:p.s1_ini||'', s1_fim:p.s1_fim||'', s2_ini:p.s2_ini||'', s2_fim:p.s2_fim||'', s3_ini:p.s3_ini||'', s3_fim:p.s3_fim||'' })
      setDormiu(p.dormiu || '')
      setObs(p.obs || '')
    }
  }

  // ── Auto-save debounce 2s ──────────────────────────
  const triggerSave = useCallback(() => {
    clearTimeout(saveDebRef.current)
    saveDebRef.current = setTimeout(() => doSave(latestData.current), 2000)
  }, [child])

  useEffect(() => {
    latestData.current = { acordou, planoSel, realTimes, dormiu, obs }
  }, [acordou, planoSel, realTimes, dormiu, obs])

  const doSave = async (d) => {
    if (!child) return
    setSyncState('syncing')
    const numS = d.planoSel === 'auto' ? planoAuto.sestas : parseInt(d.planoSel)
    const c = d.acordou ? calcSestas(toMins(d.acordou), { ...planoAuto, sestas: numS }, d.realTimes) : null
    const df = c?.deitar ? Math.min(Math.max(c.deitar, deitarMin), deitarMax) : null
    const payload = {
      acordou: d.acordou, plano: d.planoSel, dormiu: d.dormiu, obs: d.obs, ...d.realTimes,
      alvo1: c?.sestas[0] ? fromMins(c.sestas[0].alvo) : '',
      alvo2: c?.sestas[1] ? fromMins(c.sestas[1].alvo) : '',
      alvo3: c?.sestas[2] ? fromMins(c.sestas[2].alvo) : '',
      deitar: df ? fromMins(df) : '',
      alertas: c?.alertas || [],
    }
    const { error } = await sb.from('sleep_events').upsert({
      child_id: child.id, data_date: today(),
      payload, recorded_by: profile?.id, updated_at: new Date().toISOString()
    }, { onConflict: 'child_id,data_date' })
    setSyncState(error ? 'err' : 'ok')
  }

  const setAcordouAndSave = (v) => { setAcordou(v); setTimeout(triggerSave, 0) }
  const setPlanoAndSave   = (v) => { setPlanoSel(v); setTimeout(triggerSave, 0) }
  const setObsAndSave     = (v) => { setObs(v); setTimeout(triggerSave, 0) }
  const setDormiuAndSave  = (v) => { setDormiu(v); setTimeout(triggerSave, 0) }
  const setRTAndSave      = (key, val) => {
    setRealTimes(prev => {
      const next = { ...prev, [key]: val }
      latestData.current = { ...latestData.current, realTimes: next }
      setTimeout(triggerSave, 0)
      return next
    })
  }

  // ── Contador acordado ──────────────────────────────
  useEffect(() => {
    clearInterval(awakeRef.current)
    if (estADormir) { setAwakeSecs(null); return }
    const emSesta = [1,2,3].some(n => realTimes[`s${n}_ini`] && !realTimes[`s${n}_fim`])
    if (emSesta || activeTimer) { setAwakeSecs(null); return }
    const ultimoFim = (() => { for (const n of [3,2,1]) { const f = realTimes[`s${n}_fim`]; if (f) return horaToMs(f) } return null })()
    const refMs = ultimoFim || horaToMs(acordou)
    if (!refMs) { setAwakeSecs(null); return }
    const tick = () => setAwakeSecs(Math.max(0, Math.floor((Date.now() - refMs) / 1000)))
    tick()
    awakeRef.current = setInterval(tick, 15000)
    return () => clearInterval(awakeRef.current)
  }, [acordou, realTimes, activeTimer, estADormir])

  // ── Timer sesta ────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current)
    if (!activeTimer) return
    const iv = setInterval(() => {
      setTimerDisplay(fmtSecs(Math.floor((Date.now() - activeTimer.startMs) / 1000)))
    }, 500)
    return () => clearInterval(iv)
  }, [activeTimer])

  const iniciarSesta = (n) => {
    setRTAndSave(`s${n}_ini`, nowHHMM())
    setActiveTimer({ sesta: n, startMs: Date.now() })
  }

  const terminarSesta = (n) => {
    setRTAndSave(`s${n}_fim`, nowHHMM())
    setActiveTimer(null)
  }

  const confirmarApagarSesta = (n) => {
    if (activeTimer?.sesta === n) { clearInterval(timerRef.current); setActiveTimer(null) }
    setRealTimes(prev => {
      const next = { ...prev, [`s${n}_ini`]: '', [`s${n}_fim`]: '' }
      latestData.current = { ...latestData.current, realTimes: next }
      setTimeout(triggerSave, 0)
      return next
    })
    setDeleteNap(null)
    showToast('Sesta apagada')
  }

  const limparDormiu = () => {
    setDormiuAndSave('')
    showToast('Hora de dormir apagada')
  }

  const awakeColor = awakeSecs == null ? null
    : awakeSecs < 7200  ? { bg:'rgba(168,197,171,0.15)', border:'rgba(122,158,126,0.3)', text:'var(--sage)',   msg:'Dentro da janela normal' }
    : awakeSecs < 10800 ? { bg:'rgba(245,216,122,0.15)', border:'rgba(196,162,64,0.35)',  text:'var(--warn)',   msg:'A aproximar do limite' }
    :                     { bg:'rgba(232,165,152,0.15)', border:'rgba(232,165,152,0.4)',   text:'var(--danger)', msg:'Pode estar com sono!' }

  if (!child) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">👶</div><p>Adiciona uma criança para começar</p></div>
    </div>
  )

  return (
    <div className="page-content">

      {/* A dormir (sono nocturno) */}
      {estADormir && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(106,174,200,0.1)', border:'1px solid rgba(106,174,200,0.3)', borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
          <span style={{ fontSize:28 }}>😴</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--sky)' }}>A dormir desde as {dormiu}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Regista a hora de acordar quando acordar</div>
          </div>
        </div>
      )}

      {/* Contador acordado */}
      {awakeSecs !== null && awakeColor && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:awakeColor.bg, border:`1px solid ${awakeColor.border}`, borderRadius:12, padding:'12px 16px', marginBottom:12 }}>
          <span style={{ fontSize:22 }}>☀️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:awakeColor.text }}>Acordado há {fmtAwake(awakeSecs)}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{awakeColor.msg}</div>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', textAlign:'right' }}>
            Deitar<br/><strong style={{ color:'var(--sage)', fontSize:13 }}>{fromMins(deitarMin)}–{fromMins(deitarMax)}</strong>
          </div>
        </div>
      )}

      {/* Plano */}
      <div className="alert alert-info" style={{ marginBottom:12 }}>
        🌱 <span><strong>{planoAuto.label}</strong>{sestaFacultativa ? ' · sesta facultativa' : ''} — {planoAuto.desc}</span>
      </div>

      {calc?.alertas?.map((a, i) => <div key={i} className="alert alert-warn">⚠️ {a}</div>)}

      {/* Dados do dia */}
      <div className="card">
        <div className="card-title">
          📅 Hoje
          <span style={{ fontSize:10, color:'var(--sage)', fontStyle:'normal', marginLeft:6 }}>✓ guarda automaticamente</span>
        </div>
        <div className="field-row">
          <div className="field-label">
            Acordou
            <small>hora em que acordou de manhã</small>
          </div>
          <input type="time" value={acordou} onChange={e => setAcordouAndSave(e.target.value)} style={{ width:'auto', minWidth:110 }} />
        </div>
        <div className="field-row">
          <div className="field-label">Plano</div>
          <select value={planoSel} onChange={e => setPlanoAndSave(e.target.value)} style={{ width:'auto', minWidth:130 }}>
            <option value="auto">Auto ({planoAuto.sestas} sestas)</option>
            <option value="3">3 sestas</option>
            <option value="2">2 sestas</option>
            <option value="1">1 sesta</option>
            {sestaFacultativa && <option value="0">Sem sesta hoje</option>}
          </select>
        </div>
      </div>

      {/* Sestas — só mostrar se já acordou */}
      {acordou && numSestas > 0 && Array.from({ length: numSestas }, (_, idx) => {
        const n = idx + 1
        const s = calc?.sestas[idx]
        const ini = realTimes[`s${n}_ini`]
        const fim = realTimes[`s${n}_fim`]
        const isActive = activeTimer?.sesta === n
        const temRegisto = ini || fim

        return (
          <div key={n} style={{ background:'var(--warm)', border:'1px solid var(--border)', borderRadius:14, padding:'13px 14px', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--earth)' }}>{n}ª Sesta</span>
                {sestaFacultativa && <span style={{ fontSize:10, color:'var(--muted)', background:'var(--sand)', borderRadius:4, padding:'1px 5px' }}>facultativa</span>}
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                {s && <span style={{ fontFamily:'monospace', fontSize:13, fontWeight:600, background:'white', color:'var(--sage)', border:'1px solid var(--sage-light)', borderRadius:8, padding:'3px 9px' }}>⏰ {fromMins(s.alvo)}</span>}
                <span style={{ fontSize:11, color:'var(--muted)', background:'white', border:'1px solid var(--border)', borderRadius:6, padding:'3px 7px' }}>~{s?.durAlvo ? formatDur(s.durAlvo) : '–'}</span>
                {temRegisto && (
                  <button onClick={() => setDeleteNap(n)} style={{ padding:'3px 8px', borderRadius:6, border:'1px solid rgba(192,97,78,0.3)', background:'rgba(192,97,78,0.06)', color:'var(--danger)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
                )}
              </div>
            </div>

            {isActive && (
              <div style={{ background:'var(--sky)', borderRadius:10, padding:'10px 14px', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ color:'white', fontSize:13, fontWeight:600 }}>⏱ A dormir…</span>
                <span style={{ fontFamily:'monospace', fontSize:20, color:'white', fontWeight:600 }}>{timerDisplay}</span>
              </div>
            )}

            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="time" value={ini} onChange={e => setRTAndSave(`s${n}_ini`, e.target.value)} style={{ flex:1, textAlign:'center', fontSize:15 }} placeholder="início" />
              <span style={{ color:'var(--muted)', fontSize:13 }}>→</span>
              <input type="time" value={fim} onChange={e => setRTAndSave(`s${n}_fim`, e.target.value)} style={{ flex:1, textAlign:'center', fontSize:15 }} placeholder="fim" />
            </div>

            <div style={{ display:'flex', gap:6, marginTop:8 }}>
              {!isActive && !ini && (
                <button onClick={() => iniciarSesta(n)} style={{ flex:1, padding:'8px', borderRadius:8, border:'1px solid var(--sky-light)', background:'rgba(143,179,200,0.1)', color:'var(--sky)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>▶ Começou</button>
              )}
              {isActive && (
                <button onClick={() => terminarSesta(n)} style={{ flex:1, padding:'8px', borderRadius:8, border:'1px solid rgba(192,97,78,0.3)', background:'rgba(192,97,78,0.08)', color:'var(--danger)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>⏹ Acordou</button>
              )}
              {ini && !isActive && !fim && (
                <button onClick={() => setRTAndSave(`s${n}_fim`, nowHHMM())} style={{ flex:1, padding:'8px', borderRadius:8, border:'1px solid rgba(122,158,126,0.3)', background:'rgba(122,158,126,0.08)', color:'var(--sage)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>✓ Acordou agora</button>
              )}
            </div>

            {s?.quality && fim && ini && (
              <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
                <span className="quality-pill" style={{ background:s.quality.bg, color:s.quality.color }}>{s.quality.label}</span>
                <span style={{ fontSize:11, color:'var(--muted)' }}>Real: {formatDur(s.durReal)} / Ideal: ~{formatDur(s.durAlvo)}</span>
              </div>
            )}
          </div>
        )
      })}

      {/* Deitar */}
      {(deitarFinal || acordou) && (
        <div style={{ background:'linear-gradient(135deg, #7a9e7e 0%, #5a8a7a 100%)', borderRadius:16, padding:'18px 20px', marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 4px 20px rgba(122,158,126,0.25)' }}>
          <div>
            <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.6px', color:'rgba(255,255,255,0.7)', marginBottom:4 }}>Deitar — janela</div>
            <div style={{ fontFamily:'Fraunces, serif', fontSize:28, fontWeight:300, color:'white' }}>{fromMins(deitarMin)} – {fromMins(deitarMax)}</div>
            {deitarFinal && <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:4 }}>Sugestão hoje: <strong>{fromMins(deitarFinal)}</strong></div>}
          </div>
          <div style={{ fontSize:36, opacity:0.6 }}>🌙</div>
        </div>
      )}

      {/* Dormiu + obs */}
      <div className="card">
        <div style={{ marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <div className="field-label">
              Dormiu às
              <small>hora em que adormeceuu à noite</small>
            </div>
            {dormiu && (
              <button onClick={limparDormiu} style={{ fontSize:11, color:'var(--danger)', background:'rgba(192,97,78,0.08)', border:'1px solid rgba(192,97,78,0.25)', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontFamily:'inherit' }}>
                ✕ Apagar
              </button>
            )}
          </div>
          <input type="time" value={dormiu} onChange={e => setDormiuAndSave(e.target.value)} style={{ width:'100%' }} />
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Observações</div>
        <textarea value={obs} onChange={e => setObsAndSave(e.target.value)} placeholder="notas do dia…" />
      </div>

      {/* Confirm apagar sesta */}
      {deleteNap && (
        <div className="modal-overlay" onClick={() => setDeleteNap(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🗑️</div>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:400, marginBottom:8 }}>Apagar {deleteNap}ª sesta?</h3>
              <p style={{ fontSize:14, color:'var(--muted)' }}>Os horários registados serão apagados.</p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteNap(null)} style={{ flex:1, padding:'13px', borderRadius:12, border:'1px solid var(--border)', background:'var(--warm)', color:'var(--text)', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Cancelar</button>
              <button onClick={() => confirmarApagarSesta(deleteNap)} style={{ flex:1, padding:'13px', borderRadius:12, border:'none', background:'var(--danger)', color:'white', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
