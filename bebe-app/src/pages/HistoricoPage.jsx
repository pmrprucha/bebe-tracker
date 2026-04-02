import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { fromMins, toMins, formatDur, fmtSecs, getWeeks, getAgeLabel } from '../lib/sleep'

const TIPO_ICONS = { sintoma: '🤒', medicamento: '💊', consulta: '👨‍⚕️', vacina: '💉', outro: '📋' }
const LADO_L = { E: 'Esq.', D: 'Dir.', A: 'Ambos', M: 'Mamad.' }
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function fmtDate(d) {
  const dt = new Date(d + 'T12:00')
  return DAYS[dt.getDay()] + ' ' + d.split('-').reverse().join('/')
}

export default function HistoricoPage() {
  const { activeChild, canViewHistory } = useApp()
  const [days, setDays]       = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter]   = useState('all') // all | sono | mamadas | medico | refeicoes
  const [page, setPage]       = useState(0)
  const PAGE_SIZE = 14

  useEffect(() => { if (activeChild) load() }, [activeChild, filter, page])

  const load = async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    // Fetch all types in parallel
    const [sleepRes, feedsRes, mealsRes, medRes] = await Promise.all([
      (filter === 'all' || filter === 'sono')
        ? sb.from('sleep_events').select('*, profiles(name)').eq('child_id', activeChild.id).order('data_date', { ascending: false }).range(from, to)
        : { data: [] },
      (filter === 'all' || filter === 'mamadas')
                ? sb.from('feeds').select('*, profiles(name)').eq('child_id', activeChild.id).order('data_date', { ascending: false }).order('hora', { ascending: false }).order('created_at', { ascending: false })
        : { data: [] },
      (filter === 'all' || filter === 'refeicoes')
        ? sb.from('meals').select('*, profiles(name)').eq('child_id', activeChild.id).order('data_date', { ascending: false })
        : { data: [] },
      (filter === 'all' || filter === 'medico')
        ? sb.from('medical_records').select('*, profiles(name)').eq('child_id', activeChild.id).order('data_date', { ascending: false }).order('created_at', { ascending: false })
        : { data: [] },
    ])

    // Group by date
    const allDates = new Set([
      ...(sleepRes.data || []).map(r => r.data_date),
      ...(feedsRes.data || []).map(r => r.data_date),
      ...(mealsRes.data || []).map(r => r.data_date),
      ...(medRes.data || []).map(r => r.data_date),
    ])

    const grouped = [...allDates].sort((a, b) => b.localeCompare(a)).map(date => ({
      date,
      sleep: (sleepRes.data || []).find(r => r.data_date === date) || null,
      feeds: (feedsRes.data || []).filter(r => r.data_date === date),
      meals: (mealsRes.data || []).filter(r => r.data_date === date),
      medical: (medRes.data || []).filter(r => r.data_date === date),
    }))

    setDays(page === 0 ? grouped : prev => [...prev, ...grouped])
    setLoading(false)
  }

  const totalFeeds  = days.reduce((a, d) => a + d.feeds.length, 0)
  const totalMedico = days.reduce((a, d) => a + d.medical.length, 0)

  if (!activeChild) return (
    <div className="page-content">
      <div className="empty-state"><div className="e-icon">👶</div><p>Seleciona uma criança primeiro</p></div>
    </div>
  )

  if (!canViewHistory(activeChild.id)) return (
    <div className="page-content">
      <div className="alert alert-warn">
        🔒 Só os pais e cuidadores aprovados têm acesso ao histórico completo.
      </div>
    </div>
  )

  return (
    <div className="page-content">

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { num: getWeeks(activeChild.birthdate), label: 'semanas' },
          { num: days.filter(d => d.sleep).length, label: 'dias reg.' },
          { num: totalFeeds, label: 'mamadas' },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: '12px 8px', textAlign: 'center', marginBottom: 0 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 300, color: 'var(--earth)', lineHeight: 1 }}>{s.num}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 12 }}>
        {[
          ['all', '📋 Tudo'],
          ['sono', '🌙 Sono'],
          ['mamadas', '🍼 Mamadas'],
          ['refeicoes', '🥣 Refeições'],
          ['medico', '🩺 Saúde'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => { setFilter(k); setPage(0); setDays([]) }} style={{
            padding: '6px 12px', borderRadius: 20, border: '1px solid',
            borderColor: filter === k ? 'var(--earth)' : 'var(--border)',
            background: filter === k ? 'rgba(139,111,71,0.1)' : 'var(--warm)',
            color: filter === k ? 'var(--earth)' : 'var(--muted)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0
          }}>{l}</button>
        ))}
      </div>

      {/* Days */}
      {days.length === 0 && !loading && (
        <div className="empty-state"><div className="e-icon">📋</div><p>Ainda sem registos</p></div>
      )}

      {days.map(d => (
        <div key={d.date} className="card" style={{ padding: 14 }}>

          {/* Date header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 400, color: 'var(--deep)' }}>{fmtDate(d.date)}</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {d.sleep  && <span className="badge badge-sage">🌙</span>}
              {d.feeds.length > 0  && <span className="badge badge-sky">🍼{d.feeds.length}</span>}
              {d.meals.length > 0  && <span className="badge badge-earth">🥣</span>}
              {d.medical.length > 0 && <span className="badge badge-danger">🩺{d.medical.length}</span>}
            </div>
          </div>

          {/* Sleep */}
          {d.sleep && (() => {
            const p = d.sleep.payload
            return (
              <div style={{ marginBottom: d.feeds.length || d.meals.length || d.medical.length ? 12 : 0 }}>
                <div className="section-label" style={{ marginBottom: 6 }}>🌙 Sono</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {[
                    ['Acordou', p.acordou],
                    ['Deitar alvo', p.deitar],
                    p.s1_ini && ['1ª sesta', (p.s1_ini || '?') + '→' + (p.s1_fim || '?')],
                    p.s2_ini && ['2ª sesta', (p.s2_ini || '?') + '→' + (p.s2_fim || '?')],
                    p.s3_ini && ['3ª sesta', (p.s3_ini || '?') + '→' + (p.s3_fim || '?')],
                    p.dormiu  && ['Dormiu', p.dormiu],
                  ].filter(Boolean).map(([label, val]) => (
                    <div key={label} style={{ background: 'var(--warm)', borderRadius: 8, padding: '7px 9px' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace', color: 'var(--deep)', marginTop: 2 }}>{val || '–'}</div>
                    </div>
                  ))}
                </div>
                {p.alertas?.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>⚠️ {p.alertas.join(' · ')}</div>
                )}
                {p.obs && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>📝 {p.obs}</div>}
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, textAlign: 'right' }}>por {d.sleep.profiles?.name || '–'}</div>
              </div>
            )
          })()}

          {/* Feeds */}
          {d.feeds.length > 0 && (
            <div style={{ marginBottom: d.meals.length || d.medical.length ? 12 : 0 }}>
              {d.sleep && <div className="divider" />}
              <div className="section-label" style={{ marginBottom: 6 }}>🍼 Mamadas ({d.feeds.length})</div>
              {d.feeds.map(f => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--earth)' }}>{f.hora}</span>
                  <span>{fmtSecs(f.duracao_seg || 0)}</span>
                  <span style={{ color: 'var(--muted)' }}>{f.lado ? (LADO_L[f.lado] || f.lado) : '–'}</span>
                  <span style={{ color: 'var(--muted)' }}>{f.profiles?.name || ''}</span>
                </div>
              ))}
            </div>
          )}

          {/* Meals */}
          {d.meals.length > 0 && (
            <div style={{ marginBottom: d.medical.length ? 12 : 0 }}>
              {(d.sleep || d.feeds.length) && <div className="divider" />}
              <div className="section-label" style={{ marginBottom: 6 }}>🥣 Refeições</div>
              {d.meals.map(m => (
                <div key={m.id} style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--earth)', minWidth: 38 }}>{m.hora}</span>
                  <span>{m.descricao}</span>
                </div>
              ))}
              {d.meals[0]?.obs && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>📝 {d.meals[0].obs}</div>}
            </div>
          )}

          {/* Medical */}
          {d.medical.length > 0 && (
            <div>
              {(d.sleep || d.feeds.length || d.meals.length) && <div className="divider" />}
              <div className="section-label" style={{ marginBottom: 6 }}>🩺 Saúde</div>
              {d.medical.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{TIPO_ICONS[r.tipo] || '📋'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.titulo} {r.valor ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--earth)' }}>{r.valor}</span> : ''}</div>
                    {r.descricao && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.descricao}</div>}
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.hora || ''}{r.profiles?.name ? ' · ' + r.profiles.name : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {loading && <div className="spinner" />}

      {!loading && days.length >= PAGE_SIZE && (
        <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)}>
          Carregar mais
        </button>
      )}
    </div>
  )
}
