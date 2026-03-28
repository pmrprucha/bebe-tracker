# 🌿 Bebé App — Setup Completo

Tempo estimado: **20 minutos**. Tudo gratuito.

---

## Estrutura do projeto

```
bebe-app/
├── src/
│   ├── lib/
│   │   ├── supabase.js      ← cliente Supabase + SQL schema nos comentários
│   │   ├── sleep.js         ← lógica de sestas evolutiva
│   │   └── AppContext.jsx   ← estado global (auth, perfil, criança)
│   ├── pages/
│   │   ├── AuthPage.jsx     ← login / registo
│   │   ├── SonoPage.jsx     ← sono + timers de sestas
│   │   ├── MamadasPage.jsx  ← timer mamadas
│   │   ├── MedicoPage.jsx   ← registos médicos
│   │   └── PerfilPage.jsx   ← perfil, criança, família, convites
│   ├── App.jsx              ← shell, navegação
│   ├── main.jsx             ← entry point
│   └── index.css            ← estilos globais
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── .env.example
```

---

## PARTE 1 — Supabase

### 1.1 Criar projeto
1. **supabase.com** → criar conta → **New project**
2. Nome: `bebe-tracker`, região: **West EU (Ireland)**
3. Aguarda ~2 minutos

### 1.2 Criar tabelas
1. **SQL Editor** → **New query**
2. Abre o ficheiro `src/lib/supabase.js`
3. Copia o bloco SQL dentro dos comentários `/* ... */` (linhas 9 a 130 aproximadamente)
4. Cola no SQL Editor e clica **Run**
5. Resultado: "Success. No rows returned." ✓

### 1.3 Ativar Email Auth
1. **Authentication** → **Providers** → **Email** → deve estar ativo por defeito
2. Em **Authentication** → **URL Configuration**:
   - Site URL: `https://bebe-tracker-XXXXX.vercel.app` (preenches depois)
   - Redirect URLs: adicionar o mesmo URL

### 1.4 Copiar credenciais
1. **Project Settings** → **API**
2. Copia **Project URL** e **anon public key**

---

## PARTE 2 — GitHub

### 2.1 Criar repositório
1. **github.com/pmrprucha** → **New repository**
2. Nome: `bebe-tracker`, visibilidade: **Public** (ou Private — ambos funcionam com Vercel)
3. **Create repository**

### 2.2 Upload dos ficheiros
**Opção A — Interface web (mais simples):**
1. No repositório, clica **"uploading an existing file"**
2. Arrasta a pasta `bebe-app/` inteira (ou os ficheiros todos)
3. Commit changes

**Opção B — Terminal (se tens Git):**
```bash
cd bebe-app
git init
git remote add origin https://github.com/pmrprucha/bebe-tracker.git
git add .
git commit -m "initial commit"
git push -u origin main
```

---

## PARTE 3 — Vercel (hosting + build)

### 3.1 Criar conta e ligar GitHub
1. **vercel.com** → criar conta com GitHub
2. **Add New Project** → seleciona `pmrprucha/bebe-tracker`
3. Framework preset: **Vite** (detecta automaticamente)
4. Root directory: `bebe-app` (se fizeste upload da pasta inteira)

### 3.2 Variáveis de ambiente
Antes de fazer deploy, adiciona em **Environment Variables**:
```
VITE_SUPABASE_URL        = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY   = eyJhbGci…
```

### 3.3 Deploy
1. Clica **Deploy**
2. Aguarda ~1 minuto
3. Recebes o URL: `https://bebe-tracker-xxx.vercel.app`

### 3.4 Atualizar Supabase com o URL final
1. Volta ao Supabase → **Authentication** → **URL Configuration**
2. Atualiza o **Site URL** com o URL da Vercel
3. Adiciona o URL em **Redirect URLs**

---

## PARTE 4 — Primeira utilização

### Fluxo da Mãe (criadora)
1. Abre o URL no telemóvel
2. **Criar conta** → preenche nome, escolhe "Mãe", email, password
3. Vai a **Perfil → Criança → Adicionar criança**
4. Preenche nome e data de nascimento → **Criar**
5. A mãe fica automaticamente como pai/mãe com acesso total

### Fluxo do Pai
1. Abre o URL, cria conta (escolhe "Pai")
2. A mãe vai a **Perfil → Família → Convidar → Pai/Mãe**
3. Gera link e envia ao pai por WhatsApp
4. O pai abre o link → fica automaticamente no agregado com acesso total ao histórico

### Fluxo da Avó
1. Abre o URL, cria conta (escolhe "Avó")
2. A mãe vai a **Perfil → Família → Convidar → Cuidador**
3. Gera link e envia à avó
4. A avó abre o link → pedido enviado para aprovação
5. A mãe recebe notificação em **Perfil → Família → Pedidos pendentes** → aprova
6. Depois de aprovada, a avó tem acesso ao histórico completo

---

## Permissões resumidas

| Perfil         | Regista | Histórico | Gestão família |
|----------------|---------|-----------|----------------|
| Pai / Mãe      | ✓       | ✓         | ✓              |
| Cuidador aprov.| ✓       | ✓         | ✗              |
| Cuidador pend. | ✗       | ✗         | ✗              |

---

## Adicionar ao ecrã inicial

**iPhone (Safari):** Partilhar ↑ → "Adicionar ao ecrã principal"
**Android (Chrome):** Menu ⋮ → "Adicionar ao ecrã inicial"

---

## Mensagem para partilhar

```
🌿 App do bebé

Link: https://bebe-tracker-xxx.vercel.app

1. Cria conta (escolhe o teu papel)
2. Espera que eu te envie o link de convite
3. Abre o link e fica ligado/a automaticamente

Qualquer dúvida fala com o Pedro!
```

---

## Updates futuros
Sempre que alterares código e fizeres push para o GitHub,
a Vercel faz deploy automático em ~1 minuto.
