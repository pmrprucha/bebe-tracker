import { useState, useEffect } from 'react'
import { useApp } from './lib/AppContext'
import { sb } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import SonoPage from './pages/SonoPage'
import MamadasPage from './pages/MamadasPage'
import RefeicoesPage from './pages/RefeicoesPage'
import MedicoPage from './pages/MedicoPage'
import HistoricoPage from './pages/HistoricoPage'
import PerfilPage from './pages/PerfilPage'
import { getAgeLabel, getWeeks } from './lib/sleep'

const NAV = [
  { key: 'sono',      icon: '🌙', label: 'Sono' },
  { key: 'mamadas',   icon: '🍼', label: 'Mamadas' },
  { key: 'refeicoes', icon: '🥣', label: 'Refeições' },
  { key: 'medico',    icon: '🩺', label: 'Saúde' },
  { key: 'historico', icon: '📋', label: 'Histórico' },
  { key: 'perfil',    icon: '👤', label: 'Perfil' },
]

function AppShell() {
  const { profile, activeChild, children, switchChild, toast, syncState } = useApp()
  const [page, setPage] = useState('sono')
  const [showChildPicker, setShowChildPicker] = useState(false)

  const semanas = activeChild ? getWeeks(activeChild.birthdate) : 0
  const ageLabel = activeChild ? getAgeLabel(activeChild.birthdate) : ''

  const PAGES = { sono: SonoPage, mamadas: MamadasPage, refeicoes: RefeicoesPage, medico: MedicoPage, historico: HistoricoPage, perfil: PerfilPage }
  const CurrentPage = PAGES[page]

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 300, color: 'var(--deep)' }}>
            🌿 <em>bebé</em>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Sync dot */}
            <div className={`rt-dot ${syncState}`} />

            {/* Child selector */}
            {activeChild && (
              <button onClick={() => children.length > 1 && setShowChildPicker(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--warm)', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 12px 5px 8px', cursor: children.length > 1 ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, overflow: 'hidden' }}>
                  {activeChild.avatar_url
                    ? <img src={activeChild.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : '👶'}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--deep)', lineHeight: 1 }}>{activeChild.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.2 }}>{ageLabel}</div>
                </div>
                {children.length > 1 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>▾</span>}
              </button>
            )}

            {/* Profile avatar */}
            <div className="avatar" style={{ width: 32, height: 32, fontSize: 16 }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                : '👤'}
            </div>
          </div>
        </div>
      </div>

      {/* Child picker */}
      {showChildPicker && (
        <div className="modal-overlay" onClick={() => setShowChildPicker(false)}>
          <div className="modal-sheet">
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 400, marginBottom: 16 }}>Escolher criança</h3>
            {children.map(kid => (
              <button key={kid.id} onClick={() => { switchChild(kid); setShowChildPicker(false) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px', borderRadius: 12, border: '1px solid', borderColor: activeChild?.id === kid.id ? 'var(--earth)' : 'var(--border)', background: activeChild?.id === kid.id ? 'rgba(139,111,71,0.05)' : 'var(--warm)', cursor: 'pointer', marginBottom: 8, fontFamily: 'inherit' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, overflow: 'hidden' }}>
                  {kid.avatar_url ? <img src={kid.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : '👶'}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{kid.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{getAgeLabel(kid.birthdate)}</div>
                </div>
                {activeChild?.id === kid.id && <span style={{ marginLeft: 'auto', color: 'var(--earth)' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No child state */}
      {!activeChild && page !== 'perfil' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="empty-state">
            <div className="e-icon">🌿</div>
            <p>Vai ao <strong>Perfil → Criança</strong> para adicionar o teu bebé.</p>
            <button className="btn btn-primary" onClick={() => setPage('perfil')} style={{ marginTop: 16 }}>
              Ir para Perfil
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      {(activeChild || page === 'perfil') && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <CurrentPage />
        </div>
      )}

      {/* Bottom nav */}
      <nav className="bottom-nav">
        {NAV.map(n => (
          <button key={n.key} className={`nav-item ${page === n.key ? 'active' : ''}`} onClick={() => setPage(n.key)}>
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className="toast">{toast}</div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const { session, loading } = useApp()

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  if (!session) return <AuthPage />
  return <AppShell />
}
