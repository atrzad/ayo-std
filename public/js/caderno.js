// Ayo Std: editor do caderno. Texto (simples ou Markdown) + folha de caneta com pressão.
// Salva sozinho; cada gravação leva a versão, e o servidor recusa se outra aba já tiver mudado a anotação.
(() => {
  const raiz = document.querySelector('[data-caderno]');
  if (!raiz) return;
  const $ = (s, el = raiz) => el.querySelector(s);
  const $$ = (s, el = raiz) => [...el.querySelectorAll(s)];

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
      throw Object.assign(new Error('Sem conexão com o servidor.'), { status: 0 });
    }
    let corpo = {};
    try { corpo = await resp.json(); } catch {}
    if (!resp.ok) throw Object.assign(new Error(corpo.erro || `Erro ${resp.status}.`), { status: resp.status });
    return corpo;
  }

  function avisar(texto, erro = false) {
    const el = document.getElementById('aviso');
    if (!el) return;
    el.textContent = texto;
    el.classList.toggle('erro', erro);
    el.classList.add('mostrar');
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => el.classList.remove('mostrar'), erro ? 6000 : 3000);
  }

  // ---------- estado ----------
  const LARGURA = 1000;
  const ALTURA_PAGINA = 1400;
  const LINHA = 44;
  let desenho;
  try { desenho = JSON.parse(document.getElementById('desenho-dados').textContent); } catch { desenho = null; }
  let tracos = desenho?.tracos || [];
  let altura = desenho?.altura || ALTURA_PAGINA;
  let id = raiz.dataset.id ? Number(raiz.dataset.id) : null;
  let versao = Number(raiz.dataset.versao) || 0;

  // ---------- salvamento automático ----------
  const status = $('[data-status]');
  let sujo = false;
  let salvando = false;
  let travado = false;
  let timer = null;

  const campos = () => ({
    titulo: $('[name="titulo"]').value,
    data: $('[name="data"]').value,
    trilha: $('[name="trilha"]').value,
    assunto: $('[name="assunto"]').value,
    formato: $('[name="formato"]:checked').value,
    texto: $('[name="texto"]').value,
    desenho: tracos.length ? { v: 1, altura, tracos } : null,
  });
  const vazio = (c) => !c.titulo.trim() && !c.texto.trim() && !c.desenho;

  function marcarSujo(atraso = 1200) {
    if (travado) return;
    sujo = true;
    status.textContent = 'Alterações não salvas';
    status.dataset.estado = 'sujo';
    clearTimeout(timer);
    timer = setTimeout(salvar, atraso);
  }

  async function salvar() {
    if (travado || !sujo) return;
    if (salvando) { clearTimeout(timer); timer = setTimeout(salvar, 600); return; }
    const c = campos();
    if (!id && vazio(c)) return;
    salvando = true;
    sujo = false;
    status.textContent = 'Salvando…';
    status.dataset.estado = 'salvando';
    try {
      const r = id ? await api(`/api/caderno/${id}`, { ...c, versao }) : await api('/api/caderno', c);
      if (!id) {
        id = r.id;
        raiz.dataset.id = String(id);
        history.replaceState(null, '', `/caderno/${id}`);
      }
      versao = r.versao;
      const hora = new Date(r.atualizado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (!sujo) { status.textContent = `Salvo às ${hora}`; status.dataset.estado = 'salvo'; }
    } catch (err) {
      if (err.status === 409) {
        travado = true;
        status.textContent = 'Conflito: mudou em outra aba';
        status.dataset.estado = 'erro';
        avisar('Esta anotação foi alterada em outra aba ou aparelho. Copie o que escreveu aqui e recarregue a página.', true);
      } else {
        sujo = true;
        status.textContent = 'Não salvou; tentando de novo…';
        status.dataset.estado = 'erro';
        if (err.status === 413 || err.status === 400) { travado = true; avisar(err.message, true); }
        else { clearTimeout(timer); timer = setTimeout(salvar, 5000); }
      }
    } finally {
      salvando = false;
    }
  }

  // Ao sair com algo não salvo, o navegador pergunta antes de fechar.
  addEventListener('beforeunload', (e) => {
    if (sujo || salvando) { salvar(); e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && sujo) salvar(); });

  $$('[name="titulo"], [name="data"], [name="assunto"], [name="texto"]').forEach((el) => el.addEventListener('input', () => marcarSujo()));
  $('[name="trilha"]').addEventListener('change', (e) => {
    $('[name="assunto"]').setAttribute('list', `assuntos-${e.target.value}`);
    [...document.body.classList].filter((c) => c.startsWith('t-')).forEach((c) => document.body.classList.remove(c));
    document.body.classList.add(`t-${e.target.value || 'inicio'}`);
    marcarSujo(300);
  });

  // ---------- abas ----------
  function abrirAba(nome) {
    raiz.dataset.aba = nome;
    $$('[data-aba-botao]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.abaBotao === nome)));
    $$('[data-painel]').forEach((p) => { p.hidden = p.dataset.painel !== nome; });
    if (nome === 'caneta') ajustarFolha();
  }
  $$('[data-aba-botao]').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.abaBotao)));

  // ---------- texto ----------
  const area = $('[name="texto"]');
  const previa = $('[data-previa]');
  const botaoPrevia = $('[data-previa-botao]');
  function crescer() { area.style.height = 'auto'; area.style.height = `${Math.max(320, area.scrollHeight + 4)}px`; }
  area.addEventListener('input', crescer);
  crescer();
  $$('[name="formato"]').forEach((r) => r.addEventListener('change', () => {
    const md = r.value === 'md';
    botaoPrevia.hidden = !md;
    area.classList.toggle('simples', !md);
    if (!md) { previa.hidden = true; area.hidden = false; botaoPrevia.textContent = 'Visualizar'; }
    marcarSujo(300);
  }));
  // Tab insere recuo em vez de sair do campo
  area.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b, value: v } = area;
    area.value = `${v.slice(0, a)}  ${v.slice(b)}`;
    area.selectionStart = area.selectionEnd = a + 2;
    marcarSujo();
  });
  botaoPrevia.addEventListener('click', async () => {
    if (!previa.hidden) {
      previa.hidden = true; area.hidden = false; botaoPrevia.textContent = 'Visualizar'; area.focus();
      return;
    }
    botaoPrevia.disabled = true;
    try {
      const r = await api('/api/caderno/previa', { texto: area.value });
      previa.innerHTML = r.html || '<p class="vazio">Nada escrito ainda.</p>';
      previa.hidden = false; area.hidden = true; botaoPrevia.textContent = 'Editar';
    } catch (err) {
      avisar(err.message, true);
    } finally {
      botaoPrevia.disabled = false;
    }
  });

  // ---------- caneta ----------
  const folha = $('[data-folha]');
  const canvas = $('[data-canvas]');
  const ctx = canvas.getContext('2d');
  let escala = 1;
  let ferramenta = 'caneta';
  const corAtiva = { caneta: '#1d1d1f', marca: '#ffd54f' };
  let espessura = 3.5;
  let soCaneta = false;
  try { soCaneta = localStorage.getItem('ayo-so-caneta') === 'sim'; } catch {}
  const caixaSoCaneta = $('[data-so-caneta]');
  caixaSoCaneta.checked = soCaneta;
  caixaSoCaneta.addEventListener('change', () => {
    soCaneta = caixaSoCaneta.checked;
    try { localStorage.setItem('ayo-so-caneta', soCaneta ? 'sim' : 'nao'); } catch {}
  });

  $$('.cor').forEach((b) => { b.style.background = b.dataset.cor; });
  $$('[name="ferramenta"]').forEach((r) => r.addEventListener('change', () => {
    ferramenta = r.value;
    $$('[data-cores]').forEach((g) => { g.hidden = g.dataset.cores !== (ferramenta === 'marca' ? 'marca' : 'caneta'); });
    folha.classList.toggle('apagando', ferramenta === 'borracha');
  }));
  $$('[data-cores]').forEach((grupo) => grupo.addEventListener('click', (e) => {
    const b = e.target.closest('.cor');
    if (!b) return;
    $$('.cor', grupo).forEach((x) => x.classList.toggle('ativa', x === b));
    corAtiva[grupo.dataset.cores] = b.dataset.cor;
  }));
  $$('[name="espessura"]').forEach((r) => r.addEventListener('change', () => { espessura = Number(r.value); }));

  function ajustarFolha() {
    const largura = folha.clientWidth || LARGURA;
    escala = largura / LARGURA;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = `${largura}px`;
    canvas.style.height = `${altura * escala}px`;
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * escala * dpr);
    folha.style.setProperty('--linha', `${LINHA * escala}px`);
    ctx.setTransform(dpr * escala, 0, 0, dpr * escala, 0, 0);
    redesenhar();
  }
  addEventListener('resize', () => { if (!$('[data-painel="caneta"]').hidden) ajustarFolha(); });

  const largura = (t, pressao) => (t.f === 'marca' ? t.w : t.w * (0.35 + 1.3 * pressao));

  // Curva suave: cada trecho vai do meio de um segmento ao meio do próximo, com o ponto como controle.
  function trecho(c, t, i) {
    const p = t.p;
    const x0 = p[i - 3], y0 = p[i - 2], x1 = p[i], y1 = p[i + 1];
    const xa = i >= 6 ? (p[i - 6] + x0) / 2 : x0;
    const ya = i >= 6 ? (p[i - 5] + y0) / 2 : y0;
    const xb = (x0 + x1) / 2, yb = (y0 + y1) / 2;
    c.lineWidth = largura(t, (p[i - 1] + p[i + 2]) / 2);
    c.beginPath();
    c.moveTo(xa, ya);
    c.quadraticCurveTo(x0, y0, xb, yb);
    c.stroke();
  }

  function estilo(c, t) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = t.c;
    c.fillStyle = t.c;
    c.globalAlpha = t.f === 'marca' ? 0.4 : 1;
    c.globalCompositeOperation = t.f === 'marca' ? 'multiply' : 'source-over';
  }

  function desenharTraco(c, t) {
    c.save();
    estilo(c, t);
    if (t.p.length === 3) {
      c.beginPath();
      c.arc(t.p[0], t.p[1], largura(t, t.p[2]) / 2, 0, Math.PI * 2);
      c.fill();
    } else if (t.f === 'marca') {
      // marca-texto: um único caminho, para a transparência não se acumular nas emendas
      c.lineWidth = t.w;
      c.beginPath();
      c.moveTo(t.p[0], t.p[1]);
      for (let i = 3; i < t.p.length; i += 3) c.lineTo(t.p[i], t.p[i + 1]);
      c.stroke();
    } else {
      for (let i = 3; i < t.p.length; i += 3) trecho(c, t, i);
      // último meio-segmento, até o ponto final
      const n = t.p.length;
      c.lineWidth = largura(t, t.p[n - 1]);
      c.beginPath();
      c.moveTo((t.p[n - 6] + t.p[n - 3]) / 2, (t.p[n - 5] + t.p[n - 2]) / 2);
      c.lineTo(t.p[n - 3], t.p[n - 2]);
      c.stroke();
    }
    c.restore();
  }

  function redesenhar() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    tracos.forEach((t) => desenharTraco(ctx, t));
  }

  // desfazer/refazer guardam a lista de traços (os traços em si nunca mudam)
  const pilhaDesfazer = [];
  const pilhaRefazer = [];
  function registrar() {
    pilhaDesfazer.push(tracos.slice());
    if (pilhaDesfazer.length > 150) pilhaDesfazer.shift();
    pilhaRefazer.length = 0;
  }
  function desenhoMudou() { redesenhar(); marcarSujo(2000); }

  let atual = null;      // traço em andamento
  let apagou = false;    // a passada da borracha já registrou o desfazer?
  let modoApagar = false;
  let ponteiroAtivo = null;
  let rolagemDedo = null;
  let canetaVista = false;

  function ponto(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / escala) * 10) / 10;
    const y = Math.round(((e.clientY - r.top) / escala) * 10) / 10;
    const pressao = e.pointerType === 'pen' ? Math.round(Math.max(0.05, e.pressure || 0.5) * 100) / 100 : 0.5;
    return [x, y, pressao];
  }

  function apagarEm(x, y) {
    const raio = 14 / Math.max(escala, 0.4);
    const antes = tracos.length;
    const restam = tracos.filter((t) => {
      for (let i = 0; i < t.p.length; i += 3) {
        const dx = t.p[i] - x, dy = t.p[i + 1] - y;
        if (dx * dx + dy * dy <= (raio + largura(t, t.p[i + 2]) / 2) ** 2) return false;
      }
      return true;
    });
    if (restam.length !== antes) {
      if (!apagou) { registrar(); apagou = true; }
      tracos = restam;
      redesenhar();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen' && !canetaVista) {
      canetaVista = true;
      if (!soCaneta) {
        soCaneta = true;
        caixaSoCaneta.checked = true;
        try { localStorage.setItem('ayo-so-caneta', 'sim'); } catch {}
        avisar('Caneta detectada: agora só ela desenha, e o dedo rola a página.');
      }
    }
    // dedo com "só caneta": rola a página manualmente (a folha bloqueia o gesto nativo)
    if (e.pointerType === 'touch' && (soCaneta || ponteiroAtivo !== null)) {
      rolagemDedo = { id: e.pointerId, y: e.clientY };
      return;
    }
    if (ponteiroAtivo !== null || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 5)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    ponteiroAtivo = e.pointerId;
    // botão de borracha da caneta (ou ferramenta borracha)
    modoApagar = ferramenta === 'borracha' || e.button === 5 || (e.buttons & 32) === 32;
    const [x, y, p] = ponto(e);
    if (modoApagar) { apagou = false; apagarEm(x, y); return; }
    atual = {
      f: ferramenta === 'marca' ? 'marca' : 'caneta',
      c: ferramenta === 'marca' ? corAtiva.marca : corAtiva.caneta,
      w: ferramenta === 'marca' ? 22 : espessura,
      p: [x, y, p],
    };
    ctx.save();
    estilo(ctx, atual);
    ctx.beginPath();
    ctx.arc(x, y, largura(atual, p) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (rolagemDedo && e.pointerId === rolagemDedo.id) {
      window.scrollBy(0, rolagemDedo.y - e.clientY);
      rolagemDedo.y = e.clientY;
      return;
    }
    if (e.pointerId !== ponteiroAtivo) return;
    const eventos = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (eventos.length ? eventos : [e])) {
      const [x, y, p] = ponto(ev);
      if (modoApagar) { apagarEm(x, y); continue; }
      const q = atual.p;
      const n = q.length;
      if (Math.abs(q[n - 3] - x) + Math.abs(q[n - 2] - y) < 0.8) continue;
      q.push(x, y, p);
      if (atual.f === 'marca') {
        ctx.save(); estilo(ctx, atual); ctx.globalAlpha = 0.4; ctx.lineWidth = atual.w;
        ctx.beginPath(); ctx.moveTo(q[n - 3], q[n - 2]); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
      } else {
        ctx.save(); estilo(ctx, atual); trecho(ctx, atual, q.length - 3); ctx.restore();
      }
    }
  });

  function fimDoTraco(e) {
    if (rolagemDedo && e.pointerId === rolagemDedo.id) { rolagemDedo = null; return; }
    if (e.pointerId !== ponteiroAtivo) return;
    ponteiroAtivo = null;
    if (modoApagar) {
      modoApagar = false;
      if (apagou) desenhoMudou();
      return;
    }
    if (atual) {
      registrar();
      tracos = tracos.concat([atual]);
      atual = null;
      desenhoMudou();
    }
  }
  canvas.addEventListener('pointerup', fimDoTraco);
  canvas.addEventListener('pointercancel', fimDoTraco);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- botões da folha ----------
  let confirmarLimpar = null;
  $('.ed-botoes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-desenho]');
    if (!b) return;
    const acao = b.dataset.desenho;
    if (acao === 'desfazer' && pilhaDesfazer.length) { pilhaRefazer.push(tracos); tracos = pilhaDesfazer.pop(); desenhoMudou(); }
    if (acao === 'refazer' && pilhaRefazer.length) { pilhaDesfazer.push(tracos); tracos = pilhaRefazer.pop(); desenhoMudou(); }
    if (acao === 'pagina') {
      if (altura >= ALTURA_PAGINA * 20) { avisar('Limite de 20 páginas por anotação.', true); return; }
      altura += ALTURA_PAGINA;
      ajustarFolha();
      marcarSujo(1500);
    }
    if (acao === 'limpar') {
      if (!tracos.length) return;
      if (confirmarLimpar !== b) {
        confirmarLimpar = b;
        b.classList.add('confirmar');
        b.textContent = 'Confirmar limpeza';
        setTimeout(() => { if (confirmarLimpar === b) { confirmarLimpar = null; b.classList.remove('confirmar'); b.textContent = 'Limpar tudo'; } }, 4000);
        return;
      }
      confirmarLimpar = null;
      b.classList.remove('confirmar');
      b.textContent = 'Limpar tudo';
      registrar();
      tracos = [];
      desenhoMudou();
    }
    if (acao === 'png') {
      const off = document.createElement('canvas');
      off.width = LARGURA;
      off.height = altura;
      const c = off.getContext('2d');
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, LARGURA, altura);
      tracos.forEach((t) => desenharTraco(c, t));
      const a = document.createElement('a');
      a.href = off.toDataURL('image/png');
      a.download = `${($('[name="titulo"]').value || 'anotacao').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'anotacao'}.png`;
      a.click();
    }
  });

  // atalhos: Ctrl+Z / Ctrl+Shift+Z na aba da caneta
  document.addEventListener('keydown', (e) => {
    if (raiz.dataset.aba !== 'caneta' || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    $(`[data-desenho="${e.shiftKey ? 'refazer' : 'desfazer'}"]`).click();
  });

  // ---------- apagar a anotação (segundo clique confirma) ----------
  const botaoApagar = $('[data-caderno-remover]');
  if (botaoApagar) {
    botaoApagar.addEventListener('click', async () => {
      if (!botaoApagar.classList.contains('confirmar')) {
        botaoApagar.classList.add('confirmar');
        botaoApagar.textContent = 'Confirmar: apagar';
        return;
      }
      botaoApagar.disabled = true;
      try {
        travado = true;
        sujo = false;
        await api(`/api/caderno/${id}/remover`);
        sessionStorage.setItem('ayo-aviso', 'Anotação apagada. Ela ainda existe no backup diário do banco.');
        location.href = '/caderno';
      } catch (err) {
        travado = false;
        avisar(err.message, true);
        botaoApagar.disabled = false;
      }
    });
  }

  abrirAba(raiz.dataset.aba || 'texto');
  if (!id) $('[name="titulo"]').focus();
})();
