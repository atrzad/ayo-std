// Ayo Std: interações da página. Sem dependências; tudo que altera dados passa pelo cabeçalho X-Ayo.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pixel = document.body.classList.contains('tema-pixel');

  async function api(url, dados) {
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ayo': '1' },
        body: JSON.stringify(dados ?? {}),
        credentials: 'same-origin',
      });
    } catch {
      throw Object.assign(new Error('Sem conexão com o servidor. Confira a internet ou se o Ayo Std está rodando.'), { status: 0 });
    }
    let corpo = {};
    try { corpo = await resp.json(); } catch {}
    if (!resp.ok) throw Object.assign(new Error(corpo.erro || `Erro ${resp.status}.`), { status: resp.status });
    return corpo;
  }

  // ---------- avisos ----------
  let timerAviso;
  function avisar(texto, erro = false) {
    const el = $('#aviso');
    if (!el) return;
    el.textContent = texto;
    el.classList.toggle('erro', erro);
    el.classList.add('mostrar');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => el.classList.remove('mostrar'), erro ? 5000 : 3000);
  }

  // Faixa grande no tema pixel; no tema normal vira um aviso discreto.
  let timerBanner;
  function banner(texto, morte = false) {
    if (!pixel) { avisar(texto, morte); return; }
    const el = $('#banner');
    if (!el) return;
    el.querySelector('span').textContent = texto;
    el.classList.remove('mostrar', 'morte');
    void el.offsetWidth;
    el.classList.toggle('morte', morte);
    el.classList.add('mostrar');
    clearTimeout(timerBanner);
    timerBanner = setTimeout(() => el.classList.remove('mostrar'), 2700);
  }

  function maisUm(alvo, texto) {
    if (reduzir || !pixel) return;
    const r = alvo.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'mais-um';
    el.textContent = texto;
    el.style.left = `${r.left + r.width + 6}px`;
    el.style.top = `${r.top - 6}px`;
    document.body.append(el);
    setTimeout(() => el.remove(), 1100);
  }

  // medidores: largura via CSSOM (a CSP não permite style inline no HTML)
  function pintarMedidores(raiz = document) {
    $$('.medidor i[data-pct]', raiz).forEach((i) => { i.style.width = `${Math.max(0, Math.min(100, Number(i.dataset.pct) || 0))}%`; });
  }

  // ---------- formulário genérico: envia, mostra erro, recarrega com aviso ----------
  function ligarForm(seletor, url, { antes, depois, mensagem } = {}) {
    $$(seletor).forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const erro = $('[data-erro]', form);
        const botao = $('button[type="submit"]', form);
        const dados = Object.fromEntries(new FormData(form));
        // caixas de seleção viram true/false (marcadas ou não)
        $$('input[type="checkbox"][name]', form).forEach((c) => { dados[c.name] = c.checked; });
        if (erro) erro.hidden = true;
        try {
          if (antes) antes(dados, form);
          botao.disabled = true;
          const r = await api(typeof url === 'function' ? url(form) : url, dados);
          if (depois) return depois(dados, r, form);
          if (mensagem) sessionStorage.setItem('ayo-aviso', typeof mensagem === 'function' ? mensagem(dados) : mensagem);
          location.reload();
        } catch (err) {
          if (erro) { erro.textContent = err.message; erro.hidden = false; } else avisar(err.message, true);
          botao.disabled = false;
        }
      });
    });
  }

  // ---------- sair, entrar, primeira configuração ----------
  $$('[data-sair]').forEach((b) => b.addEventListener('click', async () => {
    try { await api('/api/sair'); } catch {}
    location.href = '/entrar';
  }));
  const conferirIguais = (a, b) => (dados) => { if (dados[a] !== dados[b]) throw new Error('As senhas não são iguais.'); };
  // entrar: volta para o convite/grupo se veio de lá; conta sem e-mail confirmado pode pedir o link de novo
  $$('form[data-form="entrar"]').forEach((form) => {
    const reenviar = $('[data-reenviar]', form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = $('[data-erro]', form);
      const botao = $('button[type="submit"]', form);
      erro.hidden = true;
      botao.disabled = true;
      try {
        await api('/api/entrar', Object.fromEntries(new FormData(form)));
        location.href = form.dataset.voltar || '/';
      } catch (err) {
        erro.textContent = err.message;
        erro.hidden = false;
        botao.disabled = false;
        if (reenviar) reenviar.hidden = err.status !== 403;
      }
    });
    reenviar?.addEventListener('click', async () => {
      reenviar.disabled = true;
      try { await api('/api/reenviar-confirmacao', { login: $('#usuario', form).value }); } catch {}
      avisar('Se a conta estiver aguardando confirmação, um novo link foi enviado para o e-mail dela.');
    });
  });
  ligarForm('form[data-form="configurar"]', '/api/configurar', { antes: conferirIguais('senha', 'confirmacao'), depois: () => { location.href = '/'; } });

  // ---------- conta ----------
  ligarForm('form[data-form="conta-senha"]', '/api/conta/senha', {
    antes: conferirIguais('nova', 'confirmacao'),
    depois: () => { sessionStorage.setItem('ayo-aviso', 'Senha trocada. As outras sessões abertas foram encerradas.'); location.href = '/conta'; },
  });
  ligarForm('form[data-form="conta-nome"]', '/api/conta/nome', { mensagem: (d) => `Nome de usuário trocado para ${d.usuario}.` });
  ligarForm('form[data-form="conta-perfil"]', '/api/conta/perfil', { mensagem: 'Perfil salvo.' });
  ligarForm('form[data-form="conta-email"]', '/api/conta/email', {
    mensagem: (d) => `Enviamos um link de confirmação para ${d.email}. O e-mail só muda depois que você clicar nele.`,
  });
  ligarForm('form[data-form="conta-excluir"]', '/api/conta/excluir', { depois: () => { location.href = '/entrar'; } });
  $$('form[data-form="conta-tema"]').forEach((form) => form.addEventListener('change', async () => {
    try { await api('/api/conta/tema', { tema: $('input[name="tema"]:checked', form).value }); location.reload(); } catch (err) { avisar(err.message, true); }
  }));

  // ---------- grupo, convites e cadastro ----------
  ligarForm('form[data-form="grupo-criar"]', '/api/grupo/criar', { mensagem: 'Grupo criado.' });
  ligarForm('form[data-form="grupo-consentir"]', '/api/grupo/compartilhamento', { mensagem: 'Compartilhamento salvo.' });
  ligarForm('form[data-form="grupo-convite"]', '/api/grupo/convite', {
    depois: (_d, r, form) => {
      const caixa = $('[data-convite-gerado]');
      $('[data-convite-codigo]', caixa).textContent = r.codigo;
      $('[data-convite-link]', caixa).value = r.link;
      caixa.hidden = false;
      $('button[type="submit"]', form).disabled = false;
    },
  });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copiar]');
    if (!b) return;
    const campo = $('[data-convite-link]');
    try { await navigator.clipboard.writeText(campo.value); avisar('Link copiado.'); } catch { campo.select(); avisar('Selecione e copie o link.'); }
  });
  ligarForm('form[data-form="convite-manual"]', '/api/convite/validar', { depois: (_d, r) => { location.href = `/convite/${r.codigo}`; } });
  $$('.campo-codigo').forEach((c) => c.addEventListener('input', () => { c.value = c.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }));
  ligarForm('form[data-form="criar-conta"]', '/api/criar-conta', {
    antes: (d) => {
      d.arroba = String(d.arroba || '').trim().toLowerCase().replace(/^@/, '');
      if (d.senha !== d.confirmacao) throw new Error('As senhas não são iguais.');
      if (!d.aceite) throw new Error('Para criar a conta, aceite as regras e a política de privacidade.');
    },
    depois: (d, r, form) => {
      form.hidden = true;
      const ok = $('[data-conta-criada]');
      $('[data-email-enviado]', ok).textContent = r.email;
      ok.hidden = false;
      try { document.cookie = 'ayo_cookies=essenciais; Max-Age=31536000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch {}
    },
  });

  // ---------- meu espaço ----------
  ligarForm('form[data-form="espaco-criar"]', '/api/espaco', { depois: (_d, r) => { location.href = `/espaco/${r.id}`; } });
  ligarForm('form[data-form="espaco-editar"]', (f) => `/api/espaco/${f.dataset.espaco}`, { mensagem: 'Trilha salva.' });
  ligarForm('form[data-form="espaco-nota"]', (f) => `/api/espaco/${f.dataset.espaco}/nota`, {
    depois: (_d, r) => { location.href = `/espaco/${r.id}/nota/${r.nota}/editar`; },
  });
  ligarForm('form[data-form="espaco-nota-salvar"]', (f) => `/api/espaco/${f.dataset.espaco}/nota/${f.dataset.nota}`, {
    antes: (d, f) => { d.versao = Number(f.dataset.versao); },
    depois: (_d, _r, f) => { sessionStorage.setItem('ayo-aviso', 'Nota salva.'); location.href = `/espaco/${f.dataset.espaco}/nota/${f.dataset.nota}`; },
  });
  const areaEspaco = $('form[data-form="espaco-nota-salvar"] textarea');
  if (areaEspaco) {
    const crescer = () => { areaEspaco.style.height = 'auto'; areaEspaco.style.height = `${Math.max(360, areaEspaco.scrollHeight + 4)}px`; };
    areaEspaco.addEventListener('input', crescer);
    crescer();
  }

  // ---------- botões de ação genéricos (data-acao-url); data-confirmar pede segundo clique ----------
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao-url]');
    if (!b) return;
    if (b.hasAttribute('data-confirmar') && !b.classList.contains('confirmar')) {
      b.dataset.textoOriginal = b.textContent;
      b.classList.add('confirmar');
      b.textContent = 'Confirmar';
      setTimeout(() => { if (b.classList.contains('confirmar')) { b.classList.remove('confirmar'); b.textContent = b.dataset.textoOriginal; } }, 5000);
      return;
    }
    b.disabled = true;
    try {
      await api(b.dataset.acaoUrl, b.dataset.acaoCorpo ? JSON.parse(b.dataset.acaoCorpo) : {});
      if (b.dataset.acaoMsg) sessionStorage.setItem('ayo-aviso', b.dataset.acaoMsg);
      if (b.dataset.acaoIr) location.href = b.dataset.acaoIr; else location.reload();
    } catch (err) {
      avisar(err.message, true);
      b.disabled = false;
    }
  });

  // ---------- aviso de cookies (só o essencial de sessão) ----------
  const avisoCookies = $('[data-aviso-cookies]');
  if (avisoCookies && !/(^|;\s*)ayo_cookies=/.test(document.cookie)) {
    avisoCookies.hidden = false;
    $('[data-aceitar-cookies]', avisoCookies).addEventListener('click', async () => {
      document.cookie = 'ayo_cookies=essenciais; Max-Age=31536000; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
      avisoCookies.hidden = true;
      try { await api('/api/cookies'); } catch {}
    });
  }
  ligarForm('form[data-form="conta-criar"]', '/api/conta/usuarios', { mensagem: (d) => `Conta ${d.usuario} criada. Passe a senha provisória para a pessoa.` });
  ligarForm('form[data-form="conta-redefinir"]', '/api/conta/usuarios/redefinir', { mensagem: 'Senha provisória definida. A pessoa vai criar a própria no próximo acesso.' });

  // Ações destrutivas pedem um segundo clique (a página não usa confirm()).
  function segundoClique(botao) {
    if (botao.classList.contains('confirmar')) return true;
    $$('.btn-x.confirmar').forEach((x) => { x.classList.remove('confirmar'); x.textContent = x.dataset.textoOriginal || 'Remover'; });
    botao.dataset.textoOriginal = botao.textContent;
    botao.classList.add('confirmar');
    botao.textContent = 'Confirmar';
    return false;
  }

  document.addEventListener('click', async (e) => {
    const alvo = e.target.closest('[data-remover], [data-foco-remover], [data-conta-remover], [data-foco-acao="cancelar"]');
    if (!alvo || !segundoClique(alvo)) return;
    alvo.disabled = true;
    try {
      if (alvo.dataset.remover) {
        await api(`/api/t/${alvo.dataset.trilha}/registro/remover`, { linha: Number(alvo.dataset.remover), hash: alvo.dataset.hash });
        sessionStorage.setItem('ayo-aviso', 'Registro removido. Uma cópia do CSV anterior ficou no backup.');
      } else if (alvo.dataset.focoRemover) {
        await api('/api/foco/remover', { id: Number(alvo.dataset.focoRemover) });
        sessionStorage.setItem('ayo-aviso', 'Sessão removida.');
      } else if (alvo.dataset.contaRemover) {
        await api('/api/conta/usuarios/remover', { id: Number(alvo.dataset.contaRemover) });
        sessionStorage.setItem('ayo-aviso', 'Conta removida.');
      } else {
        await api('/api/foco/cancelar', { id: Number(alvo.dataset.id) });
        sessionStorage.setItem('ayo-aviso', 'Sessão abandonada. Ela não conta no tempo de foco.');
      }
      location.reload();
    } catch (err) {
      avisar(err.message, true);
      alvo.disabled = false;
    }
  });

  // ---------- nota: tarefas e selos das seções ----------
  const artigo = $('article.nota[data-arquivo]');

  function atualizarSelos() {
    if (!artigo) return new Map();
    const resultado = new Map();
    $$('h2, h3', artigo).forEach((h) => {
      const nivel = Number(h.tagName[1]);
      let feitas = 0, total = 0;
      let el = h.nextElementSibling;
      while (el && !(/^H[1-6]$/.test(el.tagName) && Number(el.tagName[1]) <= nivel)) {
        $$('input.cb', el).forEach((cb) => { total++; if (cb.checked) feitas++; });
        el = el.nextElementSibling;
      }
      let selo = h.querySelector('.selo-secao');
      if (!total) { selo?.remove(); return; }
      if (!selo) { selo = document.createElement('span'); selo.className = 'selo-secao'; h.append(selo); }
      selo.textContent = feitas === total ? `✓ ${feitas}/${total}` : `${feitas}/${total}`;
      selo.classList.toggle('completo', feitas === total);
      resultado.set(h.id, { feitas, total });
    });
    $$('.indice a[data-secao]').forEach((a) => {
      const r = resultado.get(a.dataset.secao);
      let selo = a.querySelector('.selo-secao');
      if (!r) { selo?.remove(); return; }
      if (!selo) { selo = document.createElement('span'); selo.className = 'selo-secao'; a.append(selo); }
      selo.textContent = r.feitas === r.total ? '✓' : `${r.feitas}/${r.total}`;
      selo.classList.toggle('completo', r.feitas === r.total);
    });
    return resultado;
  }

  function secaoDe(cb) {
    let el = cb.closest('ul, ol, blockquote, p, div.tabela') || cb;
    while (el && el.parentElement !== artigo) el = el.parentElement;
    while (el && !/^H[23]$/.test(el.tagName)) el = el.previousElementSibling;
    return el;
  }

  function atualizarProgressoNota(feitas, total) {
    const f = $('[data-feitas]'), t = $('[data-total]'), p = $('[data-pct-txt]'), m = $('[data-nota-medidor]');
    if (f) f.textContent = feitas;
    if (t) t.textContent = total;
    const pct = total ? (100 * feitas) / total : 0;
    if (p) p.textContent = `${Math.round(pct)}%`;
    if (m) { m.dataset.pct = pct.toFixed(1); pintarMedidores(m.parentElement); }
  }

  if (artigo) {
    atualizarSelos();
    artigo.addEventListener('change', async (e) => {
      const cb = e.target;
      if (!cb.matches('input.cb[data-linha], input.cb[data-chave]')) return;
      const marcado = cb.checked;
      const antes = secaoDe(cb);
      const estavaCompleta = antes?.querySelector('.selo-secao.completo');
      cb.disabled = true;
      cb.classList.add('salvando');
      try {
        const corpo = { arquivo: artigo.dataset.arquivo, marcado };
        if (cb.dataset.chave) corpo.chave = cb.dataset.chave;
        else Object.assign(corpo, { linha: Number(cb.dataset.linha), hash: cb.dataset.hash });
        const r = await api(artigo.dataset.endpoint || `/api/t/${artigo.dataset.trilha}/tarefa`, corpo);
        if (r.hash) cb.dataset.hash = r.hash;
        cb.closest('li')?.classList.toggle('feito', marcado);
        atualizarProgressoNota(r.feitas, r.total);
        const almas = $('.almas b');
        if (almas && typeof r.almas === 'number') almas.textContent = r.almas.toLocaleString('pt-BR');
        const sec = atualizarSelos();
        if (marcado) {
          maisUm(cb, '+1');
          const info = antes && sec.get(antes.id);
          if (r.total && r.feitas === r.total) banner('Nota concluída');
          else if (info && info.feitas === info.total && !estavaCompleta) banner(antes.tagName === 'H3' ? 'Módulo concluído' : 'Seção concluída');
        }
      } catch (err) {
        cb.checked = !marcado;
        if (err.status === 409) {
          banner('A nota mudou', true);
          avisar('Esta nota foi alterada em outro lugar. Recarregando a versão atual…', true);
          setTimeout(() => location.reload(), 1800);
        } else {
          avisar(`Não deu para salvar: ${err.message}`, true);
        }
      } finally {
        cb.disabled = false;
        cb.classList.remove('salvando');
      }
    });
  }

  // ---------- registro de questões e ritmo ----------
  ligarForm('form[data-form="registro"]', (f) => `/api/t/${f.dataset.trilha}/registro`, {
    mensagem: (d) => `Sessão registrada: ${d.acertos}/${d.questoes} em ${d.materia}.`,
  });
  $$('form[data-form="projecao"]').forEach((form) => {
    form.addEventListener('change', async () => {
      try {
        await api(`/api/t/${form.dataset.trilha}/projecao`, Object.fromEntries(new FormData(form)));
        location.reload();
      } catch (err) {
        avisar(err.message, true);
      }
    });
  });

  // ---------- pomodoro ----------
  const mmss = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const somLigado = () => { try { return localStorage.getItem('ayo-som') !== 'nao'; } catch { return true; } };

  function tocarSino() {
    if (!somLigado()) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.07, ctx.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.11);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.12);
        o.stop(ctx.currentTime + i * 0.12 + 0.12);
      });
    } catch {}
  }

  function notificar(titulo, corpo) {
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(titulo, { body: corpo, icon: '/icone.svg' }); } catch {}
  }

  const pilula = $('.foco-fixo[data-foco-id]');
  if (pilula) {
    // acabou de começar: a barra entra com animação
    try { if (sessionStorage.getItem('ayo-foco-entrou')) { sessionStorage.removeItem('ayo-foco-entrou'); pilula.classList.add('entrando'); } } catch {}
    const id = Number(pilula.dataset.focoId);
    const total = Number(pilula.dataset.focoTotal);
    const pausado = pilula.dataset.focoEstado === 'pausado';
    // Relógio do navegador ajustado ao do servidor (aparelhos com hora diferente).
    const desvio = Number(pilula.dataset.agora) - Date.now();
    const fim = Date.now() + desvio + Number(pilula.dataset.focoRestante);
    const tituloBase = document.title;
    let encerrando = false;

    const tique = async () => {
      const resta = pausado ? Number(pilula.dataset.focoRestante) : fim - (Date.now() + desvio);
      $$('[data-foco-relogio]').forEach((el) => { el.textContent = mmss(resta); });
      $$('[data-foco-barra]').forEach((barra) => {
        barra.dataset.pct = (100 * (1 - resta / total)).toFixed(2);
        barra.style.width = `${Math.max(0, Math.min(100, Number(barra.dataset.pct)))}%`;
      });
      document.title = `${mmss(resta)} ${pausado ? '(pausado) ' : ''}· ${tituloBase}`;
      if (pausado || resta > 0 || encerrando) return;
      encerrando = true;
      clearInterval(relogio);
      try {
        const r = await api('/api/foco/concluir', { id, automatico: true });
        const msg = r.tipo === 'pausa' ? 'Pausa concluída' : 'Foco concluído';
        tocarSino();
        notificar(msg, r.tipo === 'pausa' ? 'Hora de voltar ao foco.' : `${r.minutos} min${r.assunto ? ` em ${r.assunto}` : ''}. Hora de uma pausa.`);
        banner(msg);
        sessionStorage.setItem('ayo-aviso', `${msg}${r.assunto ? `: ${r.assunto}` : ''}.`);
        setTimeout(() => location.reload(), $('[data-foco-pagina]') ? 2600 : 3200);
      } catch (err) {
        // 409 = o servidor ainda conta alguns segundos; tenta de novo em breve.
        encerrando = false;
        setTimeout(tique, 3000);
      }
    };
    const relogio = setInterval(tique, 1000);
    tique();
  }

  // botões da sessão em andamento
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-foco-acao="pausar"], [data-foco-acao="retomar"], [data-foco-acao="concluir"]');
    if (!b) return;
    b.disabled = true;
    try {
      const acao = b.dataset.focoAcao;
      const r = await api(`/api/foco/${acao}`, { id: Number(b.dataset.id) });
      if (acao === 'concluir') {
        sessionStorage.setItem('ayo-aviso', r.curta ? 'Sessão com menos de 1 minuto: não foi contada.' : `Sessão registrada: ${r.minutos} min.`);
      }
      location.reload();
    } catch (err) {
      avisar(err.message, true);
      b.disabled = false;
    }
  });

  // formulário de início
  const formFoco = $('form[data-form="foco-iniciar"]');
  if (formFoco) {
    const previa = $('[data-relogio-previa]', formFoco);
    const livre = $('label.livre', formFoco);
    const som = $('#foco-som');
    if (som) {
      som.checked = somLigado();
      som.addEventListener('change', () => { try { localStorage.setItem('ayo-som', som.checked ? 'sim' : 'nao'); } catch {} });
    }
    const modoAtual = () => $('input[name="modo"]:checked', formFoco);
    const atualizarPrevia = () => {
      const m = modoAtual();
      const ehLivre = m.value === 'livre';
      livre.hidden = !ehLivre;
      const min = ehLivre ? Number($('input[name="minutos"]', formFoco).value) || 0 : Number(m.dataset.minutos);
      previa.textContent = mmss(min * 60000);
    };
    formFoco.addEventListener('change', (e) => {
      if (e.target.name === 'trilha') {
        const painel = $('[data-foco-pagina]');
        [...painel.classList].filter((c) => c.startsWith('t-')).forEach((c) => painel.classList.remove(c));
        painel.classList.add(`t-${e.target.value}`);
        $('input[name="assunto"]', formFoco).setAttribute('list', `assuntos-${e.target.value}`);
      }
      atualizarPrevia();
    });
    formFoco.addEventListener('input', atualizarPrevia);
    atualizarPrevia();

    formFoco.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = $('[data-erro]', formFoco);
      const botao = $('button[type="submit"]', formFoco);
      const m = modoAtual();
      const dados = Object.fromEntries(new FormData(formFoco));
      const corpo = {
        tipo: m.dataset.tipo,
        minutos: m.value === 'livre' ? Number(dados.minutos) : Number(m.dataset.minutos),
        trilha: dados.trilha,
        assunto: dados.assunto,
      };
      erro.hidden = true;
      botao.disabled = true;
      // pedido de permissão no clique (o navegador só deixa perguntar após uma ação da pessoa)
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {}
      try {
        await api('/api/foco/iniciar', corpo);
        try { sessionStorage.setItem('ayo-foco-entrou', '1'); } catch {}
        location.reload();
      } catch (err) {
        erro.textContent = err.message;
        erro.hidden = false;
        botao.disabled = false;
      }
    });
  }
  ligarForm('form[data-form="foco-manual"]', '/api/foco/manual', { mensagem: (d) => `Sessão de ${d.minutos} min registrada.` });

  // ---------- dicas do gráfico ----------
  let dica;
  function mostrarDica(alvo, x, y) {
    if (!dica) { dica = document.createElement('div'); dica.id = 'dica'; document.body.append(dica); }
    dica.textContent = alvo.dataset.dica;
    dica.hidden = false;
    const r = dica.getBoundingClientRect();
    dica.style.left = `${Math.min(innerWidth - r.width - 8, Math.max(8, x + 14))}px`;
    dica.style.top = `${Math.max(8, y - r.height - 12)}px`;
  }
  $$('[data-dica]').forEach((g) => {
    g.addEventListener('mousemove', (e) => mostrarDica(g, e.clientX, e.clientY));
    g.addEventListener('mouseleave', () => { if (dica) dica.hidden = true; });
    g.addEventListener('focus', () => { const r = g.getBoundingClientRect(); mostrarDica(g, r.left + r.width / 2, r.top); });
    g.addEventListener('blur', () => { if (dica) dica.hidden = true; });
  });

  // ---------- citação da página inicial: "Outra reflexão" passa para a próxima ----------
  const cit = $('[data-citacao]');
  if (cit) {
    let lista = [];
    try { lista = JSON.parse($('#citacoes-dados').textContent); } catch {}
    let i = Number(cit.dataset.indice) || 0;
    $('[data-citacao-outra]', cit).addEventListener('click', () => {
      if (!lista.length) return;
      i = (i + 1) % lista.length;
      const c = lista[i];
      $('[data-citacao-tipo]', cit).textContent = c.tipo;
      $('[data-citacao-texto]', cit).textContent = `“${c.texto}”`;
      $('[data-citacao-autor]', cit).textContent = c.autor;
      $('[data-citacao-fonte]', cit).textContent = c.fonte;
    });
  }

  pintarMedidores();
  const pendente = sessionStorage.getItem('ayo-aviso');
  if (pendente) { sessionStorage.removeItem('ayo-aviso'); avisar(pendente); }
})();
