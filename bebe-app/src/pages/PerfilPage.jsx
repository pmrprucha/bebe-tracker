import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { today } from '../lib/sleep'

const ROLE_LABELS = {
  mae: '👩 Mãe', pai: '👨 Pai', avo_m: '👵 Avó', avo_p: '👴 Avô',
  tio: '👨‍👦 Tio', tia: '👩‍👦 Tia', primo: '🧑 Primo/a', outro: '👤 Outro'
}

export default function PerfilPage() {
  const { session, profile, setProfile, activeChild, children, switchChild, refreshChildren, isParent, showToast } = useApp()
  const [tab, setTab]               = useState('perfil') // perfil | crianca | familia
  const [showAddChild, setShowAddChild] = useState(false)
  const [childName, setChildName]   = useState('')
  const [childBirth, setChildBirth] = useState('')
  const [inviteLink, setInviteLink] = useState(null)
  const [inviteType, setInviteType] = useState(null)
  const [familyMembers, setFamilyMembers] = useState([])
  const [caregivers, setCaregivers]  = useState([])
  const [pendingCaregivers, setPendingCaregivers] = useState([])
  const avatarRef = useRef()

  useEffect(() => {
    if (activeChild) loadFamily()
  }, [activeChild])

  const loadFamily = async () => {
    const [fmRes, cgRes] = await Promise.all([
      sb.from('family_members').select('*, profiles(name, role, avatar_url)').eq('child_id', activeChild.id),
      sb.from('caregivers').select('*, profiles(name, role, avatar_url)').eq('child_id', activeChild.id)
    ])
    setFamilyMembers(fmRes.data || [])
    setCaregivers((cgRes.data || []).filter(c => c.approved))
    setPendingCaregivers((cgRes.data || []).filter(c => !c.approved))
  }

  // ── Avatar upload ────────────────────────────────
  const handleAvatarUpload = async (e, targetType, targetId) => {
    const file = e.target.files[0]
    if (!file) return
    const ext = file.name.split('.').pop()
    const path = `${targetType}/${targetId}.${ext}`
    const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { showToast('Erro ao carregar foto'); return }
    const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(path)

    if (targetType === 'profile') {
      await sb.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id)
      setProfile(p => ({ ...p, avatar_url: publicUrl }))
    } else {
      await sb.from('children').update({ avatar_url: publicUrl }).eq('id', targetId)
      refreshChildren()
    }
    showToast('Foto atualizada ✓')
  }

  // ── Create child ─────────────────────────────────
  const criarCrianca = async () => {
    if (!childName || !childBirth) { showToast('Preenche nome e data de nascimento'); return }
    const { data: kid, error } = await sb.from('children').insert({
      name: childName, birthdate: childBirth, created_by: session.user.id
    }).select().single()
    if (error) { showToast('Erro ao criar criança'); return }
    // add as parent
    await sb.from('family_members').insert({
      child_id: kid.id, profile_id: session.user.id,
      is_parent: true, approved: true, added_by: session.user.id
    })
    showToast(childName + ' adicionado/a ✓')
    setShowAddChild(false); setChildName(''); setChildBirth('')
    refreshChildren()
  }

  // ── Generate invite ───────────────────────────────
  const gerarConvite = async (type) => {
    if (!activeChild) return
    const { data, error } = await sb.from('invites').insert({
      child_id: activeChild.id,
      invite_type: type,
      created_by: session.user.id
    }).select().single()
    if (error) { showToast('Erro ao gerar convite'); return }
    const link = `${window.location.origin}${window.location.pathname}?invite=${data.token}`
    setInviteLink(link)
    setInviteType(type)
  }

  const copiarLink = () => {
    navigator.clipboard.writeText(inviteLink)
    showToast('Link copiado ✓')
  }

  // ── Accept invite (on load if ?invite= param) ─────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('invite')
    if (token && session) acceptInvite(token)
  }, [session])

  const acceptInvite = async (token) => {
    const { data: invite } = await sb.from('invites').select('*').eq('token', token).single()
    if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
      showToast('Convite inválido ou expirado'); return
    }
    if (invite.invite_type === 'parent') {
      await sb.from('family_members').upsert({
        child_id: invite.child_id, profile_id: session.user.id,
        is_parent: false, approved: true, added_by: invite.created_by
      }, { onConflict: 'child_id,profile_id' })
    } else {
      await sb.from('caregivers').upsert({
        child_id: invite.child_id, profile_id: session.user.id,
        approved: false, approved_by: null
      }, { onConflict: 'child_id,profile_id' })
    }
    await sb.from('invites').update({ used_by: session.user.id, used_at: new Date().toISOString() }).eq('token', token)
    window.history.replaceState({}, '', window.location.pathname)
    showToast(invite.invite_type === 'parent' ? 'Adicionado à família ✓' : 'Pedido enviado aos pais para aprovação')
    refreshChildren()
  }

  // ── Approve caregiver ─────────────────────────────
  const aprovarCuidador = async (cgId) => {
    await sb.from('caregivers').update({ approved: true, approved_by: session.user.id }).eq('id', cgId)
    showToast('Cuidador aprovado ✓'); loadFamily()
  }

  const rejeitarCuidador = async (cgId) => {
    await sb.from('caregivers').delete().eq('id', cgId)
    showToast('Pedido recusado'); loadFamily()
  }

  const AvatarBlock = ({ url, size = 56, onUpload, emoji = '👤' }) => (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.45 }}>
        {url ? <img src={url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
              : emoji}
      </div>
      {onUpload && (
        <label style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, background: 'var(--earth)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid white' }}>
          <span style={{ fontSize: 11, color: 'white' }}>+</span>
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onUpload} />
        </label>
      )}
    </div>
  )

  return (
    <div className="page-content">

      {/* Sub-tabs */}
      <div style={{ display: 'flex', background: 'var(--warm)', borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {[['perfil','Perfil'],['crianca','Criança'],['familia','Família']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: '9px', borderRadius: 9, border: 'none',
            fontFamily: 'Instrument Sans, sans-serif', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.2s',
            background: tab === k ? 'white' : 'transparent',
            color: tab === k ? 'var(--earth)' : 'var(--muted)',
            boxShadow: tab === k ? 'var(--shadow)' : 'none'
          }}>{l}</button>
        ))}
      </div>

      {/* ── PERFIL ── */}
      {tab === 'perfil' && profile && (
        <>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px' }}>
            <AvatarBlock url={profile.avatar_url} size={72}
              onUpload={e => handleAvatarUpload(e, 'profile', session.user.id)} />
            <div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 400 }}>{profile.name}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{ROLE_LABELS[profile.role] || profile.role}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{session.user.email}</div>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => sb.auth.signOut()}>
            Sair da conta
          </button>
        </>
      )}

      {/* ── CRIANÇA ── */}
      {tab === 'crianca' && (
        <>
          {children.map(kid => (
            <div key={kid.id} className="card" style={{ padding: '16px', cursor: 'pointer', borderColor: activeChild?.id === kid.id ? 'var(--earth)' : 'var(--border)' }}
              onClick={() => switchChild(kid)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <AvatarBlock url={kid.avatar_url} size={52} emoji="👶"
                  onUpload={isParent(kid.id) ? e => handleAvatarUpload(e, 'child', kid.id) : null} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 400 }}>{kid.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Nasceu: {kid.birthdate?.split('-').reverse().join('/')}
                  </div>
                </div>
                {activeChild?.id === kid.id && <span style={{ color: 'var(--earth)', fontSize: 20 }}>✓</span>}
              </div>
            </div>
          ))}

          {!showAddChild ? (
            <button className="btn btn-ghost" onClick={() => setShowAddChild(true)}>+ Adicionar criança</button>
          ) : (
            <div className="card">
              <div className="card-title">👶 Nova criança</div>
              <div style={{ marginBottom: 10 }}>
                <div className="section-label">Nome</div>
                <input type="text" value={childName} onChange={e => setChildName(e.target.value)} placeholder="Nome do bebé" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div className="section-label">Data de nascimento</div>
                <input type="date" value={childBirth} onChange={e => setChildBirth(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setShowAddChild(false)} style={{ flex: 1 }}>Cancelar</button>
                <button className="btn btn-primary" onClick={criarCrianca} style={{ flex: 1 }}>Criar</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── FAMÍLIA ── */}
      {tab === 'familia' && activeChild && (
        <>
          {/* Aprovações pendentes (só pais) */}
          {isParent(activeChild.id) && pendingCaregivers.length > 0 && (
            <div className="card" style={{ borderColor: 'rgba(196,162,64,0.4)', background: 'rgba(196,162,64,0.05)' }}>
              <div className="card-title" style={{ color: 'var(--warn)' }}>⏳ Pedidos pendentes</div>
              {pendingCaregivers.map(cg => (
                <div key={cg.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div className="avatar" style={{ width: 40, height: 40, fontSize: 18 }}>
                    {cg.profiles?.avatar_url
                      ? <img src={cg.profiles.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                      : '👤'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{cg.profiles?.name || 'Utilizador'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ROLE_LABELS[cg.profiles?.role] || ''} · pede acesso de cuidador</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => aprovarCuidador(cg.id)} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--sage)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>
                    <button onClick={() => rejeitarCuidador(cg.id)} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(192,97,78,0.1)', color: 'var(--danger)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Membros da família */}
          {familyMembers.length > 0 && (
            <div className="card">
              <div className="card-title">👨‍👩‍👧 Família</div>
              {familyMembers.map(fm => (
                <div key={fm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div className="avatar" style={{ width: 40, height: 40, fontSize: 18 }}>
                    {fm.profiles?.avatar_url
                      ? <img src={fm.profiles.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                      : '👤'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{fm.profiles?.name || 'Utilizador'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ROLE_LABELS[fm.profiles?.role] || ''}</div>
                  </div>
                  {fm.is_parent && <span className="badge badge-earth">Pai/Mãe</span>}
                </div>
              ))}
            </div>
          )}

          {/* Cuidadores aprovados */}
          {caregivers.length > 0 && (
            <div className="card">
              <div className="card-title">🤝 Cuidadores com acesso</div>
              {caregivers.map(cg => (
                <div key={cg.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div className="avatar" style={{ width: 40, height: 40, fontSize: 18 }}>
                    {cg.profiles?.avatar_url
                      ? <img src={cg.profiles.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                      : '👤'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{cg.profiles?.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ROLE_LABELS[cg.profiles?.role] || ''}</div>
                  </div>
                  <span className="badge badge-sage">Cuidador</span>
                </div>
              ))}
            </div>
          )}

          {/* Gerar convites (só pais) */}
          {isParent(activeChild.id) && (
            <div className="card">
              <div className="card-title">🔗 Convidar</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: inviteLink ? 12 : 0 }}>
                <button className="btn btn-secondary" onClick={() => gerarConvite('parent')} style={{ flex: 1, fontSize: 13 }}>
                  👨‍👩‍👧 Pai/Mãe
                </button>
                <button className="btn btn-secondary" onClick={() => gerarConvite('caregiver')} style={{ flex: 1, fontSize: 13 }}>
                  🤝 Cuidador
                </button>
              </div>
              {inviteLink && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                    {inviteType === 'parent' ? 'Link de pai/mãe — acesso total' : 'Link de cuidador — precisa de aprovação dos pais'}
                  </div>
                  <div style={{ background: 'var(--warm)', borderRadius: 10, padding: '10px 12px', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 8 }}>
                    {inviteLink}
                  </div>
                  <button className="btn btn-sage" onClick={copiarLink} style={{ fontSize: 13 }}>
                    📋 Copiar link
                  </button>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>Válido por 7 dias</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
