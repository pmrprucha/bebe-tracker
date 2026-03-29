import { sb } from './supabase'
import { today } from './sleep'

// Lado label
export const LADO_LABELS = { E: 'Esquerdo', D: 'Direito', A: 'Ambos', M: 'Mamadeira' }

// Busca a última alimentação do dia (amamentação OU refeição, o mais recente)
// Retorna: { ms, tipo, detalhe, hora } ou null
export async function getUltimaAlimentacao(childId) {
  const [feedsRes, mealsRes] = await Promise.all([
    sb.from('feeds')
      .select('hora, duracao_seg, lado, created_at')
      .eq('child_id', childId)
      .eq('data_date', today())
      .order('created_at', { ascending: false })
      .limit(1),
    sb.from('meals')
      .select('hora, obs, descricao, created_at')
      .eq('child_id', childId)
      .eq('data_date', today())
      .order('hora', { ascending: false })
      .limit(1)
  ])

  let candidates = []

  // Amamentação — usar created_at + duracao para saber quando terminou
  const feed = feedsRes.data?.[0]
  if (feed) {
    const endMs = feed.created_at
      ? new Date(feed.created_at).getTime() + (feed.duracao_seg || 0) * 1000
      : horaToMs(feed.hora)
    if (endMs) {
      candidates.push({
        ms: endMs,
        tipo: 'Amamentação',
        detalhe: feed.lado ? (LADO_LABELS[feed.lado] || feed.lado) : '',
        hora: feed.hora
      })
    }
  }

  // Refeição
  const meal = mealsRes.data?.[0]
  if (meal) {
    const mealMs = horaToMs(meal.hora)
    if (mealMs) {
      candidates.push({
        ms: mealMs,
        tipo: 'Refeição',
        detalhe: meal.obs || meal.descricao || '',
        hora: meal.hora
      })
    }
  }

  if (!candidates.length) return null

  // Retorna o mais recente
  return candidates.reduce((a, b) => a.ms > b.ms ? a : b)
}

function horaToMs(hora) {
  if (!hora) return null
  const [h, m] = hora.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export function fmtSinceShort(secs) {
  if (!secs || secs < 0) return null
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const h = Math.floor(m / 60)
  if (h === 0) return `${m}min`
  return `${h}h${m % 60 > 0 ? ` ${m % 60}min` : ''}`
}
