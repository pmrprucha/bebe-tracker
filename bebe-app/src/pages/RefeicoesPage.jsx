import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { today, nowHHMM } from '../lib/sleep'

export default function RefeicoesPage() {
  const { activeChild, profile, showToast } = useApp()
  const [meals, setMeals]   = useState([])
  const [obs, setObs]       = useState('')
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (activeChild) loadToday() }, [activeChild])

  const loadToday = async () => {
    const { data } = await sb
      .from('meals')
      .select('*')
      .eq('child_id', activeChild.id)
      .eq('data_date', today())
      .order('hora', { ascending: true })

    if (data?.length) {
      setMeals(data.map(r => ({ id: r.id, hora: r.hora, descricao: r.descricao, obs: r.obs || '' })))
      setObs(data[0]?.obs || '')
      setSaved(true)
    } else {
      setMeals([{ hora: nowHHMM(), descricao: '', obs: '' }])
    }
  }

  const addMeal = () => setMeals(prev => [...prev, { hora: nowHHMM(), descricao: '', obs: '' }])
  const delMeal = i => setMeals(prev => prev.filter((_, idx) => idx !== i))
  const updateMeal = (i, field, val) => setMeals(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m))

  const guardar = async () => {
    const valid = meals.filter(m => m.descricao.trim())
    if (!valid.length) { showToast('Adiciona pelo menos uma refeição'); return }
    setSaving(true)

    // delete existing for today and re-insert
    await sb.from('meals').delete().eq('child_id', activeChild.id).eq('data_date', today())
    const { error } = await sb.from('meals').insert(
      valid.map(m => ({
        child_id: activeChild.id,
        data_date: today(),
        hora: m.hora,
        descricao: m.descricao,
        obs,
        recorded_by: profile?.id
      }))
    )
    setSaving(false)
    if (error) { showToast('Erro ao guardar'); return }
    showToast('Refeições guardadas ✓')
    setSaved(true)
  }

  if (!activeChild) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">👶</div><p>Seleciona uma criança primeiro</p></div>
    </div>
  )

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-title">🥣 Refeições de hoje</div>
        {meals.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input type="time" value={m.hora} onChange={e => updateMeal(i, 'hora', e.target.value)}
              style={{ width: 90, flexShrink: 0, textAlign: 'center', fontSize: 14 }} />
            <input type="text" value={m.descricao} onChange={e => updateMeal(i, 'descricao', e.target.value)}
              placeholder="o que comeu…" style={{ flex: 1 }} />
            {meals.length > 1 && (
              <button onClick={() => delMeal(i)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>✕</button>
            )}
          </div>
        ))}
        <button className="btn btn-ghost" onClick={addMeal} style={{ marginTop: 4 }}>+ Adicionar refeição</button>
      </div>

      <div className="card">
        <div className="card-title">📝 Notas de alimentação</div>
        <textarea value={obs} onChange={e => setObs(e.target.value)}
          placeholder="apetite, novos alimentos, recusas, alergias…" />
      </div>

      <button className="btn btn-primary" onClick={guardar} disabled={saving}>
        {saving ? '…' : '💾 Guardar refeições'}
      </button>
    </div>
  )
}
