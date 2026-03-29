import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { getDeitarRangeByWeeks, getWeeks, fromMins } from '../lib/sleep'

const ROLE_LABELS = {
  mae:'👩 Mãe', pai:'👨 Pai', avo_m:'👵 Avó', avo_p:'👴 Avô',
  tio:'👨‍👦 Tio', tia:'👩‍👦 Tia', primo:'🧑 Primo/a', outro:'👤 Outro'
}

export default function PerfilPage() {
  const { session, profile, setProfile, activeChild, children, switchChild, refreshChildren, isParent, showToast } = useApp()
  const [tab, setTab] = useState('perfil')
  const [showAddChild, setShowAddChild] = useState(false)
  const [childName, setChildName] = useState('')
  const [childBirth, setChildBirth] = useState('')
  const [editingChild, setEditingChild] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBirth, setEditBirth] = useState('')
  const [editAmamentacao, setEditAmamentacao] = useState(false)
  const [editSestaFac, setEditSestaFac] = useState(false)
  const [editDeitarMin, setEditDeitarMin] = useState('')
  const [editDeitarMax, setEditDeitarMax] = useState('')
  const [inviteLink, setInviteLink] = useState(null)
  const [inviteType, setInviteType] = useState(null)
  const [familyMembers, setFamilyMembers] = useState([])
  const [caregivers, setCaregivers] = useState([])
  const [pendingCaregivers, setPendingCaregivers] = useState([])

  useEffect(() => { if (activeChild) loadFamily() }, [activeChild])

  const loadFamily = async () => {
    const [fmRes, cgRes] = await Promise.all([
      sb.from('family_members').select('*, profiles(name, role, avatar_url)').eq('child_id', activeChild.id),
      sb.from('caregivers').select('*, profiles(name, role, avatar_url)').eq('child_id', activeChild.id)
    ])
    setFamilyMembers(fmRes.data || [])
    setCaregivers((cgRes.data || []).filter(c => c.approved))
    setPendingCaregivers((cgRes.data || []).filter(c => !c.approved))
  }

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
    showToast('Foto atualizada')
  }

  const criarCrianca = async () => {
    if (!childName || !childBirth) { showToast('Preenche nome e data'); return }
    const { data: kid, error } = await sb.from('children').insert({
      name: childName, birthdate: childBirth, created_by: session.user.id,
      amamentacao: false, sesta_facultativa: false
    }).select().single()
    if (error) { showToast('Erro ao criar criança'); return }
    await sb.from('family_members').insert({
      child_id: kid.id, profile_id: session.user.id,
      is_parent: true, approved: true, added_by: session.user.id
    })
    showToast(childName + ' adicionado/a')
    setShowAddChild(false); setChildName(''); setChildBirth('')
    refreshChildren()
  }

  const abrirEditCrianca = (kid) => {
    setEditName(kid.name || '')
    setEditBirth(kid.birthdate || '')
    setEditAmamentacao(kid.amamentacao || false)
    setEditSestaFac(kid.sesta_facultativa || false)
    setEditDeitarMin(kid.deitar_min || '')
    setEditDeitarMax(kid.deitar_max || '')
    setEditingChild(true)
  }

  const guardarEditCrianca = async () => {
    if (!editName || !editBirth) { showToast('Nome e data são obrigatórios'); return }
    const { error } = await sb.from('children').update({
      name: editName, birthdate: editBirth,
      amamentacao: editAmamentacao,
      sesta_facultativa: editSestaFac,
      deitar_min: editDeitarMin || null,
      deitar_max: editDeitarMax || null,
    }).eq('id', activeChild.id)
    if (error) { showToast('Erro ao guardar'); return }
    showToast('Perfil atualizado')
    setEditingChild(false)
    refreshChildren()
  }

  const gerarConvite = async (type) => {
    if (!activeChild) return
    const { data, error } = await sb.from('invites').insert({
      child_id: activeChild.id, invite_type: type, created_by: session.user.id
    }).select().single()
    if (error) { showToast('Erro ao gerar convite'); return }
    const link = `${window.location.origin}${window.location.pathname}?invite=${data.token}`
    setInviteLink(link); setInviteType(type)
  }

  const copiarLink = () => { navigator.clipboard.writeText(inviteLink); showToast('Link copiado') }

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
        approved: false
      }, { onConflict: 'child_id,profile_id' })
    }
    await sb.from('invites').update({ used_by: session.user.id, used_at: new Date().toISOString() }).eq('token', token)
    window.history.replaceState({}, '', window.location.pathname)
    showToast(invite.invite_type === 'parent' ? 'Adicionado à família' : 'Pedido enviado para aprovação')
    refreshChildren()
  }

  const aprovarCuidador = async (cgId) => {
    await sb.from('caregivers').update({ approved: true, approved_by: session.user.id }).eq('id', cgId)
    showToast('Cuidador aprovado'); loadFamily()
  }

  const rejeitarCuidador = async (cgId) => {
    await sb.from('caregivers').delete().eq('id', cgId)
    showToast('Pedido recusado'); loadFamily()
  }

  const Toggle = ({ value, onChange }) => (
    <button onClick={() => onChange(!value)} style={{
      width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
      background: value ? 'var(--sage)' : 'var(--sand)',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0
    }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: value ? 24 : 4, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
    </button>
  )

  const Avatar = ({ url, size = 56, onUpload, emoji = '👤' }) => (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.45 }}>
        {url ? <img src={url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" /> : emoji}
      </div>
      {onUpload && (
        <label style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, background: 'var(--earth)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid white' }}>
          <span style={{ fontSize: 11, color: 'white' }}>+</span>
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onUpload} />
        </label>
      )}
    </div>
  )

  const deitarAuto = activeChild ? getDeitarRangeByWeeks(getWeeks(activeChild.birthdate)) : null
  const fmtT = m => { if (m == null) return ''; m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') }

  return (
    <div className="page-content">
      <div style={{ display: 'flex', background: 'var(--warm)', borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {[['perfil', 'Perfil'], ['crianca', 'Criança'], ['familia', 'Família']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: '9px', borderRadius: 9, border: 'none',
            fontFamily: 'Instrument Sans, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: tab === k ? 'white' : 'transparent',
            color: tab === k ? 'var(--earth)' : 'var(--muted)',
            boxShadow: tab === k ? 'var(--shadow)' : 'none'
          }}>{l}</button>
        ))}
      </div>

      {/* PERFIL */}
      {tab === 'perfil' && profile && (
        <>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20 }}>
            <Avatar url={profile.avatar_url} size={72} onUpload={e => handleAvatarUpload(e, 'profile', session.user.id)} />
            <div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 400 }}>{profile.name}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{ROLE_LABELS[profile.role] || profile.role}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{session.user.email}</div>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => sb.auth.signOut()}>Sair da conta</button>
        </>
      )}

      {/* CRIANÇA */}
      {tab === 'crianca' && (
        <>
          {children.map(kid => (
            <div key={kid.id} className="card" style={{ padding: 16, borderColor: activeChild?.id === kid.id ? 'var(--earth)' : 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div onClick={() => switchChild(kid)} style={{ cursor: 'pointer' }}>
                  <Avatar url={kid.avatar_url} size={52} emoji="👶"
                    onUpload={isParent(kid.id) ? e => handleAvatarUpload(e, 'child', kid.id) : null} />
                </div>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => switchChild(kid)}>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 400 }}>{kid.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{kid.birthdate?.split('-').reverse().join('/')}</div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                    {kid.amamentacao && <span style={{ fontSize: 10, background: 'rgba(143,179,200,0.15)', color: 'var(--sky)', border: '1px solid rgba(143,179,200,0.3)', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>🤱 Amamentação</span>}
                    {kid.sesta_facultativa && <span style={{ fontSize: 10, background: 'rgba(139,111,71,0.1)', color: 'var(--earth)', border: '1px solid rgba(139,111,71,0.2)', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>💤 Sesta facultativa</span>}
                    {(kid.deitar_min || kid.deitar_max) && <span style={{ fontSize: 10, background: 'rgba(122,158,126,0.1)', color: 'var(--sage)', border: '1px solid rgba(122,158,126,0.2)', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>🌙 {kid.deitar_min || '–'}–{kid.deitar_max || '–'}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  {activeChild?.id === kid.id && <span style={{ color: 'var(--earth)', fontSize: 18 }}>✓</span>}
                  {isParent(kid.id) && (
                    <button onClick={() => { switchChild(kid); abrirEditCrianca(kid) }}
                      style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--warm)', color: 'var(--earth)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>✏️ Editar</button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {editingChild && activeChild && (
            <div className="card" style={{ borderColor: 'var(--earth)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>✏️ Editar {activeChild.name}</div>
                <button onClick={() => setEditingChild(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div className="section-label">Nome</div>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div className="section-label">Data de nascimento</div>
                <input type="date" value={editBirth} onChange={e => setEditBirth(e.target.value)} />
              </div>
              {[
                { label: '🤱 Está a amamentar', val: editAmamentacao, set: setEditAmamentacao, desc: 'Mostra o menu de Amamentação' },
                { label: '💤 Sesta facultativa', val: editSestaFac, set: setEditSestaFac, desc: 'Indica que a sesta não é obrigatória' },
              ].map(({ label, val, set, desc }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{desc}</div>
                  </div>
                  <Toggle value={val} onChange={set} />
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>🌙 Hora de deitar personalizada</div>
                {deitarAuto && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                    Auto por idade: <strong>{fmtT(deitarAuto.min)}–{fmtT(deitarAuto.max)}</strong>. Preenche para personalizar.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div className="section-label">Mínimo</div>
                    <input type="time" value={editDeitarMin} onChange={e => setEditDeitarMin(e.target.value)} />
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 16 }}>–</div>
                  <div style={{ flex: 1 }}>
                    <div className="section-label">Máximo</div>
                    <input type="time" value={editDeitarMax} onChange={e => setEditDeitarMax(e.target.value)} />
                  </div>
                  {(editDeitarMin || editDeitarMax) && (
                    <button onClick={() => { setEditDeitarMin(''); setEditDeitarMax('') }}
                      style={{ marginTop: 16, padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--warm)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Repor</button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setEditingChild(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                <button onClick={guardarEditCrianca} className="btn btn-primary" style={{ flex: 2 }}>Guardar</button>
              </div>
            </div>
          )}

          {!showAddChild && !editingChild && (
            <button className="btn btn-ghost" onClick={() => setShowAddChild(true)}>+ Adicionar criança</button>
          )}
          {showAddChild && (
            <div className="card">
              <div className="card-title">👶 Nova criança</div>
              <div style={{ marginBottom: 10 }}><div className="section-label">Nome</div><input type="text" value={childName} onChange={e => setChildName(e.target.value)} placeholder="Nome do bebé" /></div>
              <div style={{ marginBottom: 14 }}><div className="section-label">Data de nascimento</div><input type="date" value={childBirth} onChange={e => setChildBirth(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setShowAddChild(false)} style={{ flex: 1 }}>Cancelar</button>
                <button className="btn btn-primary" onClick={criarCrianca} style={{ flex: 1 }}>Criar</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* FAMÍLIA */}
      {tab === 'familia' && activeChild && (
        <>
          {isParent(activeChild.id) && pendingCaregivers.length > 0 && (
            <div className="card" style={{ borderColor: 'rgba(196,162,64,0.4)', background: 'rgba(196,162,64,0.05)' }}>
              <div className="card-title" style={{ color: 'var(--warn)' }}>⏳ Pedidos pendentes</div>
              {pendingCaregivers.map(cg => (
                <div key={cg.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div className="avatar" style={{ width: 40, height: 40, fontSize: 18 }}>
                    {cg.profiles?.avatar_url ? <img src={cg.profiles.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" /> : '👤'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{cg.profiles?.name || 'Utilizador'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ROLE_LABELS[cg.profiles?.role] || ''} · pede acesso</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => aprovarCuidador(cg.id)} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--sage)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>✓</button>
                    <button onClick={() => rejeitarCuidador(cg.id)} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(192,97,78,0.1)', color: 'var(--danger)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {familyMembers.length > 0 && (
            <div className="card">
              <div className="card-title">👨‍👩‍👧 Família</div>
              {familyMembers.map(fm => (
                <div key={fm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div className="avatar" style={{ width: 40, height: 40, fontSize: 18 }}>
                    {fm.profiles?.avatar_url ? <img src={fm.profiles.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" /> : '👤'}
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
          {caregivers.length > 0 && (
            <div className="card">
              <div className="card-title">🤝 Cuidadores</div>
              {caregivers.map(cg => (
                <div key={cg.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div className="avatar" style={{ width: 40, height: 40, fontSize: 18 }}>
                    {cg.profiles?.avatar_url ? <img src={cg.profiles.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} alt="" /> : '👤'}
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
          {isParent(activeChild.id) && (
            <div className="card">
              <div className="card-title">🔗 Convidar</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: inviteLink ? 12 : 0 }}>
                <button className="btn btn-secondary" onClick={() => gerarConvite('parent')} style={{ flex: 1, fontSize: 13 }}>👨‍👩‍👧 Pai/Mãe</button>
                <button className="btn btn-secondary" onClick={() => gerarConvite('caregiver')} style={{ flex: 1, fontSize: 13 }}>🤝 Cuidador</button>
              </div>
              {inviteLink && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{inviteType === 'parent' ? 'Acesso total de pai/mãe' : 'Precisa de aprovação dos pais'}</div>
                  <div style={{ background: 'var(--warm)', borderRadius: 10, padding: '10px 12px', fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 8 }}>{inviteLink}</div>
                  <button className="btn btn-sage" onClick={copiarLink} style={{ fontSize: 13 }}>📋 Copiar link</button>
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
