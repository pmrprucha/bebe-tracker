// Plano evolutivo baseado em semanas de vida
export function getPlanoByWeeks(semanas) {
  if (semanas < 8)  return { sestas:4, w1:45,  d1:45,  w2:60,  d2:45,  w3:60,  d3:45,  w4:60,  d4:30, wN:60,  label:'Recém-nascido',    desc:'4 sestas curtas, ciclos de ~3h' }
  if (semanas < 12) return { sestas:4, w1:50,  d1:60,  w2:70,  d2:60,  w3:70,  d3:45,  w4:60,  d4:30, wN:75,  label:'2–3 meses',         desc:'4 sestas, janela a crescer' }
  if (semanas < 16) return { sestas:3, w1:75,  d1:75,  w2:90,  d2:75,  w3:90,  d3:30,  wN:90,  label:'3–4 meses',         desc:'3 sestas, transição importante' }
  if (semanas < 20) return { sestas:3, w1:90,  d1:90,  w2:100, d2:90,  w3:100, d3:30,  wN:100, label:'4–5 meses',         desc:'3 sestas longas' }
  if (semanas < 24) return { sestas:3, w1:110, d1:70,  w2:120, d2:60,  w3:130, d3:30,  wN:140, label:'5–6 meses',         desc:'3 sestas, janelas a crescer' }
  if (semanas < 30) return { sestas:3, w1:130, d1:60,  w2:140, d2:60,  w3:140, d3:30,  wN:160, label:'6–7 meses',         desc:'3 sestas — prestes a passar a 2' }
  if (semanas < 36) return { sestas:2, w1:150, d1:90,  w2:180, d2:90,  wN:180, label:'7–9 meses',         desc:'2 sestas — transição típica 7–8 meses' }
  if (semanas < 44) return { sestas:2, w1:180, d1:90,  w2:210, d2:90,  wN:200, label:'9–11 meses',        desc:'2 sestas consolidadas' }
  if (semanas < 52) return { sestas:2, w1:200, d1:90,  w2:220, d2:75,  wN:210, label:'11–12 meses',       desc:'2 sestas — prestes a passar a 1' }
  if (semanas < 65) return { sestas:1, w1:210, d1:120, wN:240, label:'12–15 meses',       desc:'1 sesta longa a meio do dia' }
  if (semanas < 78) return { sestas:1, w1:240, d1:105, wN:255, label:'15–18 meses',       desc:'1 sesta — janela de acordar longa' }
  if (semanas < 104)return { sestas:1, w1:270, d1:90,  wN:270, label:'18–24 meses',       desc:'1 sesta curta' }
  if (semanas < 130)return { sestas:0, w1:300, d1:60,  wN:300, label:'2–3 anos',          desc:'Sesta facultativa — varia por dia' }
  return                    { sestas:0, w1:360, d1:0,   wN:360, label:'+3 anos',           desc:'Sem sesta habitual' }
}

// Deitar recomendado por faixa etária (min e max em minutos desde meia-noite)
export function getDeitarRangeByWeeks(semanas) {
  if (semanas < 16)  return { min: 18*60+30, max: 19*60+30, label:'18:30–19:30' }
  if (semanas < 36)  return { min: 19*60,    max: 20*60,    label:'19:00–20:00' }
  if (semanas < 65)  return { min: 19*60+30, max: 20*60+30, label:'19:30–20:30' }
  if (semanas < 104) return { min: 19*60+30, max: 20*60,    label:'19:30–20:00' }
  if (semanas < 130) return { min: 20*60,    max: 21*60,    label:'20:00–21:00' }
  return                    { min: 20*60,    max: 21*60+30, label:'20:00–21:30' }
}

export function getSleepQuality(realMins, expectedMins) {
  if (!realMins || !expectedMins) return null
  const pct = (realMins - expectedMins) / expectedMins
  if (pct >= 0.25)  return { label:'Sesta longa! 🌟',     color:'#5a9e6e', bg:'rgba(90,158,110,0.1)',  short:false }
  if (pct >= -0.1)  return { label:'Boa sesta ✓',         color:'#7a9e7e', bg:'rgba(122,158,126,0.1)', short:false }
  if (pct >= -0.3)  return { label:'Sesta curta',          color:'#c4a240', bg:'rgba(196,162,64,0.1)',  short:true  }
  return                    { label:'Sesta muito curta ⚠️', color:'#c06050', bg:'rgba(192,96,80,0.1)',  short:true  }
}

export function calcSestas(acordouMins, plano, realTimes) {
  const p = plano
  const numSestas = p.sestas
  const result = { sestas:[], deitar:null, alertas:[] }

  const s1Alvo = acordouMins + p.w1
  const s1Dur  = realTimes.s1_fim && realTimes.s1_ini ? timeDiff(realTimes.s1_ini, realTimes.s1_fim) : null
  const s1Fim  = realTimes.s1_fim ? toMins(realTimes.s1_fim)
    : realTimes.s1_ini ? toMins(realTimes.s1_ini) + (p.d1||60) : s1Alvo + (p.d1||60)

  result.sestas.push({ n:1, alvo:s1Alvo, durAlvo:p.d1, ini:realTimes.s1_ini, fim:realTimes.s1_fim, durReal:s1Dur, quality:getSleepQuality(s1Dur, p.d1) })

  if (numSestas >= 2) {
    const s2Alvo = s1Fim + (p.w2||140)
    const s2Dur  = realTimes.s2_fim && realTimes.s2_ini ? timeDiff(realTimes.s2_ini, realTimes.s2_fim) : null
    const s2Fim  = realTimes.s2_fim ? toMins(realTimes.s2_fim)
      : realTimes.s2_ini ? toMins(realTimes.s2_ini) + (p.d2||90) : s2Alvo + (p.d2||90)

    result.sestas.push({ n:2, alvo:s2Alvo, durAlvo:p.d2, ini:realTimes.s2_ini, fim:realTimes.s2_fim, durReal:s2Dur, quality:getSleepQuality(s2Dur, p.d2) })

    if (numSestas >= 3) {
      const s3Alvo = s2Fim + (p.w3||140)
      const s3Dur  = realTimes.s3_fim && realTimes.s3_ini ? timeDiff(realTimes.s3_ini, realTimes.s3_fim) : null
      const s3Fim  = realTimes.s3_fim ? toMins(realTimes.s3_fim)
        : realTimes.s3_ini ? toMins(realTimes.s3_ini) + (p.d3||30) : s3Alvo + (p.d3||30)

      result.sestas.push({ n:3, alvo:s3Alvo, durAlvo:p.d3, ini:realTimes.s3_ini, fim:realTimes.s3_fim, durReal:s3Dur, quality:getSleepQuality(s3Dur, p.d3) })
      result.deitar = s3Fim + (p.wN||160)

      if (realTimes.s3_fim && toMins(realTimes.s3_fim) > 17*60+15)
        result.alertas.push('Cortar 3ª sesta — acabou depois das 17:15')
      else if (realTimes.s3_ini && toMins(realTimes.s3_ini) > 16*60+45)
        result.alertas.push('3ª sesta tardia — iniciou depois das 16:45')
    } else {
      result.deitar = s2Fim + (p.wN||200)
    }
  } else if (numSestas === 1) {
    result.deitar = s1Fim + (p.wN||240)
  } else {
    // 0 sestas (2+ anos) — deitar baseado apenas no tempo acordado
    result.deitar = acordouMins + (p.wN||720) // ~12h depois de acordar
  }

  return result
}

export const toMins    = t => { if (!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m }
export const fromMins  = m => { if (m==null) return '–'; m=((m%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0') }
export const timeDiff  = (ini,fim) => { if (!ini||!fim) return null; const d=toMins(fim)-toMins(ini); return d>0?d:null }
export const formatDur = m => { if (!m) return '–'; const h=Math.floor(m/60), min=m%60; if(h===0) return `${min}min`; return min===0?`${h}h`:`${h}h${min}min` }
export const getWeeks  = b => Math.floor((new Date()-new Date(b))/(7*24*3600*1000))
export const getAgeLabel = b => { const d=Math.floor((new Date()-new Date(b))/(24*3600*1000)); const m=Math.floor(d/30.44); if(m<2) return Math.floor(d/7)+' sem'; if(m<24) return m+' m'; return Math.floor(m/12)+' anos' }
export const today    = () => new Date().toISOString().slice(0,10)
export const nowHHMM  = () => { const d=new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0') }
export const fmtSecs  = s => String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')
