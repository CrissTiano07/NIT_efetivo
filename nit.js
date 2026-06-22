'use strict';

    // ── FIREBASE ──────────────────────────────────────────────────────────────
    window.NitFirebase = {
        status: 'inicializando',
        db: null,

        _aguardarSDK() {
            return new Promise((resolve, reject) => {
                if (typeof firebase !== 'undefined' && window.db) { resolve(); return; }
                let tentativas = 0;
                const check = setInterval(() => {
                    tentativas++;
                    if (typeof firebase !== 'undefined' && window.db) {
                        clearInterval(check); resolve();
                    } else if (tentativas > 40) {
                        clearInterval(check); reject(new Error('Firebase SDK timeout'));
                    }
                }, 100);
            });
        },

        async _init() {
            return new Promise(async resolve => {
                const timeout = setTimeout(() => { this._setStatus('offline'); resolve(false); }, 5000);
                try {
                    await this._aguardarSDK();
                    this.db = window.db;
                    this.db.ref('.info/connected').on('value', snap => {
                        this._setStatus(snap.val() ? 'online' : 'offline');
                    });
                    clearTimeout(timeout);
                    this._setStatus('online');
                    resolve(true);
                } catch (e) {
                    console.warn('[NIT] Firebase SDK não carregado:', e.message);
                    clearTimeout(timeout);
                    this._setStatus('offline');
                    resolve(false);
                }
            });
        },

        exec(fn) {
            if (!this.db) return undefined;
            const ref    = (db, path) => path ? db.ref(path) : db.ref();
            const update = (r, data)  => r.update(data);
            const push   = (r, data)  => r.push(data);
            return fn(this.db, ref, update, push);
        },

        _setStatus(status) {
            this.status = status;
            const el = document.getElementById('nit-firebase-status');
            if (!el) return;
            const map = {
                online:        { dot: '#22C55E', text: 'Firebase online',  color: '#22C55E' },
                offline:       { dot: '#EF4444', text: 'Firebase offline', color: '#EF4444' },
                inicializando: { dot: '#0EA5E9', text: 'Conectando…',      color: '#0EA5E9' },
            };
            const s   = map[status] || map.offline;
            const dot = el.querySelector('.nit-status-dot');
            if (dot) dot.style.backgroundColor = s.dot;
            const txt = el.querySelector('span:last-child');
            if (txt) { txt.textContent = s.text; txt.style.color = s.color; }
        },
    };

    // ── LOGIN ─────────────────────────────────────────────────────────────────
    const NitLogin = {
        operador: null,
        turno:    null,

        inicializar() {
            const nome   = document.getElementById('login-nome');
            const turno  = document.getElementById('login-turno');
            const btn    = document.getElementById('btn-login-entrar');
            const checar = () => { btn.disabled = !(nome.value.trim().length >= 2 && turno.value); };
            nome.addEventListener('input', checar);
            turno.addEventListener('change', checar);
            nome.addEventListener('keydown',  e => { if (e.key === 'Enter') turno.focus(); });
            turno.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) this.confirmar(); });
            btn.addEventListener('click', () => this.confirmar());
            setTimeout(() => nome.focus(), 100);
            checar();
        },

        confirmar() {
            const nome  = document.getElementById('login-nome').value.trim();
            const turno = document.getElementById('login-turno').value;
            if (!nome || !turno) return;
            this.operador = nome;
            this.turno    = turno;
            const badge = document.getElementById('nit-operador-badge');
            if (badge) { badge.textContent = `${nome} · ${turno}`; badge.style.display = ''; }
            sessionStorage.setItem('nit-operador', nome);
            sessionStorage.setItem('nit-turno',    turno);
            NitFirebase.exec((db, ref, update) =>
                update(ref(db, 'meta/sessao'), { operador: nome, turno, entradaTs: Date.now() })
            );
            document.getElementById('nit-login-overlay').classList.add('hidden');
            showToast(`Bem-vindo, ${nome}!`, 'success');
            registrarAcao(`Login: ${nome} — ${turno}.`);
            // ✅ Verifica lacuna de processamento noturno (delay para garantir DOM pronto)
            setTimeout(() => NitProcessamento.verificar(), 800);
        },

        tentarRestaurar() {
            const nome  = sessionStorage.getItem('nit-operador');
            const turno = sessionStorage.getItem('nit-turno');
            if (!nome || !turno) return false;
            document.getElementById('login-nome').value  = nome;
            document.getElementById('login-turno').value = turno;
            this.confirmar();
            return true;
        },
    };

    // ── FILTRO DE DATA ────────────────────────────────────────────────────────
    // ── FILTRO DE DATA ────────────────────────────────────────────────────────
const NitData = {
    hoje: () => {
        const d  = new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
    },
};
    // ── ESTADO GLOBAL ─────────────────────────────────────────────────────────
    window.AppState = {
        STORAGE_KEY_SEMAFORO: 'nit-v12-semaforo',
        STORAGE_KEY_DADOS:    'nit-v12-dadosMestres',
        cardIdCounter:           0,
        totalOcorrenciasCriadas: 0,
        draggedCard:  null,
        placeholder:  null,
        despachoTipo: 'vl',
        dadosMestres: { operadores: [], supervisores: [], monitores: [], locais: [], qrus: [] },
    };

    // ── DOM CACHE ─────────────────────────────────────────────────────────────
    const DOM = {};
    function queryDOM() {
        Object.assign(DOM, {
            tabButtons:               document.querySelectorAll('.tab-button'),
            tabContents:              document.querySelectorAll('.tab-content'),
            toastContainer:           document.getElementById('toast-container'),
            relatorioBrutoInput:      document.getElementById('relatorio-bruto-input'),
            btnProcessar:             document.getElementById('btn-processar'),
            relatorioFinalPreview:    document.getElementById('relatorio-final-preview'),
            checkIncluirNormalizados: document.getElementById('check-incluir-normalizados'),
            btnVisualizarRelatorio:   document.getElementById('btn-visualizar-relatorio'),
            displayTotal:             document.getElementById('display-total'),
            displayPendentes:         document.getElementById('display-pendentes'),
            displayNormalizados:      document.getElementById('display-normalizados'),
            colunaNormalizados:       document.querySelector('#coluna-normalizados .kanban-cards-container'),
            countNormalizados:        document.getElementById('count-normalizados'),
            modalRelatorio:           document.getElementById('modal-relatorio'),
            modalRelatorioTexto:      document.getElementById('modal-relatorio-texto'),
            btnModalCopiar:           document.getElementById('btn-modal-copiar'),
            btnModalFechar:           document.getElementById('btn-modal-fechar'),
            modalEdicao:              document.getElementById('modal-edicao'),
            edicaoCardId:             document.getElementById('edicao-card-id'),
            edicaoCodigo:             document.getElementById('edicao-codigo'),
            edicaoEndereco:           document.getElementById('edicao-endereco'),
            edicaoProblema:           document.getElementById('edicao-problema'),
            btnEdicaoCancelar:        document.getElementById('btn-edicao-cancelar'),
            btnEdicaoSalvar:          document.getElementById('btn-edicao-salvar'),
            modalDespachoSemaforo:    document.getElementById('modal-despacho-semaforo'),
            despachoSemaforoCardId:   document.getElementById('despacho-semaforo-card-id'),
            despachoSemaforoEquipe:   document.getElementById('despacho-semaforo-equipe'),
            despachoSemaforoVt:       document.getElementById('despacho-semaforo-vt'),
            btnDespachoSemaforoConfirmar: document.getElementById('btn-despacho-semaforo-confirmar'),
            btnDespachoSemaforoCancelar:  document.getElementById('btn-despacho-semaforo-cancelar'),
        });
    }

    // ── UTILITÁRIOS UI ────────────────────────────────────────────────────────
    function showToast(message, type = 'success', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        DOM.toastContainer?.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, duration);
    }

    function abrirModal(modal)  { if (modal) modal.classList.add('visible'); }
    function fecharModal(modal) { if (modal) modal.classList.remove('visible'); }

    function setupModal(modal, closeBtn, onCancel = null) {
        if (!modal || !closeBtn) return;
        closeBtn.addEventListener('click', () => { fecharModal(modal); onCancel?.(); });
        modal.addEventListener('click', e => { if (e.target === modal) { fecharModal(modal); onCancel?.(); } });
    }

    // ── AUDITORIA ─────────────────────────────────────────────────────────────
    function registrarAcao(mensagem) {
        const logs = JSON.parse(localStorage.getItem('historicoDeAcoes_v1') || '[]');
        logs.unshift({ timestamp: new Date().toLocaleString('pt-BR'), mensagem });
        if (logs.length > 500) logs.length = 500;
        localStorage.setItem('historicoDeAcoes_v1', JSON.stringify(logs));
    }

    function gravarHistoricoFirebase(eventoId, de, para, sub, eq, vt, operador) {
        NitFirebase.exec((db, ref, update, push) =>
            push(ref(db, `historico/${eventoId}`), { de, para, sub, eq, vt, operador, ts: Date.now() })
        );
    }

    function carregarDadosMestres() {
        try {
            const raw = localStorage.getItem(AppState.STORAGE_KEY_DADOS);
            if (raw) Object.assign(AppState.dadosMestres, JSON.parse(raw));
        } catch (e) { console.warn('[NIT] dadosMestres inválido:', e); }
    }

    // ── UNDO TOAST ────────────────────────────────────────────────────────────
    const UNDO_DURATION = 5000;
    let _undoActive = null;

    function mostrarUndoToast(mensagem, onCommit, onUndo) {
        cancelarUndoAtivo();
        const toast = document.getElementById('undo-toast');
        const msgEl = document.getElementById('undo-toast-msg');
        const barEl = document.getElementById('undo-progress-bar');
        if (!toast || !msgEl || !barEl) { onCommit(); return; }

        msgEl.textContent = mensagem;
        toast.classList.add('show');

        let cancelado = false;
        let rafId;
        const inicio = performance.now();

        function tick(now) {
            const restante = Math.max(0, 1 - (now - inicio) / UNDO_DURATION);
            barEl.style.width = `${restante * 100}%`;
            if (restante > 0 && !cancelado) { rafId = requestAnimationFrame(tick); return; }
            if (!cancelado) { esconderUndoToast(); onCommit(); }
        }
        rafId = requestAnimationFrame(tick);

        _undoActive = {
            commit: () => { cancelado = true; cancelAnimationFrame(rafId); esconderUndoToast(); onCommit(); },
            undo:   () => { cancelado = true; cancelAnimationFrame(rafId); esconderUndoToast(); onUndo(); },
        };

        document.getElementById('undo-toast-btn')?.addEventListener('click', () => _undoActive?.undo(), { once: true });
    }

    function esconderUndoToast() {
        document.getElementById('undo-toast')?.classList.remove('show');
        _undoActive = null;
    }

    function cancelarUndoAtivo() {
        if (_undoActive) { _undoActive.commit(); _undoActive = null; }
    }

    // ── API ───────────────────────────────────────────────────────────────────
    async function nitAPIFetch(endpoint, options = {}) {
        const key = await window.getNITKey?.() || '';
        const url = `${window.NIT_API_URL}${endpoint}`;
        const res = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', 'X-NIT-Key': key, ...(options.headers || {}) },
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || data.error || `HTTP ${res.status}`);
        }
        return res.json().catch(() => ({}));
    }

    // ── CONFIRM MODAL ─────────────────────────────────────────────────────────
    let _confirmCb = null;
    function nitConfirm(titulo, mensagem, onConfirm) {
        const modal = document.getElementById('modal-confirmar-generico');
        const titEl = document.getElementById('modal-confirmar-titulo');
        const msgEl = document.getElementById('modal-confirmar-msg');
        if (!modal) { if (confirm(mensagem)) onConfirm(); return; }
        titEl.textContent = titulo;
        msgEl.innerHTML   = mensagem;
        _confirmCb = onConfirm;
        abrirModal(modal);
    }


    // ═══════════════════════════════════════════════════════════════════════
    // NIT LOGGER — logging estruturado do parser
    // Cada processamento recebe um ID único; logs consultáveis via console
    // e armazenados em localStorage para replay/debug.
    // ═══════════════════════════════════════════════════════════════════════
    const NitLogger = {
        _KEY: 'nit-parser-logs-v1',
        _MAX: 50, // máximo de sessões armazenadas

        // Gera ID único para cada processamento
        novaSessionId() {
            return `nit_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        },

        // Persiste sessão de processamento
        salvar(sessionId, { texto, eventos, logs, erros, dataReferencia }) {
            try {
                const stored = this._carregar();
                stored.unshift({
                    sessionId,
                    ts:             new Date().toISOString(),
                    dataReferencia,
                    totalEventos:   eventos.length,
                    totalErros:     erros.length,
                    hashTexto:      this._hash(texto),
                    textoTamanho:   texto.length,
                    // Guarda texto completo para replay (até 50KB)
                    textoRaw:       texto.length < 50000 ? texto : '[TRUNCADO]',
                    logs,
                    erros,
                    resumo: eventos.map(e => ({
                        codigo:   e.codigo,
                        eventoId: e.eventoId,
                        status:   e.status,
                        inicio:   e.inicio,
                        fim:      e.fim,
                    })),
                });
                if (stored.length > this._MAX) stored.length = this._MAX;
                localStorage.setItem(this._KEY, JSON.stringify(stored));
            } catch(e) {
                console.warn('[NitLogger] Falha ao salvar log:', e.message);
            }
        },

        // Carrega todas as sessões
        _carregar() {
            try { return JSON.parse(localStorage.getItem(this._KEY) || '[]'); }
            catch { return []; }
        },

        // Hash simples para identificar relatórios únicos
        _hash(str) {
            let h = 0;
            for (let i = 0; i < Math.min(str.length, 200); i++) {
                h = ((h << 5) - h) + str.charCodeAt(i);
                h |= 0;
            }
            return Math.abs(h).toString(16);
        },

        // Lista sessões no console (debug)
        listar() {
            const logs = this._carregar();
            console.table(logs.map(l => ({
                sessionId:     l.sessionId,
                ts:            l.ts,
                data:          l.dataReferencia,
                eventos:       l.totalEventos,
                erros:         l.totalErros,
                hash:          l.hashTexto,
            })));
            return logs;
        },

        // Recupera texto de uma sessão para replay
        replay(sessionId) {
            const logs = this._carregar();
            const sess = logs.find(l => l.sessionId === sessionId);
            if (!sess) { console.warn('[NitLogger] Sessão não encontrada:', sessionId); return null; }
            console.log('[NitLogger] Texto da sessão:', sess.textoRaw);
            return sess.textoRaw;
        },

        // Captura erro com contexto
        capturarErro(sessionId, contexto, erro) {
            console.error(`[NIT ERROR] session=${sessionId}`, contexto, erro);
            // Envia para backend (fire-and-forget)
            if (window.NIT_API_URL) {
                fetch(`${window.NIT_API_URL}/api/v1/log-error`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        ts:        new Date().toISOString(),
                        contexto,
                        erro:      erro?.message || String(erro),
                        stack:     erro?.stack   || '',
                        userAgent: navigator.userAgent,
                    }),
                }).catch(() => {}); // silencia falha de rede
            }
        },
    };
    window.NitLogger = NitLogger;

    // ═════════════════════════════════════════════════════════════════════════
    // SEMAFORO
    // ═════════════════════════════════════════════════════════════════════════
    const Semaforo = {
        ultimoLoteNormalizado: [],

        // ── Helpers ───────────────────────────────────────────────────────
        gerarEventoId(codigo, inicio) {
            const ts = (inicio || '').replace(/[^0-9]/g, '').slice(0, 12) || Date.now();
            return `${codigo}_${ts}`;
        },

        extrairDataReferencia(linhas) {
            for (const l of linhas) {
                const m = l.match(/(\d{2}\/\d{2}\/\d{4})/);
                if (m) return m[1];
            }
            return NitData.hoje();
        },

        statusFromSecao(secao, card) {
            // Ordem de prioridade — documentação NIT v2.0:
            // 1. Seção NORMALIZADOS (cabeçalho do relatório)
            if (secao === 'NORMALIZADO') return 'NORMALIZADO';
            // 2. Campo Fim preenchido
            if (card.fim && card.fim.trim()) return 'NORMALIZADO';
            // 3. PGV ou Entre no endereço (sem exceções, obs não altera)
            const end = (card.endereco || '').toLowerCase();
            if (end.includes('pgv'))   return 'SEM_NECESSIDADE';
            if (/\bentre\b/i.test(end)) return 'SEM_NECESSIDADE';  
            if (/\bpr[oó]x\.?\b/i.test(end)) return 'SEM_NECESSIDADE';
            // Obs indica semáforo veicular já operando — sem necessidade de agente
            const obs = (card.observacoes || card.dataset?.observacoes || '').toLowerCase();
            if (/veiculares?\s+funcionando/i.test(obs)) return 'SEM_NECESSIDADE';
            // 4. Fallback
            return 'PENDENTE';
        },

        extrairDadosDaLinha(linha) {
    const prefixMatch = linha.match(/^([A-ZÀ-Ú][A-ZÀ-Ú\s]{1,30}?)\s*(?:\*\s*)?🚦/u);
    const prefixo = prefixMatch ? prefixMatch[1].trim().toUpperCase() : '';
    const TIPOS = ['FALHA DE EQUIPAMENTO','INVESTIGANDO','ROMPIMENTO','ACIDENTE','IMPROCEDENTE','FURTO','ENEL'];
    const tipo = TIPOS.find(t => prefixo.includes(t)) || 'N/I';

    const re = /🚦[\s*]*([A-Z0-9]{2,8})[\s*]*🚦[\t ]*\*?(.*?)\*?[\t ]*●[\t ]*\*?([A-ZÀ-Ú][A-ZÀ-Ú\s/]+?)\*?[\t ]*●(.*)/isu;
    const m = linha.match(re);
    if (!m) return null;

    const resto   = m[4] || '';
    const inicioM = resto.match(/In[ií]cio:[\t ]*(\d{2}\/\d{2}\/\d{4}[\t ]+\d{2}:\d{2})/i);
    const fimM    = resto.match(/Fim:[\t ]*(\d{2}\/\d{2}\/\d{4}[\t ]+\d{2}:\d{2})/i);

    // Extrai obs: procura "Obs:" explícito primeiro
    let obsInline = '';
    const obsExplicit = resto.match(/\*?Obs[.:*]?\*?[\t ]*(.+?)(?:\/log\b.*)?$/is);
    if (obsExplicit) {
        obsInline = obsExplicit[1].replace(/["*]/g, '').replace(/\s+/g, ' ').trim();
    } else {
        // Fallback: tudo após as datas de início/fim
        obsInline = resto
            .replace(/In[ií]cio:[\t ]*\d{2}\/\d{2}\/\d{4}[\t ]+\d{2}:\d{2}/gi, '')
            .replace(/Fim:[\t ]*\d{2}\/\d{2}\/\d{4}[\t ]+\d{2}:\d{2}/gi, '')
            .replace(/["*\t]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        // Descarta se for só pontuação ou muito curto sem valor semântico
        if (/^[.\-–—\s"]+$/.test(obsInline) || obsInline.length < 3) obsInline = '';
    }

    return {
        tipo,
        codigo:      m[1].trim(),
        endereco:    m[2].trim().replace(/\s+/g, ' '),
        problema:    m[3].trim().toUpperCase(),
        inicio:      inicioM?.[1] ?? '',
        fim:         fimM?.[1]    ?? '',
        observacoes: obsInline,
        equipe: '', viatura: '', pl: '', sub: '',
    };
},

        // ── Firebase listener ─────────────────────────────────────────────
        _kanbanListenerAtivo: false,
        inicializarListenerFirebase() {
            if (this._kanbanListenerAtivo) return;
            this._kanbanListenerAtivo = true;
            NitFirebase.exec((db, ref) => {
                const kanbanRef = ref(db, 'kanban');

                kanbanRef.on('child_added', snap => {
                    const eventoId = snap.key;
                    const dados    = snap.val();
                    if (!dados) return;
                    // Guard: eventoId já no DOM — evita duplicata na sincronização Firebase
                    if (document.querySelector(`[data-eventoid="${eventoId}"]`)) return;
                    const coluna    = dados.coluna || 'coluna-espera';
                    const container = document.querySelector(`#${coluna} .kanban-cards-container`)
                                   || document.getElementById(coluna);
                    if (!container) return;
                    const el = Semaforo.criarElementoCard(`card-${AppState.cardIdCounter++}`, {
                        ...dados, eventoId, codigo: dados.codigo || eventoId.split('_')[0],
                    });
                    el.dataset.eventoid       = eventoId;
                    el.dataset.coluna         = coluna;
                    el.dataset.datareferencia = dados.dataReferencia || '';
                    // Normalizar campos de fim no dataset para que ordenarNormalizados() os leia
                    if (dados.data_fim) el.dataset.data_fim = dados.data_fim;
                    if (dados.hora_fim) el.dataset.hora_fim = dados.hora_fim;
                    if (dados.equipeApoio)  el.dataset.equipeApoio  = dados.equipeApoio;
                    if (dados.viaturaApoio) el.dataset.viaturaApoio = dados.viaturaApoio;
                    if (dados.tsDespacho)   el.dataset.tsDespacho   = dados.tsDespacho;
                    if (coluna === 'coluna-normalizados') {
                        container.prepend(el);
                        // Reordena após inserção — Firebase pode entregar fora de ordem
                        requestAnimationFrame(() => Semaforo.ordenarNormalizados());
                    } else {
                        container.appendChild(el);
                    }
                    Semaforo.atualizarPainel();
                });

                kanbanRef.on('child_changed', snap => {
                    const eventoId = snap.key;
                    const dados    = snap.val();
                    if (!dados) return;
                    const el = document.querySelector(`[data-eventoid="${eventoId}"]`);
                    if (!el) return;
                    const novaColuna  = dados.coluna || 'coluna-espera';
                    const colunaAtual = el.dataset.coluna;
                    if (novaColuna !== colunaAtual) {
                        const container = document.querySelector(`#${novaColuna} .kanban-cards-container`)
                                       || document.getElementById(novaColuna);
                        if (container) { container.appendChild(el); el.dataset.coluna = novaColuna; }
                    }
                    if (dados.equipe      !== undefined) el.dataset.equipe      = dados.equipe;
                    if (dados.viatura     !== undefined) el.dataset.viatura     = dados.viatura;
                    if (dados.pl          !== undefined) el.dataset.pl          = dados.pl;
                    if (dados.sub         !== undefined) el.dataset.sub         = dados.sub;
                    if (dados.status      !== undefined) el.dataset.status      = dados.status;
                    if (dados.observacoes !== undefined) el.dataset.observacoes = dados.observacoes;

                    // ✅ fix: rerenderiza o card-body com dados frescos do Firebase
                    // garante que observações, equipe e status apareçam após child_changed
                    const bodyEl = el.querySelector('.card-body');
                    if (bodyEl) {
                        const obs        = dados.observacoes || el.dataset.observacoes || '';
                        const status     = dados.status      || el.dataset.status      || '';
                        const inicio     = dados.inicio      || el.dataset.inicio      || '';
                        const equipe     = dados.equipe      || el.dataset.equipe      || '';
                        const viatura    = dados.viatura     || el.dataset.viatura     || '';
                        const frase      = Semaforo._fraseTecnica(obs, status, inicio);
                        const obsExibir  = frase || obs.replace(/NORMALIZADOS\s*✅/gi,'').replace(/\*/g,'').trim().slice(0,100);
                        bodyEl.innerHTML =
                            `<p class="card-address">${dados.endereco || el.dataset.endereco || ''}</p>` +
                            (obsExibir ? `<p class="card-obs">${obsExibir}</p>` : '') +
                            (equipe    ? `<p class="card-equipe"><span class="card-equipe-linha">${equipe}${viatura ? ` · VT ${viatura}` : ''}</span></p>` : '');
                        el.classList.remove('lazy-pending');
                    }

                    Semaforo.atualizarPainel();
                });

                kanbanRef.on('child_removed', snap => {
                    const el = document.querySelector(`[data-eventoid="${snap.key}"]`);
                    if (el) { NitLazy.liberar(el); el.remove(); Semaforo.atualizarPainel(); }
                });
            });
        },

        // ── Processar relatório ───────────────────────────────────────────
        handleProcessarClick() {
            this.ultimoLoteNormalizado = [];
            const texto = DOM.relatorioBrutoInput.value;
            if (!texto.trim()) { showToast('Insira o relatório bruto para processar.', 'warning'); return; }
            const eventos = this._parsearRelatorio(texto);
            if (!eventos.length) { showToast('Nenhuma ocorrência encontrada.', 'warning'); return; }
            const temCards = !!document.querySelector('#tab-semaforo .kanban-card');
            temCards ? this._reprocessar(eventos) : this._cargaInicial(eventos);
            this.atualizarPainel();
            // ✅ Registra metadados do processamento para rastreabilidade e verificação de turno
            NitProcessamento.registrar(texto, eventos, eventos[0]?.dataReferencia || '');
            DOM.relatorioBrutoInput.value = '';
        },

        _ehCabecalho(linha) {
            const l = linha.trim();
            if (!l) return true;
            if (/NORMALIZADOS/i.test(l) && /[✅❌*]/.test(l)) return true;
            if (/PENDENTES/i.test(l)    && /[✅❌*]/.test(l)) return true;
            return /^[-=*#_]{3,}/.test(l)
                || /^\*?STATUS\s+SEMAF/i.test(l)
                || /^\d{2}\/\d{2}\/\d{4}/.test(l)
                || /^ocorr[êe]ncias?\s*[:(\d]/i.test(l)
                || /^\*?pendentes?\s*[:(\d*]/i.test(l)
                || /^\*?normalizados?\s*[:(\d*]/i.test(l)
                || /^\*?\d+\s*(ocorr|pend|norm)/i.test(l)
                || /^[\u2600-\u27BF\uFE00-\uFE0F]{1,4}\s*(\*|\d|$)/u.test(l)
                || /^[-–—]+\s*\d{2}:\d{2}/.test(l);
        },

        _parsearRelatorio(texto) {
            const linhas  = texto.split('\n');
            const dataRef = this.extrairDataReferencia(linhas);
            const eventos = [];
            let atual     = null;
            let secao     = 'PENDENTE';

            for (const linha of linhas) {
                if (/\*?NORMALIZADOS\*?\s*✅/.test(linha)) { secao = 'NORMALIZADO'; continue; }
                if (/\*?PENDENTES\*?\s*❌/.test(linha))    { secao = 'PENDENTE';    continue; }
                const dados = this.extrairDadosDaLinha(linha);
                if (dados) {
                    if (atual) eventos.push(atual);
                    atual = { ...dados, secao, dataReferencia: dataRef };
                } else if (atual && linha.trim() && !this._ehCabecalho(linha)) {
                    // Guarda adicional: ignora linhas de cabeçalho de plantão
                    if (/PLANTONISTA|PLANTÃO|TÉCNICOS|CEMOB/i.test(linha)) continue;
                    // ✅ GUARDA #19: ignora linha que é só "Obs:" sem conteúdo útil
                    if (/^\s*["*]*\s*\*?Obs[.:*]?\*?\s*["*]*\s*$/.test(linha)) continue;
                    let limpa = linha.trim()
                        .replace(/["*]/g, '')
                        .replace(/\*?Obs:\*?/gi, '')
                        .replace(/\/log\b.*/i, '')
                        .replace(/\s+/g, ' ').trim();
                    if (limpa && !/^\d{2}[:/]\d{2}$/.test(limpa) && !/^\d{2}\/\d{2}\/\d{4}$/.test(limpa)) {
                        atual.observacoes += (atual.observacoes ? ' ' : '') + limpa;
                    }
                }
            }
            if (atual) eventos.push(atual);
            return eventos
                .filter(ev => ev.codigo)
                .map(ev => ({ ...ev, eventoId: this.gerarEventoId(ev.codigo, ev.inicio) }));
        },

        // ── Carga inicial (painel vazio) ──────────────────────────────────
        _cargaInicial(eventos) {
            const vistos = new Set(); // códigos já vistos — marca reincidência visual (↺ REINC)
            const batch  = {};
            eventos.forEach(ev => {
                // Reincidência: mesmo código, início diferente → dois cards legítimos
                // A tag ↺ REINC sinaliza ao operador que o cruzamento quebrou mais de uma vez
                ev.reincidente = vistos.has(ev.codigo);
                vistos.add(ev.codigo);

                const status = this.statusFromSecao(ev.secao, ev);
                const el     = this.criarElementoCard(`card-${AppState.cardIdCounter++}`, ev);
                this._colocarCardNaColuna(el, status);
                if (status === 'NORMALIZADO') this.ultimoLoteNormalizado.push(el.id);
                batch[ev.eventoId] = this._payloadFirebase(ev, status);
            });
            AppState.totalOcorrenciasCriadas = eventos.length;
            NitFirebase.exec((db, ref, update) => {
                update(ref(db, 'kanban'), batch);
                update(ref(db, 'meta'), {
                    dataReferencia:      eventos[0]?.dataReferencia,
                    turnoAtivo:          NitLogin.turno || '',
                    ultimoProcessamento: Date.now(),
                });
            });
            showToast(`${eventos.length} ocorrência(s) processada(s).`, 'success');
        },

        // ── Reprocessar (painel já tem cards) ────────────────────────────
        //
        // Corrige os dois blocos soltos do original: consolida a lógica de
        // herança cross-day (codigosMap) e herança por mesmo eventoId num
        // único método coeso, sem duplicatas.
        _reprocessar(eventos) {
            // Monta índices do estado atual do DOM
            const mapaAtual  = new Map(); // eventoId → { element, normalizado }
            const codigosMap = new Map(); // codigo   → [eventoId, ...]

            document.querySelectorAll('#tab-semaforo .kanban-card').forEach(el => {
                const eid  = el.dataset.eventoid;
                const cod  = el.dataset.codigo;
                const norm = !!el.closest('#coluna-normalizados');
                if (eid) mapaAtual.set(eid, { element: el, normalizado: norm });
                if (cod) {
                    if (!codigosMap.has(cod)) codigosMap.set(cod, []);
                    codigosMap.get(cod).push(eid);
                }
            });

            let criados = 0, atualizados = 0, herdados = 0;

            eventos.forEach(ev => {
                const status    = this.statusFromSecao(ev.secao, ev);
                const existente = mapaAtual.get(ev.eventoId);

                if (!existente) {
                    // Herança cross-day: mesmo código, eventoId diferente
                    const eidsPorCodigo = codigosMap.get(ev.codigo) || [];
                    const cardHerdado   = eidsPorCodigo
                        .map(eid => mapaAtual.get(eid))
                        .find(c => c && !c.normalizado);

                    if (cardHerdado) {
                        const cardEl           = cardHerdado.element;
                        const eventoIdAnterior = cardEl.dataset.eventoid;

                        // ✅ fix: se o evento chegou NORMALIZADO, normaliza o card existente
                        if (status === 'NORMALIZADO') {
                            DOM.colunaNormalizados.prepend(cardEl);
                            cardEl.classList.add('card-foi-normalizado');
                            setTimeout(() => cardEl.classList.remove('card-foi-normalizado'), 2000);
                            this.ultimoLoteNormalizado.push(cardEl.id);

                            const fimPartes = (ev.fim || '').trim().split(' ');
                            const dataFim   = fimPartes[0] || '';
                            const horaFim   = fimPartes[1] || '';

                            NitFirebase.exec((db, ref, update) =>
                                update(ref(db, `kanban/${eventoIdAnterior}`), {
                                    coluna:   'coluna-normalizados',
                                    status:   'NORMALIZADO',
                                    ts:       Date.now(),
                                    data_fim: dataFim,
                                    hora_fim: horaFim,
                                    ts_norm:  Date.now(),
                                    // preserva observacoes do relatório mais recente
                                    ...(ev.observacoes && { observacoes: ev.observacoes }),
                                })
                            );
                            atualizados++;
                            return;
                        }

                        // Herança cross-day: pendente → atualiza dataReferencia
                        cardEl.dataset.datareferencia = ev.dataReferencia;
                        NitFirebase.exec((db, ref, update) =>
                            update(ref(db, `kanban/${eventoIdAnterior}`), {
                                dataReferencia:    ev.dataReferencia,
                                ts:                Date.now(),
                                ts_dataReferencia: Date.now(),
                            })
                        );
                        herdados++;
                        return;
                    }

                    // Card com eventoId novo — pode ser reincidência legítima
                    // (mesmo SCN, início diferente = dois eventos distintos no mesmo dia)
                    // A tag ↺ REINC sinaliza ao operador que o cruzamento quebrou mais de uma vez.
                    ev.reincidente = codigosMap.has(ev.codigo);
                    this.criarNovoCard(ev, status);
                    criados++;
                    return;
                }

                // Card já existe no DOM
                if (!existente.normalizado && status === 'NORMALIZADO') {
                    DOM.colunaNormalizados.prepend(existente.element);
                    existente.element.classList.add('card-foi-normalizado');
                    setTimeout(() => existente.element.classList.remove('card-foi-normalizado'), 2000);
                    this.ultimoLoteNormalizado.push(existente.element.id);

                    // ✅ CORREÇÃO #20: atualizar dataReferencia para a data do plantão atual
                    if (ev.dataReferencia) {
                        existente.element.dataset.datareferencia = ev.dataReferencia;
                    }

                    // ✅ fix: usa apenas o fim extraído do relatório; não inventa data/hora
                    const fimPartes = (ev.fim || '').trim().split(' ');
                    const dataFim   = fimPartes[0] || '';
                    const horaFim   = fimPartes[1] || '';

                    NitFirebase.exec((db, ref, update) =>
                        update(ref(db, `kanban/${ev.eventoId}`), {
                            coluna:   'coluna-normalizados',
                            status:   'NORMALIZADO',
                            ts:       Date.now(),
                            data_fim: dataFim,
                            hora_fim: horaFim,
                            ts_norm:  Date.now(),
                            // ✅ CORREÇÃO #20: atualizar dataReferencia no Firebase também
                            dataReferencia: ev.dataReferencia,
                        })
                    );
                    atualizados++;
                    return;

                } else if (!existente.normalizado &&
                           ev.dataReferencia !== existente.element.dataset.datareferencia) {
                    // Herança via mesmo eventoId (data de referência mudou)
                    existente.element.dataset.datareferencia = ev.dataReferencia;
                    NitFirebase.exec((db, ref, update) =>
                        update(ref(db, `kanban/${ev.eventoId}`), {
                            dataReferencia:    ev.dataReferencia,
                            ts:                Date.now(),
                            ts_dataReferencia: Date.now(),
                        })
                    );
                    herdados++;
                }
            });

            AppState.totalOcorrenciasCriadas += criados;
            const msgs = [];
            if (criados)     msgs.push(`${criados} nova(s) adicionada(s).`);
            if (atualizados) msgs.push(`${atualizados} normalizada(s).`);
            if (herdados)    msgs.push(`${herdados} pendência(s) herdada(s) do dia anterior.`);
            showToast(msgs.length ? msgs.join(' ') : 'Nenhuma mudança detectada.', msgs.length ? 'success' : 'info');
        },

        // ── Helpers internos ─────────────────────────────────────────────
        _colocarCardNaColuna(el, status) {
            const mapa = {
                NORMALIZADO:     () => DOM.colunaNormalizados.prepend(el),
                SEM_NECESSIDADE: () => document.querySelector('#coluna-sem-necessidade .kanban-cards-container').appendChild(el),
            };
            (mapa[status] || (() => document.querySelector('#coluna-espera .kanban-cards-container').appendChild(el)))();
        },

        _payloadFirebase(ev, status) {
            const colunaMap = { NORMALIZADO: 'coluna-normalizados', SEM_NECESSIDADE: 'coluna-sem-necessidade' };

            // Extrai data e hora de fim do campo ev.fim (formato "DD/MM/YYYY HH:MM")
            const fimPartes = (ev.fim || '').trim().split(' ');
            const dataFim   = fimPartes[0] || '';
            const horaFim   = fimPartes[1] || '';

            return {
                coluna:         colunaMap[status] || 'coluna-espera',
                codigo:         ev.codigo,
                eventoId:       ev.eventoId,
                dataReferencia: ev.dataReferencia || '',
                endereco:       ev.endereco    || '',
                problema:       ev.problema    || '',
                observacoes:    ev.observacoes || '',
                tipo:           ev.tipo        || '',
                status,
                equipe:         ev.equipe  || '',
                viatura:        ev.viatura || '',
                inicio:         ev.inicio  || '',
                pl:             ev.pl      || '',
                sub:            ev.sub     || '',
                reincidente:    ev.reincidente || false,
                operador:       NitLogin.operador || 'anon',
                turno:          NitLogin.turno    || '',
                ts:             Date.now(),
                // ✅ fix: gravar campos de fim quando ocorrência nasce normalizada
                ...(status === 'NORMALIZADO' && {
                    data_fim: dataFim,
                    hora_fim: horaFim,
                    ts_norm:  Date.now(),
                }),
            };
        },

        criarNovoCard(cardData, status) {
            const el = this.criarElementoCard(`card-${AppState.cardIdCounter++}`, cardData);
            this._colocarCardNaColuna(el, status);
            NitFirebase.exec((db, ref, update) =>
                update(ref(db, `kanban/${cardData.eventoId}`), this._payloadFirebase(cardData, status))
            );
        },

        // ── DOM do card ───────────────────────────────────────────────────
        criarElementoCard(cardId, cardData) {
            const card = document.createElement('div');
            card.id        = cardId;
            card.className = 'kanban-card';
            card.draggable = true;
            card.setAttribute('role',     'article');
            card.setAttribute('tabindex', '0');

            const _dsMap = { dataReferencia: 'datareferencia', eventoId: 'eventoid' };
            Object.entries(cardData).forEach(([k, v]) => {
                if (v !== undefined) card.dataset[_dsMap[k] || k] = v;
            });

            const frase = this._fraseTecnica(cardData.observacoes, cardData.status, cardData.inicio);
            const reinc = (cardData.reincidente === true || cardData.reincidente === 'true')
                ? '<span class="reincident-tag" title="Reincidência">↺ REINC</span>' : '';

            card.innerHTML = `
                <div class="card-header">
                    <strong>${cardData.codigo}</strong>
                    <span class="card-status-tag">${cardData.problema}</span>
                    ${reinc}
                </div>
                <div class="card-body card-body-lazy"></div>
                <div class="card-footer">
                    <button class="btn-card-action copy-location" title="Copiar Localização"><i class="fa-solid fa-location-crosshairs"></i></button>
                    <button class="btn-card-action details"       title="Ver Detalhes"><i class="fas fa-info-circle"></i></button>
                    <button class="btn-card-action edit"          title="Editar"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-card-action dispatch"      title="Despachar Equipe"><i class="fas fa-paper-plane"></i></button>
                    <button class="btn-card-action complete"      title="Normalizar"><i class="fas fa-check-circle"></i></button>
                </div>`;

            // ✅ fix: renderiza o body imediatamente com dados em memória
            // NitLazy continua observando para cards fora do viewport,
            // mas cards visíveis recebem conteúdo sem depender do IntersectionObserver.
            const _renderCardBody = () => {
                // Lê de cardData em memória; cai para dataset como fallback
                // (cards vindos do Firebase via child_added podem chegar antes
                //  do dataset ser populado completamente)
                const obsBruta    = cardData.observacoes || card.dataset.observacoes || '';
                const statusAtual = cardData.status  || card.dataset.status  || '';
                const inicioAtual = cardData.inicio  || card.dataset.inicio  || '';
                const equipe      = cardData.equipe  || card.dataset.equipe  || '';
                const viatura     = cardData.viatura || card.dataset.viatura || '';
                const endereco    = cardData.endereco|| card.dataset.endereco|| '';
                const tipo        = cardData.sub     || card.dataset.sub     || '';
                const tsDespacho  = cardData.tsDespacho || card.dataset.tsDespacho || '';
                const equipeApoio = cardData.equipeApoio || card.dataset.equipeApoio || '';
                const viaturaApoio = cardData.viaturaApoio || card.dataset.viaturaApoio || '';
                // data_fim + hora_fim vêm do Firebase separados; 'fim' é o campo combinado
                // gravado pelo NitNormalizar.confirmar ("DD/MM/YYYY HH:MM")
                const dataFim = cardData.data_fim || card.dataset.data_fim || '';
                const horaFim = cardData.hora_fim || card.dataset.hora_fim || '';
                const fimComb = cardData.fim      || card.dataset.fim      || '';
                const fimExib = fimComb || (dataFim ? `${dataFim}${horaFim ? ' ' + horaFim : ''}` : '');

                const frase       = Semaforo._fraseTecnica(obsBruta, statusAtual, inicioAtual);
                const obsFallback = obsBruta
                    .replace(/NORMALIZADOS\s*✅/gi, '')
                    .replace(/PENDENTES\s*❌/gi, '')
                    .replace(/\*/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                const obsExibir = frase || (obsFallback.length > 120
                    ? obsFallback.slice(0, 120) + '…'
                    : obsFallback);
                

                 // Montar HTML de despacho
    let despachoHTML = '';
    if (tipo) {
        const tipoLabel = tipo === 'vl' ? 'VIA LIVRE' :
                         tipo === 'amc' ? 'AMC' :
                         tipo === 'sn' ? 'SEM NECESSIDADE' : tipo.toUpperCase();
        const emojiMap = { 'vl': '🟠', 'amc': '🔵', 'sn': '⚪' };
        const emoji = emojiMap[tipo] || '🚦';
        
        // Equipe principal
        const linhaP = equipe 
            ? `<span class="card-equipe-linha">👤 ${equipe}${viatura ? ` · VT ${viatura}` : ''}</span>` 
            : '';
        
        // Equipe de apoio — só exibe se não for substring do campo principal
        const apoioRedundante = equipeApoio &&
            equipe.toLowerCase().includes(equipeApoio.toLowerCase()) &&
            viatura.toLowerCase().includes(viaturaApoio.toLowerCase());
        const linhaA = (equipeApoio && !apoioRedundante)
            ? `<span class="card-equipe-linha card-equipe-apoio">➕ ${equipeApoio}${viaturaApoio ? ` · VT ${viaturaApoio}` : ''}</span>`
            : '';
        
        const equipeHTML = (linhaP || linhaA) 
            ? `<p class="card-equipe">${linhaP}${linhaA}</p>` 
            : '';
        
        const tsStr = Semaforo._formatarTimestamp(tsDespacho);
        const tsHTML = tsStr ? `<p class="card-ts-despacho">📅 ${tsStr}</p>` : '';
        
        despachoHTML = `
            <p class="card-despacho-tipo">${emoji} ${tipoLabel}</p>
            ${equipeHTML}
            ${tsHTML}
        `;
    }

    const bodyEl = card.querySelector('.card-body');
    if (bodyEl) {
        bodyEl.innerHTML = 
            (despachoHTML || '') +
            `<p class="card-address">${endereco}</p>` +
            (obsExibir ? `<p class="card-obs">${obsExibir}</p>` : '') +
            (fimExib ? `<p class="card-fim">✅ ${fimExib}</p>` : '');
    }
};

            // Renderiza imediatamente se NitLazy não estiver disponível,
            // ou registra para render quando o card entrar no viewport.
            // Para cards já no viewport no momento da inserção, o IntersectionObserver
            // pode não disparar — por isso forçamos render via requestAnimationFrame.
            if (typeof NitLazy !== 'undefined' && NitLazy.observar) {
                NitLazy.observar(card, _renderCardBody);
                // Força render no próximo frame caso o card já esteja visível
                requestAnimationFrame(() => {
                    if (card.classList.contains('lazy-pending')) {
                        _renderCardBody();
                    }
                });
            } else {
                _renderCardBody();
            }
            return card;
        },

        _fraseTecnica(texto, status, inicio) {
            // Estado INVESTIGANDO — frase padrão com data/hora
            if (String(status).trim().toUpperCase() === 'INVESTIGANDO') {
                if (!inicio) return 'Investigando.';
                const [data, hora] = inicio.split(' ');
                const [dia, mes]   = data.split('/');
                return `Início: ${dia}/${mes} ${hora} — Investigando.`;
            }
            if (!texto) return '';

            // Limpeza base: remove cabeçalhos de seção que podem vazar do parser
            let t = texto
                .replace(/NORMALIZADOS\s*✅/gi, '')
                .replace(/PENDENTES\s*❌/gi,    '')
                .replace(/\*/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!t) return '';

            // Estado investigando no texto da observação
            if (t.toLowerCase() === 'investigando') return 'Investigando.';

            // Cortar no primeiro ponto final
            const pontoIndex = t.indexOf('.');
            if (pontoIndex !== -1) {
                t = t.substring(0, pontoIndex + 1).trim();
            } else {
                t = t.slice(0, 100);
                if (texto.length > 100) t += '…';
            }

            // Compactar datas longas: 13/06/2026 07:41 → 13/06 07:41
            t = t.replace(/(\d{2}\/\d{2})\/\d{4}(\s+\d{2}:\d{2})/g, '$1$2');

            return t;
        },

        _formatarTimestamp(ts) {
            if (!ts) return '';
            const d = new Date(ts);
            return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        },

        // ── Ordenar coluna normalizados (mais recente no topo) ────────────
        // Converte "DD/MM/YYYY HH:MM" → timestamp para ordenação correta.
        // localeCompare sozinho NÃO funciona com esse formato de data.
        _parseFim(str) {
            if (!str) return 0;
            // Aceita "DD/MM/YYYY HH:MM" ou "DD/MM/YYYY" ou "HH:MM"
            const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
            if (!m) return 0;
            return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
        },

        ordenarNormalizados() {
            const container = DOM.colunaNormalizados;
            if (!container) return;
            const cards = Array.from(container.querySelectorAll('.kanban-card'));
            if (cards.length < 2) return;
            cards.sort((a, b) => {
                // Lê data_fim + hora_fim separados (vindos do Firebase via dataset)
                // ou o campo combinado 'fim' (gravado pelo NitNormalizar.confirmar)
                const fimA = a.dataset.fim
                    || ((a.dataset.data_fim || '') + ' ' + (a.dataset.hora_fim || '')).trim();
                const fimB = b.dataset.fim
                    || ((b.dataset.data_fim || '') + ' ' + (b.dataset.hora_fim || '')).trim();
                return this._parseFim(fimB) - this._parseFim(fimA); // mais recente primeiro
            });
            // Reinserir na ordem correta — fragment evita reflow múltiplo
            const frag = document.createDocumentFragment();
            cards.forEach(c => frag.appendChild(c));
            container.appendChild(frag);
        },
        
        
        // ── Painel e relatório ────────────────────────────────────────────
        _painelTimer: null,
        atualizarPainel() {
            clearTimeout(this._painelTimer);
            this._painelTimer = setTimeout(() => this._atualizarPainelAgora(), 80);
        },

        _atualizarPainelAgora() {
            const hoje = NitData.hoje();

            // B3 — filtro visual: oculta cards de dias anteriores
            document.querySelectorAll('#tab-semaforo .kanban-card').forEach(c => {
                c.style.display = c.dataset.datareferencia === hoje ? '' : 'none';
            });

            // B2 — contadores filtrados por data atual
            const n = sel =>
                Array.from(document.querySelectorAll(sel))
                     .filter(c => c.dataset.datareferencia === hoje).length;

            const total = {
                espera:         n('#coluna-espera .kanban-card'),
                semNecessidade: n('#coluna-sem-necessidade .kanban-card'),
                vl:             n('#coluna-vl .kanban-card'),
                amc:            n('#coluna-amc .kanban-card'),
                normalizados:   Array.from(DOM.colunaNormalizados.querySelectorAll('.kanban-card'))
                                    .filter(c => c.dataset.datareferencia === hoje).length,
            };
            const totalGeral = Object.values(total).reduce((a, b) => a + b, 0);
            const totalNorm  = total.normalizados;
            const totalPend  = totalGeral - totalNorm;

            DOM.displayTotal.textContent        = totalGeral;
            DOM.displayNormalizados.textContent = totalNorm;
            DOM.displayPendentes.textContent    = totalPend;
            DOM.countNormalizados.textContent   = totalNorm;

            document.getElementById('count-espera') && (document.getElementById('count-espera').textContent = total.espera);
            [['vl', total.vl], ['amc', total.amc], ['sem-necessidade', total.semNecessidade]].forEach(([id, v]) => {
                const el = document.getElementById(`count-${id}`);
                if (el) el.textContent = v;
            });

            this.gerarPreviewRelatorio();
        },

        gerarPreviewRelatorio() {
            const incluirNorm = DOM.checkIncluirNormalizados?.checked;
            const filtroData  = NitData.hoje();

            // Filtra por data de referência do plantão atual — evita acumulado de plantões anteriores
            const cards = id => {
                const todos = Array.from(document.querySelectorAll(`#${id} .kanban-card`));
                return todos.filter(c => c.dataset.datareferencia === filtroData);
            };

            const espera = cards('coluna-espera');
            const sn     = cards('coluna-sem-necessidade');
            const vl     = cards('coluna-vl');
            const amc    = cards('coluna-amc');
            const norm   = (() => {
                const todos = Array.from(DOM.colunaNormalizados.querySelectorAll('.kanban-card'));
                return todos.filter(c => c.dataset.datareferencia === filtroData);
            })();

            const totalOcorr  = espera.length + sn.length + vl.length + amc.length + norm.length;
            const totalPend   = espera.length + sn.length + vl.length + amc.length; // VL e AMC são pendentes em atendimento
            const totalNorm   = norm.length;
            const totalAtivos = vl.length + amc.length + espera.length + sn.length;

            let emoji, emojiPendentes;
            if (totalAtivos === 0) {
                emoji = '🟢🟢';
                emojiPendentes = '✅';
            } else if (totalAtivos >= 1 && totalAtivos <= 5) {
                emoji = '🟡🟡';
                emojiPendentes = '⚠️';
            } else {
                emoji = '🔴🔴';
                emojiPendentes = '🚨';
            }
            const hora  = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const data  = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

            const fmt = card => {
                const tipo = (card.dataset.tipo || '').toUpperCase();
    
                // Mapeamento — apenas tipos longos são abreviados
                const mapa = {
                    'FALHA DE EQUIPAMENTO': 'FALHA',
                    'INVESTIGANDO': 'INVESTIGANDO',
                    'ROMPIMENTO': 'ROMPIMENTO',
                    'ACIDENTE': 'ACIDENTE',
                    'IMPROCEDENTE': 'IMPROCEDENTE',  // ← COMPLETO
                    'FURTO': 'FURTO',
                    'ENEL': 'ENEL',
                };
                const abrev = mapa[tipo] || tipo;
    
                let desde = '';
                const mts = (card.dataset.inicio || '').match(/(\d{2})\/(\d{2})(?:\/\d+)?\s+(\d{2}:\d{2})/);
                if (mts) desde = ` - Desde ${mts[1]}/${mts[2]} - ${mts[3]}`;
                let t = `${card.dataset.codigo} 🚦 ${card.dataset.endereco} ● *${abrev}${desde} • ${card.dataset.problema}*`;
                if (card.dataset.viatura) {
                    t += ` (VT: ${card.dataset.viatura})`;
                }
                return t;
            };

            const linhas = [
                `${emoji} *STATUS SEMAFÓRICO* ${emoji}`,
                `---------- ${data} - ${hora} ----------`,
                '',
                `*Ocorrências (${totalOcorr})*`,
                `*Pendentes (${totalPend})* ${emojiPendentes}`,  // ← USANDO emojiPendentes
                `*Normalizados (${totalNorm})*`,
                '',
            ];
            if (totalAtivos > 0) {
                if (vl.length)  { linhas.push(`🚔🟠 *VIA LIVRE (${vl.length}):*`);  vl.forEach(c => linhas.push(fmt(c)));  linhas.push(''); }
                if (amc.length) { linhas.push(`🚔🔵 *AMC (${amc.length}):*`); amc.forEach(c => linhas.push(fmt(c))); linhas.push(''); }

                linhas.push('---');
                linhas.push(`⏳ *PENDENTES / OUTROS MOTIVOS*`);
                linhas.push(`*- Aguardando atendimento:*`);
                espera.forEach(c => linhas.push(fmt(c)));

                if (sn.length) {
                    linhas.push(`*- Sem necessidade de operação:*`);
                    sn.forEach(c => linhas.push(fmt(c)));
                }
            }

            if (incluirNorm && norm.length) {
                linhas.push('');
                linhas.push(`✅ *NORMALIZADOS (${norm.length}):*`);
                norm.forEach(c => linhas.push(fmt(c)));
            }

            const texto = linhas.join('\n');
            if (DOM.relatorioFinalPreview) DOM.relatorioFinalPreview.value = texto;
            return texto;
        },

        // ── Ações de card ─────────────────────────────────────────────────
        handleKanbanBoardClick(e) {
            const card = e.target.closest('.kanban-card');
            if (!card) return;
            if (e.target.closest('.btn-card-action.dispatch'))           this.abrirModalDespacho(card.id);
            else if (e.target.closest('.btn-card-action.edit'))          this.abrirModalEdicao(card.id);
            else if (e.target.closest('.btn-card-action.complete'))      this.handleNormalizarClick(card);
            else if (e.target.closest('.btn-card-action.copy-location')) this.copiarLocalizacao(card);
            else if (e.target.closest('.btn-card-action.details'))       NitCardDetails.abrir(card);
        },

        copiarLocalizacao(card) {
            const txt = `*${card.dataset.codigo} ${card.dataset.endereco} - ${card.dataset.problema}*`;
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(txt)
                    .then(() => showToast('Localização copiada!', 'success'))
                    .catch(() => this._clipboardFallback(txt));
            } else {
                this._clipboardFallback(txt);
            }
        },

        _clipboardFallback(texto) {
            const ta = Object.assign(document.createElement('textarea'), {
                value: texto, style: 'position:fixed;opacity:0;',
            });
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(ok ? 'Localização copiada!' : 'Não foi possível copiar.', ok ? 'success' : 'error');
        },

        // ── Despacho ──────────────────────────────────────────────────────
        abrirModalDespacho(cardId) {
            const card = document.getElementById(cardId);
            if (!card) return;
             // ✅ Mostrar/ocultar botão Encerrar Operação
            const tipoAtual = card.dataset.sub || '';
            const btnEncerrar = document.getElementById('btn-encerrar-operacao');
            if (btnEncerrar) {
                btnEncerrar.style.display = tipoAtual ? 'flex' : 'none';
            }
            DOM.despachoSemaforoCardId.value = cardId;
            DOM.despachoSemaforoEquipe.value = card.dataset.equipe  || '';
            DOM.despachoSemaforoVt.value     = card.dataset.viatura || '';
            
            // Resetar campos de apoio
            const chkApoio    = document.getElementById('despacho-tem-apoio');
            const camposApoio = document.getElementById('grupo-apoio-campos');
            const apoioEquipe = document.getElementById('despacho-apoio-equipe');
            const apoioVt     = document.getElementById('despacho-apoio-vt');
            if (chkApoio)    chkApoio.checked    = false;
            if (camposApoio) camposApoio.style.display = 'none';
            if (apoioEquipe) apoioEquipe.value   = '';
            if (apoioVt)     apoioVt.value        = '';
            document.getElementById('despacho-preview')?.classList.remove('show');
            const btnConf = document.getElementById('btn-despacho-semaforo-confirmar');
            if (btnConf) btnConf.innerHTML = 'Confirmar Despacho';
            AppState.despachoTipo = card.dataset.sub || 'vl';
            this.selecionarTipoDespacho(AppState.despachoTipo);
            abrirModal(DOM.modalDespachoSemaforo);
        },

        selecionarTipoDespacho(tipo) {
            AppState.despachoTipo = tipo;
            const btnVl  = document.getElementById('despacho-tipo-vl');
            const btnAmc = document.getElementById('despacho-tipo-amc');
            if (btnVl)  btnVl.style.background  = tipo === 'vl'  ? 'rgba(240,136,62,0.15)'  : '';
            if (btnAmc) btnAmc.style.background = tipo === 'amc' ? 'rgba(88,166,255,0.15)' : '';
            if (btnVl)  btnVl.style.borderColor  = tipo === 'vl'  ? '#f0883e' : '';
            if (btnAmc) btnAmc.style.borderColor = tipo === 'amc' ? '#58a6ff' : '';
        },

        handleSalvarDespachoClick() {
            const cardId  = DOM.despachoSemaforoCardId.value;
            const card    = document.getElementById(cardId);
            if (!card) return;
            const equipe  = DOM.despachoSemaforoEquipe.value.trim();
            const vt      = DOM.despachoSemaforoVt.value.trim();
            const tipo    = AppState.despachoTipo;
            // Ler equipe de apoio
            const apoioEquipe = document.getElementById('despacho-apoio-equipe')?.value.trim() || '';
            const apoioVt     = document.getElementById('despacho-apoio-vt')?.value.trim()     || '';
            const temApoio    = document.getElementById('despacho-tem-apoio')?.checked && apoioEquipe;

            const preview = document.getElementById('despacho-preview');
            const btnConf = document.getElementById('btn-despacho-semaforo-confirmar');
            if (preview && !preview.classList.contains('show')) {
                // Montar linhas do preview
                const linha1 = [equipe, vt ? `VT ${vt}` : ''].filter(Boolean).join(' · ');
                const linha2 = temApoio ? [apoioEquipe, apoioVt ? `VT ${apoioVt}` : ''].filter(Boolean).join(' · ') : '';
                preview.innerHTML = `
                    <div class="despacho-preview-title">Confirmar despacho</div>
                    <div><strong>${card.dataset.codigo}</strong> → ${tipo.toUpperCase()}${linha1 ? ` · ${linha1}` : ''}</div>
                    ${linha2 ? `<div style="font-size:12px;color:var(--color-text-tertiary);margin-top:4px;">Apoio: ${linha2}</div>` : ''}`;
                preview.classList.add('show');
                if (btnConf) btnConf.innerHTML = 'Confirmar';
                return;
            }

            const colunaDestino = tipo === 'sn' ? 'coluna-sem-necessidade' : `coluna-${tipo}`;
            const container     = document.querySelector(`#${colunaDestino} .kanban-cards-container`) || document.getElementById(colunaDestino);
            if (container) container.appendChild(card);

            // Montar strings consolidadas para dataset e Firebase
            const equipeConcat  = [equipe, temApoio ? apoioEquipe : ''].filter(Boolean).join(' + ');
            const viaturaConcat = [vt,     temApoio ? apoioVt     : ''].filter(Boolean).join(' + ');

            card.dataset.equipe  = equipeConcat;
            card.dataset.viatura = viaturaConcat;
            card.dataset.pl      = tipo === 'sn' ? 'sn' : 'atend';
            card.dataset.sub     = tipo;

            // Montar HTML do card com linhas separadas por equipe
            const linhaP = equipe
                ? `<span class="card-equipe-linha">${equipe}${vt ? ` · VT ${vt}` : ''}</span>`
                : '';
            const linhaA = temApoio
                ? `<span class="card-equipe-linha card-equipe-apoio">Apoio: ${apoioEquipe}${apoioVt ? ` · VT ${apoioVt}` : ''}</span>`
                : '';
            const equipeHTML = (linhaP || linhaA)
                ? `<p class="card-equipe">${linhaP}${linhaA}</p>`
                : '';

            const cardFooterEquipe = card.querySelector('.card-equipe');
            if (cardFooterEquipe) cardFooterEquipe.outerHTML = equipeHTML || '<p class="card-equipe"></p>';
            else if (equipeHTML) card.querySelector('.card-body')?.insertAdjacentHTML('beforeend', equipeHTML);

            fecharModal(DOM.modalDespachoSemaforo);
            this._commitDespacho(card, equipe, vt, tipo, apoioEquipe, apoioVt);
        },

        handleEncerrarOperacao() {
    const cardId = DOM.despachoSemaforoCardId.value;
    const card = document.getElementById(cardId);
    if (!card) return;

    const codigo = card.dataset.codigo;
    const equipeAtual = card.dataset.equipe || 'equipe';
    const tipoAtual = card.dataset.sub || '';

    const tipoLabel = tipoAtual === 'vl' ? 'Via Livre' :
                      tipoAtual === 'amc' ? 'AMC' :
                      tipoAtual === 'sn' ? 'Sem Necessidade' : tipoAtual;

    nitConfirm(
        '⏹️ Encerrar Operação',
        `Deseja encerrar a operação do card <strong>${codigo}</strong>?<br><br>
         <strong>${tipoLabel}</strong> · Equipe: <strong>${equipeAtual}</strong><br><br>
         A equipe será liberada e o card voltará para <strong>Aguardando</strong>.`,
        () => {
            // 1. Mover card para Aguardando
            const containerEspera = document.querySelector('#coluna-espera .kanban-cards-container');
            if (containerEspera) {
                containerEspera.appendChild(card);
            }
            card.dataset.coluna = 'coluna-espera';

            // 2. Limpar dados de despacho (liberar equipes)
            delete card.dataset.equipe;
            delete card.dataset.viatura;
            delete card.dataset.pl;
            delete card.dataset.sub;
            delete card.dataset.tsDespacho;
            delete card.dataset.equipeApoio;
            delete card.dataset.viaturaApoio;

            // 3. Remover elementos visuais de despacho do card
            const despachoEls = card.querySelectorAll('.card-despacho-tipo, .card-equipe, .card-ts-despacho');
            despachoEls.forEach(el => el.remove());

            // 4. Atualizar Firebase
            const eventoId = card.dataset.eventoid || card.dataset.codigo;
            NitFirebase.exec((db, ref, update) =>
                update(ref(db, `kanban/${eventoId}`), {
                    coluna: 'coluna-espera',
                    pl: null,
                    sub: null,
                    equipe: '',
                    viatura: '',
                    equipeApoio: '',
                    viaturaApoio: '',
                    tsDespacho: null,
                    ts_encerramento: Date.now(),
                    operador: NitLogin.operador || 'anon',
                    turno: NitLogin.turno || '',
                })
            );

            // 5. Registrar histórico
            gravarHistoricoFirebase(
                eventoId,
                card.dataset.coluna || 'desconhecido',
                'coluna-espera',
                'ENCERRADO',
                '',
                '',
                NitLogin.operador
            );

            registrarAcao(`Operação encerrada: '${codigo}'. Equipe ${equipeAtual} liberada.`);

            // 6. Fechar modal e notificar
            fecharModal(DOM.modalDespachoSemaforo);
            showToast(`${codigo} — Operação encerrada. Equipe liberada.`, 'info');
            Semaforo.atualizarPainel();
        }
    );
},

        _commitDespacho(card, equipe, vt, tipo, equipeApoio, vtApoio) {
    const cod      = card.dataset.codigo;
    const eventoId = card.dataset.eventoid || cod;
    const coluna   = tipo === 'sn' ? 'coluna-sem-necessidade' : `coluna-${tipo}`;
    
    // Dados concatenados para compatibilidade com código existente
    const equipeConcat  = [equipe, equipeApoio].filter(Boolean).join(' + ');
    const viaturaConcat = [vt, vtApoio].filter(Boolean).join(' + ');
    
    NitFirebase.exec((db, ref, update) =>
        update(ref(db, `kanban/${eventoId}`), {
            coluna,
            pl: tipo === 'sn' ? 'sn' : 'atend',
            sub: tipo,
            equipe: equipeConcat,
            viatura: viaturaConcat,
            equipeApoio: equipeApoio || '',
            viaturaApoio: vtApoio || '',
            tsDespacho: Date.now(),
            operador: NitLogin.operador || 'anon',
            turno: NitLogin.turno || '',
            ts: Date.now(),
        })
    );
    gravarHistoricoFirebase(eventoId, card.dataset.coluna, coluna, tipo, equipeConcat, viaturaConcat, NitLogin.operador);
    registrarAcao(`Despacho '${cod}': ${equipeConcat} VT ${viaturaConcat || 'N/I'} → ${tipo.toUpperCase()}.`);
    showToast(`${cod} → ${tipo === 'sn' ? 'Sem necess.' : equipe || 'despachado'}`, 'success');
    nitAPIFetch('/api/v1/despacho', { method: 'POST', body: JSON.stringify({ cod, eventoId, eq: equipeConcat, vt: viaturaConcat, sub: tipo }) })
        .catch(err => { if (!err.message?.includes('fetch')) console.warn('[NIT] API despacho:', err); });
},


        
        // ── Normalizar ────────────────────────────────────────────────────
        handleNormalizarClick(card) {
            NitNormalizar.abrir(card);
        },

        // ── Edição ────────────────────────────────────────────────────────
        abrirModalEdicao(cardId) {
            const card = document.getElementById(cardId);
            if (!card) return;
            DOM.edicaoCardId.value   = cardId;
            DOM.edicaoCodigo.value   = card.dataset.codigo   || '';
            DOM.edicaoEndereco.value = card.dataset.endereco || '';
            DOM.edicaoProblema.value = card.dataset.problema || 'APAGADO';
            abrirModal(DOM.modalEdicao);
        },

        handleSalvarEdicaoClick() {
            const card = document.getElementById(DOM.edicaoCardId.value);
            if (!card) return;
            const novoEnd  = DOM.edicaoEndereco.value.trim();
            const novoProb = DOM.edicaoProblema.value;
            if (!novoEnd) { showToast('Endereço não pode ser vazio.', 'error'); return; }
            if (novoEnd === card.dataset.endereco && novoProb === card.dataset.problema) {
                fecharModal(DOM.modalEdicao); showToast('Nenhuma alteração.', 'info'); return;
            }
            const eventoId = card.dataset.eventoid || card.dataset.codigo;
            const old      = `End: ${card.dataset.endereco}, Prob: ${card.dataset.problema}`;
            NitFirebase.exec((db, ref, update) =>
                update(ref(db, `kanban/${eventoId}`), {
                    endereco: novoEnd, problema: novoProb,
                    operador: NitLogin.operador || 'anon', turno: NitLogin.turno || '', ts: Date.now(),
                })
            );
            fecharModal(DOM.modalEdicao);
            registrarAcao(`'${card.dataset.codigo}' editado. Antes: ${old}.`);
            showToast('Sincronizando alterações…', 'info');
        },

        // ── Drag & drop ───────────────────────────────────────────────────
        handleDragStart(e) {
            AppState.draggedCard = e.target.closest('.kanban-card');
            if (!AppState.draggedCard) return;
            AppState.placeholder = document.createElement('div');
            AppState.placeholder.className = 'kanban-card drag-placeholder';
            AppState.placeholder.style.height = `${AppState.draggedCard.offsetHeight}px`;
            AppState.draggedCard.classList.add('dragging');
        },

        handleDragEnd() {
            AppState.draggedCard?.classList.remove('dragging');
            AppState.placeholder?.remove();
            AppState.draggedCard = null;
            AppState.placeholder = null;
        },

        handleDragOver(e) {
            e.preventDefault();
            const container = e.target.closest('.kanban-cards-container');
            if (!container || !AppState.placeholder) return;
            container.classList.add('drag-over');
            const afterEl = this._afterElement(container, e.clientY);
            afterEl ? container.insertBefore(AppState.placeholder, afterEl) : container.appendChild(AppState.placeholder);
        },

        handleDragLeave(e) {
            e.target.closest('.kanban-cards-container')?.classList.remove('drag-over');
        },

        _afterElement(container, y) {
            const cards = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
            return cards.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const off = y - box.top - box.height / 2;
                return (off < 0 && off > (closest.offset ?? -Infinity)) ? { offset: off, element: child } : closest;
            }, {}).element;
        },

        handleDrop(e) {
            e.preventDefault();
            const container = e.target.closest('.kanban-cards-container');
            if (!container || !AppState.draggedCard) return;
            AppState.placeholder?.remove();
            document.querySelectorAll('.kanban-cards-container.drag-over').forEach(c => c.classList.remove('drag-over'));
            const card     = AppState.draggedCard;
            const coluna   = container.closest('.kanban-column')?.id || 'desconhecido';
            const eventoId = card.dataset.eventoid || card.dataset.codigo;
            const origem   = card.dataset.coluna   || 'desconhecido';
            NitFirebase.exec((db, ref, update) =>
                update(ref(db, `kanban/${eventoId}`), {
                    coluna, operador: NitLogin.operador || 'anon', turno: NitLogin.turno || '', ts: Date.now(),
                })
            );
            gravarHistoricoFirebase(eventoId, origem, coluna, null, null, null, NitLogin.operador);
            registrarAcao(`'${card.dataset.codigo}' movido: ${origem} → ${coluna}.`);
        },

        // ── Limpar painel ─────────────────────────────────────────────────
        limparPainel() {
            nitConfirm('🗑️ Limpar Painel', '⚠️ Remove <strong>TODOS os dados</strong> para todos os operadores conectados.', () => {
                document.querySelectorAll('#tab-semaforo .kanban-cards-container').forEach(c => c.innerHTML = '');
                if (DOM.relatorioFinalPreview) DOM.relatorioFinalPreview.value = '';
                AppState.cardIdCounter = AppState.totalOcorrenciasCriadas = 0;
                localStorage.removeItem(AppState.STORAGE_KEY_SEMAFORO);
                NitFirebase.exec((db, ref, update) => {
                    ref(db, 'kanban').remove();
                    update(ref(db, 'meta'), {
                        ultimoReset: { ts: Date.now(), operador: NitLogin.operador || 'anon', turno: NitLogin.turno || '' },
                        dataReferencia: null,
                    });
                });
                this.atualizarPainel();
                showToast('Painel limpo para todos os operadores!', 'success');
                registrarAcao('Painel limpo.');
            });
        },

    // ── Init ──────────────────────────────────────────────────────────
    inicializar: function() {
        DOM.btnProcessar.addEventListener('click', this.handleProcessarClick.bind(this));
        DOM.btnEdicaoSalvar.addEventListener('click', this.handleSalvarEdicaoClick.bind(this));
        DOM.btnDespachoSemaforoConfirmar.addEventListener('click', this.handleSalvarDespachoClick.bind(this));
        
        var btnEncerrar = document.getElementById('btn-encerrar-operacao');
        if (btnEncerrar) {
            btnEncerrar.addEventListener('click', this.handleEncerrarOperacao.bind(this));
        }
        
        DOM.btnVisualizarRelatorio.addEventListener('click', function() {
            DOM.modalRelatorioTexto.value = this.gerarPreviewRelatorio();
            abrirModal(DOM.modalRelatorio);
        }.bind(this));
        
        var checkIncluir = document.getElementById('check-incluir-normalizados');
        if (checkIncluir) {
            checkIncluir.addEventListener('change', function() {
                this.gerarPreviewRelatorio();
            }.bind(this));
        }

        var kanbanArea = document.querySelector('#tab-semaforo');
        kanbanArea.addEventListener('dragstart', this.handleDragStart.bind(this));
        kanbanArea.addEventListener('dragend', this.handleDragEnd.bind(this));
        kanbanArea.addEventListener('dragover', this.handleDragOver.bind(this));
        kanbanArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        kanbanArea.addEventListener('drop', this.handleDrop.bind(this));
        kanbanArea.addEventListener('click', this.handleKanbanBoardClick.bind(this));

        this.inicializarListenerFirebase();
    }
};  // ← FECHA O OBJETO SEMAFORO
    // ═════════════════════════════════════════════════════════════════════════
    // INICIALIZAÇÃO
    // ═════════════════════════════════════════════════════════════════════════
    async function inicializarApp() {
    queryDOM();
    carregarDadosMestres();
    document.body.setAttribute('data-theme', 'dark');

    await NitFirebase._init();
    Semaforo.inicializar();
    switchTab('tab-semaforo');

    NitLogin.inicializar();
    NitLogin.tentarRestaurar() || true;

    setupModal(DOM.modalRelatorio, DOM.btnModalFechar);
    setupModal(DOM.modalEdicao, DOM.btnEdicaoCancelar);
    setupModal(DOM.modalDespachoSemaforo, DOM.btnDespachoSemaforoCancelar, function() {
        var preview = document.getElementById('despacho-preview');
        if (preview) preview.classList.remove('show');
        var b = document.getElementById('btn-despacho-semaforo-confirmar');
        if (b) b.innerHTML = 'Confirmar Despacho';
    });

    var tabButtons = DOM.tabButtons;
    for (var i = 0; i < tabButtons.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                switchTab(btn.dataset.tab);
            });
        })(tabButtons[i]);
    }

    // Modal confirmação genérico
    var mc = document.getElementById('modal-confirmar-generico');
    var ok = document.getElementById('btn-confirmar-generico-ok');
    var can = document.getElementById('btn-confirmar-generico-cancel');
    if (ok) {
        ok.addEventListener('click', function() {
            fecharModal(mc);
            if (_confirmCb) { _confirmCb(); _confirmCb = null; }
        });
    }
    if (can) {
        can.addEventListener('click', function() {
            fecharModal(mc);
            _confirmCb = null;
        });
    }
    if (mc) {
        mc.addEventListener('click', function(e) {
            if (e.target === mc) {
                fecharModal(mc);
                _confirmCb = null;
            }
        });
    }

    // Copiar relatório
    var btnCopiar = DOM.btnModalCopiar;
    if (btnCopiar) {
        btnCopiar.addEventListener('click', function() {
            var txt = DOM.modalRelatorioTexto ? DOM.modalRelatorioTexto.value : '';
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(txt)
                    .then(function() {
                        fecharModal(DOM.modalRelatorio);
                        showToast('Relatório copiado!', 'success');
                    })
                    .catch(function() {
                        Semaforo._clipboardFallback(txt);
                    });
            } else {
                Semaforo._clipboardFallback(txt);
                fecharModal(DOM.modalRelatorio);
            }
        });
    }

    // Histórico
    var btnH = document.getElementById('btn-ver-historico');
    var modH = document.getElementById('modal-historico');
    var bodH = document.getElementById('historico-body');
    if (btnH && modH) {
        btnH.addEventListener('click', function() {
            var logs = JSON.parse(localStorage.getItem('historicoDeAcoes_v1') || '[]');
            if (logs.length) {
                var html = '';
                for (var j = 0; j < logs.length; j++) {
                    html += '<div style="display:flex;padding:10px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;margin-bottom:8px;">' +
                        '<span style="color:var(--color-text-tertiary);min-width:160px;flex-shrink:0;">' + logs[j].timestamp + '</span>' +
                        '<span style="margin-left:16px;">' + logs[j].mensagem + '</span>' +
                        '</div>';
                }
                bodH.innerHTML = html;
            } else {
                bodH.innerHTML = '<p>Nenhuma ação registrada.</p>';
            }
            abrirModal(modH);
        });
        setupModal(modH, document.getElementById('btn-historico-fechar'));
    }

    NitCardDetails.inicializar();
    NitBuscaGlobal.inicializar();
    NitLogout.inicializar();
    NitLazy.inicializar();
    NitSidebar.inicializar();
    NitNormalizar.inicializar();
    NitNormalizados.inicializar();
    inicializarBuscasPorColuna();

    // Toggle campos de apoio no modal de despacho
    var temApoioCheck = document.getElementById('despacho-tem-apoio');
    if (temApoioCheck) {
        temApoioCheck.addEventListener('change', function() {
            var campos = document.getElementById('grupo-apoio-campos');
            if (campos) {
                campos.style.display = this.checked ? 'flex' : 'none';
            }
            if (!this.checked) {
                var apoioEquipe = document.getElementById('despacho-apoio-equipe');
                var apoioVt = document.getElementById('despacho-apoio-vt');
                if (apoioEquipe) apoioEquipe.value = '';
                if (apoioVt) apoioVt.value = '';
            }
        });
    }

    NitViradaDia.inicializar();
}

    function switchTab(tabId) {
        if (!document.getElementById(tabId)) return;
        var contents = DOM.tabContents;
        for (var i = 0; i < contents.length; i++) {
            contents[i].classList.remove('active');
        }
        var buttons = DOM.tabButtons;
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].classList.remove('active');
        }
        document.getElementById(tabId).classList.add('active');
        var activeBtn = document.querySelector('.tab-button[data-tab="' + tabId + '"]');
        if (activeBtn) activeBtn.classList.add('active');
    }
    // ═════════════════════════════════════════════════════════════════════════
    // NORMALIZAR — modal com data/hora fim obrigatórios + undo robusto
    // ═════════════════════════════════════════════════════════════════════════
    // ═════════════════════════════════════════════════════════════════════════
// NORMALIZAR — modal com data/hora fim obrigatórios + undo robusto
// ═════════════════════════════════════════════════════════════════════════
const NitNormalizar = {
    _cardAtual: null,
    _origemAtual: null,

    abrir(card) {
        this._cardAtual = card;
        this._origemAtual = card.closest('.kanban-column')?.id || 'desconhecido';

        var agora = new Date();
        var dataISO = agora.toISOString().slice(0, 10);
        var horaHM = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        var infoEl = document.getElementById('norm-card-info');
        if (infoEl) infoEl.textContent = card.dataset.codigo + ' — ' + card.dataset.endereco;

        var dataInput = document.getElementById('norm-data-fim');
        var horaInput = document.getElementById('norm-hora-fim');
        var obsInput = document.getElementById('norm-obs');
        var erroEl = document.getElementById('norm-erro');

        if (card.dataset.fim) {
            var parts = (card.dataset.fim).split(' ');
            if (parts[0]) {
                var d = parts[0].split('/');
                if (dataInput) dataInput.value = d[2] + '-' + d[1] + '-' + d[0];
            }
            if (parts[1] && horaInput) horaInput.value = parts[1].slice(0, 5);
        } else {
            if (dataInput) dataInput.value = dataISO;
            if (horaInput) horaInput.value = horaHM;
        }

        if (obsInput) obsInput.value = card.dataset.observacoes || '';
        if (erroEl) erroEl.style.display = 'none';

        document.getElementById('norm-card-id').value = card.id;
        abrirModal(document.getElementById('modal-normalizar'));

        setTimeout(function() {
            if (horaInput) horaInput.focus();
        }, 120);
    },

    confirmar() {
        var card = this._cardAtual;
        var origem = this._origemAtual;
        if (!card) return;

        var dataInput = document.getElementById('norm-data-fim');
        var horaInput = document.getElementById('norm-hora-fim');
        var obsInput = document.getElementById('norm-obs');
        var erroEl = document.getElementById('norm-erro');

        if (!dataInput || !dataInput.value || !horaInput || !horaInput.value) {
            if (erroEl) {
                erroEl.textContent = 'Data e hora de normalização são obrigatórios.';
                erroEl.style.display = 'block';
            }
            return;
        }

        var d = dataInput.value.split('-');
        var dataFimBR = d[2] + '/' + d[1] + '/' + d[0];
        var horaFimHM = horaInput.value.slice(0, 5);
        var obsNova = (obsInput && obsInput.value.trim()) || card.dataset.observacoes || '';
        var cod = card.dataset.codigo;
        var eventoId = card.dataset.eventoid || cod;

        fecharModal(document.getElementById('modal-normalizar'));

        var containerNorm = DOM.colunaNormalizados;
        containerNorm.prepend(card);
        card.dataset.coluna = 'coluna-normalizados';
        card.classList.add('card-foi-normalizado');
        setTimeout(function() {
            card.classList.remove('card-foi-normalizado');
        }, 2000);
        Semaforo.atualizarPainel();

        mostrarUndoToast(
            cod + ' normalizado — ' + horaFimHM,
            function() {
                NitFirebase.exec(function(db, ref, update) {
                    update(ref(db, 'kanban/' + eventoId), {
                        coluna: 'coluna-normalizados',
                        status: 'NORMALIZADO',
                        operador: NitLogin.operador || 'anon',
                        turno: NitLogin.turno || '',
                        ts: Date.now(),
                        data_fim: dataFimBR,
                        hora_fim: horaFimHM,
                        observacoes: obsNova,
                        ts_norm: Date.now()
                    });
                });
                card.dataset.fim = dataFimBR + ' ' + horaFimHM;
                card.dataset.observacoes = obsNova;
                gravarHistoricoFirebase(eventoId, origem, 'NORMALIZADO', null, null, null, NitLogin.operador);
                registrarAcao("'" + cod + "' normalizado — fim: " + dataFimBR + ' ' + horaFimHM + '.');
                showToast(cod + ' normalizado!', 'success');
            },
            function() {
                var containerOrigem = document.querySelector('#' + origem + ' .kanban-cards-container');
                if (containerOrigem) containerOrigem.appendChild(card);
                card.dataset.coluna = origem;
                NitFirebase.exec(function(db, ref, update) {
                    update(ref(db, 'kanban/' + eventoId), {
                        coluna: origem,
                        status: 'PENDENTE',
                        operador: NitLogin.operador || 'anon',
                        ts: Date.now(),
                        data_fim: null,
                        hora_fim: null,
                        ts_norm: null
                    });
                });
                Semaforo.atualizarPainel();
                showToast(cod + ' restaurado.', 'info');
            }
        );
    },

    inicializar: function() {
        var modal = document.getElementById('modal-normalizar');
        var btnConf = document.getElementById('btn-norm-confirmar');
        var btnCanc = document.getElementById('btn-norm-cancelar');
        var horaInput = document.getElementById('norm-hora-fim');

        if (!modal) return;

        if (btnConf) {
            btnConf.addEventListener('click', function() {
                this.confirmar();
            }.bind(this));
        }

        if (btnCanc) {
            btnCanc.addEventListener('click', function() {
                fecharModal(modal);
                this._cardAtual = null;
                this._origemAtual = null;
            }.bind(this));
        }

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                fecharModal(modal);
                this._cardAtual = null;
                this._origemAtual = null;
            }
        }.bind(this));

        if (horaInput) {
            horaInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') this.confirmar();
            }.bind(this));
        }
    }
};
window.NitNormalizar = NitNormalizar;
        

     
    // ═════════════════════════════════════════════════════════════════════════
    // SIDEBAR
    // ═════════════════════════════════════════════════════════════════════════
    const NitSidebar = {
        _KEY: 'nit-sidebar-collapsed',

        inicializar() {
            const btn = document.getElementById('btn-sb-toggle');
            if (!btn) return;
            if (localStorage.getItem(this._KEY) === '1') this._setSidebar(true);
            btn.addEventListener('click', () => this.toggle());
            document.addEventListener('keydown', e => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                if (e.key === '[') this.toggle();
            });
        },

        toggle()   { const sb = document.getElementById('sidebar'); if (sb) this._setSidebar(!sb.classList.contains('collapsed')); },
        expandir() { this._setSidebar(false); },

        _setSidebar(collapsed) {
            const sb = document.getElementById('sidebar');
            if (!sb) return;
            sb.classList.toggle('collapsed', collapsed);
            localStorage.setItem(this._KEY, collapsed ? '1' : '0');
            const btn = document.getElementById('btn-sb-toggle');
            if (btn) btn.setAttribute('aria-expanded', String(!collapsed));
        },

        toggleSec(id) {
            const sec = document.getElementById(id);
            if (sec) sec.classList.toggle('sec-collapsed');
        },
    };
    window.NitSidebar = NitSidebar;

    // ═════════════════════════════════════════════════════════════════════════
    // LAZY RENDER
    // ═════════════════════════════════════════════════════════════════════════
    const NitLazy = {
        _io:    null,
        _queue: new Map(),

        inicializar() {
            if (!('IntersectionObserver' in window)) return;
            this._io = new IntersectionObserver(entries => {
                entries.forEach(e => {
                    if (!e.isIntersecting) return;
                    const fn = this._queue.get(e.target);
                    if (fn) { fn(); this._queue.delete(e.target); this._io.unobserve(e.target); }
                });
            }, { rootMargin: '120px 0px', threshold: 0 });
        },

        observar(cardEl, renderFn) {
            if (!this._io) { renderFn(); return; }
            this._queue.set(cardEl, renderFn);
            this._io.observe(cardEl);
        },

        liberar(cardEl) {
            if (this._queue.has(cardEl)) {
                this._queue.delete(cardEl);
                this._io?.unobserve(cardEl);
            }
        },
    };
    window.NitLazy = NitLazy;

    // ═════════════════════════════════════════════════════════════════════════
    // MODAL DETALHES DO CARD
    // ═════════════════════════════════════════════════════════════════════════
    const NitCardDetails = {
        _COLUNAS: {
            'coluna-sem-necessidade': { label: 'Sem Necessidade', cor: '#94A3B8' },
            'coluna-espera':          { label: 'Aguardando',      cor: '#f85149' },
            'coluna-vl':              { label: 'Via Livre',       cor: '#f0883e' },
            'coluna-amc':             { label: 'AMC',             cor: '#58a6ff' },
            'coluna-normalizados':    { label: 'Normalizado',     cor: '#3fb950' },
        },

        abrir(card) {
            const ds      = card.dataset;
            const colId   = card.closest('.kanban-column')?.id || ds.coluna || '';
            const colInfo = this._COLUNAS[colId] || { label: colId || '—', cor: '#94A3B8' };

            const set = (id, val) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (val && String(val).trim()) { el.textContent = val; el.classList.remove('vazio'); }
                else { el.textContent = '—'; el.classList.add('vazio'); }
            };

            set('det-codigo',      ds.codigo);
            set('det-problema',    ds.problema);
            set('det-endereco',    ds.endereco);
            set('det-inicio',      ds.inicio);
            set('det-fim',         ds.fim);
            set('det-tipo',        ds.tipo);
            set('det-equipe',      ds.equipe);
            set('det-viatura',     ds.viatura);
            set('det-obs',         ds.observacoes);
            set('det-data',        ds.datareferencia);
            set('det-operador',    ds.operador);
            set('det-reincidente', ds.reincidente === 'true' ? 'Sim' : 'Nao');

            const badge = document.getElementById('detalhe-coluna-badge');
            if (badge) {
                badge.textContent    = colInfo.label;
                badge.style.background = colInfo.cor + '22';
                badge.style.color      = colInfo.cor;
                badge.style.border     = `1px solid ${colInfo.cor}44`;
            }
            abrirModal(document.getElementById('modal-detalhes'));
        },

        inicializar() {
            const modal = document.getElementById('modal-detalhes');
            const btnF  = document.getElementById('btn-detalhes-fechar');
            if (!modal || !btnF) return;
            btnF.addEventListener('click', () => fecharModal(modal));
            modal.addEventListener('click', e => { if (e.target === modal) fecharModal(modal); });
        },
    };

    // ═════════════════════════════════════════════════════════════════════════
    // BUSCA GLOBAL
    // ═════════════════════════════════════════════════════════════════════════
    const NitBuscaGlobal = {
        _aberto: false,
        _idx:    -1,

        _COLUNAS_LABEL: {
            'coluna-sem-necessidade': { label: 'Sem Nec.',    cor: '#94A3B8' },
            'coluna-espera':          { label: 'Aguardando',  cor: '#f85149' },
            'coluna-vl':              { label: 'Via Livre',   cor: '#f0883e' },
            'coluna-amc':             { label: 'AMC',         cor: '#58a6ff' },
            'coluna-normalizados':    { label: 'Normalizado', cor: '#3fb950' },
        },

        abrir() {
            const ov  = document.getElementById('busca-global-overlay');
            const inp = document.getElementById('busca-global-input');
            if (!ov) return;
            ov.classList.add('aberto');
            this._aberto = true;
            if (inp) { inp.value = ''; inp.focus(); }
            this._renderizar('');
        },

        fechar() {
            if (!this._aberto) return;
            document.getElementById('busca-global-overlay')?.classList.remove('aberto');
            this._aberto = false;
            this._idx = -1;
        },

        _coletarCards() {
            return Array.from(document.querySelectorAll('#tab-semaforo .kanban-card')).map(c => ({
                el:       c,
                codigo:   (c.dataset.codigo   || '').toLowerCase(),
                endereco: (c.dataset.endereco || '').toLowerCase(),
                problema: (c.dataset.problema || '').toLowerCase(),
                colId:    c.closest('.kanban-column')?.id || c.dataset.coluna || '',
                raw:      c,
            }));
        },

        _match(card, q) {
            return card.codigo.includes(q) || card.endereco.includes(q) || card.problema.includes(q);
        },

        _hl(texto, q) {
            if (!q || !texto) return texto || '';
            const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            return texto.replace(re, '<span class="busca-highlight">$1</span>');
        },

        _renderizar(q) {
            const lista = document.getElementById('busca-global-resultados');
            const vazio = document.getElementById('busca-global-vazio');
            if (!lista || !vazio) return;
            const termo = q.toLowerCase().trim();
            const todos = this._coletarCards();
            const hits  = termo ? todos.filter(c => this._match(c, termo)) : todos.slice(0, 20);
            lista.innerHTML = '';
            vazio.classList.toggle('visivel', !hits.length);
            if (!hits.length && termo) {
                vazio.innerHTML = `<i class="fas fa-search" style="font-size:22px;opacity:0.3;"></i><span>Nenhum card encontrado para <strong>"${termo}"</strong></span>`;
            } else if (!hits.length) {
                vazio.innerHTML = `<i class="fas fa-inbox" style="font-size:22px;opacity:0.3;"></i><span>Nenhum card no painel.</span>`;
            }
            this._idx = -1;
            hits.forEach((c, i) => {
                const colInfo = this._COLUNAS_LABEL[c.colId] || { label: c.colId, cor: '#94A3B8' };
                const item = document.createElement('div');
                item.className = 'busca-resultado-item';
                item.dataset.i = i;
                item.innerHTML = `
                    <span class="busca-res-coluna-dot" style="background:${colInfo.cor};"></span>
                    <span class="busca-res-codigo">${this._hl(c.raw.dataset.codigo, termo)}</span>
                    <span class="busca-res-endereco">${this._hl(c.raw.dataset.endereco, termo)}</span>
                    <span class="busca-res-tag">${this._hl(c.raw.dataset.problema, termo)}</span>
                    <span class="busca-res-coluna-label">${colInfo.label}</span>`;
                item.addEventListener('click', e => { e.stopPropagation(); this._selecionar(c.raw); });
                lista.appendChild(item);
            });
        },

        _selecionar(cardEl) {
            this.fechar();
            requestAnimationFrame(() => {
                cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                cardEl.style.outline    = '2px solid var(--color-primary)';
                cardEl.style.boxShadow  = '0 0 0 4px rgba(59,130,246,.25)';
                setTimeout(() => { cardEl.style.outline = ''; cardEl.style.boxShadow = ''; }, 2200);
            });
        },

        _moverFoco(dir) {
            const items = document.querySelectorAll('#busca-global-resultados .busca-resultado-item');
            if (!items.length) return;
            items[this._idx]?.classList.remove('ativo');
            this._idx = Math.max(0, Math.min(this._idx + dir, items.length - 1));
            items[this._idx]?.classList.add('ativo');
            items[this._idx]?.scrollIntoView({ block: 'nearest' });
        },

        _confirmarFoco() {
            document.querySelector('#busca-global-resultados .busca-resultado-item.ativo')?.click();
        },

        inicializar() {
            const btnAbrir = document.getElementById('btn-busca-global');
            const overlay  = document.getElementById('busca-global-overlay');
            const input    = document.getElementById('busca-global-input');
            const btnEsc   = document.getElementById('busca-global-esc');
            if (!overlay || !input) return;
            btnAbrir?.addEventListener('click', () => this.abrir());
            btnEsc?.addEventListener('click',  () => this.fechar());
            overlay.addEventListener('click', e => { if (e.target === overlay) this.fechar(); });
            document.addEventListener('keydown', e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); this.abrir(); return; }
                if (e.key === 'Escape' && this._aberto) { e.stopPropagation(); this.fechar(); }
            });
            input.addEventListener('keydown', e => {
                if      (e.key === 'ArrowDown') { e.preventDefault(); this._moverFoco(+1); }
                else if (e.key === 'ArrowUp')   { e.preventDefault(); this._moverFoco(-1); }
                else if (e.key === 'Enter')      { e.preventDefault(); this._confirmarFoco(); }
                else if (e.key === 'Escape')     { e.stopPropagation(); this.fechar(); }
            });
            input.addEventListener('input', () => this._renderizar(input.value));
        },
    };

    // ═════════════════════════════════════════════════════════════════════════
    // LOGOUT
    // ═════════════════════════════════════════════════════════════════════════
    const NitLogout = {
        inicializar() {
            const btn = document.getElementById('btn-logout');
            if (!btn) return;
            btn.addEventListener('click', () => this._executar());
            const _orig = NitLogin.confirmar.bind(NitLogin);
            NitLogin.confirmar = function() {
                _orig();
                btn.style.display = 'flex';
            };
            if (sessionStorage.getItem('nit-operador')) btn.style.display = 'flex';
        },

        _executar() {
            nitConfirm(
                '🚪 Sair do Sistema',
                `Tem certeza que deseja encerrar a sessão de <strong>${NitLogin.operador || 'operador'}</strong>?`,
                () => {
                    const nome = NitLogin.operador;
                    registrarAcao(`Logout: ${nome} — ${NitLogin.turno || ''}.`);
                    NitFirebase.exec((db, ref, update) =>
                        update(ref(db, 'meta/sessao'), { operador: null, turno: null, saidaTs: Date.now() })
                    );
                    sessionStorage.removeItem('nit-operador');
                    sessionStorage.removeItem('nit-turno');
                    NitLogin.operador = null;
                    NitLogin.turno    = null;
                    const badge = document.getElementById('nit-operador-badge');
                    if (badge) { badge.textContent = ''; badge.style.display = 'none'; }
                    const btn = document.getElementById('btn-logout');
                    if (btn) btn.style.display = 'none';
                    const nomeI  = document.getElementById('login-nome');
                    const turnoI = document.getElementById('login-turno');
                    if (nomeI)  nomeI.value  = '';
                    if (turnoI) turnoI.value = '';
                    document.getElementById('nit-login-overlay')?.classList.remove('hidden');
                    setTimeout(() => nomeI?.focus(), 120);
                    showToast(`Sessão encerrada. Até logo, ${nome}!`, 'info');
                }
            );
        },
    };

    // ═════════════════════════════════════════════════════════════════════════
    // BUSCA POR COLUNA
    // ═════════════════════════════════════════════════════════════════════════
    // ═════════════════════════════════════════════════════════════════════════
    // COLUNA NORMALIZADOS — colapso inline
    // ═════════════════════════════════════════════════════════════════════════
    const NitNormalizados = {
        _KEY: 'nit-norm-collapsed',

        inicializar() {
            if (localStorage.getItem(this._KEY) === '1') this._set(true);
            // Clicar no header inteiro também abre quando colapsado
            document.getElementById('coluna-normalizados')
                ?.querySelector('.kanban-column-header')
                ?.addEventListener('click', e => {
                    const col = document.getElementById('coluna-normalizados');
                    if (col?.classList.contains('collapsed') && !e.target.closest('#btn-toggle-norm')) {
                        this._set(false);
                    }
                });
        },

        toggle() {
            const col = document.getElementById('coluna-normalizados');
            this._set(!col?.classList.contains('collapsed'));
        },

        _set(collapsed) {
            const col   = document.getElementById('coluna-normalizados');
            const board = document.querySelector('.kanban-board');
            if (!col || !board) return;
            col.classList.toggle('collapsed', collapsed);
            board.classList.toggle('norm-collapsed', collapsed);
            localStorage.setItem(this._KEY, collapsed ? '1' : '0');
        },
    };
    window.NitNormalizados = NitNormalizados;

    function inicializarBuscasPorColuna() {
        document.querySelectorAll('.kanban-search').forEach(input => {
            const colunaId = input.dataset.coluna;
            if (!colunaId) return;
            input.addEventListener('input', () => {
                const q       = input.value.toLowerCase();
                const hoje    = NitData.hoje();
                const container = document.querySelector(`#${colunaId} .kanban-cards-container`);
                if (!container) return;
                container.querySelectorAll('.kanban-card').forEach(c => {
                    if (c.dataset.datareferencia !== hoje) { c.style.display = 'none'; return; }
                    const match = (c.dataset.codigo   || '').toLowerCase().includes(q)
                               || (c.dataset.endereco || '').toLowerCase().includes(q)
                               || (c.dataset.problema || '').toLowerCase().includes(q);
                    c.style.display = match ? '' : 'none';
                });
            });
        });
    }


    // ══════════════════════════════════════════════════════════════════
// NitViradaDia — versão compatível com NitProcessamento
// Apenas delega a verificação para o módulo principal.
// Não restaura relatórios automaticamente — isso agora é feito
// pelo NitProcessamento com base em metadados e orientação ao operador.
// ══════════════════════════════════════════════════════════════════
const NitViradaDia = {
    inicializar() {
        // Aguarda DOM e Firebase sincronizarem, então verifica lacuna noturna
        setTimeout(() => {
            if (typeof NitProcessamento !== 'undefined') {
                NitProcessamento.verificar();
            } else {
                console.warn('[NitViradaDia] NitProcessamento não encontrado.');
            }
        }, 1800);
    },
};

    // ═══════════════════════════════════════════════════════════════════════
    // NIT PROCESSAMENTO — rastreabilidade e verificação de turno
    // Registra metadados de cada processamento e orienta o operador da manhã
    // sobre relatórios postados na lacuna noturna (21:30 – 05:30).
    // ═══════════════════════════════════════════════════════════════════════
    const NitProcessamento = {
        _KEY_META:  'nit-ultimo-processamento-v1',
        _KEY_HIST:  'nit-historico-relatorios-v1',
        _MAX_DIAS:  7, // dias mantidos no histórico

        // ── Hash simples para identificar relatórios ─────────────────────
        _hash(str) {
            let h = 0;
            for (let i = 0; i < Math.min(str.length, 300); i++) {
                h = ((h << 5) - h) + str.charCodeAt(i);
                h |= 0;
            }
            return Math.abs(h).toString(16);
        },

        // ── Formata DD/MM/YYYY ────────────────────────────────────────────
        _hojeStr() {
            const d  = new Date();
            return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        },

        // ── Registra metadados ao final de cada processamento ────────────
        registrar(texto, eventos, dataReferencia) {
            const agora = new Date();
            const meta = {
                dataReferencia,
                data:        this._hojeStr(),
                horario:     agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
                operador:    NitLogin.operador || 'anon',
                turno:       NitLogin.turno    || '',
                totalEventos: eventos.length,
                timestamp:   agora.getTime(),
                hashTexto:   this._hash(texto),
            };

            // Salva o último processamento
            localStorage.setItem(this._KEY_META, JSON.stringify(meta));

            // Salva histórico por dia (não sobrescreve dias anteriores)
            try {
                const hist = JSON.parse(localStorage.getItem(this._KEY_HIST) || '{}');
                const diaKey = meta.data;
                if (!hist[diaKey]) hist[diaKey] = [];
                // Evita duplicata exata (mesmo hash)
                if (!hist[diaKey].some(r => r.hashTexto === meta.hashTexto)) {
                    hist[diaKey].push({
                        ts:          meta.timestamp,
                        horario:     meta.horario,
                        operador:    meta.operador,
                        turno:       meta.turno,
                        totalEventos: meta.totalEventos,
                        hashTexto:   meta.hashTexto,
                        // Texto completo para replay (limitado a 80KB)
                        textoRaw:    texto.length < 80000 ? texto : '[TRUNCADO]',
                    });
                }
                // Limpa dias antigos (mantém _MAX_DIAS)
                const dias = Object.keys(hist).sort((a, b) => {
                    const parse = d => { const [dd,mm,yyyy] = d.split('/'); return new Date(+yyyy,+mm-1,+dd); };
                    return parse(b) - parse(a);
                });
                if (dias.length > this._MAX_DIAS) {
                    dias.slice(this._MAX_DIAS).forEach(d => delete hist[d]);
                }
                localStorage.setItem(this._KEY_HIST, JSON.stringify(hist));
            } catch(e) {
                console.warn('[NitProcessamento] Falha ao salvar histórico:', e.message);
            }

            // Espelha no Firebase para visibilidade multi-operador
            NitFirebase.exec((db, ref, update) =>
                update(ref(db, 'meta/ultimoProcessamento'), meta)
            );
        },

        // ── Verifica se há lacuna desde o último processamento ───────────
        verificar() {
            if (this._verificado) return;
            this._verificado = true;
            const raw = localStorage.getItem(this._KEY_META);
            if (!raw) return; // Primeira vez — sem histórico

            let meta;
            try { meta = JSON.parse(raw); } catch { return; }

            const agora    = new Date();
            const hoje     = this._hojeStr();
            const ontem    = (() => {
                const d = new Date(agora); d.setDate(d.getDate() - 1);
                return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
            })();

            // Só exibe modal se o último processamento foi ontem
            if (meta.data !== ontem) return;

            // Extrai hora do último processamento
            const [hh, mm] = meta.horario.split(':').map(Number);
            const foiAposLacuna = hh >= 21 || hh < 6; // entre 21h e 06h

            this._exibirModal(meta, foiAposLacuna);
        },

        // ── Exibe modal orientando o operador da manhã ───────────────────
        _exibirModal(meta, foiAposLacuna) {
            const modal = document.getElementById('modal-virada-dia');
            const corpo = document.getElementById('modal-virada-corpo');
            const btnOk = document.getElementById('btn-virada-ok');
            const btnPr = document.getElementById('btn-virada-processar');
            if (!modal || !corpo) return;

            const lacunaMsg = foiAposLacuna
                ? `<div style="margin-top:14px;padding:12px 14px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);border-radius:8px;font-size:13px;line-height:1.6;color:var(--color-warning);">
                    <i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>
                    <strong>Atenção:</strong> O último processamento foi às <strong>${meta.horario}</strong>.
                    Se houver relatório postado no WhatsApp <strong>após ${meta.horario.slice(0,5)}</strong> e antes de 23:59, cole e processe antes de continuar.
                  </div>`
                : `<div style="margin-top:14px;padding:10px 14px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;font-size:13px;color:var(--color-success);">
                    <i class="fas fa-check-circle" style="margin-right:6px;"></i>
                    Processamento recente. Nenhuma lacuna detectada.
                  </div>`;

            corpo.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px;">
                    <div style="background:var(--color-bg);border-radius:8px;padding:12px;">
                        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--color-text-tertiary);margin-bottom:4px;">Operador</div>
                        <div style="font-size:14px;font-weight:600;color:var(--color-text-primary);">${meta.operador}</div>
                    </div>
                    <div style="background:var(--color-bg);border-radius:8px;padding:12px;">
                        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--color-text-tertiary);margin-bottom:4px;">Turno</div>
                        <div style="font-size:14px;font-weight:600;color:var(--color-text-primary);">${meta.turno || '—'}</div>
                    </div>
                    <div style="background:var(--color-bg);border-radius:8px;padding:12px;">
                        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--color-text-tertiary);margin-bottom:4px;">Data</div>
                        <div style="font-size:14px;font-weight:600;color:var(--color-text-primary);">${meta.data}</div>
                    </div>
                    <div style="background:var(--color-bg);border-radius:8px;padding:12px;">
                        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--color-text-tertiary);margin-bottom:4px;">Último processamento</div>
                        <div style="font-size:14px;font-weight:600;color:var(--color-text-primary);">${meta.horario.slice(0,5)}</div>
                    </div>
                    <div style="background:var(--color-bg);border-radius:8px;padding:12px;grid-column:1/-1;">
                        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--color-text-tertiary);margin-bottom:4px;">Ocorrências processadas</div>
                        <div style="font-size:14px;font-weight:600;color:var(--color-text-primary);">${meta.totalEventos} evento(s)</div>
                    </div>
                </div>
                ${lacunaMsg}
            `;

            // Botão "Já verifiquei"
            btnOk?.addEventListener('click', () => fecharModal(modal), { once: true });

            // Botão "Processar relatório pendente"
            btnPr?.addEventListener('click', () => {
                fecharModal(modal);
                // Expande sidebar se colapsada e foca na textarea
                if (typeof NitSidebar !== 'undefined') NitSidebar.expandir();
                setTimeout(() => {
                    const ta = document.getElementById('relatorio-bruto-input');
                    ta?.focus();
                    ta?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 200);
            }, { once: true });

            // Fecha ao clicar fora
            modal.addEventListener('click', e => { if (e.target === modal) fecharModal(modal); }, { once: true });

            abrirModal(modal);
        },

        // ── Consulta histórico de um dia ──────────────────────────────────
        historicoDodia(dataStr) {
            try {
                const hist = JSON.parse(localStorage.getItem(this._KEY_HIST) || '{}');
                return hist[dataStr] || [];
            } catch { return []; }
        },

        // ── Replay de um processamento anterior ───────────────────────────
        replay(hashTexto) {
            try {
                const hist = JSON.parse(localStorage.getItem(this._KEY_HIST) || '{}');
                for (const dia of Object.values(hist)) {
                    const reg = dia.find(r => r.hashTexto === hashTexto);
                    if (reg) {
                        console.log('[NitProcessamento] Texto para replay:', reg.textoRaw);
                        return reg.textoRaw;
                    }
                }
                console.warn('[NitProcessamento] Hash não encontrado:', hashTexto);
                return null;
            } catch { return null; }
        },
    };
    window.NitProcessamento = NitProcessamento;

    document.addEventListener('DOMContentLoaded', () => {
        inicializarApp().catch(e => console.error('[NIT] Falha crítica:', e));
    });


        // ── Placeholder overlay do círculo ───────────────────────────────
        (function() {
            const ta    = document.getElementById('relatorio-bruto-input');
            const label = document.getElementById('circulo-placeholder-label');
            if (!ta || !label) return;
            const update = () => { label.style.display = ta.value ? 'none' : 'flex'; };
            ta.addEventListener('input', update);
            ta.addEventListener('focus', () => { label.style.opacity = '0.4'; });
            ta.addEventListener('blur',  () => { label.style.opacity = '1'; update(); });
            update();
        })();

        // ── Sidebar overlay (mobile/tablet) ──────────────────────────────
        (function() {
            const sidebar   = document.getElementById('sidebar');
            const backdrop  = document.getElementById('sb-backdrop');
            const hamburger = document.getElementById('btn-sb-hamburger');
            if (!sidebar || !backdrop || !hamburger) return;

            function openSidebar() {
                sidebar.classList.add('sb-open');
                backdrop.classList.add('visible');
                hamburger.querySelector('i').className = 'fas fa-times';
            }
            function closeSidebar() {
                sidebar.classList.remove('sb-open');
                backdrop.classList.remove('visible');
                hamburger.querySelector('i').className = 'fas fa-bars';
            }

            hamburger.addEventListener('click', () => {
                sidebar.classList.contains('sb-open') ? closeSidebar() : openSidebar();
            });
            backdrop.addEventListener('click', closeSidebar);

            // fechar ao redimensionar para desktop
            window.addEventListener('resize', () => {
                if (window.innerWidth > 960) closeSidebar();
            });
        })();
