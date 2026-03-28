import { useState } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

const ROLES = [
  { value: 'mae',   label: 'Mãe',   icon: '👩' },
  { value: 'pai',   label: 'Pai',   icon: '👨' },
  { value: 'avo_m', label: 'Avó',   icon: '👵' },
  { value: 'avo_p', label: 'Avô',   icon: '👴' },
  { value: 'tio',   label: 'Tio',   icon: '👨‍👦' },
  { value: 'tia',   label: 'Tia',   icon: '👩‍👦' },
  { value: 'primo', label: 'Primo/a', icon: '🧑' },
  { value: 'outro', label: 'Outro', icon: '👤' },
]

export default function AuthPage() {
  const [mode, setMode]     = useState('login') // login | register
  const [email, setEmail]   = useState('')
  const [pass, setPass]     = useState('')
  const [name, setName]     = useState('')
  const [role, setRole]     = useState('mae')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const { showToast } = useApp()

  const handleLogin = async () => {
    if (!email || !pass) { setError('Preenche email e password'); return }
    setLoading(true); setError('')
    const { error: e } = await sb.auth.signInWithPassword({ email, password: pass })
    if (e) setError('Email ou password incorretos')
    setLoading(false)
  }

  const handleRegister = async () => {
    if (!email || !pass || !name) { setError('Preenche todos os campos'); return }
    if (pass.length < 6) { setError('Password com pelo menos 6 caracteres'); return }
    setLoading(true); setError('')

    const { data, error: e } = await sb.auth.signUp({ email, password: pass })
    if (e) { setError(e.message); setLoading(false); return }

    // create profile
    await sb.from('profiles').insert({
      id: data.user.id,
      name,
      role,
    })
    showToast('Conta criada! Bem-vindo/a 🌿')
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px',
      background: 'var(--cream)',
      backgroundImage: 'radial-gradient(ellipse at 20% 0%, rgba(168,197,171,0.2) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(143,179,200,0.15) 0%, transparent 50%)'
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🌿</div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 300, color: 'var(--deep)' }}>
            <em>bebé</em>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            O diário partilhado do vosso bebé
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'var(--warm)', borderRadius: 12, padding: 4, marginBottom: 20 }}>
          {['login', 'register'].map(m => (
            <button key={m}
              onClick={() => { setMode(m); setError('') }}
              style={{
                flex: 1, padding: '9px', borderRadius: 9, border: 'none',
                fontFamily: 'Instrument Sans, sans-serif', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
                background: mode === m ? 'white' : 'transparent',
                color: mode === m ? 'var(--earth)' : 'var(--muted)',
                boxShadow: mode === m ? 'var(--shadow)' : 'none'
              }}>
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 20 }}>
          {mode === 'register' && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div className="section-label">Nome</div>
                <input type="text" placeholder="O teu nome" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <div className="section-label">Quem és?</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {ROLES.map(r => (
                    <button key={r.value}
                      onClick={() => setRole(r.value)}
                      style={{
                        padding: '10px 4px', borderRadius: 10, border: '1px solid',
                        borderColor: role === r.value ? 'var(--earth)' : 'var(--border)',
                        background: role === r.value ? 'rgba(139,111,71,0.08)' : 'var(--warm)',
                        cursor: 'pointer', textAlign: 'center',
                        fontFamily: 'Instrument Sans, sans-serif',
                      }}>
                      <div style={{ fontSize: 20 }}>{r.icon}</div>
                      <div style={{ fontSize: 10, color: role === r.value ? 'var(--earth)' : 'var(--muted)', marginTop: 3, fontWeight: 600 }}>{r.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div style={{ marginBottom: 12 }}>
            <div className="section-label">Email</div>
            <input type="email" placeholder="email@exemplo.com" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="section-label">Password</div>
            <input type="password" placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'} value={pass}
              onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())} />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12, textAlign: 'center' }}>
              ⚠️ {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={mode === 'login' ? handleLogin : handleRegister} disabled={loading}>
            {loading ? '…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </div>
      </div>
    </div>
  )
}
