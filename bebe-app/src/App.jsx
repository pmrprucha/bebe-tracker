import { useState, useEffect, useRef } from 'react'
import { useApp } from './lib/AppContext'
import { sb } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import SonoPage from './pages/SonoPage'
import AmamentacaoPage from './pages/AmamentacaoPage'
import AlimentacaoPage from './pages/AlimentacaoPage'
import DespensaPage from './pages/DespensaPage'
import MedicoPage from './pages/MedicoPage'
import HistoricoPage from './pages/HistoricoPage'
import PerfilPage from './pages/PerfilPage'
import { getAgeLabel } from './lib/sleep'

export default function App() {
  const { session, loading } = useApp()
  if (loading) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="spinner" />
    </div>
  )
  if (!session) return <AuthPage />
  return <AppShell />
}

function AppShell() {
  const { profile, activeChild, children, switchChild, toast, syncState } = useApp()
  const [page, setPage] = useState('sono')
  const [showChildPicker, setShowChildPicker] = useState(false)

  // ── Alertas medicamentos ──────────────────────────
  const [medAlerts, setMedAlerts] = useState([])
  const medTimerRef = useRef(null)

  // ── Alertas despensa ──────────────────────────────
  const [despensaAlerts, setDespensaAlerts] = useState(0)
  const despensaTimerRef = useRef(null)

  const checkMedAlerts = async () => {
    if (!activeChild) return
    const { data: treats } = await sb.from('treatments').select('id,periodicidade_horas')
      .eq('child_id', activeChild.id).eq('ativo', true)
    if (!treats?.length) { setMedAlerts([]); return }
    const { data: logs } = await sb.from('treatment_logs').select('treatment_id,tomado_em')
      .in('treatment_id', treats.map(t => t.id)).order('tomado_em', { ascending: false })
    const lastLog = {}
    for (const l of (logs||[])) { if (!lastLog[l.treatment_id]) lastLog[l.treatment_id] = l.tomado_em }
    const atrasados = treats.filter(t => {
      const last = lastLog[t.id]
      if (!last) return true
      return Date.now() > new Date(last).getTime() + t.periodicidade_horas * 3600000
    })
    setMedAlerts(atrasados)
  }

  const checkDespensaAlerts = async () => {
    const today = new Date().toISOString().slice(0,10)
    const threeDays = new Date(Date.now() + 3*86400000).toISOString().slice(0,10)
    const { count } = await sb.from('food_items')
      .select('id', { count: 'exact', head: true })
      .eq('consumido', false)
      .lte('data_validade', threeDays)
    setDespensaAlerts(count || 0)
  }

  useEffect(() => {
    checkMedAlerts()
    checkDespensaAlerts()
    medTimerRef.current = setInterval(checkMedAlerts, 60000)
    despensaTimerRef.current = setInterval(checkDespensaAlerts, 300000)
    return () => {
      clearInterval(medTimerRef.current)
      clearInterval(despensaTimerRef.current)
    }
  }, [activeChild])

  // ── Navegacao ──────────────────────────────────────
  const mostrarAmamentacao = activeChild?.amamentando ?? false

  const NAV = [
    { key: 'sono',        icon: '🌙', label: 'Sono' },
    ...(mostrarAmamentacao ? [{ key: 'amamentacao', icon: '🤱', label: 'Mama' }] : []),
    { key: 'alimentacao', icon: '🍽️', label: 'Comida' },
    { key: 'despensa',    icon: '🍱', label: 'Despensa', alert: despensaAlerts > 0 },
    { key: 'medico',      icon: '🩺', label: 'Saude', alert: medAlerts.length > 0 },
    { key: 'historico',   icon: '📋', label: 'Hist.' },
    { key: 'perfil',      icon: '👤', label: 'Perfil' },
  ]

  const PAGES = {
    sono:        SonoPage,
    amamentacao: AmamentacaoPage,
    alimentacao: AlimentacaoPage,
    despensa:    DespensaPage,
    medico:      MedicoPage,
    historico:   HistoricoPage,
    perfil:      PerfilPage,
  }

  useEffect(() => {
    if (!NAV.find(n => n.key === page)) setPage('sono')
  }, [mostrarAmamentacao])

  const CurrentPage = PAGES[page] || SonoPage
  const ageLabel = activeChild ? getAgeLabel(activeChild.birthdate) : ''

  return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column' }}>

      {/* Banner medicamentos */}
      {medAlerts.length > 0 && page !== 'medico' && (
        <div onClick={() => setPage('medico')} style={{ background:'var(--danger)', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', flexShrink:0, animation:'bannerPulse 2s ease-in-out infinite' }}>
          <style>{`@keyframes bannerPulse{0%,100%{background:#e07070}50%{background:#c84040}}`}</style>
          <span style={{ fontSize:18 }}>💊</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'white' }}>
              {medAlerts.length === 1 ? '1 medicamento em atraso' : `${medAlerts.length} medicamentos em atraso`}
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)' }}>Toca para confirmar</div>
          </div>
          <span style={{ color:'white', fontSize:18, opacity:0.8 }}>›</span>
        </div>
      )}

      {/* Banner despensa */}
      {despensaAlerts > 0 && page !== 'despensa' && (
        <div onClick={() => setPage('despensa')} style={{ background:'rgba(232,184,75,0.9)', padding:'8px 16px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', flexShrink:0 }}>
          <span style={{ fontSize:16 }}>⚠️</span>
          <div style={{ flex:1, fontSize:12, fontWeight:600, color:'#5a4000' }}>
            {despensaAlerts} {despensaAlerts === 1 ? 'item' : 'itens'} a expirar na despensa
          </div>
          <span style={{ color:'#5a4000', fontSize:16, opacity:0.8 }}>›</span>
        </div>
      )}

      {/* Header */}
      <div className="app-header">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:20, fontWeight:300, color:'var(--deep)' }}>
            🌿 <em>bebe</em>
          </h1>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div className={`rt-dot ${syncState}`} />
            {activeChild && (
              <button onClick={() => children.length > 1 && setShowChildPicker(true)}
                style={{ display:'flex', alignItems:'center', gap:8, background:'var(--warm)', border:'1px solid var(--border)', borderRadius:20, padding:'5px 12px 5px 8px', cursor: children.length > 1 ? 'pointer' : 'default', fontFamily:'inherit' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--sand)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, overflow:'hidden' }}>
                  {activeChild.avatar_url ? <img src={activeChild.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : '👶'}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--deep)', lineHeight:1 }}>{activeChild.name}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.2 }}>{ageLabel}</div>
                </div>
                {children.length > 1 && <span style={{ fontSize:10, color:'var(--muted)' }}>▾</span>}
              </button>
            )}
            <div className="avatar" style={{ width:32, height:32, fontSize:16 }}>
              {profile?.avatar_url ? <img src={profile.avatar_url} style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} alt="" /> : '👤'}
            </div>
          </div>
        </div>
      </div>

      {/* Child picker */}
      {showChildPicker && (
        <div className="modal-overlay" onClick={() => setShowChildPicker(false)}>
          <div className="modal-sheet">
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:400, marginBottom:16 }}>Escolher crianca</h3>
            {children.map(kid => (
              <button key={kid.id} onClick={() => { switchChild(kid); setShowChildPicker(false) }}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'12px', borderRadius:12, border:'1px solid', borderColor: activeChild?.id===kid.id?'var(--earth)':'var(--border)', background: activeChild?.id===kid.id?'rgba(139,111,71,0.05)':'var(--warm)', cursor:'pointer', marginBottom:8, fontFamily:'inherit' }}>
                <div style={{ width:44, height:44, borderRadius:'50%', background:'var(--sand)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, overflow:'hidden' }}>
                  {kid.avatar_url ? <img src={kid.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : '👶'}
                </div>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontSize:15, fontWeight:600 }}>{kid.name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{getAgeLabel(kid.birthdate)}</div>
                </div>
                {activeChild?.id===kid.id && <span style={{ marginLeft:'auto', color:'var(--earth)' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sem crianca */}
      {!activeChild && page !== 'perfil' && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div className="empty-state">
            <div className="e-icon">🌿</div>
            <p>Vai ao <strong>Perfil</strong> para adicionar o teu bebe.</p>
            <button className="btn btn-primary" onClick={() => setPage('perfil')} style={{ marginTop:16 }}>Ir para Perfil</button>
          </div>
        </div>
      )}

      {/* Conteudo */}
      {(activeChild || page === 'perfil') && (
        <div style={{ flex:1, overflowY:'auto' }}>
          <CurrentPage />
        </div>
      )}

      {/* Bottom nav */}
      <nav className="bottom-nav">
        {NAV.map(n => (
          <button key={n.key} className={`nav-item ${page === n.key ? 'active' : 'inactive'}`}
            onClick={() => setPage(n.key)} style={{ position:'relative' }}>
            <span className="nav-icon">{n.icon}</span>
            {n.label}
            {n.alert && (
              <span style={{ position:'absolute', top:6, right:'50%', marginRight:-18, width:10, height:10, borderRadius:'50%', background:'var(--danger)', border:'2px solid white', display:'block' }} />
            )}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast-container"><div className="toast">{toast}</div></div>
      )}
    </div>
  )
}
