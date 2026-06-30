/**
 * NIT EFETIVO — efetivo.js
 * Módulo de Controle Operacional de Efetivo
 * v1.0 MVP · 28/06/2026
 *
 * Namespace: NIT_EFETIVO (exposto globalmente para onclick no HTML)
 * Padrão: IIFE com API pública mínima
 */

const NIT_EFETIVO = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // CONFIG
  // ═══════════════════════════════════════════════════════════════
  const CFG = {
    firebase: {
      apiKey:            'AIzaSyCWAGfmCr-pHr0asIk_Sfz1WbajIEhiZn0',
      authDomain:        'nit-operacional.firebaseapp.com',
      databaseURL:       'https://nit-operacional-default-rtdb.firebaseio.com',
      projectId:         'nit-operacional',
      storageBucket:     'nit-operacional.appspot.com',
      messagingSenderId: '823046484118',
      appId:             '1:823046484118:web:487159cabb28ae275bd2b7'
    },
    TURNOS: {
      manha: { label:'MANHÃ',  inicio:'05:30', fim:'11:30', minI:330,  minF:690  },
      tarde: { label:'TARDE',  inicio:'10:30', fim:'16:30', minI:630,  minF:990  },
      noite: { label:'NOITE',  inicio:'15:30', fim:'21:30', minI:930,  minF:1290 }
    },
    TIPOS_ACAO: [
      'CONTROLE', 'BLOQUEIO', 'BLOQUEIO/DESVIO', 'BLOQUEIO/CONTROLE',
      'CONTROLE/COIBIR DIREITA', 'BLOQUEIO NA LARGADA', 'CONTROLE NA'
    ],
    STATUS_RECURSO: ['disponivel','escalado','ausente','afastado','desligado'],
    STATUS_COLORS: { disponivel:'success', escalado:'accent', ausente:'warning',
                      afastado:'muted', desligado:'danger' },
    CARGOS: ['SUPERVISOR','AUXILIAR','MOTOCICLISTA','MONITOR','ORIENTADOR'],

    // 17 categorias do modelo oficial de Relatório Mensal da AMC —
    // nomes exatamente como as abas do arquivo original, pois é isso
    // que determina o roteamento de cada QRU pro relatório certo.
    TIPOS_MISSAO: [
      'CONTROLE DE TRAFEGO', 'OPERAÇÃO SEMAFORICA', 'APOIO A OBRA',
      'RESERVA DE VAGAS', 'OPER CICLOFAIXA DO LAZER', 'COLISÃO SEM VITIMA',
      'APOIO AO JOGO', 'APOIO A EVENTO', 'APOIO A OUTROS ORGÃOS',
      'FIOS CAIDOS NA VIA', 'POSTE CAIDO NA VIA', 'MANIFESTAÇÃO',
      'APOIO A PODA', 'INCENDIO', 'ARVORE CAIDA NA VIA',
      'DILIGENCIA', 'OLEO NA PISTA'
    ],

    // 106 bairros oficiais — extraídos do modelo original (aba BAIRROS).
    // QRUs com bairro fora desta lista caem num bucket separado no
    // relatório ("BAIRRO NÃO RECONHECIDO"), sem perder dado nenhum.
    BAIRROS_OFICIAL: [
      'AEROLANDIA','AEROPORTO','ALDEOTA','ALVARO WEYNE','ANCURI','ALTO ALEGRE',
      'ANTONIO BEZERRA','ARACAPÉ','AUTRAN NUNES','BARRA DO CEARÁ','BARROSO',
      'BELA VISTA','BENFICA','BOM FUTURO','BOM JARDIM','BONSUCESSO',
      'CAIS DO PORTO','CAJAZEIRAS','CAMBEBA','CANINDEZINHO','CARLITO PAMPLONA',
      'CASTELÃO','CENTRO','CIDADE 2000','CIDADE DOS FUNCIONARIOS','COAÇU',
      'COCÓ','CONJUNTO CEARÁ','CONJUNTO ESPERANÇA','CONJUNTO PALMEIRAS',
      'COUTO FERNANDES','CRISTO REDENTOR','CURIÓ','DAMAS','DEMOCRITO ROCHA',
      'DIAS MACEDO','DIONISIO TORRES','DOM LUSTOSA','EDSON QUEIROZ',
      'FARIAS BRITO','FATIMA','FLORESTA','GENIBAU','GRANJA LISBOA',
      'GRANJA PORTUGAL','GUAJIRU','GUARARAPES','HENRIQUE JORGE','ITAOCA',
      'ITAPERI','JACARECANGA','JANGURUSSU','JARDIM AMERICA','JARDIM IRACEMA',
      'JOAO XXIII','JOAQUIM TAVORA','JOQUEI CLUBE','JOSÉ DE ALENCAR',
      'JOSÉ BONIFACIO','JOSE WALTER','LAGOA REDONDA','LUCIANO CAVALCANTE',
      'MARAPONGA','MEIRELES','MESSEJANA','MONDUBIM','MONTE CASTELO','MONTESE',
      'MOURA BRASIL','MUCURIPE','OTAVIO BONFIM','PADRE ANDRADE','PANAMERICANO',
      'PAPICU','PARANGABA','PARREÃO','PARQUE ARAXÁ','PARQUE MANIBURA',
      'PARQUE SANTA ROSA','PARQUE DOIS IRMÃOS','PARQUE SANTA MARIA',
      'PARQUELANDIA','PASSARÉ','PAUPINA','PEDRAS','PIRAMBU',
      'PLANALTO AIRTON SENNA','PRAIA DE IRACEMA','PRAIA DO FUTURO',
      'PRESIDENTE KENNEDY','QUINTINO CUNHA','RODOLFO TEOFILO','SALINAS',
      'SÃO CRISTOVÃO','SÃO GERARDO','SÃO JOÃO DO TAUAPE','SAPIRANGA',
      'SERRINHA','SIQUEIRA','VARJOTA','VICENTE PIZON','VILA ELLERY',
      'VILA MANUEL SATIRO','VILA PERY','VILA UNIÃO','VILA VELHA'
    ]
  };

  // ═══════════════════════════════════════════════════════════════
  // STATE — única fonte de verdade no client
  // ═══════════════════════════════════════════════════════════════
  const S = {
    user:           null,
    role:           null,   // 'monitor'|'supervisor'|'admin'|'campo'
    modo:           'dashboard',
    db:             null,
    recursos:       {},
    viaturas:       {},
    escalas:        {},
    operacoes:      {},
    postos:         {},
    escalaAtiva:    null,   // pushKey da escala com status=='ativo' hoje
    templates:      {},     // operações recorrentes pré-configuradas
    _unsubs:        [],     // listeners a desanexar no logout
    _campoOk:       false   // flag: dados do modo campo carregados
  };

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════
  const vibrar    = ms  => { try { navigator.vibrate?.(ms); } catch(_){} };
  const $         = id  => document.getElementById(id);
  const show      = id  => { const el=$(id); if(el) { el.classList.remove('hidden'); } };
  const hide      = id  => { const el=$(id); if(el) el.classList.add('hidden'); };
  const esc       = s   => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const upper     = s   => (s||'').toUpperCase();
  const emailKey  = em  => em.replace(/\./g,'_').replace(/@/g,'_at_');
  // Hierarquia de permissão — 3 níveis, conforme matriz original do projeto:
  //   canWrite  → ações operacionais do dia a dia (Monitor já pode):
  //               abrir turno, +operação, +QRU, +supervisão, mudar status
  //               básico, escalar equipe pro turno, aplicar template
  //   canManage → estrutura/cadastro (exige Supervisor+):
  //               cadastrar/editar/excluir recurso e equipe, encerrar
  //               turno, editar/excluir escala e operação, marcar
  //               afastado/desligado, gerar relatório mensal
  //   canAdmin  → configuração (exige Admin):
  //               criar/editar/excluir templates
  // IMPORTANTE: isto é UX — esconde/mostra controles. A barreira real
  // de segurança são as Firebase Rules (auth.token.email != null),
  // que hoje NÃO diferenciam role. Ver nota no CONTEXT_EFETIVO_HANDOFF.
  const canWrite  = ()  => ['monitor','supervisor','admin'].includes(S.role);
  const canManage = ()  => ['supervisor','admin'].includes(S.role);
  const canAdmin  = ()  => S.role === 'admin';

  function getDataHoje() {
    // BRT = UTC-3
    return new Date(Date.now() - 3*60*60*1000).toISOString().split('T')[0];
  }

  function formatData(iso) {
    if (!iso) return '';
    const [y,m,d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  // Nome de exibição do turno — sempre derivado do enum (manha/tarde/noite)
  // em vez do campo `label` salvo no Firebase. Isso corrige automaticamente
  // escalas criadas antes da remoção da duplicação de horário no label
  // (ex: label antigo = "MANHÃ 05:30–11:30"), sem precisar migrar dados.
  // Para turnos "especial" (sem entrada fixa no CFG.TURNOS), o fallback usa
  // o label salvo — a regex abaixo remove qualquer resíduo de horário
  // ("HH:MM–HH:MM" ou "HH:MM-HH:MM") que tenha ficado gravado em labels
  // antigos desse tipo, sem exigir migração de dados.
  const RE_HORARIO_RESIDUAL = /\s+\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}\s*$/;
  function turnoLabel(escala) {
    if (!escala) return '';
    const base = CFG.TURNOS[escala.turno]?.label || escala.label || upper(escala.turno || '');
    return base.replace(RE_HORARIO_RESIDUAL, '').trim();
  }

  // ── HIERARQUIA DE ALERTA — horários fora do padrão ─────────────
  function horaParaMinutos(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  // Nível 1: a escala inteira foge do padrão — tipo "especial" OU um
  // turno padrão (manha/tarde/noite) cujo horário real foi editado
  // para diferir do horário oficial daquele tipo de turno.
  function escalaForaDoPadrao(escala) {
    if (!escala) return false;
    if (escala.turno === 'especial') return true;
    const cfg = CFG.TURNOS[escala.turno];
    if (!cfg) return true; // tipo desconhecido — trata como fora do padrão por segurança
    return escala.horarioInicio !== cfg.inicio || escala.horarioFim !== cfg.fim;
  }

  // Nível 2: uma operação específica começa fora da janela oficial do
  // turno em que está inserida (ex: Corrida Sefaz às 05:00h dentro de
  // um turno Manhã que abre oficialmente às 05:30h).
  function operacaoForaDoPadrao(op, escala) {
    if (!op?.horario || !escala) return false;
    const opMin  = horaParaMinutos(op.horario);
    const iniMin = horaParaMinutos(escala.horarioInicio);
    const fimMin = horaParaMinutos(escala.horarioFim);
    if (opMin === null || iniMin === null || fimMin === null) return false;
    return opMin < iniMin || opMin > fimMin;
  }

  function getTurnosAtivos() {
    const brt = new Date(new Date().toLocaleString('en-US', { timeZone:'America/Fortaleza' }));
    const min = brt.getHours()*60 + brt.getMinutes();
    return Object.entries(CFG.TURNOS)
      .filter(([,t]) => min >= t.minI && min <= t.minF)
      .map(([k]) => k);
  }

  // ── LISTAGEM / CONTAGEM — usados em vários renders (Recursos,
  // Equipes, Templates, combos de seleção) para evitar reescrever o
  // mesmo comparador/filtro em cada lugar.
  function sortByNome(entries) {
    return [...entries].sort(([,a],[,b]) => (a.nome||'').localeCompare(b.nome||'','pt-BR'));
  }

  function recursosOrdenados(filtroFn = null) {
    let entries = Object.entries(S.recursos);
    if (filtroFn) entries = entries.filter(filtroFn);
    return sortByNome(entries);
  }

  function contarPorStatus(status) {
    return Object.values(S.recursos).filter(r => r.status === status).length;
  }

  // O modelo de Relatório Mensal só tem 3 colunas de turno (Manhã/Tarde/
  // Noite) — não existe coluna para turnos "especial". Para não perder
  // dado, um turno especial é encaixado na coluna mais próxima pelo
  // horário real de início (ex: Corrida Sefaz às 05:00h cai em Manhã).
  function turnoColuna(escala) {
    if (escala.turno === 'manha' || escala.turno === 'tarde' || escala.turno === 'noite') {
      return escala.turno;
    }
    const ini = horaParaMinutos(escala.horarioInicio);
    if (ini === null) return 'manha';
    if (ini < CFG.TURNOS.tarde.minI) return 'manha';
    if (ini < CFG.TURNOS.noite.minI) return 'tarde';
    return 'noite';
  }

  function debounce(fn, delay) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
  }

  let _buscaRecursoTimer = null; // debounce manual da busca de recursos (preserva foco)

  // ═══════════════════════════════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════════════════════════════
  const Auth = {
    init() {
      const p = new URLSearchParams(window.location.search);
      if (p.has('modo')) S.modo = p.get('modo');

      firebase.auth().onAuthStateChanged(async user => {
        if (user) {
          // Usuário anônimo fora do modo campo → deslogar e mostrar login
          if (user.isAnonymous && S.modo !== 'campo') {
            await firebase.auth().signOut();
            UI.showLogin();
            return;
          }
          S.user = user;
          await Auth._resolveRole(user);
          if (S.modo === 'campo' || !S.role || S.role === 'campo') {
            await DB.initPublico();
            UI.showCampo();
          } else {
            DB.init();
            UI.showDashboard();
          }
        } else {
          // Sem auth
          if (S.modo === 'campo') {
            // signInAnonymously dispara onAuthStateChanged novamente
            firebase.auth().signInAnonymously()
              .catch(() => UI.toast('Erro de conexão. Tente novamente.', 'danger'));
          } else {
            UI.showLogin();
          }
        }
      });
    },

    async _resolveRole(user) {
      if (!user.email) { S.role = 'campo'; return; } // anônimos = campo sempre
      try {
        const snap = await firebase.database()
          .ref(`efetivo_roles/${emailKey(user.email)}`).get();
        S.role = snap.exists() ? snap.val() : 'campo';
      } catch(_) {
        S.role = 'campo';
      }
    },

    login() {
      const prov = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithPopup(prov)
        .catch(e => UI.toast('Erro ao entrar: ' + e.message, 'danger'));
    },

    logout() {
      S._unsubs.forEach(fn => { try { fn(); } catch(_){} });
      S._unsubs = [];
      Object.assign(S, { user:null, role:null, recursos:{}, viaturas:{}, escalas:{},
        operacoes:{}, postos:{}, escalaAtiva:null, _campoOk:false });
      firebase.auth().signOut();
      UI.showLogin();
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // DATABASE
  // ═══════════════════════════════════════════════════════════════
  const DB = {

    // ── Dashboard: listeners em tempo real ─────────────────────
    init() {
      S.db = firebase.database();
      DB._listenRecursos();
      DB._listenViaturas();
      DB._listenEscalas();
      DB._listenOperacoes();
      DB._listenPostos();
      DB._listenTemplates();
      DB._listenConexao();
    },

    // ── Modo Campo: one-time reads (não consume slot WebSocket extra) ─
    async initPublico() {
      S.db = firebase.database();
      show('campo-loading');
      try {
        const hoje = getDataHoje();
        const escSnap = await S.db.ref('efetivo/escalas')
          .orderByChild('data').equalTo(hoje).once('value');
        S.escalas = escSnap.val() || {};

        const ativa = Object.entries(S.escalas).find(([,e]) => e.status === 'ativo');
        S.escalaAtiva = ativa ? ativa[0] : null;

        if (S.escalaAtiva) {
          const [rS, oS, pS] = await Promise.all([
            S.db.ref('efetivo/recursos').once('value'),
            S.db.ref('efetivo/operacoes').orderByChild('escalaId').equalTo(S.escalaAtiva).once('value'),
            S.db.ref('efetivo/postos').orderByChild('escalaId').equalTo(S.escalaAtiva).once('value')
          ]);
          S.recursos  = rS.val() || {};
          S.operacoes = oS.val() || {};
          S.postos    = pS.val() || {};
        } else {
          const rS = await S.db.ref('efetivo/recursos').once('value');
          S.recursos = rS.val() || {};
        }
      } catch(e) {
        console.error('[DB.initPublico]', e);
        UI.toast('Erro ao carregar dados. Verifique a conexão.', 'danger');
      } finally {
        hide('campo-loading');
        S._campoOk = true;
        UI._atualizarTurnoBadge();
        // Restaurar última busca
        const ultimo = localStorage.getItem('efetivo_campo_ultimo');
        if (ultimo) {
          const el = $('campo-busca');
          if (el) { el.value = ultimo; Campo.buscar(ultimo); }
        }
      }
    },

    // ── Listeners ───────────────────────────────────────────────
    _listenRecursos() {
      const ref = S.db.ref('efetivo/recursos');
      const fn  = ref.on('value', snap => {
        S.recursos = snap.val() || {};
        UI.renderRecursos();
      });
      S._unsubs.push(() => ref.off('value', fn));
    },

    _listenViaturas() {
      const ref = S.db.ref('efetivo/viaturas');
      const fn  = ref.on('value', snap => {
        S.viaturas = snap.val() || {};
        UI.renderEscala();
        UI.renderEquipes(); // sem isso, a própria aba Equipes não atualizava sozinha após CRUD
      });
      S._unsubs.push(() => ref.off('value', fn));
    },

    _listenEscalas() {
      const hoje = getDataHoje();
      const ref  = S.db.ref('efetivo/escalas').orderByChild('data').equalTo(hoje);
      const fn   = ref.on('value', snap => {
        S.escalas = snap.val() || {};
        const ativa = Object.entries(S.escalas).find(([,e]) => e.status === 'ativo');
        S.escalaAtiva = ativa ? ativa[0] : null;
        UI.renderEscala();
        UI.renderMetricas();
      });
      S._unsubs.push(() => ref.off('value', fn));
    },

    _listenOperacoes() {
      const ref = S.db.ref('efetivo/operacoes');
      const fn  = ref.on('value', snap => {
        S.operacoes = snap.val() || {};
        UI.renderEscala();
      });
      S._unsubs.push(() => ref.off('value', fn));
    },

    _listenPostos() {
      const ref = S.db.ref('efetivo/postos');
      const fn  = ref.on('value', snap => {
        S.postos = snap.val() || {};
        UI.renderEscala();
        UI.renderMetricas();
      });
      S._unsubs.push(() => ref.off('value', fn));
    },

    _listenTemplates() {
      const ref = S.db.ref('efetivo/templates/operacoes');
      const fn  = ref.on('value', snap => {
        S.templates = snap.val() || {};
        UI.renderTemplates();
      });
      S._unsubs.push(() => ref.off('value', fn));
    },

    // Indicador de conexão (dot + label no nav) — só no dashboard.
    // Usa o path especial .info/connected do Firebase, que reflete o
    // estado real do WebSocket (não depende de nenhum dado da aplicação).
    _listenConexao() {
      const ref = S.db.ref('.info/connected');
      const fn  = ref.on('value', snap => {
        const dot   = $('conexao-dot');
        const label = $('conexao-label');
        if (!dot || !label) return;
        const online = snap.val() === true;
        dot.className   = `status-dot ${online ? 'status-dot-online' : 'status-dot-offline'}`;
        label.className = online ? 'status-label-online' : 'status-label-offline';
        label.textContent = online ? 'Firebase online' : 'Sem conexão';
      });
      S._unsubs.push(() => ref.off('value', fn));
    },

    // ── Writes ──────────────────────────────────────────────────
    async criarEscala(dados) {
      const ref = await S.db.ref('efetivo/escalas').push({
        ...dados, status:'ativo',
        criadoEm: Date.now(), criadoPor: S.user?.email
      });
      Log.write('escala_criada', null, { escalaId:ref.key, ...dados });
      return ref.key;
    },

    async editarEscala(escalaId, dados) {
      await S.db.ref(`efetivo/escalas/${escalaId}`).update({
        ...dados, updatedAt: Date.now(), updatedBy: S.user?.email
      });
      Log.write('escala_editada', null, { escalaId, ...dados });
    },

    async excluirEscala(escalaId) {
      // Libera todos os recursos/viaturas escalados nos postos desta
      // escala antes de remover — mesma lógica de encerrarEscala, mas
      // para o caso de uma escala criada por engano (nunca chegou a rodar).
      const postosEscala = Object.entries(S.postos).filter(([,p]) => p.escalaId === escalaId);
      for (const [postoId, posto] of postosEscala) {
        await DB._statusAlocacao(posto.alocacao, 'disponivel');
        await S.db.ref(`efetivo/postos/${postoId}`).remove();
      }
      const opsEscala = Object.entries(S.operacoes).filter(([,o]) => o.escalaId === escalaId);
      for (const [opId] of opsEscala) {
        await S.db.ref(`efetivo/operacoes/${opId}`).remove();
      }
      await S.db.ref(`efetivo/escalas/${escalaId}`).remove();
      Log.write('escala_excluida', null, { escalaId });
    },

    async adicionarOperacao(escalaId, dados) {
      const ordemAtual = Object.values(S.operacoes).filter(o => o.escalaId === escalaId).length;
      const ref = await S.db.ref('efetivo/operacoes').push({
        ...dados, escalaId, ordem: ordemAtual + 1, criadoEm: Date.now()
      });
      return ref.key;
    },

    async editarOperacao(opId, dados) {
      await S.db.ref(`efetivo/operacoes/${opId}`).update({
        ...dados, updatedAt: Date.now(), updatedBy: S.user?.email
      });
      Log.write('operacao_editada', null, { opId, ...dados });
    },

    async excluirOperacao(opId) {
      // Libera recursos/viaturas e remove todos os postos da operação
      // antes de excluir a operação em si — evita deixar QRU órfão.
      const postosOp = Object.entries(S.postos).filter(([,p]) => p.operacaoId === opId);
      for (const [postoId, posto] of postosOp) {
        await DB._statusAlocacao(posto.alocacao, 'disponivel');
        await S.db.ref(`efetivo/postos/${postoId}`).remove();
      }
      await S.db.ref(`efetivo/operacoes/${opId}`).remove();
      Log.write('operacao_excluida', null, { opId });
    },

    // ── Alocação de posto — agente OU viatura, lógica única ──────
    // Antes desta consolidação, liberar/escalar tinha 3 cópias quase
    // idênticas (criar/editar/excluir posto) e a versão de "editar"
    // só liberava a alocação anterior quando era um agente — uma
    // viatura trocada de posto nunca voltava para "disponível".
    // Corrigido aqui ao unificar em um único caminho de código.
    async _statusAlocacao(alocacao, status) {
      if (!alocacao?.id) return;
      if (alocacao.tipo === 'viatura') {
        await S.db.ref(`efetivo/viaturas/${alocacao.id}/status`)
          .set(status === 'disponivel' ? 'disponivel' : 'escalada');
      } else {
        await DB.setStatusRecurso(alocacao.id, status);
      }
    },

    // Próximo número sequencial de QRU dentro de uma escala.
    _proximoNumeroPosto(escalaId) {
      const postosEscala = Object.values(S.postos).filter(p => p.escalaId === escalaId);
      return postosEscala.length > 0
        ? Math.max(...postosEscala.map(p => p.numero || 0)) + 1 : 1;
    },

    async adicionarPosto(dados) {
      const numero = DB._proximoNumeroPosto(dados.escalaId);
      const ref = await S.db.ref('efetivo/postos').push({ ...dados, numero, criadoEm: Date.now() });
      await DB._statusAlocacao(dados.alocacao, 'escalado');
      Log.write('posto_criado', null, { postoId:ref.key, local:dados.local, numero });
      return ref.key;
    },

    async editarPosto(postoId, dados, alocacaoAnterior) {
      // Libera a alocação anterior (agente OU viatura) se ela mudou
      if (alocacaoAnterior?.id && alocacaoAnterior.id !== dados.alocacao?.id) {
        await DB._statusAlocacao(alocacaoAnterior, 'disponivel');
      }
      await DB._statusAlocacao(dados.alocacao, 'escalado');

      await S.db.ref(`efetivo/postos/${postoId}`).update({
        ...dados, updatedAt: Date.now(), updatedBy: S.user?.email
      });
      Log.write('posto_editado', null, { postoId, local: dados.local });
    },

    async excluirPosto(postoId) {
      const posto = S.postos[postoId];
      if (!posto) return;
      await DB._statusAlocacao(posto.alocacao, 'disponivel');
      await S.db.ref(`efetivo/postos/${postoId}`).remove();
      Log.write('posto_excluido', null, { postoId, local: posto.local, numero: posto.numero });
    },

    async salvarTemplate(dados, templateId = null) {
      const payload = {
        ...dados,
        updatedAt: Date.now(),
        updatedBy: S.user?.email
      };
      if (templateId) {
        await S.db.ref(`efetivo/templates/operacoes/${templateId}`).update(payload);
        Log.write('template_editado', null, { templateId, nome: dados.nome });
        return templateId;
      } else {
        payload.criadoEm  = Date.now();
        payload.criadoPor = S.user?.email;
        const ref = await S.db.ref('efetivo/templates/operacoes').push(payload);
        Log.write('template_criado', null, { templateId: ref.key, nome: dados.nome });
        return ref.key;
      }
    },

    async excluirTemplate(templateId) {
      const t = S.templates[templateId];
      await S.db.ref(`efetivo/templates/operacoes/${templateId}`).remove();
      Log.write('template_excluido', null, { templateId, nome: t?.nome });
    },

    // Aplica template: cria operação + todos os postos padrão (sem alocação)
    async aplicarTemplate(templateId, escalaId) {
      const tmpl = S.templates[templateId];
      if (!tmpl) return;
      const opId = await DB.adicionarOperacao(escalaId, {
        nome:       tmpl.nome,
        bairro:     tmpl.bairro     || '',
        horario:    tmpl.horario    || '',
        tipoMissao: tmpl.tipoMissao || 'NÃO CLASSIFICADO',
        templateId
      });
      // Número calculado uma única vez e incrementado em memória — ler
      // S.postos a cada iteração seria não-confiável aqui, pois esse
      // estado só atualiza de forma assíncrona via listener do Firebase
      // (poderia gerar QRUs com números duplicados ao aplicar vários
      // postos de uma vez).
      let numero = DB._proximoNumeroPosto(escalaId);
      for (const p of (tmpl.postosPadrao || [])) {
        await S.db.ref('efetivo/postos').push({
          escalaId, operacaoId: opId,
          numero: numero++,
          local:     upper(p.local || ''),
          bairro:    upper(tmpl.bairro || ''),
          horario:   tmpl.horario || '',
          tipoAcao:  p.tipoAcao || 'CONTROLE',
          alocacao:  null,
          qruPessoas:1,
          obs:       '',
          criadoEm:  Date.now()
        });
      }
      Log.write('template_aplicado', null, { templateId, escalaId, nome: tmpl.nome });
      return opId;
    },

    async setStatusRecurso(id, status) {
      const ant = S.recursos[id]?.status;
      const nome = S.recursos[id]?.nome;
      await S.db.ref(`efetivo/recursos/${id}`).update({
        status, updatedAt: Date.now(), updatedBy: S.user?.email || 'sistema'
      });
      Log.write('status_change', id, { de:ant, para:status, nome });
    },

    async encerrarEscala(escalaId) {
      // Resetar escalados → disponivel
      const escalados = Object.entries(S.recursos).filter(([,r]) => r.status === 'escalado');
      await Promise.all(escalados.map(([id]) => DB.setStatusRecurso(id, 'disponivel')));
      await S.db.ref(`efetivo/escalas/${escalaId}/status`).set('encerrado');
      Log.write('escala_encerrada', null, { escalaId });
    },

    async cadastrarRecurso(dados) {
      const ref = await S.db.ref('efetivo/recursos').push({
        ...dados, status:'disponivel', criadoEm: Date.now(), criadoPor: S.user?.email
      });
      Log.write('recurso_cadastrado', ref.key, { nome:dados.nome, matricula:dados.matricula });
      return ref.key;
    },

    async editarRecurso(id, dados) {
      await S.db.ref(`efetivo/recursos/${id}`).update({
        ...dados, updatedAt: Date.now(), updatedBy: S.user?.email
      });
      Log.write('recurso_editado', id, { nome: dados.nome });
    },

    async excluirRecurso(id) {
      // Não remove se o recurso estiver alocado em algum posto ativo —
      // melhor travar e avisar do que deixar um QRU apontando pra um
      // recurso que não existe mais.
      const emUso = Object.values(S.postos).some(p => p.alocacao?.id === id);
      if (emUso) throw new Error('RECURSO_EM_USO');
      const r = S.recursos[id];
      await S.db.ref(`efetivo/recursos/${id}`).remove();
      Log.write('recurso_excluido', id, { nome: r?.nome, matricula: r?.matricula });
    },

    async editarSupervisao(escalaId, camada, recursoId, dados) {
      await S.db.ref(`efetivo/escalas/${escalaId}/supervisao/${camada}/${recursoId}`).set(dados);
      Log.write('supervisao_editada', recursoId, { escalaId, camada, ...dados });
    },

    async removerSupervisao(escalaId, camada, recursoId) {
      await S.db.ref(`efetivo/escalas/${escalaId}/supervisao/${camada}/${recursoId}`).remove();
      Log.write('supervisao_removida', recursoId, { escalaId, camada });
    },

    // ── RELATÓRIO MENSAL — sem backend, lê o Firebase direto ────
    // Firebase não tem busca por prefixo de string; mas datas em
    // formato ISO "YYYY-MM-DD" ordenam lexicograficamente igual a
    // ordenação cronológica, então um range startAt/endAt funciona
    // como filtro de mês sem precisar de índice especial.
    async buscarDadosRelatorioMensal(anoMes) {
      const escSnap = await S.db.ref('efetivo/escalas')
        .orderByChild('data')
        .startAt(`${anoMes}-01`)
        .endAt(`${anoMes}-31`)
        .once('value');
      const escalas = escSnap.val() || {};

      const linhas = [];
      for (const [escalaId, esc] of Object.entries(escalas)) {
        const [opSnap, postoSnap] = await Promise.all([
          S.db.ref('efetivo/operacoes').orderByChild('escalaId').equalTo(escalaId).once('value'),
          S.db.ref('efetivo/postos').orderByChild('escalaId').equalTo(escalaId).once('value')
        ]);
        const operacoes = opSnap.val()    || {};
        const postos    = postoSnap.val() || {};

        for (const posto of Object.values(postos)) {
          const op = operacoes[posto.operacaoId] || {};
          linhas.push({
            dia:        parseInt((esc.data||'').split('-')[2], 10) || 0,
            turno:      turnoColuna(esc), // manha/tarde/noite — especial é encaixado por horário
            tipoMissao: op.tipoMissao || 'NÃO CLASSIFICADO',
            bairro:     upper((posto.bairro || op.bairro || '').trim()) || '—',
            local:      posto.local || '—',
            pessoas:    posto.qruPessoas || 1
          });
        }
      }
      return linhas;
    },

    // ── EQUIPES / VIATURAS — entidade persistente, independente de turno ──
    async cadastrarViatura(dados) {
      const ref = await S.db.ref('efetivo/viaturas').push({
        ...dados, status:'disponivel', criadoEm: Date.now(), criadoPor: S.user?.email
      });
      Log.write('viatura_cadastrada', null, { viaturaId: ref.key, nome: dados.nome });
      return ref.key;
    },

    async editarViatura(id, dados) {
      await S.db.ref(`efetivo/viaturas/${id}`).update({
        ...dados, updatedAt: Date.now(), updatedBy: S.user?.email
      });
      Log.write('viatura_editada', null, { viaturaId: id, nome: dados.nome });
    },

    async excluirViatura(id) {
      // Remove a viatura de qualquer escala onde estava escalada
      const escalasComViatura = Object.entries(S.escalas)
        .filter(([,e]) => e.viaturasEscaladas?.[id]);
      await Promise.all(escalasComViatura.map(([eid]) =>
        S.db.ref(`efetivo/escalas/${eid}/viaturasEscaladas/${id}`).remove()));
      const v = S.viaturas[id];
      await S.db.ref(`efetivo/viaturas/${id}`).remove();
      Log.write('viatura_excluida', null, { viaturaId: id, nome: v?.nome });
    },

    // Toggle: equipe entra/sai do roster do turno ativo (sem recriar a equipe)
    async toggleViaturaEscala(viaturaId) {
      if (!S.escalaAtiva) return;
      const ref   = S.db.ref(`efetivo/escalas/${S.escalaAtiva}/viaturasEscaladas/${viaturaId}`);
      const ativa = !!S.escalas[S.escalaAtiva]?.viaturasEscaladas?.[viaturaId];
      if (ativa) {
        await ref.remove();
        Log.write('viatura_removida_turno', null, { viaturaId, escalaId: S.escalaAtiva });
      } else {
        await ref.set(true);
        Log.write('viatura_escalada_turno', null, { viaturaId, escalaId: S.escalaAtiva });
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // LOG — append-only, nunca deletar
  // ═══════════════════════════════════════════════════════════════
  const Log = {
    write(tipo, recursoId, payload) {
      if (!S.db) return;
      S.db.ref('efetivo/log').push({
        tipo, recursoId: recursoId || null, payload,
        operadorEmail: S.user?.email || 'anonimo',
        timestamp: Date.now()
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // CAMPO — consulta de QTH (orientadores / agentes de campo)
  // ═══════════════════════════════════════════════════════════════
  const Campo = {
    // Debounced para não disparar a cada tecla
    buscar: debounce(function(termo, alvoId = 'campo-resultado') {
      const t = (termo || '').trim().toLowerCase();
      if (t.length < 2) { const el=$(alvoId); if(el) el.innerHTML=''; return; }
      if (!S._campoOk && S.modo === 'campo') return; // ainda carregando

      const matches = Object.entries(S.recursos).filter(([,r]) =>
        r && r.nome && (
          r.nome.toLowerCase().includes(t) ||
          (r.matricula||'').toLowerCase().includes(t)
        )
      );

      if (matches.length === 0) {
        UI.renderResultadoCampo({ tipo:'nao_encontrado' }, alvoId); return;
      }
      if (matches.length === 1) {
        Campo._resolverQTH(matches[0][0], matches[0][1], alvoId); return;
      }
      UI.renderResultadoCampo({ tipo:'multiplos', matches }, alvoId);
    }, 350),

    // Chamado do onclick nos cards de múltiplos resultados
    // ID do Firebase não tem chars especiais → seguro em onclick
    selecionar(recursoId, alvoId) {
      const r = S.recursos[recursoId];
      if (r) { vibrar(40); Campo._resolverQTH(recursoId, r, alvoId || 'campo-resultado'); }
    },

    limpar() {
      const el = $('campo-busca');
      if (el) { el.value = ''; el.focus(); }
      const res = $('campo-resultado');
      if (res) res.innerHTML = '';
      localStorage.removeItem('efetivo_campo_ultimo');
    },

    _resolverQTH(recursoId, recurso, alvoId) {
      // Persiste última busca bem-sucedida
      localStorage.setItem('efetivo_campo_ultimo', recurso.nome || '');

      // Postos diretos (agente alocado individualmente)
      const postosDiretos = Object.entries(S.postos)
        .filter(([,p]) => p.alocacao?.id === recursoId)
        .sort(([,a],[,b]) => (a.numero||0) - (b.numero||0));

      // Postos via viatura (agente é membro de uma viatura que tem postos)
      let postosViatura = [];
      if (!postosDiretos.length) {
        const viat = Object.entries(S.viaturas).find(([,v]) => {
          const membros = Object.values(v.membrosIds || {});
          return v.liderId === recursoId || membros.includes(recursoId);
        });
        if (viat) {
          postosViatura = Object.entries(S.postos)
            .filter(([,p]) => p.alocacao?.id === viat[0])
            .sort(([,a],[,b]) => (a.numero||0) - (b.numero||0));
        }
      }

      const todosPostos = [...postosDiretos, ...postosViatura];

      // Checar se está na camada de supervisão
      let funcaoSup = null;
      if (S.escalaAtiva) {
        const sup = S.escalas[S.escalaAtiva]?.supervisao || {};
        for (const [camada, pessoas] of Object.entries(sup)) {
          if (pessoas?.[recursoId]) { funcaoSup = { camada, ...pessoas[recursoId] }; break; }
        }
      }

      // Contato do supervisor
      let supervisorInfo = null;
      if (S.escalaAtiva) {
        const sups = S.escalas[S.escalaAtiva]?.supervisao?.supervisores || {};
        const primSup = Object.entries(sups)[0];
        if (primSup) {
          const sr = S.recursos[primSup[0]] || {};
          supervisorInfo = { nome: sr.nome || 'Supervisor', contato: primSup[1]?.contato || sr.telefone || '' };
        }
      }

      UI.renderResultadoCampo({
        tipo:'encontrado',
        recurso: { id:recursoId, ...recurso },
        postos: todosPostos.map(([id,p]) => ({ id, ...p })),
        operacoes: S.operacoes,
        funcaoSup, supervisorInfo,
        escala: S.escalaAtiva ? S.escalas[S.escalaAtiva] : null
      }, alvoId);

      vibrar(60);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════════════
  const UI = {

    showLogin() {
      hide('app-campo'); hide('app-dashboard'); show('login-screen');
    },

    showCampo() {
      hide('login-screen'); hide('app-dashboard'); show('app-campo');
      UI._atualizarTurnoBadge();
    },

    showDashboard() {
      hide('login-screen'); hide('app-campo'); show('app-dashboard');
      const re = $('dash-role'), ue = $('dash-user');
      if (re) re.textContent = (S.role || '').toUpperCase();
      if (ue) ue.textContent = S.user?.displayName || S.user?.email || '';
      UI.switchTab('escala');
    },

    switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.tab-pane').forEach(p => {
        const active = p.id === `tab-${tab}`;
        p.classList.toggle('hidden', !active);
        p.classList.toggle('active', active);
      });
    },

    _atualizarTurnoBadge() {
      const el = $('campo-turno-badge');
      if (!el) return;
      if (S.escalaAtiva) {
        const e = S.escalas[S.escalaAtiva];
        const alerta = escalaForaDoPadrao(e);
        el.textContent = `${alerta?'⚠ ':''}${turnoLabel(e)} · ${e.horarioInicio}–${e.horarioFim}`;
        el.style.cssText = alerta
          ? 'color:var(--color-orange);background:var(--color-orange-dim)'
          : 'color:var(--color-success);background:var(--color-success-dim)';
      } else {
        const ativos = getTurnosAtivos();
        if (ativos.length) {
          el.textContent = ativos.map(t => CFG.TURNOS[t].label).join('+') + ' · SEM ESCALA';
          el.style.cssText = 'color:var(--color-warning);background:var(--color-warning-dim)';
        } else {
          el.textContent = 'FORA DE TURNO';
          el.style.cssText = 'color:var(--color-decorative);background:var(--color-text-tertiary-dim)';
        }
      }
    },

    // ── ESCALA ────────────────────────────────────────────────
    renderEscala() {
      const cont = $('escala-container');
      if (!cont) return;
      if (!S.escalaAtiva) { cont.innerHTML = UI._semEscalaHTML(); return; }

      const escala = S.escalas[S.escalaAtiva];
      const postosEscala = Object.entries(S.postos)
        .filter(([,p]) => p.escalaId === S.escalaAtiva)
        .sort(([,a],[,b]) => (a.numero||0) - (b.numero||0));

      // Preservar foco/cursor da busca entre re-renders (mesmo padrão
      // já usado em Recursos/Equipes/Templates)
      const buscaAnterior = $('busca-escala');
      const tinhaFoco  = document.activeElement === buscaAnterior;
      const cursorPos  = tinhaFoco ? buscaAnterior.selectionStart : null;
      const buscaValor = buscaAnterior ? buscaAnterior.value : '';
      const busca      = buscaValor.toLowerCase().trim();

      let ops = Object.entries(S.operacoes)
        .filter(([,o]) => o.escalaId === S.escalaAtiva)
        .sort(([,a],[,b]) => (a.ordem||0) - (b.ordem||0));

      if (busca) {
        ops = ops.filter(([opId, op]) => {
          const bateOp = (op.nome||'').toLowerCase().includes(busca) ||
                         (op.bairro||'').toLowerCase().includes(busca);
          const batePosto = postosEscala.some(([,p]) =>
            p.operacaoId === opId && (p.local||'').toLowerCase().includes(busca));
          return bateOp || batePosto;
        });
      }

      // QRUs por viatura (sempre sobre o total, não sobre o filtro)
      const qruVt = {};
      postosEscala.forEach(([,p]) => {
        if (p.alocacao?.tipo === 'viatura')
          qruVt[p.alocacao.id] = (qruVt[p.alocacao.id]||0) + 1;
      });

      const w = canWrite();
      const m = canManage();
      const foraPadrao = escalaForaDoPadrao(escala);
      const totalOps = Object.values(S.operacoes).filter(o => o.escalaId === S.escalaAtiva).length;

      cont.innerHTML = `
        <div class="escala-header">
          <div class="escala-title">
            <span class="badge badge-${escala.status}">${upper(escala.status)}</span>
            <h2>${esc(turnoLabel(escala))} · ${formatData(escala.data)}</h2>
            <span class="escala-horario${foraPadrao ? ' escala-horario-alerta' : ''}">
              ${foraPadrao ? '⚠ ' : ''}${esc(escala.horarioInicio)}–${esc(escala.horarioFim)}
            </span>
            ${foraPadrao ? `<span class="badge badge-warning" title="Horário diferente do padrão deste tipo de turno">FORA DO PADRÃO</span>` : ''}
            ${m ? `
              <button class="btn-icon" title="Editar turno" onclick="NIT_EFETIVO.Modals.abrirEditEscala()">✏️</button>
              <button class="btn-icon" title="Excluir turno" onclick="NIT_EFETIVO.Actions.excluirEscala('${S.escalaAtiva}')">🗑️</button>
            ` : ''}
          </div>
          <div class="escala-actions">
            ${w ? `
              <button class="btn btn-secondary btn-sm" onclick="NIT_EFETIVO.Modals.abrirAddSupervisao()">+ SUPERVISÃO</button>
              <button class="btn btn-secondary btn-sm" onclick="NIT_EFETIVO.Modals.abrirAddOperacao()">+ OPERAÇÃO</button>
            ` : ''}
            ${m && escala.status==='ativo'
              ? `<button class="btn btn-danger btn-sm" onclick="NIT_EFETIVO.Actions.encerrarEscala()">ENCERRAR TURNO</button>` : ''}
          </div>
        </div>
        ${totalOps > 1 ? `
          <input id="busca-escala" class="input-search" style="width:100%;margin-bottom:16px"
            placeholder="Buscar operação, bairro ou endereço de QRU..."
            value="${esc(buscaValor)}" oninput="NIT_EFETIVO.UI.renderEscala()">
        ` : ''}
        ${UI._supervisaoHTML(escala)}
        ${UI._viaturasHTML(escala, qruVt)}
        ${ops.length
          ? ops.map(([opId,op]) => UI._operacaoHTML(opId, op, postosEscala, w, escala, m)).join('')
          : (busca ? `<p class="text-muted" style="text-align:center;padding:24px">Nenhuma operação ou QRU encontrado para "${esc(buscaValor)}"</p>` : '')}
        ${w ? `<div class="add-operacao-hint" onclick="NIT_EFETIVO.Modals.abrirAddOperacao()">
          + Adicionar operação / evento ao turno
        </div>` : ''}
      `;

      if (tinhaFoco) {
        const buscaNovo = $('busca-escala');
        if (buscaNovo) { buscaNovo.focus(); buscaNovo.setSelectionRange(cursorPos, cursorPos); }
      }
    },

    _semEscalaHTML() {
      const ativos = getTurnosAtivos();
      const label  = ativos.length
        ? ativos.map(t => CFG.TURNOS[t].label).join(' + ') : 'FORA DE TURNO';
      return `<div class="sem-escala">
        <div class="sem-escala-icon">📋</div>
        <h3>Nenhuma escala ativa</h3>
        <p>Turno atual: <strong>${label}</strong></p>
        ${canWrite()
          ? `<button class="btn btn-primary" onclick="NIT_EFETIVO.Modals.abrirCriarEscala()">ABRIR TURNO</button>`
          : `<p class="text-muted">Aguardando supervisor abrir o turno</p>`}
      </div>`;
    },

    _supervisaoHTML(escala) {
      const sup = escala.supervisao || {};
      const w   = canWrite();
      const camadas = [
        { key:'supervisores',  label:'SUPERVISOR'  },
        { key:'auxiliares',    label:'AUXILIAR'     },
        { key:'motociclistas', label:'MOTOCICLISTA' },
        { key:'monitores',     label:'MONITOR'      }
      ];
      const linhas = camadas.flatMap(({ key, label }) =>
        Object.entries(sup[key] || {}).map(([id, info]) => {
          const r = S.recursos[id] || {};
          return `<div class="sup-linha">
            <span class="sup-cargo">${label}</span>
            <span class="sup-nome">${esc(r.nome||id)}</span>
            <span class="sup-funcao">${esc(info.funcao||'')}</span>
            <span class="sup-contato">${esc(info.contato||r.telefone||'')}</span>
            ${w ? `
              <button class="btn-icon" title="Editar" onclick="NIT_EFETIVO.Modals.abrirEditSupervisao('${key}','${id}')">✏️</button>
              <button class="btn-icon" title="Remover" onclick="NIT_EFETIVO.Actions.removerSupervisao('${S.escalaAtiva}','${key}','${id}')">🗑️</button>
            ` : ''}
          </div>`;
        })
      ).join('');
      if (!linhas) return '';
      return `<div class="bloco-card">
        <div class="bloco-titulo">SUPERVISÃO E MONITORAMENTO</div>
        <div class="supervisao-lista">${linhas}</div>
      </div>`;
    },

    _viaturasHTML(escala, qruVt) {
      const vtEsc = escala.viaturasEscaladas || {};
      const ids   = Object.keys(vtEsc).filter(id => vtEsc[id]);
      if (!ids.length) return '';
      const cards = ids.map(id => {
        const v      = S.viaturas[id] || {};
        const lider  = S.recursos[v.liderId] || {};
        const membros= Object.values(v.membrosIds||{}).map(mid => S.recursos[mid]?.nome).filter(Boolean);
        const qru    = qruVt[id] || 0;
        return `<div class="viatura-card">
          <div class="viatura-header">
            <span class="viatura-nome">${esc(v.nome||id)}</span>
            <span class="badge-qth">QTH: ${qru} QRU${qru!==1?'s':''}</span>
            <span class="badge badge-${v.status==='escalada'?'accent':'success'}">${upper(v.status||'disponivel')}</span>
          </div>
          <div class="viatura-detalhes">
            <span class="viatura-lider">Líder: <strong>${esc(lider.nome||'—')}</strong></span>
            ${membros.length ? `<span class="viatura-membros"> · ${membros.map(esc).join(', ')}</span>` : ''}
          </div>
        </div>`;
      }).join('');
      return `<div class="bloco-card">
        <div class="bloco-titulo">VIATURAS ESCALADAS</div>
        <div class="viaturas-grid">${cards}</div>
      </div>`;
    },

    _operacaoHTML(opId, op, postosEscala, writeable, escala, manageable) {
      const postosOp = postosEscala
        .filter(([,p]) => p.operacaoId === opId)
        .sort(([,a],[,b]) => (a.numero||0) - (b.numero||0));
      const horarioAlerta = operacaoForaDoPadrao(op, escala);

      const linhas = postosOp.map(([postoId, posto]) => {
        const nome  = esc(posto.alocacao?.nome || '—');
        const vazio = !posto.alocacao?.id;
        return `<div class="posto-linha ${vazio?'posto-vazio':'posto-alocado'}">
          <span class="posto-num">[${posto.numero}]</span>
          <span class="posto-local">${esc(posto.local)}</span>
          <span class="posto-alocado-nome">${nome}</span>
          <span class="badge-acao">${esc(posto.tipoAcao||'')}</span>
          ${posto.obs ? `<span class="posto-obs">${esc(posto.obs)}</span>` : ''}
          ${writeable ? `
            <button class="btn-icon" title="Editar QRU" onclick="NIT_EFETIVO.Modals.abrirEditPosto('${postoId}')">✏️</button>
            <button class="btn-icon" title="Excluir QRU" onclick="NIT_EFETIVO.Actions.excluirPosto('${postoId}')">🗑️</button>
          ` : ''}
        </div>`;
      }).join('');

      return `<div class="bloco-card operacao-card">
        <div class="bloco-titulo operacao-titulo">
          ${op.bairro ? `<span class="op-bairro">${upper(op.bairro)}</span>` : ''}
          <span class="op-nome">${esc(op.nome)}</span>
          ${op.tipoMissao
            ? `<span class="badge badge-accent">${esc(op.tipoMissao)}</span>`
            : `<span class="badge badge-warning" title="Operação criada antes do campo Tipo de Missão existir — não entra corretamente no Relatório Mensal">⚠ NÃO CLASSIFICADO</span>`}
          ${op.horario ? `
            <span class="op-horario${horarioAlerta ? ' op-horario-alerta' : ''}"
              ${horarioAlerta ? `title="Fora da janela do turno (${esc(escala?.horarioInicio)}–${esc(escala?.horarioFim)})"` : ''}>
              ${horarioAlerta ? '⚠ ' : ''}${op.horario}h
            </span>` : ''}
          <span class="op-count">${postosOp.length} QRU${postosOp.length!==1?'s':''}</span>
          ${writeable
            ? `<button class="btn btn-secondary btn-sm" onclick="NIT_EFETIVO.Modals.abrirAddPosto('${opId}')">+ QRU</button>` : ''}
          ${manageable ? `
            <button class="btn-icon" title="Editar operação" onclick="NIT_EFETIVO.Modals.abrirEditOperacao('${opId}')">✏️</button>
            <button class="btn-icon" title="Excluir operação" onclick="NIT_EFETIVO.Actions.excluirOperacao('${opId}')">🗑️</button>
          ` : ''}
        </div>
        ${horarioAlerta ? `<div class="op-alerta-banner">⚠ Esta operação começa fora do horário oficial do turno (${esc(escala?.horarioInicio)}–${esc(escala?.horarioFim)})</div>` : ''}
        <div class="postos-lista">
          ${linhas || '<div class="empty-cell">Nenhum posto designado</div>'}
        </div>
      </div>`;
    },

    // ── RECURSOS ──────────────────────────────────────────────
    // Debounce do input — evita reconstruir o painel a cada tecla
    _debouncedRenderRecursos() {
      clearTimeout(_buscaRecursoTimer);
      _buscaRecursoTimer = setTimeout(() => UI.renderRecursos(), 150);
    },

    renderRecursos() {
      const cont = $('recursos-container');
      if (!cont) return;

      // Preservar foco e posição do cursor do campo de busca entre re-renders.
      // Sem isso, cada re-render (digitação OU update do Firebase em tempo
      // real) recria o <input> via innerHTML e a digitação "trava" porque
      // o foco se perde a cada tecla.
      const buscaAnterior = $('busca-recurso');
      const tinhaFoco      = document.activeElement === buscaAnterior;
      const cursorPos      = tinhaFoco ? buscaAnterior.selectionStart : null;
      const buscaValor     = buscaAnterior ? buscaAnterior.value : '';

      const filtroSt = $('filtro-status')?.value || 'todos';
      const busca    = buscaValor.toLowerCase().trim();

      let lista = Object.entries(S.recursos);
      if (filtroSt !== 'todos') lista = lista.filter(([,r]) => r.status === filtroSt);
      if (busca) lista = lista.filter(([,r]) =>
        (r.nome||'').toLowerCase().includes(busca) ||
        (r.cargo||'').toLowerCase().includes(busca) ||
        (r.matricula||'').toLowerCase().includes(busca));
      lista = sortByNome(lista);

      const total      = Object.keys(S.recursos).length;
      const disponivel = contarPorStatus('disponivel');
      const escalado   = contarPorStatus('escalado');
      const ausente    = contarPorStatus('ausente');
      const w          = canWrite();
      const m          = canManage();
      // Monitor só muda status operacional do dia a dia; afastado/desligado
      // é decisão administrativa, exige Supervisor+
      const statusPermitidos = m ? CFG.STATUS_RECURSO : CFG.STATUS_RECURSO.filter(s => s !== 'afastado' && s !== 'desligado');

      const linhas = lista.map(([id,r]) => `
        <tr class="recurso-row status-${r.status}">
          <td><span class="font-mono">${esc(r.matricula||'—')}</span></td>
          <td class="recurso-nome">${esc(r.nome||'—')}</td>
          <td>${esc(r.cargo||'—')}</td>
          <td>${esc(CFG.TURNOS[r.turno_padrao]?.label||r.turno_padrao||'—')}</td>
          <td><span class="badge badge-${CFG.STATUS_COLORS[r.status]||'muted'}">${upper(r.status||'')}</span></td>
          <td><span class="font-mono">${esc(r.telefone||'—')}</span></td>
          <td class="acoes-cell">
            ${w ? `
              <select class="select-status-inline" onchange="NIT_EFETIVO.Actions.mudarStatus('${id}',this.value)">
                ${statusPermitidos.map(s =>
                  `<option value="${s}"${r.status===s?' selected':''}>${upper(s)}</option>`).join('')}
              </select>` : ''}
            ${m ? `
              <button class="btn-icon" title="Editar recurso" onclick="NIT_EFETIVO.Modals.abrirEditRecurso('${id}')">✏️</button>
              <button class="btn-icon" title="Excluir recurso" onclick="NIT_EFETIVO.Actions.excluirRecurso('${id}')">🗑️</button>
            ` : ''}
          </td>
        </tr>`).join('');

      cont.innerHTML = `
        <div class="recursos-toolbar">
          <div class="recursos-badges">
            <span class="badge badge-muted">${total} total</span>
            <span class="badge badge-success">${disponivel} disponíveis</span>
            <span class="badge badge-accent">${escalado} escalados</span>
            <span class="badge badge-warning">${ausente} ausentes</span>
          </div>
          <div class="recursos-filtros">
            <input id="busca-recurso" class="input-search"
              placeholder="Buscar nome / cargo / matrícula..."
              value="${esc(buscaValor)}"
              oninput="NIT_EFETIVO.UI._debouncedRenderRecursos()">
            <select id="filtro-status" class="select-filtro" onchange="NIT_EFETIVO.UI.renderRecursos()">
              <option value="todos"${filtroSt==='todos'?' selected':''}>TODOS</option>
              ${CFG.STATUS_RECURSO.map(s =>
                `<option value="${s}"${filtroSt===s?' selected':''}>${upper(s)}</option>`).join('')}
            </select>
            ${m ? `<button class="btn btn-primary btn-sm" onclick="NIT_EFETIVO.Modals.abrirCadastroRecurso()">+ RECURSO</button>` : ''}
          </div>
        </div>
        <div class="table-wrapper">
          <table class="table-recursos">
            <thead><tr>
              <th>MATRÍCULA</th><th>NOME</th><th>CARGO</th><th>TURNO</th>
              <th>STATUS</th><th>CONTATO</th><th></th>
            </tr></thead>
            <tbody>${linhas || `<tr><td colspan="7" class="empty-cell">Nenhum resultado</td></tr>`}</tbody>
          </table>
        </div>`;

      // Restaurar foco e cursor, se o campo estava sendo usado
      if (tinhaFoco) {
        const buscaNovo = $('busca-recurso');
        if (buscaNovo) {
          buscaNovo.focus();
          buscaNovo.setSelectionRange(cursorPos, cursorPos);
        }
      }
    },

    // ── EQUIPES / VIATURAS — persistentes, independentes de turno ───
    renderEquipes() {
      const cont = $('equipes-container');
      if (!cont) return;

      const buscaAnterior = $('busca-equipe');
      const tinhaFoco  = document.activeElement === buscaAnterior;
      const cursorPos  = tinhaFoco ? buscaAnterior.selectionStart : null;
      const buscaValor = buscaAnterior ? buscaAnterior.value : '';
      const busca      = buscaValor.toLowerCase().trim();

      let lista = sortByNome(Object.entries(S.viaturas));
      if (busca) lista = lista.filter(([,v]) => (v.nome||'').toLowerCase().includes(busca));

      const escaladasHoje = S.escalaAtiva
        ? (S.escalas[S.escalaAtiva]?.viaturasEscaladas || {}) : {};
      const w = canWrite();
      const m = canManage();

      const cards = lista.map(([id, v]) => {
        const lider   = S.recursos[v.liderId] || {};
        const membros = Object.keys(v.membrosIds || {})
          .map(mid => S.recursos[mid]?.nome).filter(Boolean);
        const noTurno = !!escaladasHoje[id];

        return `<div class="bloco-card equipe-card">
          <div class="equipe-header">
            <div class="equipe-info">
              <span class="equipe-nome">${esc(v.nome||'—')}</span>
              <span class="badge badge-${v.status==='escalada'?'accent':'success'}">${upper(v.status||'disponivel')}</span>
            </div>
            <div class="equipe-acoes">
              ${w && S.escalaAtiva ? `
                <button class="btn btn-sm ${noTurno?'btn-secondary':'btn-primary'}"
                  onclick="NIT_EFETIVO.Actions.toggleViaturaEscala('${id}')">
                  ${noTurno ? '✓ NO TURNO' : '+ ESCALAR HOJE'}
                </button>` : ''}
              ${m ? `
                <button class="btn-icon" title="Editar equipe" onclick="NIT_EFETIVO.Modals.abrirEditViatura('${id}')">✏️</button>
                <button class="btn-icon" title="Excluir equipe" onclick="NIT_EFETIVO.Actions.excluirViatura('${id}')">🗑️</button>
              ` : ''}
            </div>
          </div>
          <div class="equipe-detalhes">
            <span class="equipe-lider">Líder: <strong>${esc(lider.nome||'—')}</strong></span>
            ${membros.length ? `<span class="equipe-membros"> · ${membros.map(esc).join(', ')}</span>` : ''}
          </div>
        </div>`;
      }).join('');

      cont.innerHTML = `
        <div class="recursos-toolbar">
          <div class="recursos-badges">
            <span class="badge badge-muted">${lista.length} equipe${lista.length!==1?'s':''}</span>
            ${S.escalaAtiva
              ? `<span class="badge badge-accent">${Object.keys(escaladasHoje).length} no turno hoje</span>`
              : `<span class="badge badge-muted">Sem turno ativo</span>`}
          </div>
          <div class="recursos-filtros">
            <input id="busca-equipe" class="input-search" placeholder="Buscar equipe..."
              value="${esc(buscaValor)}" oninput="NIT_EFETIVO.UI.renderEquipes()">
            ${m ? `<button class="btn btn-primary btn-sm" onclick="NIT_EFETIVO.Modals.abrirCadastroViatura()">+ EQUIPE</button>` : ''}
          </div>
        </div>
        ${lista.length ? cards : `
          <div class="sem-escala">
            <div class="sem-escala-icon">🚓</div>
            <h3>Nenhuma equipe ${busca ? 'encontrada' : 'cadastrada'}</h3>
            <p>Cadastre equipes fixas (líder + tripulantes) uma vez e reutilize em todos os turnos — só escalando ou removendo do roster do dia.</p>
            ${m && !busca ? `<button class="btn btn-primary" onclick="NIT_EFETIVO.Modals.abrirCadastroViatura()">CADASTRAR PRIMEIRA EQUIPE</button>` : ''}
          </div>`}
      `;

      if (tinhaFoco) {
        const buscaNovo = $('busca-equipe');
        if (buscaNovo) { buscaNovo.focus(); buscaNovo.setSelectionRange(cursorPos, cursorPos); }
      }
    },

    // ── MÉTRICAS ──────────────────────────────────────────────
    renderMetricas() {
      const cont = $('metricas-container');
      if (!cont) return;

      const postosAtivos = S.escalaAtiva
        ? Object.values(S.postos).filter(p => p.escalaId === S.escalaAtiva) : [];
      const qruTotal      = postosAtivos.length;
      const pessoasCampo  = postosAtivos.reduce((a,p) => a + (p.qruPessoas||1), 0);
      const disponivel    = contarPorStatus('disponivel');
      const ausente       = contarPorStatus('ausente');
      const total         = Object.keys(S.recursos).length;
      const escala        = S.escalaAtiva ? S.escalas[S.escalaAtiva] : null;

      // Distribuição por tipo de ação
      const porAcao = {};
      postosAtivos.forEach(p => {
        if (p.tipoAcao) porAcao[p.tipoAcao] = (porAcao[p.tipoAcao]||0) + 1;
      });
      const distHTML = qruTotal
        ? Object.entries(porAcao).sort(([,a],[,b])=>b-a).map(([acao,qty]) => `
          <div class="dist-linha">
            <span class="dist-label">${esc(acao)}</span>
            <div class="dist-bar-wrap">
              <div class="dist-bar" style="width:${Math.round((qty/qruTotal)*100)}%"></div>
            </div>
            <span class="dist-val">${qty}</span>
          </div>`).join('')
        : '<p class="text-muted" style="text-align:center;padding:16px">Sem dados de postos no turno</p>';

      cont.innerHTML = `
        <div class="metricas-grid">
          <div class="metrica-card metrica-accent">
            <div class="metrica-valor">${qruTotal}</div>
            <div class="metrica-label">QRUs NO TURNO</div>
          </div>
          <div class="metrica-card">
            <div class="metrica-valor">${pessoasCampo}</div>
            <div class="metrica-label">PESSOAS EM CAMPO</div>
          </div>
          <div class="metrica-card metrica-success">
            <div class="metrica-valor">${disponivel}</div>
            <div class="metrica-label">DISPONÍVEIS</div>
          </div>
          <div class="metrica-card metrica-warning">
            <div class="metrica-valor">${ausente}</div>
            <div class="metrica-label">AUSENTES</div>
          </div>
          <div class="metrica-card">
            <div class="metrica-valor">${total}</div>
            <div class="metrica-label">CADASTRADOS</div>
          </div>
        </div>
        ${escala ? `<p class="metrica-escala-info">Escala ativa: ${esc(turnoLabel(escala))} · ${formatData(escala.data)}</p>` : ''}
        <div class="bloco-card" style="margin-top:20px">
          <div class="bloco-titulo">DISTRIBUIÇÃO POR TIPO DE AÇÃO</div>
          <div style="padding:8px 16px 12px">${distHTML}</div>
        </div>`;
    },

    // ── RELATÓRIO MENSAL — controle de visibilidade por role ──
    // Gerar relatório é decisão gerencial (Supervisor+); o botão é
    // HTML estático, então a visibilidade é controlada aqui ao
    // entrar na aba, em vez de via template gerado.
    renderRelatorioTab() {
      const btn = $('btn-gerar-relatorio');
      if (!btn) return;
      if (canManage()) {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
        if (!$('relatorio-sem-permissao')) {
          btn.insertAdjacentHTML('afterend',
            `<p id="relatorio-sem-permissao" class="text-muted">Gerar relatório mensal exige perfil Supervisor ou Admin.</p>`);
        }
      }
    },

    // ── TEMPLATES ─────────────────────────────────────────────
    renderTemplates() {
      const cont = $('templates-container');
      if (!cont) return;

      const buscaAnterior = $('busca-template');
      const tinhaFoco  = document.activeElement === buscaAnterior;
      const cursorPos  = tinhaFoco ? buscaAnterior.selectionStart : null;
      const buscaValor = buscaAnterior ? buscaAnterior.value : '';
      const busca      = buscaValor.toLowerCase().trim();

      let lista = sortByNome(Object.entries(S.templates));
      if (busca) lista = lista.filter(([,t]) =>
        (t.nome||'').toLowerCase().includes(busca) ||
        (t.tipoMissao||'').toLowerCase().includes(busca));

      const a = canAdmin(); // templates são configuração — exclusivo do Admin

      const cards = lista.map(([id, t]) => {
        const nPostos = (t.postosPadrao||[]).length;
        return `<div class="bloco-card template-card">
          <div class="template-header">
            <div class="template-info">
              <span class="template-nome">${esc(t.nome)}</span>
              ${t.tipoMissao ? `<span class="badge badge-accent">${esc(t.tipoMissao)}</span>` : ''}
              ${t.bairro ? `<span class="template-bairro">${upper(t.bairro)}</span>` : ''}
              ${t.horario ? `<span class="template-horario">${t.horario}h</span>` : ''}
              <span class="op-count">${nPostos} posto${nPostos!==1?'s':''} padrão</span>
            </div>
            <div class="template-acoes">
              ${S.escalaAtiva
                ? `<button class="btn btn-primary btn-sm"
                     onclick="NIT_EFETIVO.Actions.aplicarTemplate('${id}')">
                     ▶ APLICAR NO TURNO
                   </button>`
                : '<span class="text-muted" style="font-size:.75rem">Abra um turno para aplicar</span>'}
              ${a ? `
                <button class="btn-icon" title="Editar template"
                  onclick="NIT_EFETIVO.Modals.abrirEditTemplate('${id}')">✏️</button>
                <button class="btn-icon" title="Excluir template"
                  onclick="NIT_EFETIVO.Actions.excluirTemplate('${id}')">🗑️</button>
              ` : ''}
            </div>
          </div>
          <div class="template-postos">
            ${(t.postosPadrao||[]).map((p,i) => `
              <div class="template-posto-linha">
                <span class="posto-num">[${i+1}]</span>
                <span class="posto-local">${esc(p.local)}</span>
                <span class="badge-acao">${esc(p.tipoAcao||'CONTROLE')}</span>
              </div>`).join('')}
          </div>
        </div>`;
      }).join('');

      cont.innerHTML = `
        <div class="recursos-toolbar">
          <div class="recursos-badges">
            <span class="badge badge-muted">${lista.length} template${lista.length!==1?'s':''}</span>
            ${!a ? `<span class="badge badge-muted" title="Criar/editar templates exige Admin">Somente Admin edita</span>` : ''}
          </div>
          <div class="recursos-filtros">
            <input id="busca-template" class="input-search" placeholder="Buscar template..."
              value="${esc(buscaValor)}" oninput="NIT_EFETIVO.UI.renderTemplates()">
            ${a ? `<button class="btn btn-primary btn-sm"
              onclick="NIT_EFETIVO.Modals.abrirCriarTemplate()">+ NOVO TEMPLATE</button>` : ''}
          </div>
        </div>
        ${lista.length
          ? cards
          : `<div class="sem-escala">
               <div class="sem-escala-icon">📐</div>
               <h3>Nenhum template ${busca ? 'encontrado' : 'criado'}</h3>
               <p>Crie templates para operações recorrentes como a Ciclofaixa e aplicar com um clique na abertura do turno.</p>
               ${a && !busca ? `<button class="btn btn-primary"
                 onclick="NIT_EFETIVO.Modals.abrirCriarTemplate()">CRIAR PRIMEIRO TEMPLATE</button>` : ''}
             </div>`}
      `;

      if (tinhaFoco) {
        const buscaNovo = $('busca-template');
        if (buscaNovo) { buscaNovo.focus(); buscaNovo.setSelectionRange(cursorPos, cursorPos); }
      }
    },
    renderResultadoCampo(dados, alvoId = 'campo-resultado') {
      const cont = $(alvoId);
      if (!cont) return;
      if (!dados) { cont.innerHTML = ''; return; }

      if (dados.tipo === 'nao_encontrado') {
        cont.innerHTML = `<div class="campo-card">
          <div class="campo-sem-posto">
            <p>Nenhum agente encontrado.</p>
            <p class="text-muted">Verifique o nome completo ou contate o supervisor.</p>
          </div>
        </div>`;
        return;
      }

      if (dados.tipo === 'multiplos') {
        const itens = dados.matches.map(([id,r]) =>
          `<div class="campo-match-item" onclick="NIT_EFETIVO.Campo.selecionar('${id}','${alvoId}')">
            <strong>${esc(r.nome)}</strong>
            <span>Mat: ${esc(r.matricula||'—')} · ${esc(r.cargo||'')}</span>
          </div>`
        ).join('');
        cont.innerHTML = `<div class="campo-card">
          <div class="campo-recurso-header">
            <div class="campo-nome" style="font-size:.9rem">Confirme seu nome:</div>
          </div>
          ${itens}
        </div>`;
        return;
      }

      if (dados.tipo === 'encontrado') {
        const { recurso, postos, operacoes, funcaoSup, supervisorInfo, escala } = dados;
        let corpo = '';

        if (funcaoSup) {
          corpo = `<div class="campo-qth-destaque">
            <div class="campo-qth-label">FUNÇÃO NO TURNO</div>
            <div class="campo-qth-valor">${upper(funcaoSup.camada)}</div>
            <div class="campo-qth-bairro">SUPERVISÃO / APOIO NA CENTRAL</div>
            ${funcaoSup.contato
              ? `<a href="tel:${esc(funcaoSup.contato)}" class="campo-tel">📞 ${esc(funcaoSup.contato)}</a>` : ''}
          </div>`;
        } else if (postos.length) {
          corpo = postos.map(p => {
            const op  = operacoes[p.operacaoId] || {};
            const url = `https://maps.google.com/maps?q=${encodeURIComponent((p.local||'') + ', Fortaleza, CE')}`;
            const horarioAlerta = operacaoForaDoPadrao(p, escala);
            return `<div class="campo-qth-destaque">
              <div class="campo-qtu-num">QRU Nº ${p.numero}</div>
              <div class="campo-qth-label">QTH</div>
              <div class="campo-qth-valor">${esc(p.local||'—')}</div>
              <div class="campo-qth-bairro">${esc(p.bairro||op.bairro||'')}</div>
              <div class="campo-acao-badge">${esc(p.tipoAcao||'')}</div>
              ${op.nome ? `<div class="campo-op-nome${horarioAlerta ? ' campo-op-nome-alerta' : ''}">
                Operação: ${esc(op.nome)}${op.horario?` · ${horarioAlerta?'⚠ ':''}${op.horario}h`:''}
              </div>` : ''}
              ${horarioAlerta ? `<div class="campo-horario-alerta-nota">⚠ Fora do horário oficial do turno (${esc(escala?.horarioInicio)}–${esc(escala?.horarioFim)})</div>` : ''}
              ${p.obs   ? `<div class="campo-obs">${esc(p.obs)}</div>` : ''}
              <a href="${url}" target="_blank" rel="noopener" class="btn-maps">📍 Abrir no Maps</a>
            </div>`;
          }).join('');
        } else {
          corpo = `<div class="campo-sem-posto">
            <p>Você ainda não tem um QTH designado.</p>
            <p class="text-muted">Aguarde a designação do supervisor.</p>
          </div>`;
        }

        cont.innerHTML = `<div class="campo-card">
          <div class="campo-recurso-header">
            <div class="campo-nome">${esc(recurso.nome)}</div>
            <div class="campo-mat">Mat: ${esc(recurso.matricula||'—')} · ${esc(recurso.cargo||'')}</div>
          </div>
          ${corpo}
          ${supervisorInfo ? `
            <div class="campo-supervisor">
              <span>Supervisor: ${esc(supervisorInfo.nome)}</span>
              <a href="tel:${esc(supervisorInfo.contato)}" class="campo-tel">📞 ${esc(supervisorInfo.contato)}</a>
            </div>` : ''}
          <div class="campo-turno-info${escalaForaDoPadrao(escala) ? ' campo-turno-info-alerta' : ''}">
            ${escala ? `${escalaForaDoPadrao(escala)?'⚠ ':''}TURNO ${esc(turnoLabel(escala))} · ${esc(escala.horarioInicio)}–${esc(escala.horarioFim)}` : 'TURNO A DEFINIR'}
          </div>
        </div>`;
      }
    },

    // ── TOAST ─────────────────────────────────────────────────
    toast(msg, tipo = 'info') {
      vibrar(tipo === 'danger' ? [80,40,80] : 40);
      const t = document.createElement('div');
      t.className = `toast toast-${tipo}`;
      t.textContent = msg;
      $('toast-container')?.appendChild(t);
      requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      }, 3200);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // MODALS
  // ═══════════════════════════════════════════════════════════════
  const Modals = {

    _open(id)  { $(id)?.classList.add('open'); },
    _close(id) {
      $(id)?.classList.remove('open');
      document.querySelectorAll(`#${id} input:not([type=hidden]):not([readonly]),
        #${id} select:not([readonly]), #${id} textarea`)
        .forEach(el => { el.value = ''; });
    },
    _onOverlayClick(e, id) { if (e.target.id === id) Modals._close(id); },

    // ── COMBOBOX DIGITÁVEL (JS puro, sem <datalist>) ───────────
    // <datalist> tem suporte fraco/inexistente no Safari iOS e é
    // inconsistente em vários navegadores mobile — por isso não é usado.
    // Este combobox próprio funciona igual em qualquer navegador.
    // Renderiza no máximo 8 sugestões por vez, então escala bem mesmo
    // com centenas de recursos cadastrados (200+ não é problema aqui).
    _comboData: {}, // { inputId: { items:[{value,label}], value: string|null } }

    _montarCombo(inputId, listId, items, selectedValue = null) {
      const inp = $(inputId), list = $(listId);
      if (!inp || !list) return;
      Modals._comboData[inputId] = { items, value: selectedValue };

      const atual = selectedValue ? items.find(it => it.value === selectedValue) : null;
      inp.value = atual ? atual.label : '';
      list.innerHTML = '';
      list.classList.remove('open');

      // Liga os listeners apenas uma vez por elemento (input persiste entre aberturas do modal)
      if (!inp._comboBound) {
        inp._comboBound = true;
        inp.addEventListener('input', () => Modals._filtrarCombo(inputId, listId));
        inp.addEventListener('focus', () => Modals._filtrarCombo(inputId, listId));
        inp.addEventListener('blur', () => {
          // Atraso para o clique no item (mousedown) registrar antes do dropdown fechar
          setTimeout(() => { const l = $(listId); if (l) l.classList.remove('open'); }, 150);
        });
      }
    },

    // Posiciona o dropdown com position:fixed baseado na posição real do input.
    // Necessário porque o modal tem rolagem própria (overflow-y:auto) — um
    // dropdown position:absolute comum seria cortado na borda do modal.
    _posicionarCombo(inp, list) {
      const r = inp.getBoundingClientRect();
      list.style.position = 'fixed';
      list.style.top      = `${r.bottom + 4}px`;
      list.style.left     = `${r.left}px`;
      list.style.width    = `${r.width}px`;
    },

    _reposicionarCombosAbertos() {
      document.querySelectorAll('.combo-list.open').forEach(list => {
        const inp = $(list.id.replace('-list', '-input'));
        if (inp) Modals._posicionarCombo(inp, list);
      });
    },

    _filtrarCombo(inputId, listId) {
      const inp = $(inputId), list = $(listId);
      const data = Modals._comboData[inputId];
      if (!inp || !list || !data) return;

      const termo = inp.value.trim().toLowerCase();
      const filtrados = termo
        ? data.items.filter(it => it.label.toLowerCase().includes(termo))
        : data.items;
      const visiveis = filtrados.slice(0, 8); // teto fixo — rápido mesmo com listas grandes

      if (!visiveis.length) {
        list.innerHTML = `<div class="combo-empty">Nenhum resultado</div>`;
      } else {
        list.innerHTML = visiveis.map(it => `
          <div class="combo-item" onmousedown="NIT_EFETIVO.Modals._selecionarCombo('${inputId}','${listId}','${it.value}')">
            ${Modals._destacar(it.label, termo)}
          </div>`).join('') +
          (filtrados.length > visiveis.length
            ? `<div class="combo-mais">+ ${filtrados.length - visiveis.length} resultado(s) — refine a busca</div>`
            : '');
      }
      Modals._posicionarCombo(inp, list);
      list.classList.add('open');

      // Registra listeners globais de reposição apenas uma vez
      if (!Modals._comboReposBound) {
        Modals._comboReposBound = true;
        window.addEventListener('scroll', Modals._reposicionarCombosAbertos, true);
        window.addEventListener('resize', Modals._reposicionarCombosAbertos);
      }
    },

    _destacar(label, termo) {
      if (!termo) return esc(label);
      const idx = label.toLowerCase().indexOf(termo);
      if (idx === -1) return esc(label);
      return esc(label.slice(0, idx)) +
        `<mark>${esc(label.slice(idx, idx + termo.length))}</mark>` +
        esc(label.slice(idx + termo.length));
    },

    _selecionarCombo(inputId, listId, value) {
      const inp = $(inputId), list = $(listId);
      const data = Modals._comboData[inputId];
      const item = data?.items.find(it => it.value === value);
      if (!inp || !item) return;
      inp.value = item.label;
      data.value = value;
      if (list) list.classList.remove('open');
    },

    _resolverCombo(inputId) {
      const inp = $(inputId);
      const data = Modals._comboData[inputId];
      if (!inp || !data) return '';
      // Caso normal: usuário clicou em um item da lista
      const atual = data.items.find(it => it.value === data.value);
      if (atual && atual.label === inp.value) return data.value;
      // Fallback: usuário digitou o texto exato sem clicar (ex: autofill, colar)
      const exato = data.items.find(it =>
        it.label.toLowerCase() === inp.value.trim().toLowerCase());
      return exato ? exato.value : '';
    },

    _editPostoId: null, // null = modo criação; string = modo edição

    // ── ABRIR TURNO ──────────────────────────────────────────
    _editEscalaMode: false,

    abrirCriarEscala() {
      Modals._editEscalaMode = false;
      const di = $('nova-escala-data');
      if (di) di.value = getDataHoje();
      // Auto-selecionar turno mais próximo
      const ativos = getTurnosAtivos();
      if (ativos.length) {
        const sel = $('nova-escala-turno');
        if (sel) sel.value = ativos[0];
      }
      Modals.onTurnoChange();
      const h3  = document.querySelector('#modal-criar-escala .modal-header h3');
      const btn = document.querySelector('#modal-criar-escala .btn-primary');
      if (h3)  h3.textContent  = 'ABRIR TURNO';
      if (btn) btn.textContent = 'ABRIR TURNO';
      Modals._open('modal-criar-escala');
    },

    abrirEditEscala() {
      if (!S.escalaAtiva) return;
      const escala = S.escalas[S.escalaAtiva];
      if (!escala) return;
      Modals._editEscalaMode = true;
      const set = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
      set('nova-escala-data', escala.data);
      set('nova-escala-turno', escala.turno);
      set('nova-escala-inicio', escala.horarioInicio);
      set('nova-escala-fim', escala.horarioFim);
      const h3  = document.querySelector('#modal-criar-escala .modal-header h3');
      const btn = document.querySelector('#modal-criar-escala .btn-primary');
      if (h3)  h3.textContent  = 'EDITAR TURNO';
      if (btn) btn.textContent = 'SALVAR ALTERAÇÕES';
      Modals._open('modal-criar-escala');
    },

    fecharCriarEscala() {
      Modals._editEscalaMode = false;
      Modals._close('modal-criar-escala');
    },
    onTurnoChange() {
      const tv  = $('nova-escala-turno')?.value;
      const cfg = CFG.TURNOS[tv];
      const ini = $('nova-escala-inicio');
      const fim = $('nova-escala-fim');
      if (!ini || !fim) return;
      ini.value = cfg ? cfg.inicio : '';
      fim.value = cfg ? cfg.fim   : '';
    },
    async confirmarCriarEscala() {
      const turno = $('nova-escala-turno')?.value;
      const data  = $('nova-escala-data')?.value;
      const ini   = $('nova-escala-inicio')?.value;
      const fim   = $('nova-escala-fim')?.value;
      if (!turno||!data||!ini||!fim) { UI.toast('Preencha todos os campos','warning'); return; }
      const cfg   = CFG.TURNOS[turno] || {};
      // Label = apenas o nome do turno. O horário é exibido separadamente
      // (cabeçalho da escala, badge do Modo Campo, rodapé do Modo Campo) —
      // embuti-lo aqui também causava duplicação visual ("MANHÃ 05:30–11:30 · ... 05:30–11:30").
      const label = cfg.label || upper(turno);
      const dados = { turno, data, horarioInicio:ini, horarioFim:fim, label };

      if (Modals._editEscalaMode && S.escalaAtiva) {
        await DB.editarEscala(S.escalaAtiva, dados);
        UI.toast('Turno atualizado!', 'success');
      } else {
        await DB.criarEscala(dados);
        UI.toast('Turno aberto!', 'success');
      }
      Modals.fecharCriarEscala();
    },

    // ── NOVA OPERAÇÃO ────────────────────────────────────────
    _editOperacaoId: null, // null = criação; string = edição

    abrirAddOperacao() {
      if (!S.escalaAtiva) { UI.toast('Abra um turno primeiro','warning'); return; }
      Modals._editOperacaoId = null;
      // Mostrar ou ocultar selector de templates
      const tmplSection = $('op-template-section');
      const tmplSel     = $('op-template-select');
      const templates   = Object.entries(S.templates);
      if (tmplSection && tmplSel) {
        if (templates.length) {
          tmplSection.style.display = '';
          tmplSel.innerHTML =
            `<option value="">— Sem template (operação manual) —</option>` +
            templates
              .sort(([,a],[,b]) => (a.nome||'').localeCompare(b.nome||'','pt-BR'))
              .map(([id,t]) => `<option value="${id}">${esc(t.nome)}${t.bairro?' · '+upper(t.bairro):''}</option>`)
              .join('');
        } else {
          tmplSection.style.display = 'none';
        }
      }
      const tipoSel = $('op-tipo-missao');
      if (tipoSel) tipoSel.innerHTML = `<option value="">— Selecionar —</option>` +
        CFG.TIPOS_MISSAO.map(t => `<option>${t}</option>`).join('');
      const h3  = document.querySelector('#modal-add-operacao .modal-header h3');
      const btn = document.querySelector('#modal-add-operacao .btn-primary');
      if (h3)  h3.textContent  = 'NOVA OPERAÇÃO';
      if (btn) btn.textContent = 'ADICIONAR';
      Modals._open('modal-add-operacao');
    },

    abrirEditOperacao(opId) {
      const op = S.operacoes[opId];
      if (!op) return;
      Modals._editOperacaoId = opId;
      // Editar não usa template — esconde o seletor
      const tmplSection = $('op-template-section');
      if (tmplSection) tmplSection.style.display = 'none';

      const set = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
      set('op-nome', op.nome);
      set('op-bairro', op.bairro);
      set('op-horario', op.horario);

      const tipoSel = $('op-tipo-missao');
      if (tipoSel) tipoSel.innerHTML = `<option value="">— Selecionar —</option>` +
        CFG.TIPOS_MISSAO.map(t => `<option${t===op.tipoMissao?' selected':''}>${t}</option>`).join('');

      const h3  = document.querySelector('#modal-add-operacao .modal-header h3');
      const btn = document.querySelector('#modal-add-operacao .btn-primary');
      if (h3)  h3.textContent  = 'EDITAR OPERAÇÃO';
      if (btn) btn.textContent = 'SALVAR ALTERAÇÕES';
      Modals._open('modal-add-operacao');
    },

    fecharAddOperacao() {
      Modals._editOperacaoId = null;
      Modals._close('modal-add-operacao');
    },

    async confirmarAddOperacao() {
      // Edição: nunca passa por template
      if (Modals._editOperacaoId) {
        const nome       = $('op-nome')?.value.trim();
        const bairro     = $('op-bairro')?.value.trim();
        const hor        = $('op-horario')?.value;
        const tipoMissao = $('op-tipo-missao')?.value;
        if (!nome) { UI.toast('Nome é obrigatório','warning'); return; }
        if (!tipoMissao) { UI.toast('Selecione o tipo de missão — usado no Relatório Mensal','warning'); return; }
        await DB.editarOperacao(Modals._editOperacaoId, {
          nome: upper(nome), bairro: upper(bairro), horario: hor, tipoMissao
        });
        Modals.fecharAddOperacao();
        UI.toast('Operação atualizada!', 'success');
        return;
      }

      const templateId = $('op-template-select')?.value || '';
      // Com template: aplica diretamente (tipo de missão já vem do template)
      if (templateId) {
        await DB.aplicarTemplate(templateId, S.escalaAtiva);
        Modals.fecharAddOperacao();
        const t = S.templates[templateId];
        UI.toast(`Template "${esc(t?.nome)}" aplicado!`, 'success');
        return;
      }
      // Sem template: operação manual
      const nome       = $('op-nome')?.value.trim();
      const bairro     = $('op-bairro')?.value.trim();
      const hor        = $('op-horario')?.value;
      const tipoMissao = $('op-tipo-missao')?.value;
      if (!nome) { UI.toast('Nome é obrigatório','warning'); return; }
      if (!tipoMissao) { UI.toast('Selecione o tipo de missão — usado no Relatório Mensal','warning'); return; }
      await DB.adicionarOperacao(S.escalaAtiva, {
        nome:upper(nome), bairro:upper(bairro), horario:hor, tipoMissao
      });
      Modals.fecharAddOperacao();
      UI.toast('Operação adicionada!', 'success');
    },

    // Lista combinada de agentes + viaturas, no formato do combo
    _itemsRecursoViatura() {
      const agentes = recursosOrdenados(([,r]) => r.status !== 'desligado')
        .map(([id,r]) => ({
          value: `a:${id}`,
          label: `${r.nome} · ${r.cargo||'—'} · ${upper(r.status||'')}`
        }));
      const vts = sortByNome(Object.entries(S.viaturas))
        .map(([id,v]) => ({ value: `v:${id}`, label: `🚓 ${v.nome||id}` }));
      return [...agentes, ...vts];
    },

    // ── ADICIONAR QRU/POSTO ──────────────────────────────────
    abrirAddPosto(opId) {
      $('posto-operacao-id').value = opId;

      // Pré-preencher bairro e horário da operação
      const op = S.operacoes[opId] || {};
      const bi = $('posto-bairro'), hi = $('posto-horario');
      if (bi && op.bairro)  bi.value = op.bairro;
      if (hi && op.horario) hi.value = op.horario;

      // Tipos de ação
      const ts = $('posto-tipo-acao');
      if (ts) ts.innerHTML = CFG.TIPOS_ACAO.map(t => `<option>${t}</option>`).join('');

      // Combo digitável de agente/viatura
      Modals._montarCombo('posto-recurso-input', 'posto-recurso-list', Modals._itemsRecursoViatura());

      Modals._open('modal-add-posto');
    },
    fecharAddPosto() {
      // Resetar para modo criação ao fechar
      Modals._editPostoId = null;
      const h3  = document.querySelector('#modal-add-posto .modal-header h3');
      const btn = document.querySelector('#modal-add-posto .btn-primary');
      if (h3)  h3.textContent  = 'ADICIONAR QRU / POSTO';
      if (btn) btn.textContent = 'ADICIONAR QRU';
      Modals._close('modal-add-posto');
    },

    abrirEditPosto(postoId) {
      const posto = S.postos[postoId];
      if (!posto) return;
      Modals._editPostoId = postoId;

      // Pré-preencher campos com dados existentes
      $('posto-operacao-id').value   = posto.operacaoId || '';
      $('posto-local').value         = posto.local      || '';
      $('posto-bairro').value        = posto.bairro     || '';
      $('posto-horario').value       = posto.horario    || '';
      $('posto-obs').value           = posto.obs        || '';
      $('posto-qru-pessoas').value   = posto.qruPessoas || 1;

      const ts = $('posto-tipo-acao');
      if (ts) ts.innerHTML = CFG.TIPOS_ACAO.map(t =>
        `<option${t === posto.tipoAcao ? ' selected' : ''}>${t}</option>`).join('');

      // Combo digitável — pré-seleciona o valor atual (a:id ou v:id)
      const valorAtual = posto.alocacao?.id
        ? `${posto.alocacao.tipo === 'viatura' ? 'v' : 'a'}:${posto.alocacao.id}`
        : null;
      Modals._montarCombo('posto-recurso-input', 'posto-recurso-list',
        Modals._itemsRecursoViatura(), valorAtual);

      // Ajustar título e botão
      const h3  = document.querySelector('#modal-add-posto .modal-header h3');
      const btn = document.querySelector('#modal-add-posto .btn-primary');
      if (h3)  h3.textContent  = `EDITAR QRU Nº ${posto.numero}`;
      if (btn) btn.textContent = 'SALVAR ALTERAÇÕES';

      Modals._open('modal-add-posto');
    },

    async confirmarAddPosto() {
      const opId    = $('posto-operacao-id')?.value;
      const local   = $('posto-local')?.value.trim();
      const bairro  = $('posto-bairro')?.value.trim();
      const horario = $('posto-horario')?.value;
      const tipo    = $('posto-tipo-acao')?.value;
      const recVal  = Modals._resolverCombo('posto-recurso-input');
      const obs     = $('posto-obs')?.value.trim();
      const qruP    = parseInt($('posto-qru-pessoas')?.value)||1;

      if (!local)  { UI.toast('Local é obrigatório','warning'); return; }
      if (!recVal) { UI.toast('Selecione um agente ou viatura válido da lista','warning'); return; }

      let alocacao;
      if (recVal.startsWith('v:')) {
        const id = recVal.slice(2);
        alocacao = { tipo:'viatura', id, nome: S.viaturas[id]?.nome||id };
      } else {
        const id = recVal.slice(2);
        alocacao = { tipo:'agente', id, nome: S.recursos[id]?.nome||id };
      }

      const op = S.operacoes[opId] || {};
      const dadosPosto = {
        local: upper(local), bairro: upper(bairro)||op.bairro||'',
        horario: horario||op.horario||'',
        tipoAcao: tipo, alocacao, obs: upper(obs), qruPessoas: qruP
      };

      if (Modals._editPostoId) {
        // ── MODO EDIÇÃO ──────────────────────────────────────
        const alocacaoAnterior = S.postos[Modals._editPostoId]?.alocacao;
        await DB.editarPosto(Modals._editPostoId, dadosPosto, alocacaoAnterior);
        Modals.fecharAddPosto();
        UI.toast('QRU atualizado!', 'success');
      } else {
        // ── MODO CRIAÇÃO ─────────────────────────────────────
        await DB.adicionarPosto({ escalaId: S.escalaAtiva, operacaoId: opId, ...dadosPosto });
        Modals.fecharAddPosto();
        UI.toast('QRU adicionado!', 'success');
      }
    },

    // ── SUPERVISÃO ───────────────────────────────────────────
    _editSupervisao: null, // { camada, recursoId } | null

    abrirAddSupervisao() {
      if (!S.escalaAtiva) { UI.toast('Abra um turno primeiro','warning'); return; }
      Modals._editSupervisao = null;
      const items = recursosOrdenados()
        .map(([id,r]) => ({ value:id, label:`${r.nome} · ${r.cargo||'—'}` }));
      Modals._montarCombo('sup-recurso-input', 'sup-recurso-list', items);
      const fEl = $('sup-funcao'), cEl = $('sup-contato');
      if (fEl) fEl.value = ''; if (cEl) cEl.value = '';
      const h3 = document.querySelector('#modal-add-supervisao .modal-header h3');
      if (h3) h3.textContent = 'SUPERVISÃO E MONITORAMENTO';
      Modals._open('modal-add-supervisao');
    },

    abrirEditSupervisao(camada, recursoId) {
      if (!S.escalaAtiva) return;
      const info = S.escalas[S.escalaAtiva]?.supervisao?.[camada]?.[recursoId];
      if (!info) return;
      Modals._editSupervisao = { camada, recursoId };
      const items = recursosOrdenados()
        .map(([id,r]) => ({ value:id, label:`${r.nome} · ${r.cargo||'—'}` }));
      Modals._montarCombo('sup-recurso-input', 'sup-recurso-list', items, recursoId);
      const camadaSel = $('sup-camada'); if (camadaSel) camadaSel.value = camada;
      const fEl = $('sup-funcao');  if (fEl) fEl.value = info.funcao  || '';
      const cEl = $('sup-contato'); if (cEl) cEl.value = info.contato || '';
      const h3 = document.querySelector('#modal-add-supervisao .modal-header h3');
      if (h3) h3.textContent = 'EDITAR SUPERVISÃO';
      Modals._open('modal-add-supervisao');
    },

    fecharAddSupervisao() {
      Modals._editSupervisao = null;
      Modals._close('modal-add-supervisao');
    },

    async confirmarAddSupervisao() {
      const recId   = Modals._resolverCombo('sup-recurso-input');
      const camada  = $('sup-camada')?.value;
      const funcao  = upper($('sup-funcao')?.value.trim());
      const contato = $('sup-contato')?.value.trim();
      if (!recId)   { UI.toast('Selecione um recurso válido da lista','warning'); return; }
      if (!camada)  { UI.toast('Selecione a função','warning'); return; }

      // Em edição, remove a entrada antiga antes de gravar a nova —
      // cobre o caso de ter trocado de pessoa ou de camada sem deixar
      // uma entrada duplicada pra trás.
      if (Modals._editSupervisao) {
        const { camada: camadaAntiga, recursoId: recIdAntigo } = Modals._editSupervisao;
        if (camadaAntiga !== camada || recIdAntigo !== recId) {
          await DB.removerSupervisao(S.escalaAtiva, camadaAntiga, recIdAntigo);
        }
      }
      await DB.editarSupervisao(S.escalaAtiva, camada, recId, { funcao, contato });
      const eraEdicao = !!Modals._editSupervisao;
      Modals.fecharAddSupervisao();
      UI.toast(eraEdicao ? 'Supervisão atualizada!' : 'Adicionado à supervisão!', 'success');
    },

    // ── TEMPLATES ────────────────────────────────────────────
    _editTemplateId: null,  // null = criar; string = editar
    _tmplPostos:     [],    // lista de postos em edição

    abrirCriarTemplate()  { Modals._abrirFormTemplate(null); },
    abrirEditTemplate(id) { Modals._abrirFormTemplate(id); },
    fecharCriarTemplate() {
      Modals._editTemplateId = null;
      Modals._tmplPostos = [];
      Modals._close('modal-criar-template');
    },

    _abrirFormTemplate(templateId) {
      Modals._editTemplateId = templateId;
      const t = templateId ? (S.templates[templateId] || {}) : {};
      Modals._tmplPostos = templateId
        ? [...(t.postosPadrao || [])].map(p => ({ ...p }))
        : [];

      const nomeEl   = $('tmpl-nome');
      const bairroEl = $('tmpl-bairro');
      const horEl    = $('tmpl-horario');
      const tipoEl   = $('tmpl-tipo-missao');
      if (nomeEl)   nomeEl.value   = t.nome    || '';
      if (bairroEl) bairroEl.value = t.bairro  || '';
      if (horEl)    horEl.value    = t.horario || '';
      if (tipoEl) {
        tipoEl.innerHTML = `<option value="">— Selecionar —</option>` +
          CFG.TIPOS_MISSAO.map(ti =>
            `<option${ti===t.tipoMissao?' selected':''}>${ti}</option>`).join('');
      }

      const h3 = document.querySelector('#modal-criar-template .modal-header h3');
      if (h3) h3.textContent = templateId ? 'EDITAR TEMPLATE' : 'NOVO TEMPLATE';

      Modals._renderTmplPostos();
      Modals._open('modal-criar-template');
    },

    _renderTmplPostos() {
      const cont = $('tmpl-postos-lista');
      if (!cont) return;
      if (!Modals._tmplPostos.length) {
        cont.innerHTML = '<p class="text-muted" style="text-align:center;padding:12px">Nenhum posto adicionado</p>';
        return;
      }
      cont.innerHTML = Modals._tmplPostos.map((p, i) => `
        <div class="tmpl-posto-linha">
          <span class="posto-num">[${i+1}]</span>
          <input class="input-field" style="flex:1" value="${esc(p.local)}"
            oninput="NIT_EFETIVO.Modals._tmplPostos[${i}].local=this.value.toUpperCase();this.value=this.value.toUpperCase()"
            placeholder="Endereço do posto">
          <select class="select-field" style="width:160px"
            onchange="NIT_EFETIVO.Modals._tmplPostos[${i}].tipoAcao=this.value">
            ${CFG.TIPOS_ACAO.map(t =>
              `<option${t===p.tipoAcao?' selected':''}>${t}</option>`).join('')}
          </select>
          <button class="btn-icon" onclick="NIT_EFETIVO.Modals._removerTmplPosto(${i})">🗑️</button>
        </div>`).join('');
    },

    _adicionarTmplPosto() {
      Modals._tmplPostos.push({ local:'', tipoAcao:'CONTROLE' });
      Modals._renderTmplPostos();
      // Focar no último input adicionado
      const inputs = document.querySelectorAll('.tmpl-posto-linha input');
      if (inputs.length) inputs[inputs.length-1].focus();
    },

    _removerTmplPosto(idx) {
      Modals._tmplPostos.splice(idx, 1);
      Modals._renderTmplPostos();
    },

    async confirmarCriarTemplate() {
      const nome       = upper($('tmpl-nome')?.value.trim());
      const bairro     = upper($('tmpl-bairro')?.value.trim());
      const hor        = $('tmpl-horario')?.value;
      const tipoMissao = $('tmpl-tipo-missao')?.value;
      if (!nome) { UI.toast('Nome do template é obrigatório','warning'); return; }
      if (!tipoMissao) { UI.toast('Selecione o tipo de missão — usado no Relatório Mensal','warning'); return; }
      const postosValidos = Modals._tmplPostos.filter(p => p.local.trim());
      if (!postosValidos.length) { UI.toast('Adicione ao menos um posto','warning'); return; }
      await DB.salvarTemplate(
        { nome, bairro, horario:hor, tipoMissao, postosPadrao: postosValidos },
        Modals._editTemplateId
      );
      Modals.fecharCriarTemplate();
      UI.toast(Modals._editTemplateId ? 'Template atualizado!' : 'Template criado!', 'success');
    },

    // ── RELATÓRIO MENSAL ─────────────────────────────────────
    abrirRelatorioMensal() {
      const mesEl = $('relatorio-mes');
      if (mesEl) mesEl.value = getDataHoje().slice(0, 7); // "YYYY-MM" do mês atual
      const statusEl = $('relatorio-status');
      if (statusEl) {
        statusEl.className = 'relatorio-status hidden';
        statusEl.textContent = '';
      }
      Modals._open('modal-relatorio-mensal');
    },
    fecharRelatorioMensal() { Modals._close('modal-relatorio-mensal'); },

    async confirmarRelatorioMensal() {
      const anoMes   = $('relatorio-mes')?.value;
      const statusEl = $('relatorio-status');
      if (!anoMes) { UI.toast('Selecione o mês','warning'); return; }
      if (typeof XLSX === 'undefined') {
        UI.toast('Biblioteca de planilha não carregou — verifique a conexão.', 'danger');
        return;
      }

      statusEl.className = 'relatorio-status';
      statusEl.textContent = 'Buscando dados no Firebase...';

      try {
        const linhas = await DB.buscarDadosRelatorioMensal(anoMes);
        if (!linhas.length) {
          statusEl.className = 'relatorio-status relatorio-erro';
          statusEl.textContent = 'Nenhum QRU encontrado para este mês.';
          return;
        }
        Modals._gerarXlsxRelatorio(anoMes, linhas);
        statusEl.className = 'relatorio-status relatorio-sucesso';
        statusEl.textContent = `Relatório gerado! ${linhas.length} QRU(s) no mês.`;
        Log.write('relatorio_mensal_gerado', null, { anoMes, totalQrus: linhas.length });
      } catch (e) {
        console.error('[relatorio mensal]', e);
        statusEl.className = 'relatorio-status relatorio-erro';
        statusEl.textContent = 'Erro ao gerar relatório. Tente novamente.';
      }
    },

    // Monta o workbook (4 abas) e dispara o download — tudo no navegador.
    // Monta uma aba de tipo de missão no layout exato do modelo oficial:
    // 3 blocos de turno (Manhã/Tarde/Noite), cada dia do mês com um
    // bloco de linhas para endereço+orientadores. O modelo original
    // reserva 3 linhas por dia; aqui o bloco cresce automaticamente se
    // houver mais de 3 QRUs no mesmo dia/turno, pra nunca perder dado.
    // Valores são gravados como números finais (não fórmulas) — é
    // mais simples, abre igual em Excel/Sheets/LibreOffice sem
    // depender de recálculo, e o relatório já é gerado a partir de
    // dados fechados, não preenchido manualmente ao longo do mês.
    _construirAbaTipoMissao(linhasDoTipo) {
      const aoa = [];
      aoa.push(['TURNO MANHÃ','','','','TURNO TARDE','','','','TURNO NOITE','','','','']);
      aoa.push(['DIA','ENDEREÇO','QUANTIDADE DE ORIENTADORES','','DIA','ENDEREÇO','QUANTIDADE DE ORIENTADORES','','DIA','ENDEREÇO','QUANTIDADE DE ORIENTADORES','','']);

      const porDia = {};
      for (let d = 1; d <= 31; d++) porDia[d] = { manha:[], tarde:[], noite:[] };
      linhasDoTipo.forEach(l => {
        if (porDia[l.dia] && porDia[l.dia][l.turno]) porDia[l.dia][l.turno].push(l);
      });

      let totalManha = 0, totalTarde = 0, totalNoite = 0;
      let totalQrus  = 0, totalOrientadores = 0;

      for (let d = 1; d <= 31; d++) {
        const m = porDia[d].manha, t = porDia[d].tarde, n = porDia[d].noite;
        const linhasNecessarias = Math.max(3, m.length, t.length, n.length);
        const qtdDia = m.length + t.length + n.length;

        for (let i = 0; i < linhasNecessarias; i++) {
          const row = new Array(13).fill('');
          if (i === 0) { row[0] = d; row[4] = d; row[8] = d; row[12] = 'QUANT POR DIA'; }
          if (i === 1) { row[12] = qtdDia; }
          if (m[i]) { row[1] = m[i].local; row[2] = m[i].pessoas; }
          if (t[i]) { row[5] = t[i].local; row[6] = t[i].pessoas; }
          if (n[i]) { row[9] = n[i].local; row[10] = n[i].pessoas; }
          aoa.push(row);
        }

        totalManha += m.length; totalTarde += t.length; totalNoite += n.length;
        totalQrus  += qtdDia;
        [...m, ...t, ...n].forEach(l => { totalOrientadores += l.pessoas; });
      }

      aoa.push(['','QUANT POR TURNO','','','','QUANT POR TURNO','','','','QUANT POR TURNO','','','QUANTIDADE TOTAL DE QRUS']);
      aoa.push(['',totalManha,'','','',totalTarde,'','','',totalNoite,'','',totalQrus]);
      aoa.push(['','','','','','','','','','','','','QUANTIDADE TOTAL DE ORIENTADORES']);
      aoa.push(['','','','','','','','','','','','',totalOrientadores]);

      return { ws: XLSX.utils.aoa_to_sheet(aoa), totalQrus, totalOrientadores };
    },

    // Aba TOTAL — rollup de QRUs e orientadores por tipo de missão
    _construirAbaTotal(totaisPorTipo) {
      const aoa = [
        [],
        ['OCORRÊNCIAS ATENDIDAS TOTAL NO MÊS'],
        ['TIPO', 'QUANT QRU', 'ORIENTADORES']
      ];
      CFG.TIPOS_MISSAO.forEach(tipo => {
        const v = totaisPorTipo[tipo] || { qrus: 0, orientadores: 0 };
        aoa.push([tipo, v.qrus, v.orientadores]);
      });
      if (totaisPorTipo['NÃO CLASSIFICADO']) {
        aoa.push(['NÃO CLASSIFICADO (operações criadas antes do campo existir)',
          totaisPorTipo['NÃO CLASSIFICADO'].qrus, totaisPorTipo['NÃO CLASSIFICADO'].orientadores]);
      }
      return XLSX.utils.aoa_to_sheet(aoa);
    },

    // Aba BAIRROS — matriz bairro × tipo de missão (quantidade de QRUs).
    // Bairros fora da lista oficial (digitados livremente pelo supervisor
    // e que não batem com nenhum dos 106 nomes oficiais) caem num bucket
    // "BAIRRO NÃO RECONHECIDO" no fim, sem perder dado.
    _construirAbaBairros(linhas) {
      const porBairroTipo = {};
      const bairrosExtras = new Set();
      linhas.forEach(l => {
        const reconhecido = CFG.BAIRROS_OFICIAL.includes(l.bairro);
        const chave = reconhecido ? l.bairro : 'BAIRRO NÃO RECONHECIDO';
        if (!reconhecido) bairrosExtras.add(l.bairro);
        porBairroTipo[chave] = porBairroTipo[chave] || {};
        porBairroTipo[chave][l.tipoMissao] = (porBairroTipo[chave][l.tipoMissao] || 0) + 1;
      });

      const header = ['BAIRRO', ...CFG.TIPOS_MISSAO, 'TOTAL'];
      const aoa = [header];
      CFG.BAIRROS_OFICIAL.forEach(bairro => {
        const dadosBairro = porBairroTipo[bairro] || {};
        let total = 0;
        const linha = [bairro, ...CFG.TIPOS_MISSAO.map(tipo => {
          const v = dadosBairro[tipo] || 0;
          total += v;
          return v;
        })];
        linha.push(total);
        aoa.push(linha);
      });
      if (bairrosExtras.size) {
        const dadosExtra = porBairroTipo['BAIRRO NÃO RECONHECIDO'] || {};
        let total = 0;
        const linha = [`NÃO RECONHECIDO (${[...bairrosExtras].join(', ')})`,
          ...CFG.TIPOS_MISSAO.map(tipo => {
            const v = dadosExtra[tipo] || 0;
            total += v;
            return v;
          })];
        linha.push(total);
        aoa.push(linha);
      }
      return XLSX.utils.aoa_to_sheet(aoa);
    },

    _gerarXlsxRelatorio(anoMes, linhas) {
      const wb = XLSX.utils.book_new();
      const totaisPorTipo = {};

      // Uma aba por tipo de missão, na ordem oficial do modelo
      CFG.TIPOS_MISSAO.forEach(tipo => {
        const linhasDoTipo = linhas.filter(l => l.tipoMissao === tipo);
        const { ws, totalQrus, totalOrientadores } = Modals._construirAbaTipoMissao(linhasDoTipo);
        totaisPorTipo[tipo] = { qrus: totalQrus, orientadores: totalOrientadores };
        // Nome de aba do Excel tem limite de 31 caracteres
        XLSX.utils.book_append_sheet(wb, ws, tipo.slice(0, 31));
      });

      // Dados sem tipo de missão (operações criadas antes do campo existir)
      const naoClassificadas = linhas.filter(l => l.tipoMissao === 'NÃO CLASSIFICADO');
      if (naoClassificadas.length) {
        const { ws, totalQrus, totalOrientadores } = Modals._construirAbaTipoMissao(naoClassificadas);
        totaisPorTipo['NÃO CLASSIFICADO'] = { qrus: totalQrus, orientadores: totalOrientadores };
        XLSX.utils.book_append_sheet(wb, ws, 'NÃO CLASSIFICADO');
      }

      XLSX.utils.book_append_sheet(wb, Modals._construirAbaTotal(totaisPorTipo), 'TOTAL');
      XLSX.utils.book_append_sheet(wb, Modals._construirAbaBairros(linhas), 'BAIRROS');

      XLSX.writeFile(wb, `NIT_Efetivo_Relatorio_${anoMes}.xlsx`);
    },

    // ── CADASTRAR RECURSO ─────────────────────────────────────
    _editRecursoId: null, // null = modo criação; string = modo edição

    abrirCadastroRecurso() {
      Modals._editRecursoId = null;
      const h3  = document.querySelector('#modal-cadastro-recurso .modal-header h3');
      const btn = document.querySelector('#modal-cadastro-recurso .btn-primary');
      if (h3)  h3.textContent  = 'CADASTRAR RECURSO';
      if (btn) btn.textContent = 'CADASTRAR';
      Modals._open('modal-cadastro-recurso');
    },

    abrirEditRecurso(id) {
      const r = S.recursos[id];
      if (!r) return;
      Modals._editRecursoId = id;
      const set = (elId, val) => { const el = $(elId); if (el) el.value = val || ''; };
      set('rec-nome', r.nome);
      set('rec-matricula', r.matricula);
      set('rec-cargo', r.cargo);
      set('rec-turno', r.turno_padrao);
      set('rec-telefone', r.telefone);
      set('rec-transporte', r.transporte);
      set('rec-bairro', r.bairro);
      const h3  = document.querySelector('#modal-cadastro-recurso .modal-header h3');
      const btn = document.querySelector('#modal-cadastro-recurso .btn-primary');
      if (h3)  h3.textContent  = 'EDITAR RECURSO';
      if (btn) btn.textContent = 'SALVAR ALTERAÇÕES';
      Modals._open('modal-cadastro-recurso');
    },

    fecharCadastroRecurso() {
      Modals._editRecursoId = null;
      Modals._close('modal-cadastro-recurso');
    },

    async confirmarCadastroRecurso() {
      const nome  = upper($('rec-nome')?.value.trim());
      const mat   = $('rec-matricula')?.value.trim();
      if (!nome||!mat) { UI.toast('Nome e matrícula são obrigatórios','warning'); return; }
      const dados = {
        nome,
        matricula:  mat,
        cargo:      $('rec-cargo')?.value      || '',
        telefone:   $('rec-telefone')?.value   || '',
        turno_padrao:$('rec-turno')?.value     || 'manha',
        transporte: $('rec-transporte')?.value || 'proprio',
        bairro:     upper($('rec-bairro')?.value.trim())
      };
      if (Modals._editRecursoId) {
        await DB.editarRecurso(Modals._editRecursoId, dados);
        UI.toast('Recurso atualizado!', 'success');
      } else {
        await DB.cadastrarRecurso(dados);
        UI.toast('Recurso cadastrado!', 'success');
      }
      Modals.fecharCadastroRecurso();
    },

    // ── EQUIPES / VIATURAS — entidade persistente entre turnos ──
    _editViaturaId: null,  // null = criar; string = editar

    abrirCadastroViatura()  { Modals._abrirFormViatura(null); },
    abrirEditViatura(id)    { Modals._abrirFormViatura(id); },
    fecharCadastroViatura() {
      Modals._editViaturaId = null;
      Modals._close('modal-cadastro-viatura');
    },

    _abrirFormViatura(viaturaId) {
      Modals._editViaturaId = viaturaId;
      const v = viaturaId ? (S.viaturas[viaturaId] || {}) : {};

      const nomeEl = $('vt-nome');
      if (nomeEl) nomeEl.value = v.nome || '';

      const recursosOrd = recursosOrdenados(([,r]) => r.status !== 'desligado');

      // Combo digitável de líder
      const itemsLider = recursosOrd.map(([id,r]) =>
        ({ value:id, label:`${r.nome} · ${r.cargo||'—'}` }));
      Modals._montarCombo('vt-lider-input', 'vt-lider-list', itemsLider, v.liderId || null);

      // Checklist de membros — todos os recursos, marcando os já vinculados
      const membrosCont = $('vt-membros-lista');
      const filtroEl     = $('vt-membros-filtro');
      if (filtroEl) filtroEl.value = '';
      if (membrosCont) {
        const membrosAtuais = v.membrosIds || {};
        membrosCont.innerHTML = recursosOrd.length
          ? recursosOrd.map(([id,r]) => `
              <label class="vt-membro-item">
                <input type="checkbox" value="${id}"${membrosAtuais[id]?' checked':''}>
                <span>${esc(r.nome)} · ${r.cargo||''}</span>
              </label>`).join('')
          : `<p class="text-muted" style="padding:8px">Cadastre recursos primeiro</p>`;
      }

      const h3 = document.querySelector('#modal-cadastro-viatura .modal-header h3');
      if (h3) h3.textContent = viaturaId ? 'EDITAR EQUIPE' : 'CADASTRAR EQUIPE';

      Modals._open('modal-cadastro-viatura');
    },

    // Filtra a checklist de membros sem re-renderizar (evita perda de foco)
    _filtrarMembros(termo) {
      const t = (termo || '').toLowerCase().trim();
      document.querySelectorAll('#vt-membros-lista .vt-membro-item').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(t) ? '' : 'none';
      });
    },

    async confirmarCadastroViatura() {
      const nome    = upper($('vt-nome')?.value.trim());
      const liderId = Modals._resolverCombo('vt-lider-input');
      if (!nome)    { UI.toast('Nome da equipe é obrigatório','warning'); return; }
      if (!liderId) { UI.toast('Selecione um líder válido da lista','warning'); return; }

      const membrosIds = {};
      document.querySelectorAll('#vt-membros-lista input[type=checkbox]:checked')
        .forEach(el => { membrosIds[el.value] = true; });

      if (Modals._editViaturaId) {
        await DB.editarViatura(Modals._editViaturaId, { nome, liderId, membrosIds });
        UI.toast('Equipe atualizada!', 'success');
      } else {
        await DB.cadastrarViatura({ nome, liderId, membrosIds });
        UI.toast('Equipe cadastrada!', 'success');
      }
      Modals.fecharCadastroViatura();
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════
  const Actions = {
    async mudarStatus(id, status) {
      vibrar(40);
      await DB.setStatusRecurso(id, status);
      UI.toast(`Status → ${upper(status)}`, 'info');
    },

    async excluirRecurso(id) {
      const r = S.recursos[id];
      if (!r) return;
      if (!confirm(`Excluir o recurso "${r.nome}"?\n\nEsta ação não pode ser desfeita.`)) return;
      vibrar([60,40,60]);
      try {
        await DB.excluirRecurso(id);
        UI.toast('Recurso excluído.', 'info');
      } catch (e) {
        if (e.message === 'RECURSO_EM_USO') {
          UI.toast('Não é possível excluir: o recurso está alocado em um QRU ativo. Libere-o primeiro.', 'danger');
        } else {
          console.error('[excluirRecurso]', e);
          UI.toast('Erro ao excluir recurso.', 'danger');
        }
      }
    },

    async excluirEscala(escalaId) {
      const escala = S.escalas[escalaId];
      if (!escala) return;
      if (!confirm(`Excluir este turno inteiro?\n\nTodas as operações e QRUs dele serão removidos. Os recursos alocados voltam para DISPONÍVEL.\n\nEsta ação não pode ser desfeita.`)) return;
      vibrar([60,40,60]);
      await DB.excluirEscala(escalaId);
      UI.toast('Turno excluído.', 'info');
    },

    async excluirOperacao(opId) {
      const op = S.operacoes[opId];
      if (!op) return;
      const nPostos = Object.values(S.postos).filter(p => p.operacaoId === opId).length;
      if (!confirm(`Excluir a operação "${op.nome}"?\n\n${nPostos} QRU(s) dela serão removidos junto. Os recursos alocados voltam para DISPONÍVEL.`)) return;
      vibrar([60,40,60]);
      await DB.excluirOperacao(opId);
      UI.toast('Operação excluída.', 'info');
    },

    async removerSupervisao(escalaId, camada, recursoId) {
      if (!confirm('Remover esta pessoa da supervisão do turno?')) return;
      vibrar(40);
      await DB.removerSupervisao(escalaId, camada, recursoId);
      UI.toast('Removido da supervisão.', 'info');
    },

    async excluirPosto(postoId) {
      const posto = S.postos[postoId];
      if (!posto) return;
      if (!confirm(`Excluir QRU [${posto.numero}] ${posto.local}?\n\nO recurso alocado será liberado.`)) return;
      vibrar([60,40,60]);
      await DB.excluirPosto(postoId);
      UI.toast('QRU excluído.', 'info');
    },

    async excluirTemplate(templateId) {
      const t = S.templates[templateId];
      if (!t) return;
      if (!confirm(`Excluir template "${t.nome}"?\n\nEscalas já criadas com este template não são afetadas.`)) return;
      vibrar([60,40,60]);
      await DB.excluirTemplate(templateId);
      UI.toast('Template excluído.', 'info');
    },

    async excluirViatura(id) {
      const v = S.viaturas[id];
      if (!v) return;
      if (!confirm(`Excluir a equipe "${v.nome}"?\n\nSerá removida de qualquer turno onde estiver escalada.`)) return;
      vibrar([60,40,60]);
      await DB.excluirViatura(id);
      UI.toast('Equipe excluída.', 'info');
    },

    async toggleViaturaEscala(id) {
      if (!S.escalaAtiva) { UI.toast('Abra um turno primeiro','warning'); return; }
      const estavaAtiva = !!S.escalas[S.escalaAtiva]?.viaturasEscaladas?.[id];
      vibrar(40);
      await DB.toggleViaturaEscala(id);
      UI.toast(estavaAtiva ? 'Removida do turno.' : 'Equipe escalada para o turno!', 'success');
    },

    async aplicarTemplate(templateId) {
      const t = S.templates[templateId];
      if (!t || !S.escalaAtiva) return;
      if (!confirm(`Aplicar template "${t.nome}"?\n\n${(t.postosPadrao||[]).length} postos serão criados sem alocação — você designa os agentes em seguida.`)) return;
      vibrar(50);
      await DB.aplicarTemplate(templateId, S.escalaAtiva);
      UI.switchTab('escala');
      UI.toast(`"${t.nome}" aplicado! Designe os agentes nos postos.`, 'success');
    },

    async encerrarEscala() {
      if (!S.escalaAtiva) return;
      if (!confirm('Encerrar o turno?\n\nOs recursos escalados voltarão para DISPONÍVEL.')) return;
      vibrar([60,40,60]);
      await DB.encerrarEscala(S.escalaAtiva);
      UI.toast('Turno encerrado.', 'info');
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════
  async function init() {
    firebase.initializeApp(CFG.firebase);

    // Relógio — atualiza os dois ponteiros simultaneamente
    const tick = () => {
      const h = new Date().toLocaleTimeString('pt-BR',{ timeZone:'America/Fortaleza' });
      ['relogio-campo','relogio-dash'].forEach(id => { const el=$(id); if(el) el.textContent=h; });
    };
    tick();
    setInterval(tick, 1000);

    // Caixa alta automática em inputs de texto
    document.querySelectorAll('input[type=text],input[type=tel],textarea').forEach(el => {
      el.addEventListener('input', () => { el.value = el.value.toUpperCase(); });
    });

    Auth.init();
  }

  // ═══════════════════════════════════════════════════════════════
  // API PÚBLICA (usada nos onclick do HTML)
  // ═══════════════════════════════════════════════════════════════
  return { Auth, DB, UI, Modals, Actions, Campo, Log, init };

})();

window.addEventListener('DOMContentLoaded', () => NIT_EFETIVO.init());
