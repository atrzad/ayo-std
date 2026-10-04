import { esc, caminhoURL } from './markdown.js';
import { sprite, EMBLEMAS } from './sprites.js';
import { dataBR, diasEntre, hojeISO, somarDias, nomeCargo } from './resumo.js';
import { formatarDuracao } from './foco.js';
import { CITACOES, citacaoDoDia } from './citacoes.js';

// O caderno saiu do Ayo Std: as anotações vivem no Ayo Sketchbook (site próprio, mesma conta).
const SKETCHBOOK = (process.env.SKETCHBOOK_URL || 'http://localhost:3400').replace(/\/$/, '');
const linkAnotar = (titulo, tag) => `${SKETCHBOOK}/nova?titulo=${encodeURIComponent(titulo || '')}${tag ? `&amp;tags=${encodeURIComponent(tag)}` : ''}`;

const fmt = new Intl.NumberFormat('pt-BR');
const pctTxt = (v) => (v == null ? '—' : `${Math.round(v)}%`);
const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const mesAno = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
// Tema pixel (padrão) ou normal (perfil sem enfeites). Sem usuário (login, erro deslogado) = pixel.
const ehPixel = (usuario) => (usuario?.tema || 'pixel') === 'pixel';
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function tempoAtras(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  if (s < 2 * 86400) return 'ontem';
  return dataBR(new Date(ms).toLocaleDateString('sv-SE'), false);
}

function medidor(pct, { rotulo = '', classe = '', marca = '' } = {}) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<span class="medidor ${classe}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"${
    rotulo ? ` aria-label="${esc(rotulo)}"` : ''}><i data-pct="${p.toFixed(1)}"${marca}></i></span>`;
}

const emblema = (slug, escala) => sprite(EMBLEMAS[slug] || 'lagrima', { escala });

// ---------- casca ----------

// Barra do pomodoro em andamento: logo abaixo do cabeçalho, presa no topo ao rolar, em todas as páginas.
function barraFoco(foco, px, trilhas) {
  if (!foco) return '';
  const pausado = foco.estado === 'pausado';
  const trilha = trilhas.find((t) => t.slug === foco.trilha);
  const pct = (100 * foco.decorridoMs) / (foco.duracao_s * 1000);
  return `
  <aside class="foco-fixo t-${esc(foco.trilha)}${pausado ? ' pausado' : ''}" aria-label="Pomodoro em andamento"
      data-foco-id="${foco.id}" data-foco-estado="${foco.estado}" data-foco-restante="${foco.restanteMs}"
      data-foco-total="${foco.duracao_s * 1000}" data-foco-tipo="${foco.tipo}" data-agora="${Date.now()}">
    <div class="foco-fixo-in">
      ${px ? sprite('ampulheta', { escala: 2 }) : ''}
      <a class="foco-fixo-info" href="/foco">
        <span class="foco-fixo-tipo">${foco.tipo === 'pausa' ? 'Pausa' : 'Foco'} · ${esc(trilha?.curto || foco.trilha)}${pausado ? ' · pausado' : ''}</span>
        <span class="foco-fixo-assunto">${esc(foco.assunto || (foco.tipo === 'pausa' ? 'Descanso' : 'Sem assunto'))}</span>
      </a>
      <b class="foco-fixo-relogio" data-foco-relogio>${mmss(foco.restanteMs)}</b>
      <span class="foco-fixo-acoes">
        ${pausado
          ? `<button type="button" class="btn btn-ouro" data-foco-acao="retomar" data-id="${foco.id}">Retomar</button>`
          : `<button type="button" class="btn" data-foco-acao="pausar" data-id="${foco.id}">Pausar</button>`}
        <button type="button" class="btn" data-foco-acao="concluir" data-id="${foco.id}">Concluir</button>
        <a class="btn" href="${linkAnotar(foco.assunto || 'Sessão de foco', foco.trilha)}">Anotar</a>
        <button type="button" class="btn-x" data-foco-acao="cancelar" data-id="${foco.id}">Abandonar</button>
      </span>
    </div>
    <span class="foco-fixo-trilho"><i data-foco-barra data-pct="${pct.toFixed(1)}"></i></span>
  </aside>`;
}

export function layout({ titulo, ativo = 'inicio', usuario = null, corpo, classe = '', trilhas = [], almas = null, foco = null, scripts = [] }) {
  const px = ehPixel(usuario);
  const aba = (slug, href, rotulo, icone) => `<a class="aba t-${slug}${ativo === slug ? ' ativa' : ''}" href="${href}"${
    ativo === slug ? ' aria-current="page"' : ''}>${px ? icone : ''}<span>${esc(rotulo)}</span></a>`;
  const abas = [
    aba('inicio', '/', px ? 'Fogueira' : 'Início', sprite('fogueira', { escala: 2 })),
    ...trilhas.filter((t) => !t.espaco).map((t) => aba(t.slug, `/t/${t.slug}`, t.curto, emblema(t.slug, 2))),
    aba('espaco', '/espaco', 'Meu espaço', sprite('picareta', { escala: 2 })),
    aba('foco', '/foco', 'Foco', sprite('ampulheta', { escala: 2 })),
    `<a class="aba t-caderno" href="${SKETCHBOOK}" title="Abrir o Ayo Sketchbook (notas e caneta)">${px ? sprite('livro', { escala: 2 }) : ''}<span>Sketchbook ↗</span></a>`,
    aba('grupo', '/grupo', 'Grupo', sprite('fogueira', { escala: 2 })),
  ].join('');
  const topo = usuario ? `
  <header class="topo">
    ${px ? `<div class="brasas" aria-hidden="true">${'<i></i>'.repeat(14)}</div>` : ''}
    <div class="topo-in">
      <a class="marca" href="/" aria-label="Ayo Std, início">${px ? sprite('fogueira', { escala: 3 }) : ''}<span class="marca-txt"><span class="marca-nome">Ayo</span><span class="marca-std">Std</span></span></a>
      <nav class="abas" aria-label="Trilhas">${abas}</nav>
      <div class="hud">
        ${px && almas != null ? `<span class="almas" title="Lágrimas: tarefas concluídas">${sprite('lagrima', { escala: 2 })}<b>${fmt.format(almas)}</b></span>` : ''}
        <a class="conta-link${ativo === 'conta' ? ' ativa' : ''}" href="/configuracoes" title="Configurações">@${esc(usuario.arroba || usuario.usuario)}</a>
        <button type="button" class="btn btn-sair" data-sair>Sair</button>
      </div>
    </div>
  </header>` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${px ? '<meta name="color-scheme" content="dark">' : '<meta name="color-scheme" content="light dark">'}
<title>${esc(titulo ? `${titulo} · Ayo Std` : 'Ayo Std')}</title>
<link rel="icon" href="/icone.svg" type="image/svg+xml">
${px ? '<link rel="stylesheet" href="/css/fontes.css">\n<link rel="stylesheet" href="/css/ayo.css">' : '<link rel="stylesheet" href="/css/normal.css">'}
<script src="/js/ayo.js" defer></script>
${scripts.map((src) => `<script src="${src}" defer></script>`).join('\n')}
</head>
<body class="${px ? 'tema-pixel' : 'tema-normal'}${usuario && foco ? ' com-foco' : ''} ${esc(classe)}">
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
${topo}
${usuario ? barraFoco(foco, px, trilhas) : ''}
<main id="conteudo">
${corpo}
</main>
<footer class="rodape envolve"><a href="/privacidade">Privacidade e regras</a>${usuario ? ' · <a href="/configuracoes">Configurações</a>' : ' · <a href="/convite">Tenho um convite</a>'}</footer>
<div class="aviso-cookies caixa" data-aviso-cookies hidden role="region" aria-label="Aviso de cookies">
  <p>Este site usa <b>apenas cookies essenciais</b>: o da sua sessão de login. Preferências como som e caneta ficam só no seu navegador. Nada é vendido nem enviado a terceiros.</p>
  <div class="foco-botoes"><button type="button" class="btn btn-ouro" data-aceitar-cookies>Entendi e aceito</button><a class="btn" href="/privacidade">Ler a política</a></div>
</div>
<div id="aviso" role="status" aria-live="polite"></div>
<div id="banner" aria-hidden="true"><span></span></div>
</body>
</html>`;
}

// ---------- entrada ----------

export function paginaEntrar({ primeira = false, local = true, voltar = '' }) {
  const titulo = primeira ? 'Primeira fogueira' : 'Descanse na fogueira';
  const texto = primeira
    ? 'Crie o seu usuário e a sua senha. Esta tela só aparece uma vez e só abre nesta máquina.'
    : 'Entre para continuar de onde parou.';
  const form = primeira && !local
    ? '<p class="erro-form">A primeira configuração só pode ser feita nesta máquina, em http://localhost.</p>'
    : `<form class="form-entrar" data-form="${primeira ? 'configurar' : 'entrar'}"${voltar ? ` data-voltar="${esc(voltar)}"` : ''} novalidate>
      <label for="usuario">${primeira ? 'Usuário' : '@usuário ou e-mail'}</label>
      <input id="usuario" name="usuario" autocomplete="username" required minlength="3" maxlength="32" autofocus>
      <label for="senha">Senha${primeira ? ' (mínimo de 10 caracteres)' : ''}</label>
      <input id="senha" name="senha" type="password" autocomplete="${primeira ? 'new-password' : 'current-password'}" required maxlength="200">
      ${primeira ? `<label for="confirmacao">Repita a senha</label>
      <input id="confirmacao" name="confirmacao" type="password" autocomplete="new-password" required maxlength="200">` : ''}
      <p class="erro-form" data-erro hidden></p>
      <button class="btn btn-ouro" type="submit">${primeira ? 'Acender a fogueira' : 'Entrar'}</button>
      ${primeira ? '' : `<button type="button" class="btn-x" data-reenviar hidden>Reenviar e-mail de confirmação</button>
      <p class="ajuda">Ainda não tem conta? As contas são criadas por convite: <a href="/convite">tenho um código</a>.</p>`}
    </form>`;
  return layout({
    titulo,
    classe: 'tela-entrar',
    corpo: `
    <section class="cena-fogueira">
      <div class="brasas grandes" aria-hidden="true">${'<i></i>'.repeat(18)}</div>
      <div class="fogueira-grande">${sprite('fogueira', { escala: 8 })}</div>
      <h1 class="titulo-gotico">Ayo Std</h1>
      <p class="sub">${esc(titulo)}</p>
      <div class="caixa caixa-entrar">
        <p>${esc(texto)}</p>
        ${form}
      </div>
    </section>`,
  });
}

// ---------- início ----------

const MENSAGENS_NO_CHAO = [
  'Prova adiante, portanto revise',
  'Questão difícil adiante, portanto respire',
  'Cuidado com a pressa',
  'Tente o caderno de erros',
  'Tesouro adiante: a revisão de 24 h',
  'Se ao menos eu tivesse feito o simulado…',
  'Visões de aprovação…',
  'Sono adiante, portanto durma',
  'Seja forte, ó estudante',
  'Edital adiante, portanto leia com calma',
];

export function proximaProva(cards) {
  const hoje = hojeISO();
  return cards
    .filter((c) => c.prova && c.prova >= hoje)
    .map((c) => ({ ...c, dias: diasEntre(hoje, c.prova) }))
    .sort((a, b) => a.dias - b.dias)[0] || null;
}

function saudacao() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function blocoCitacao() {
  const i = citacaoDoDia();
  const c = CITACOES[i];
  return `<figure class="citacao" data-citacao data-indice="${i}">
    <span class="citacao-tipo" data-citacao-tipo>${esc(c.tipo)}</span>
    <blockquote data-citacao-texto>“${esc(c.texto)}”</blockquote>
    <figcaption><b data-citacao-autor>${esc(c.autor)}</b> · <cite data-citacao-fonte>${esc(c.fonte)}</cite></figcaption>
    <button type="button" class="btn-x" data-citacao-outra>Outra reflexão</button>
    <script type="application/json" id="citacoes-dados">${JSON.stringify(CITACOES).replace(/</g, '\\u003c')}</script>
  </figure>`;
}

export function paginaInicio({ usuario, cards, eventos, trilhas, almas, foco, totais, streak, grupoNome }) {
  const px = ehPixel(usuario);
  const prox = proximaProva(cards);
  const hoje = new Date();
  const dataLonga = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const msg = MENSAGENS_NO_CHAO[(hoje.getDate() + hoje.getMonth() * 31) % MENSAGENS_NO_CHAO.length];
  const heroi = prox ? `
      <div class="heroi-numero">
        <span class="numero">${prox.dias}</span>
        <span class="numero-rotulo">${prox.dias === 1 ? 'dia' : 'dias'} até ${esc(prox.provaNome)}<br><small>${dataBR(prox.prova)}</small></span>
      </div>` : '<p class="sub">Nenhuma prova marcada.</p>';
  const focoHoje = `<p class="foco-hoje">Foco hoje: <b>${totais.hoje.n ? `${formatarDuracao(totais.hoje.s)} em ${totais.hoje.n} ${totais.hoje.n === 1 ? 'sessão' : 'sessões'}` : 'nenhuma sessão ainda'}</b> · <a href="/foco">${foco ? 'ver sessão em andamento' : 'começar um pomodoro'}</a></p>`;

  const cartoes = cards.map((c) => `
    <a class="cartao caixa ${c.espaco ? `c-${esc(c.cor)}` : `t-${c.slug}`}" href="${c.href || `/t/${c.slug}`}">
      <span class="cartao-topo">${px ? (c.espaco ? sprite('picareta', { escala: 3 }) : emblema(c.slug, 3)) : ''}<span class="cartao-nome">${esc(c.espaco ? 'Meu espaço' : (px ? c.nome : 'Trilha'))}</span></span>
      <span class="mundo">${esc(px ? c.mundo : c.nome)}</span>
      <span class="cartao-linha">${esc(c.linhaPrazo)}</span>
      <span class="barra-rot"><span>Progresso das notas</span><b>${pctTxt(c.pct)}</b></span>
      ${medidor(c.pct, { rotulo: `Progresso de ${c.nome}`, classe: 'tc' })}
      <span class="cartao-pe">${c.semana ? esc(c.semana) : `${fmt.format(c.feitas)} de ${fmt.format(c.total)} tarefas`}</span>
      ${c.focoSemana ? `<span class="cartao-pe">Foco na semana: ${esc(c.focoSemana)}</span>` : ''}
    </a>`).join('');

  const lista = eventos.length
    ? eventos.map((e) => `<li><span class="ev-trilha t-${esc(e.trilha || 'inicio')}">${esc(trilhas.find((t) => t.slug === e.trilha)?.curto || 'Conta')}</span>
        <span class="ev-txt">${esc(e.texto)}</span><time>${tempoAtras(e.quando)}</time></li>`).join('')
    : '<li class="vazio">Nada por aqui ainda. Marque uma tarefa, registre questões ou comece um pomodoro.</li>';

  return layout({
    titulo: px ? 'Fogueira' : 'Início',
    ativo: 'inicio',
    usuario,
    trilhas,
    almas,
    foco,
    classe: 'pg-inicio',
    corpo: `
    <section class="inicio-topo envolve">
      <div class="inicio-txt">
        <p class="eyebrow">${esc(dataLonga)}</p>
        <h1 class="titulo-gotico">${esc(saudacao())}, ${esc(usuario.usuario)}.</h1>
        ${heroi}
        ${focoHoje}
        ${blocoStreak(streak, px, grupoNome)}
        ${blocoCitacao()}
        ${px ? `<p class="mensagem-chao" title="Mensagem deixada no chão"><span>Mensagem no chão</span>“${esc(msg)}”</p>` : ''}
      </div>
      ${px ? `<div class="inicio-fogo" aria-hidden="true">${sprite('fogueira', { escala: 9 })}</div>` : ''}
    </section>
    <section class="envolve">
      <h2 class="titulo-secao">${px ? 'Escolha a sua trilha' : 'Trilhas'}</h2>
      <div class="cartoes">${cartoes}</div>
    </section>
    <section class="envolve">
      <h2 class="titulo-secao">Últimas ações</h2>
      <ul class="eventos caixa">${lista}</ul>
    </section>`,
  });
}

// ---------- gráfico de questões por semana (SVG) ----------

function teto(v) {
  const passos = [10, 20, 50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000];
  return passos.find((p) => p >= v) || Math.ceil(v / 1000) * 1000;
}

function graficoSemanas(cargo, semanaAtual) {
  const ws = cargo.semanas;
  const max = teto(Math.max(10, ...ws.map((w) => Math.max(w.q, w.metaQ || 0))) * 1.05);
  const passo = 20, larg = 12, esq = 34, topo = 8, alt = 110, base = topo + alt;
  const L = esq + ws.length * passo + 6, A = base + 22;
  const y = (v) => base - Math.round((v / max) * alt);
  const ticks = [0, max / 2, max].map((v) => `
      <line class="g-grade" x1="${esq}" x2="${L - 4}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="g-eixo" x="${esq - 5}" y="${y(v) + 3}" text-anchor="end">${fmt.format(v)}</text>`).join('');
  const barras = ws.map((w, i) => {
    const x = esq + i * passo + (passo - larg) / 2;
    const h = base - y(w.q);
    const atual = w.s === semanaAtual;
    const dica = `S${w.s} (${dataBR(w.inicio, false)}): ${fmt.format(w.q)} questões${w.pct != null ? `, ${Math.round(w.pct)}% de acerto` : ''}${w.metaQ ? ` · meta ${fmt.format(w.metaQ)}` : ''}`;
    const rotuloX = ws.length <= 10 || i % 2 === (ws.length - 1) % 2
      ? `<text class="g-eixo${atual ? ' g-atual' : ''}" x="${x + larg / 2}" y="${base + 14}" text-anchor="middle">S${w.s}</text>` : '';
    return `<g class="g-coluna" tabindex="0" data-dica="${esc(dica)}">
        <rect class="g-alvo" x="${esq + i * passo}" y="${topo}" width="${passo}" height="${alt}"/>
        ${h > 0 ? `<rect class="g-barra${atual ? ' g-barra-atual' : ''}" x="${x}" y="${y(w.q)}" width="${larg}" height="${h}"/>
        <rect class="g-brilho" x="${x}" y="${y(w.q)}" width="${larg}" height="2"/>` : ''}
        ${rotuloX}
      </g>`;
  }).join('');
  const meta = ws.map((w, i) => (w.metaQ ? `<line class="g-meta" x1="${esq + i * passo + 1}" x2="${esq + (i + 1) * passo - 1}" y1="${y(w.metaQ)}" y2="${y(w.metaQ)}"/>` : '')).join('');
  const temMeta = ws.some((w) => w.metaQ);
  return `<figure class="grafico">
      <figcaption>Questões por semana${temMeta ? ' · <span class="chave-meta">linha clara = meta da semana</span>' : ''}</figcaption>
      <div class="grafico-rolagem"><svg viewBox="0 0 ${L} ${A}" width="${L * 2}" height="${A * 2}" shape-rendering="crispEdges" role="img" aria-label="Questões resolvidas por semana">
        ${ticks}
        <line class="g-base" x1="${esq}" x2="${L - 4}" y1="${base}" y2="${base}"/>
        ${barras}
        ${meta}
      </svg></div>
    </figure>`;
}

function blocoDesempenho(resumo, px) {
  if (!resumo) return '';
  if (resumo.semanaAtual < 1) {
    const dias = diasEntre(hojeISO(), resumo.inicio);
    return `<div class="caixa painel-vazio">${px ? sprite('moeda', { escala: 3 }) : ''}<p>O plano começa em ${dataBR(resumo.inicio)}, daqui a ${dias} ${dias === 1 ? 'dia' : 'dias'}. Registros feitos antes disso contam como treino.</p></div>`;
  }
  return resumo.cargos.map((c) => {
    const w = c.atual;
    const metaQ = w?.metaQ;
    const pctQ = metaQ ? Math.min(100, (100 * (w?.q || 0)) / metaQ) : 0;
    const naMeta = w?.pct != null && w.pct >= w.metaPct;
    const status = w?.pct == null ? '<span class="status neutro">sem questões nesta semana</span>'
      : naMeta ? `<span class="status bom">✓ na meta (≥ ${w.metaPct}%)</span>`
        : `<span class="status ruim">▼ abaixo da meta de ${w.metaPct}%</span>`;
    const horas = w?.min ? `${Math.floor(w.min / 60)}h${String(w.min % 60).padStart(2, '0')}` : '0h';
    const materias = w?.materias?.length
      ? `<div class="tabela"><table class="t-materias"><thead><tr><th>Matéria</th><th class="num">Questões</th><th class="num">Acerto</th></tr></thead><tbody>
          ${w.materias.map((m) => `<tr><td>${esc(m.materia)}</td><td class="num">${fmt.format(m.q)}</td><td class="num">${pctTxt(m.pct)}${m.pct != null && m.pct < w.metaPct ? ' <span class="status ruim mini">▼</span>' : ''}</td></tr>`).join('')}
        </tbody></table></div>` : '';
    const grafico = c.totalQ > 0 ? graficoSemanas(c, resumo.semanaAtual)
      : '<p class="vazio">Nenhuma questão registrada ainda para este cargo. Use o formulário “Registrar sessão” para lançar a primeira.</p>';
    return `
    <section class="caixa cargo">
      <h3 class="cargo-nome">${esc(c.nome)} <small>semana S${resumo.semanaAtual}${w ? ` · ${dataBR(w.inicio, false)} a ${dataBR(somarDias(w.inicio, 6), false)}` : ''}</small></h3>
      ${c.obs ? `<p class="nota-cargo">${esc(c.obs)}</p>` : ''}
      <div class="tiles">
        <div class="tile"><span class="tile-rot">Questões na semana</span><span class="tile-val">${fmt.format(w?.q || 0)}</span>
          <span class="tile-sub">${metaQ ? `meta: ${fmt.format(metaQ)}` : 'sem meta definida'}</span>${metaQ ? medidor(pctQ, { rotulo: 'Questões da semana em relação à meta', classe: 'tc' }) : ''}</div>
        <div class="tile"><span class="tile-rot">Acerto na semana</span><span class="tile-val">${pctTxt(w?.pct)}</span>${status}</div>
        <div class="tile"><span class="tile-rot">Tempo registrado</span><span class="tile-val">${horas}</span>
          <span class="tile-sub">${c.horasSemana ? `plano: ${c.horasSemana} h por semana` : ''}</span></div>
        ${w?.redacao != null ? `<div class="tile"><span class="tile-rot">Redação</span><span class="tile-val">${pctTxt(w.redacao)}</span><span class="tile-sub">nota média da semana</span></div>` : ''}
      </div>
      ${grafico}
      ${materias}
    </section>`;
  }).join('');
}

function blocoRegistro(t, estudos, registros) {
  const cargos = Object.keys(estudos?.cargos || {});
  if (!cargos.length) return '';
  const ultimos = (registros || []).slice(-8).reverse();
  const materias = [...new Set((registros || []).map((r) => r.materia))].slice(-60);
  return `
  <section class="caixa registro">
    <h3>Registrar sessão de questões</h3>
    <p class="ajuda">Grava uma linha no registro de questões desta trilha.</p>
    <form class="form-registro" data-form="registro" data-trilha="${t.slug}" novalidate>
      <div class="campos">
        <label>Data<input type="date" name="data" value="${hojeISO()}" required></label>
        <label class="cargo">Cargo<select name="cargo" required>${cargos.map((c) => `<option value="${esc(c)}">${esc(nomeCargo(c))}</option>`).join('')}</select></label>
        <label class="largo">Matéria<input name="materia" list="materias-${t.slug}" maxlength="80" required placeholder="Ex.: Português"></label>
        <label class="largo">Tópico<input name="topico" maxlength="120" placeholder="Ex.: Crase"></label>
        <label class="largo">Fonte<input name="fonte" maxlength="120" placeholder="Ex.: FCC 2021"></label>
        <label>Questões<input type="number" name="questoes" min="1" max="1000" required inputmode="numeric"></label>
        <label>Acertos<input type="number" name="acertos" min="0" max="1000" step="any" required inputmode="decimal"></label>
        <label>Minutos<input type="number" name="tempo_min" min="0" max="1440" inputmode="numeric"></label>
      </div>
      <datalist id="materias-${t.slug}">${materias.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      <p class="erro-form" data-erro hidden></p>
      <button class="btn btn-ouro" type="submit">Registrar</button>
      <p class="ajuda">Para redação, use a matéria “Redação”: questões = nota máxima, acertos = nota.</p>
    </form>
    ${ultimos.length ? `<h4>Últimos registros</h4><ul class="ultimos">${ultimos.map((r) => `
      <li><span>${dataBR(r.data, false)} · ${esc(r.materia)}${r.topico ? ` <small>${esc(r.topico)}</small>` : ''}</span>
        <b>${fmt.format(r.acertos)}/${fmt.format(r.questoes)}</b>
        <button type="button" class="btn-x" data-remover="${r.linha}" data-hash="${r.hash}" data-trilha="${t.slug}" aria-label="Remover registro de ${esc(r.materia)} em ${dataBR(r.data)}">Remover</button></li>`).join('')}</ul>` : ''}
  </section>`;
}

function blocoProjecao(t, proj) {
  if (!proj) return '';
  return `
  <section class="caixa projecao">
    <h3>Ritmo da forja</h3>
    <form class="form-projecao" data-form="projecao" data-trilha="${t.slug}">
      <label>Horas por semana<select name="ritmo">${[5, 8, 10, 15, 20, 25, 30, 40].map((h) => `<option value="${h}"${h === proj.ritmo ? ' selected' : ''}>${h} h</option>`).join('')}</select></label>
      <label>Ritmo cheio a partir de<input type="date" name="inicio" value="${esc(proj.inicio)}"></label>
    </form>
    <div class="tiles">
      <div class="tile"><span class="tile-rot">Horas restantes</span><span class="tile-val">${fmt.format(Math.round(proj.restantes))}</span><span class="tile-sub">de ${fmt.format(proj.total)} h</span></div>
      <div class="tile"><span class="tile-rot">Chefe final</span><span class="tile-val">${proj.restantes < 0.5 ? 'Derrotado' : esc(mesAno(proj.fim))}</span><span class="tile-sub">${fmt.format(Math.ceil(proj.semanas))} semanas a ${proj.ritmo} h</span></div>
    </div>
  </section>`;
}

function blocoFocoTrilha(t, tot) {
  return `
  <section class="caixa foco-trilha">
    <h3>Foco nesta trilha</h3>
    <div class="tiles">
      <div class="tile"><span class="tile-rot">Hoje</span><span class="tile-val">${tot?.hojeN ? formatarDuracao(tot.hojeS) : '0 min'}</span><span class="tile-sub">${tot?.hojeN || 0} ${tot?.hojeN === 1 ? 'sessão' : 'sessões'}</span></div>
      <div class="tile"><span class="tile-rot">Nesta semana</span><span class="tile-val">${tot?.semanaN ? formatarDuracao(tot.semanaS) : '0 min'}</span><span class="tile-sub">${tot?.semanaN || 0} ${tot?.semanaN === 1 ? 'sessão' : 'sessões'}</span></div>
    </div>
    <a class="btn btn-ouro" href="/foco?trilha=${t.slug}">Começar um pomodoro aqui</a>
  </section>`;
}

// ---------- página da trilha ----------

export function paginaTrilha({ usuario, trilhas, almas, foco, t, info, notas, arquivos, estudos, resumo, registros, proj, eventos, temCSV, focoTrilha, anotacoes = [] }) {
  const px = ehPixel(usuario);
  const listaNotas = notas.map((n) => {
    const pct = n.total ? (100 * n.feitas) / n.total : null;
    const icone = px ? (n.meta.hex ? sprite('minerio', { arg: n.meta.hex, escala: 3 }) : '<span class="pergaminho" aria-hidden="true"></span>') : '';
    const fimFase = proj?.porNota?.get(n.rel);
    return `
      <li><a class="nota-linha" href="/t/${t.slug}/n/${caminhoURL(n.rel)}">
        ${icone}
        <span class="nota-info"><span class="nota-titulo">${esc(n.tituloCurto)}</span>
          <span class="nota-meta">${px ? esc(n.rel) : ''}${n.meta.horas ? ` · ${n.meta.horas} h` : ''}${n.meta.cor ? ` · faixa ${esc(n.meta.cor)}` : ''}${fimFase ? ` · ${esc(fimFase)}` : ''}</span></span>
        <span class="nota-prog">${n.total ? `<b>${n.feitas}/${n.total}</b>${medidor(pct, { rotulo: `Progresso de ${n.tituloCurto}`, classe: 'tc' })}` : '<small>sem tarefas</small>'}</span>
      </a></li>`;
  }).join('');

  const outros = arquivos.filter((a) => a.ext !== '.md');
  const pastas = new Map();
  for (const a of outros) {
    const dir = a.rel.includes('/') ? a.rel.slice(0, a.rel.lastIndexOf('/')) : '';
    if (!pastas.has(dir)) pastas.set(dir, []);
    pastas.get(dir).push(a);
  }
  const blocoArquivos = outros.length ? `
    <section class="envolve">
      <h2 class="titulo-secao">${px ? 'Baú de arquivos' : 'Arquivos'}</h2>
      <div class="bau">${[...pastas].map(([dir, itens]) => `
        <details class="caixa"${pastas.size === 1 ? ' open' : ''}>
          <summary>${esc(dir || (px ? 'Raiz do cofre' : 'Arquivos'))} <small>${itens.length} ${itens.length === 1 ? 'arquivo' : 'arquivos'}</small></summary>
          <ul>${itens.map((a) => `<li><a href="/t/${t.slug}/arquivo/${caminhoURL(a.rel)}" target="_blank" rel="noopener">${esc(a.rel.split('/').pop())}</a><small>${(a.tamanho / 1024).toFixed(0)} KB</small></li>`).join('')}</ul>
        </details>`).join('')}</div>
    </section>` : '';

  const evs = eventos.length ? `<ul class="eventos caixa">${eventos.map((e) => `<li><span class="ev-txt">${esc(e.texto)}</span><time>${tempoAtras(e.quando)}</time></li>`).join('')}</ul>` : '';

  return layout({
    titulo: t.nome,
    ativo: t.slug,
    usuario,
    trilhas,
    almas,
    foco,
    classe: `pg-trilha t-${t.slug}`,
    corpo: `
    <section class="trilha-heroi envolve">
      ${px ? `<div class="heroi-emblema">${emblema(t.slug, 6)}</div>` : ''}
      <div class="heroi-txt">
        <p class="eyebrow">Trilha · ${esc(t.curto)}</p>
        <h1 class="titulo-gotico">${esc(px ? (t.mundo || t.nome) : t.nome)}</h1>
        <p class="heroi-nome">${esc(estudos?.concurso || t.nome)}</p>
        ${px ? `<p class="lema">${esc(t.lema || '')}</p>` : ''}
        ${info.chamado ? `<p class="chamado">${esc(info.chamado)}</p>` : ''}
        <div class="heroi-barra">
          <span class="barra-rot"><span>${fmt.format(info.feitas)} de ${fmt.format(info.total)} tarefas concluídas</span><b>${pctTxt(info.pct)}</b></span>
          ${medidor(info.pct, { rotulo: 'Progresso da trilha', classe: 'tc grande' })}
        </div>
      </div>
    </section>
    <div class="trilha-grade envolve">
      <section>
        <h2 class="titulo-secao">${t.slug === 'dev' ? 'Fases' : px ? 'Notas do cofre' : 'Conteúdo'}</h2>
        <ul class="notas caixa">${listaNotas || '<li class="vazio">Nenhuma nota encontrada.</li>'}</ul>
        <h2 class="titulo-secao">Anotações</h2>
        <div class="caixa anotacoes-trilha">
          <p>As anotações agora ficam no <b>Ayo Sketchbook</b>: notas em Markdown, links entre notas e desenho à caneta, com a mesma conta.</p>
          <div class="foco-botoes"><a class="btn btn-ouro" href="${linkAnotar(t.nome, t.slug)}">Nova anotação desta trilha</a><a class="btn" href="${SKETCHBOOK}">Abrir o Sketchbook ↗</a></div>
        </div>
        ${evs ? `<h2 class="titulo-secao">Últimas ações</h2>${evs}` : ''}
      </section>
      <aside class="lateral">
        ${blocoFocoTrilha(t, focoTrilha)}
        ${blocoProjecao(t, proj)}
        ${temCSV ? blocoRegistro(t, estudos, registros) : ''}
        ${resumo ? `<h2 class="titulo-secao">Desempenho</h2>${blocoDesempenho(resumo, px)}` : ''}
      </aside>
    </div>
    ${blocoArquivos}`,
  });
}

// ---------- nota ----------

export function paginaNota({ usuario, trilhas, almas, foco, t, nota, html, toc }) {
  const px = ehPixel(usuario);
  const pct = nota.total ? (100 * nota.feitas) / nota.total : null;
  const indice = toc.length > 1 ? `
    <nav class="indice caixa" aria-label="Seções da nota">
      <p class="indice-rot">Seções</p>
      <ol>${toc.map((s) => `<li class="n${s.nivel}"><a href="#${esc(s.id)}" data-secao="${esc(s.id)}">${esc(s.texto)}</a></li>`).join('')}</ol>
    </nav>` : '';
  return layout({
    titulo: nota.tituloCurto,
    ativo: t.slug,
    usuario,
    trilhas,
    almas,
    foco,
    classe: `pg-nota t-${t.slug}`,
    corpo: `
    <div class="envolve nota-cabeca">
      <nav class="migalhas" aria-label="Você está em"><a href="/t/${t.slug}">${esc(px ? (t.mundo || t.nome) : t.nome)}</a> <span aria-hidden="true">›</span> <span>${esc(px ? nota.rel : nota.tituloCurto)}</span></nav>
      <div class="nota-acoes">
        ${nota.total ? `<span class="barra-rot"><span><b data-feitas>${nota.feitas}</b> de <b data-total>${nota.total}</b> tarefas</span><b data-pct-txt>${pctTxt(pct)}</b></span>
        ${medidor(pct, { rotulo: 'Progresso da nota', classe: 'tc', marca: ' data-nota-medidor' })}` : ''}
        <div class="nota-botoes">
          <a class="btn" href="/foco?trilha=${t.slug}&amp;assunto=${encodeURIComponent(nota.tituloCurto)}">Focar nesta nota</a>
          <a class="btn" href="${linkAnotar(nota.tituloCurto, t.slug)}">Anotar</a>
          ${px ? `<a class="btn" href="obsidian://open?path=${encodeURIComponent(nota.abs)}">Abrir no Obsidian</a>` : ''}
        </div>
      </div>
    </div>
    <div class="nota-grade envolve${indice ? '' : ' sem-indice'}">
      ${indice}
      <article class="nota caixa" data-trilha="${t.slug}" data-arquivo="${esc(nota.rel)}">${html}</article>
    </div>`,
  });
}

// ---------- foco (pomodoro) ----------

const MODOS = [
  { valor: 'foco-25', tipo: 'foco', minutos: 25, rotulo: 'Foco 25' },
  { valor: 'foco-50', tipo: 'foco', minutos: 50, rotulo: 'Foco 50' },
  { valor: 'pausa-5', tipo: 'pausa', minutos: 5, rotulo: 'Pausa 5' },
  { valor: 'pausa-15', tipo: 'pausa', minutos: 15, rotulo: 'Pausa 15' },
  { valor: 'livre', tipo: 'foco', minutos: 30, rotulo: 'Livre' },
];

export function paginaFoco({ usuario, trilhas, almas, foco, totais, recentes, assuntos, trilhaInicial, assuntoInicial }) {
  const px = ehPixel(usuario);
  const nomeTrilha = (slug) => trilhas.find((t) => t.slug === slug)?.nome || slug;
  const curtoTrilha = (slug) => trilhas.find((t) => t.slug === slug)?.curto || slug;
  const slugPainel = foco?.trilha || trilhaInicial;

  const painel = foco ? `
    <div class="foco-ativo" data-foco-painel-id="${foco.id}">
      <p class="foco-tipo">${foco.tipo === 'pausa' ? 'Pausa' : 'Foco'} · ${esc(nomeTrilha(foco.trilha))}${foco.estado === 'pausado' ? ' · <b>pausado</b>' : ''}</p>
      <p class="foco-assunto">${esc(foco.assunto || 'Sem assunto')}</p>
      <div class="relogio-grande" data-foco-relogio>${mmss(foco.restanteMs)}</div>
      ${medidor((100 * foco.decorridoMs) / (foco.duracao_s * 1000), { rotulo: 'Tempo decorrido', classe: 'tc grande', marca: ' data-foco-barra' })}
      <div class="foco-botoes">
        ${foco.estado === 'rodando'
          ? `<button type="button" class="btn" data-foco-acao="pausar" data-id="${foco.id}">Pausar</button>`
          : `<button type="button" class="btn btn-ouro" data-foco-acao="retomar" data-id="${foco.id}">Retomar</button>`}
        <button type="button" class="btn" data-foco-acao="concluir" data-id="${foco.id}">Concluir agora</button>
        <button type="button" class="btn-x" data-foco-acao="cancelar" data-id="${foco.id}">Abandonar</button>
      </div>
      <p class="ajuda">Pode trocar de página ou fechar o navegador: o tempo continua contando no servidor e a sessão é registrada quando acabar.</p>
    </div>` : `
    <form class="form-foco" data-form="foco-iniciar" novalidate>
      <fieldset class="modos"><legend>Modo</legend>
        ${MODOS.map((m, i) => `<label class="modo"><input type="radio" name="modo" value="${m.valor}" data-tipo="${m.tipo}" data-minutos="${m.minutos}"${i === 0 ? ' checked' : ''}><span>${m.rotulo}</span></label>`).join('')}
      </fieldset>
      <label class="livre" hidden>Minutos<input type="number" name="minutos" min="1" max="180" value="30" inputmode="numeric"></label>
      <div class="relogio-grande" data-relogio-previa>25:00</div>
      <div class="campos-foco">
        <label>Trilha<select name="trilha" required>${trilhas.map((t) => `<option value="${t.slug}"${t.slug === trilhaInicial ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
        <label>Assunto<input name="assunto" maxlength="100" value="${esc(assuntoInicial)}" list="assuntos-${esc(trilhaInicial)}" placeholder="Ex.: Crase, Redes, Ponteiros em C" autocomplete="off"></label>
      </div>
      ${Object.entries(assuntos).map(([slug, lista]) => `<datalist id="assuntos-${esc(slug)}">${lista.map((a) => `<option value="${esc(a)}">`).join('')}</datalist>`).join('')}
      <p class="erro-form" data-erro hidden></p>
      <div class="foco-botoes">
        <button class="btn btn-ouro" type="submit">${px ? 'Acender a chama' : 'Começar'}</button>
        <label class="som"><input type="checkbox" id="foco-som" checked> Som ao terminar</label>
      </div>
    </form>`;

  const n = totais.hoje.n;
  const frascos = px
    ? `<div class="frascos" aria-label="${n} ${n === 1 ? 'sessão concluída' : 'sessões concluídas'} hoje">${
      Array.from({ length: Math.max(8, n) }, (_, i) => sprite('frasco', { arg: i < n ? 'cheio' : 'vazio', escala: 3 })).join('')}</div>`
    : '';
  const porTrilha = trilhas.map((t) => {
    const p = totais.porTrilha[t.slug];
    return `<tr><td><span class="ev-trilha t-${t.slug}">${esc(t.curto)}</span></td><td class="num">${p?.hojeN ? formatarDuracao(p.hojeS) : '—'}</td><td class="num">${p?.semanaN ? formatarDuracao(p.semanaS) : '—'}</td></tr>`;
  }).join('');

  const listaRecentes = recentes.length ? recentes.map((s) => {
    const d = new Date(s.inicio);
    const quando = `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toTimeString().slice(0, 5)}`;
    const estado = s.estado === 'cancelado' ? ' · abandonada' : s.manual ? ' · manual' : '';
    return `<li><span class="ev-trilha t-${esc(s.trilha)}">${esc(curtoTrilha(s.trilha))}</span>
      <span class="ev-txt">${esc(s.assunto || 'Sem assunto')} <small>${s.tipo === 'pausa' ? 'pausa' : 'foco'} de ${formatarDuracao(s.foco_s || 0)}${estado}</small></span>
      <time>${quando}</time>
      <button type="button" class="btn-x" data-foco-remover="${s.id}" aria-label="Remover sessão de ${esc(s.assunto || 'sem assunto')}">Remover</button></li>`;
  }).join('') : '<li class="vazio">Nenhuma sessão ainda. A primeira aparece aqui assim que terminar.</li>';

  return layout({
    titulo: 'Foco',
    ativo: 'foco',
    usuario,
    trilhas,
    almas,
    foco,
    classe: 'pg-foco',
    corpo: `
    <div class="foco-grade envolve">
      <section class="foco-painel caixa t-${esc(slugPainel)}" data-foco-pagina>
        <p class="eyebrow">Pomodoro</p>
        <h1 class="titulo-gotico">Foco</h1>
        ${painel}
      </section>
      <aside class="lateral">
        <section class="caixa">
          <h3>Hoje</h3>
          ${frascos}
          <p class="foco-resumo"><b>${n ? formatarDuracao(totais.hoje.s) : '0 min'}</b> de foco em ${n} ${n === 1 ? 'sessão' : 'sessões'} · semana: <b>${formatarDuracao(totais.semana.s)}</b></p>
        </section>
        <section class="caixa">
          <h3>Tempo por trilha</h3>
          <div class="tabela"><table><thead><tr><th>Trilha</th><th class="num">Hoje</th><th class="num">Semana</th></tr></thead><tbody>${porTrilha}</tbody></table></div>
        </section>
      </aside>
    </div>
    <section class="envolve">
      <h2 class="titulo-secao">Sessões recentes</h2>
      <ul class="eventos caixa sessoes">${listaRecentes}</ul>
      <div class="foco-extras">
        <details class="caixa manual">
          <summary>Registrar uma sessão feita sem o cronômetro</summary>
          <form class="form-manual" data-form="foco-manual" novalidate>
            <div class="campos">
              <label>Data<input type="date" name="data" value="${hojeISO()}" required></label>
              <label>Início<input type="time" name="hora" required></label>
              <label>Minutos<input type="number" name="minutos" min="1" max="600" required inputmode="numeric"></label>
              <label class="cargo">Trilha<select name="trilha">${trilhas.map((t) => `<option value="${t.slug}"${t.slug === trilhaInicial ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
              <label class="largo">Assunto<input name="assunto" maxlength="100" list="assuntos-${esc(trilhaInicial)}"></label>
            </div>
            <p class="erro-form" data-erro hidden></p>
            <button class="btn btn-ouro" type="submit">Registrar sessão</button>
          </form>
        </details>
        <a class="btn" href="/foco/exportar.csv">Exportar sessões (CSV)</a>
      </div>
    </section>`,
  });
}

// ---------- caderno ----------

const resumoTexto = (t) => String(t || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~\[\]()|-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);

export function paginaCaderno({ usuario, trilhas, almas, foco, anotacoes, filtroTrilha, busca }) {
  const px = ehPixel(usuario);
  const curto = (slug) => trilhas.find((t) => t.slug === slug)?.curto || '';
  const cartoes = anotacoes.length ? anotacoes.map((a) => `
    <a class="caderno-cartao caixa t-${esc(a.trilha || 'inicio')}" href="/caderno/${a.id}">
      <span class="cc-topo"><time>${dataBR(a.data)}</time>${a.trilha ? `<span class="ev-trilha t-${esc(a.trilha)}">${esc(curto(a.trilha))}</span>` : ''}</span>
      <span class="cc-titulo">${esc(a.titulo || 'Sem título')}</span>
      ${a.assunto ? `<span class="cc-assunto">${esc(a.assunto)}</span>` : ''}
      <span class="cc-trecho">${esc(resumoTexto(a.trecho)) || (a.tem_desenho ? '' : '<i>Vazia</i>')}</span>
      <span class="cc-pe">${a.formato === 'md' ? 'Markdown' : 'Texto'}${a.tem_desenho ? ' · ✎ com desenho' : ''}</span>
    </a>`).join('') : `<p class="vazio">${busca || filtroTrilha ? 'Nenhuma anotação com esse filtro.' : 'Seu caderno está vazio. Comece pela primeira anotação.'}</p>`;
  return layout({
    titulo: 'Caderno',
    ativo: 'caderno',
    usuario,
    trilhas,
    almas,
    foco,
    classe: 'pg-caderno',
    corpo: `
    <section class="envolve caderno-topo">
      <div>
        <p class="eyebrow">Anotações</p>
        <h1 class="titulo-gotico">Caderno</h1>
      </div>
      <a class="btn btn-ouro" href="/caderno/nova${filtroTrilha ? `?trilha=${filtroTrilha}` : ''}">Nova anotação</a>
    </section>
    <section class="envolve">
      <form class="caderno-filtros" method="get" action="/caderno">
        <label>Trilha<select name="trilha"><option value="">Todas</option>${trilhas.map((t) => `<option value="${t.slug}"${t.slug === filtroTrilha ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
        <label class="largo">Buscar<input name="q" value="${esc(busca)}" placeholder="Título, assunto ou texto" maxlength="80"></label>
        <button class="btn" type="submit">Filtrar</button>
      </form>
      <div class="caderno-grade">${cartoes}</div>
    </section>`,
  });
}

const CORES_TINTA = ['#1d1d1f', '#1f4fbf', '#c0392b', '#2e7d32', '#7b3fb5', '#b8860b'];
const CORES_MARCA = ['#ffd54f', '#a5e887', '#ff9ec4', '#8fd3ff'];

export function paginaCadernoEditor({ usuario, trilhas, almas, foco, nota, assuntos, prefill }) {
  const px = ehPixel(usuario);
  const n = nota || { id: '', versao: 0, titulo: '', data: prefill.data, trilha: prefill.trilha || null, assunto: prefill.assunto || '', formato: 'md', texto: '', desenho: null };
  const abaInicial = n.desenho && !n.texto ? 'caneta' : 'texto';
  const desenhoJSON = (n.desenho || 'null').replace(/</g, '\\u003c');
  return layout({
    titulo: n.titulo || 'Nova anotação',
    ativo: 'caderno',
    usuario,
    trilhas,
    almas,
    foco,
    classe: `pg-caderno-editor t-${esc(n.trilha || 'inicio')}`,
    scripts: ['/js/caderno.js'],
    corpo: `
    <div class="caderno-editor envolve" data-caderno data-id="${n.id}" data-versao="${n.versao}" data-aba="${abaInicial}">
      <div class="ed-topo">
        <a class="btn" href="/caderno">← Caderno</a>
        <span class="ed-status" data-status role="status">${nota ? 'Salvo' : 'Nova anotação: salva sozinha quando você começar a escrever'}</span>
        <span class="ed-acoes">
          ${nota ? `<a class="btn" href="/caderno/${n.id}/exportar.md">Exportar .md</a>
          <button type="button" class="btn-x" data-caderno-remover="${n.id}">Apagar</button>` : ''}
        </span>
      </div>
      <section class="caixa ed-cabecalho">
        <input class="ed-titulo" name="titulo" placeholder="Título" maxlength="200" value="${esc(n.titulo)}" aria-label="Título" autocomplete="off">
        <div class="ed-meta">
          <label>Data<input type="date" name="data" value="${esc(n.data)}" required></label>
          <label>Trilha<select name="trilha"><option value="">Sem trilha</option>${trilhas.map((t) => `<option value="${t.slug}"${t.slug === n.trilha ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
          <label class="largo">Assunto<input name="assunto" maxlength="120" value="${esc(n.assunto)}" list="assuntos-${esc(n.trilha || '')}" placeholder="Escolha da lista ou escreva" autocomplete="off"></label>
        </div>
        ${Object.entries(assuntos).map(([slug, lista]) => `<datalist id="assuntos-${esc(slug)}">${lista.map((a) => `<option value="${esc(a)}">`).join('')}</datalist>`).join('')}
      </section>
      <div class="ed-abas" role="tablist" aria-label="Modo de anotação">
        <button type="button" role="tab" data-aba-botao="texto" aria-selected="${abaInicial === 'texto'}">Texto</button>
        <button type="button" role="tab" data-aba-botao="caneta" aria-selected="${abaInicial === 'caneta'}">Caneta</button>
      </div>
      <section class="caixa ed-painel" data-painel="texto"${abaInicial === 'texto' ? '' : ' hidden'}>
        <div class="ed-barra">
          <fieldset class="modos"><legend>Formato</legend>
            <label class="modo"><input type="radio" name="formato" value="md"${n.formato === 'md' ? ' checked' : ''}><span>Markdown</span></label>
            <label class="modo"><input type="radio" name="formato" value="txt"${n.formato === 'txt' ? ' checked' : ''}><span>Texto simples</span></label>
          </fieldset>
          <button type="button" class="btn" data-previa-botao${n.formato === 'md' ? '' : ' hidden'}>Visualizar</button>
        </div>
        <textarea class="ed-texto${n.formato === 'txt' ? ' simples' : ''}" name="texto" spellcheck="true" placeholder="${n.formato === 'md' ? 'Escreva aqui. Markdown: # título, **negrito**, - lista, - [ ] tarefa' : 'Escreva aqui.'}" aria-label="Texto da anotação">${esc(n.texto)}</textarea>
        <div class="nota ed-previa" data-previa hidden></div>
      </section>
      <section class="caixa ed-painel" data-painel="caneta"${abaInicial === 'caneta' ? '' : ' hidden'}>
        <div class="ed-ferramentas" role="toolbar" aria-label="Ferramentas da caneta">
          <fieldset class="modos"><legend>Ferramenta</legend>
            <label class="modo"><input type="radio" name="ferramenta" value="caneta" checked><span>Caneta</span></label>
            <label class="modo"><input type="radio" name="ferramenta" value="marca"><span>Marca-texto</span></label>
            <label class="modo"><input type="radio" name="ferramenta" value="borracha"><span>Borracha</span></label>
          </fieldset>
          <fieldset class="cores"><legend>Cor</legend>
            <span data-cores="caneta">${CORES_TINTA.map((c, i) => `<button type="button" class="cor${i === 0 ? ' ativa' : ''}" data-cor="${c}" aria-label="Cor ${c}"></button>`).join('')}</span>
            <span data-cores="marca" hidden>${CORES_MARCA.map((c, i) => `<button type="button" class="cor${i === 0 ? ' ativa' : ''}" data-cor="${c}" aria-label="Marca-texto ${c}"></button>`).join('')}</span>
          </fieldset>
          <fieldset class="modos"><legend>Traço</legend>
            <label class="modo"><input type="radio" name="espessura" value="2"><span>Fino</span></label>
            <label class="modo"><input type="radio" name="espessura" value="3.5" checked><span>Médio</span></label>
            <label class="modo"><input type="radio" name="espessura" value="7"><span>Grosso</span></label>
          </fieldset>
          <div class="ed-botoes">
            <button type="button" class="btn" data-desenho="desfazer" aria-label="Desfazer">↶ Desfazer</button>
            <button type="button" class="btn" data-desenho="refazer" aria-label="Refazer">↷ Refazer</button>
            <button type="button" class="btn" data-desenho="pagina">+ Página</button>
            <button type="button" class="btn" data-desenho="png">Baixar PNG</button>
            <button type="button" class="btn-x" data-desenho="limpar">Limpar tudo</button>
          </div>
          <label class="som"><input type="checkbox" data-so-caneta> Só a caneta desenha (o dedo rola a página)</label>
        </div>
        <div class="folha" data-folha><canvas data-canvas aria-label="Folha de desenho"></canvas></div>
        <p class="ajuda">Com S Pen, Apple Pencil ou mesa digitalizadora, a espessura segue a pressão. O botão de borracha da caneta apaga.</p>
      </section>
      <script type="application/json" id="desenho-dados">${desenhoJSON}</script>
    </div>`,
  });
}

// ---------- conta: ver paginaConfiguracoes ----------


// ---------- streak e mapa de dias ----------

function blocoStreak(st, px, grupoNome) {
  if (!st) return '';
  const vivo = st.atual > 0;
  return `<p class="streak-linha">${px ? sprite('fogueira', { escala: 2 }) : ''}<b>${st.atual} ${st.atual === 1 ? 'dia seguido' : 'dias seguidos'}</b>
    estudando${st.hojeConta ? ' · hoje já conta' : vivo ? ' · estude hoje para não perder' : ''} · recorde ${st.recorde}
    · <a href="/grupo">${grupoNome ? `grupo ${esc(grupoNome)}` : 'criar um grupo de estudos'}</a></p>`;
}

const nivel = (min) => (min <= 0 ? 0 : min < 25 ? 1 : min < 60 ? 2 : min < 120 ? 3 : 4);
function mapaDias(mapa, rotulo) {
  if (!mapa) return '';
  return `<div class="mapa-dias" role="img" aria-label="${esc(rotulo)}">${mapa.map((d) => `<i class="n${d.futuro ? 'f' : nivel(d.min)}" title="${dataBR(d.dia, false)}: ${d.min} min"></i>`).join('')}</div>
    <div class="mapa-legenda"><span>menos</span><i class="n0"></i><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i><span>mais</span></div>`;
}

const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const CORES_AVATAR = ['brasa', 'anil', 'verde', 'ouro', 'violeta', 'rubi'];
const avatar = (m) => `<span class="avatar c-${CORES_AVATAR[m.id % CORES_AVATAR.length]}" aria-hidden="true">${esc(iniciais(m.nome))}</span>`;

function quando(ms) {
  const d = new Date(ms);
  const hoje = new Date().toLocaleDateString('sv-SE');
  const dia = d.toLocaleDateString('sv-SE');
  const hora = d.toTimeString().slice(0, 5);
  return dia === hoje ? `hoje ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

function itemMural(x) {
  const detalhe = [x.trilha, x.assunto].filter(Boolean).map(esc).join(' · ');
  return `<li><span class="mural-quem">${avatar(x)}<a href="/grupo/${esc(x.arroba)}">${x.souEu ? 'Você' : esc(x.nome)}</a></span>
    <span class="ev-txt">estudou <b>${x.minutos} min</b>${detalhe ? ` · ${detalhe}` : ''}${x.manual ? ' <small>(registro manual)</small>' : ''}</span>
    <time>${quando(x.quando)}</time></li>`;
}

// ---------- grupo ----------

export function paginaGrupo({ usuario, trilhas, almas, foco, membro, membros = [], mural = [], convites = [], base, streak }) {
  const px = ehPixel(usuario);
  let corpo;
  if (!membro) {
    corpo = `
    <section class="envolve conta-topo"><p class="eyebrow">Grupo de estudos</p><h1 class="titulo-gotico">Grupo</h1>
      <p class="lema">Estude junto: cada pessoa vê o streak e as sessões que as outras escolheram compartilhar.</p></section>
    <div class="conta-grade envolve">
      <section class="caixa"><h3>Criar um grupo</h3>
        <form data-form="grupo-criar" class="form-conta" novalidate>
          <label>Nome do grupo<input name="nome" maxlength="60" required placeholder="Ex.: Rumo à aprovação"></label>
          <p class="erro-form" data-erro hidden></p>
          <button class="btn btn-ouro" type="submit">Criar grupo</button>
        </form></section>
      <section class="caixa"><h3>Recebi um convite</h3>
        <p>Abra o link que recebeu ou digite o código.</p>
        <a class="btn" href="/convite">Digitar código</a></section>
    </div>`;
  } else if (!membro.consentiu) {
    corpo = `
    <section class="envolve conta-topo"><p class="eyebrow">Grupo de estudos</p><h1 class="titulo-gotico">${esc(membro.grupo_nome)}</h1></section>
    <section class="envolve"><div class="caixa consentimento">
      <h3>Antes de entrar: o que você compartilha?</h3>
      <p>No grupo, cada pessoa vê <b>apenas</b> o que as outras escolheram compartilhar. Suas notas, caderno, cofres e questões <b>nunca</b> aparecem para ninguém. Você pode mudar isto quando quiser em Configurações.</p>
      <form data-form="grupo-consentir" class="form-conta" novalidate>
        <label class="opcao"><input type="checkbox" name="tempo" checked> <span><b>Tempo e dias de estudo</b>: streak, mapa de dias e duração das sessões de foco.</span></label>
        <label class="opcao"><input type="checkbox" name="trilha" checked> <span><b>Trilha</b> de cada sessão (ex.: “ENEM 2026”).</span></label>
        <label class="opcao"><input type="checkbox" name="assunto"> <span><b>Assunto</b> de cada sessão (ex.: “Crase”).</span></label>
        <p class="ajuda">Só quem também aceitou estas regras vê o grupo. Registramos a data deste aceite.</p>
        <p class="erro-form" data-erro hidden></p>
        <div class="foco-botoes"><button class="btn btn-ouro" type="submit">Aceitar e entrar no grupo</button>
          <button type="button" class="btn-x" data-acao-url="/api/grupo/sair" data-confirmar data-acao-ir="/grupo">Recusar e sair do grupo</button></div>
      </form></div></section>`;
  } else {
    const admin = membro.dono_id === usuario.id;
    const cartoes = membros.map((m) => `
      <article class="caixa membro${m.souEu ? ' eu' : ''}">
        <header>${avatar(m)}<span class="membro-nome"><a href="/grupo/${esc(m.arroba)}">${esc(m.nome)}</a><small>@${esc(m.arroba)}${m.admin ? ' · administra' : ''}${m.souEu ? ' · você' : ''}</small></span></header>
        ${m.pendente ? '<p class="vazio">Ainda não aceitou as regras do grupo.</p>'
          : !m.compartilhaTempo ? '<p class="vazio">Não compartilha o tempo de estudo.</p>'
          : `<div class="membro-streak">${px ? sprite('fogueira', { escala: 2 }) : ''}<b>${m.streak.atual}</b><span>${m.streak.atual === 1 ? 'dia seguido' : 'dias seguidos'}<br><small>recorde ${m.streak.recorde} · hoje ${m.streak.minutosHoje} min</small></span></div>
             ${mapaDias(m.mapa, `Dias de estudo de ${m.nome} nas últimas 12 semanas`)}`}
        ${admin && !m.souEu ? `<button type="button" class="btn-x" data-acao-url="/api/grupo/remover" data-acao-corpo='{"id":${m.id}}' data-confirmar data-acao-msg="Membro removido do grupo.">Remover do grupo</button>` : ''}
      </article>`).join('');
    corpo = `
    <section class="envolve grupo-topo">
      <div><p class="eyebrow">Grupo de estudos</p><h1 class="titulo-gotico">${esc(membro.grupo_nome)}</h1>
        <p class="lema">Um dia entra no streak com pelo menos 10 min de foco concluído (pomodoro ou registro manual).</p></div>
      <div class="heroi-numero"><span class="numero">${streak.atual}</span><span class="numero-rotulo">${streak.atual === 1 ? 'dia seguido' : 'dias seguidos'}<br><small>recorde: ${streak.recorde}</small></span></div>
    </section>
    <section class="envolve"><h2 class="titulo-secao">Membros</h2><div class="membros">${cartoes}</div></section>
    <div class="trilha-grade envolve">
      <section><h2 class="titulo-secao">Mural</h2>
        <ul class="eventos caixa mural">${mural.length ? mural.map(itemMural).join('') : '<li class="vazio">Nenhuma sessão compartilhada ainda. Conclua um pomodoro e ela aparece aqui.</li>'}</ul></section>
      <aside class="lateral">
        <section class="caixa"><h3>Convidar alguém</h3>
          <form data-form="grupo-convite" class="form-conta" novalidate>
            <div class="campos"><label class="cargo">Validade<select name="horas"><option value="24">24 horas</option><option value="72">3 dias</option><option value="168">7 dias</option></select></label>
            <label>Usos<select name="usos"><option value="1">1 pessoa</option><option value="3">3 pessoas</option><option value="5">5 pessoas</option></select></label></div>
            <p class="erro-form" data-erro hidden></p>
            <button class="btn btn-ouro" type="submit">Gerar convite</button>
          </form>
          <div class="convite-gerado" data-convite-gerado hidden>
            <p>Código: <b class="codigo" data-convite-codigo></b></p>
            <input readonly data-convite-link aria-label="Link do convite">
            <button type="button" class="btn" data-copiar>Copiar link</button>
            <p class="ajuda">Quem não tem conta cria uma pelo link (com confirmação por e-mail). Também dá para digitar o código em <b>${esc(base)}/convite</b>.</p>
          </div>
          ${convites.length ? `<h4>Convites ativos</h4><ul class="ultimos">${convites.map((c) => `<li><span><b class="codigo">${esc(c.codigo)}</b> <small>até ${quando(c.expira)} · ${c.usos}/${c.usos_max} usos</small></span><span></span>
            <button type="button" class="btn-x" data-acao-url="/api/grupo/convite/revogar" data-acao-corpo='{"codigo":"${esc(c.codigo)}"}' data-confirmar data-acao-msg="Convite revogado.">Revogar</button></li>`).join('')}</ul>` : ''}
        </section>
        <section class="caixa"><h3>Seu compartilhamento</h3>
          <p>Tempo e dias: <b>${membro.compartilha_tempo ? 'sim' : 'não'}</b> · Trilha: <b>${membro.compartilha_trilha ? 'sim' : 'não'}</b> · Assunto: <b>${membro.compartilha_assunto ? 'sim' : 'não'}</b></p>
          <div class="foco-botoes"><a class="btn" href="/configuracoes#privacidade">Mudar</a>
          <button type="button" class="btn-x" data-acao-url="/api/grupo/sair" data-confirmar data-acao-ir="/grupo">Sair do grupo</button></div>
        </section>
      </aside>
    </div>`;
  }
  return layout({ titulo: 'Grupo', ativo: 'grupo', usuario, trilhas, almas, foco, classe: 'pg-grupo', corpo });
}

export function paginaMembro({ usuario, trilhas, almas, foco, alvo, mural }) {
  const px = ehPixel(usuario);
  return layout({
    titulo: alvo.nome, ativo: 'grupo', usuario, trilhas, almas, foco, classe: 'pg-grupo',
    corpo: `
    <section class="envolve grupo-topo">
      <div><nav class="migalhas"><a href="/grupo">Grupo</a> › @${esc(alvo.arroba)}</nav>
        <h1 class="titulo-gotico">${esc(alvo.nome)}</h1><p class="heroi-nome">@${esc(alvo.arroba)}</p></div>
      ${alvo.compartilhaTempo ? `<div class="heroi-numero">${px ? sprite('fogueira', { escala: 4 }) : ''}<span class="numero">${alvo.streak.atual}</span><span class="numero-rotulo">${alvo.streak.atual === 1 ? 'dia seguido' : 'dias seguidos'}<br><small>recorde ${alvo.streak.recorde} · ${alvo.streak.diasEstudados} dias estudados</small></span></div>` : ''}
    </section>
    <section class="envolve">${alvo.compartilhaTempo
      ? `<div class="caixa mapa-grande"><h3>Últimas 12 semanas</h3>${mapaDias(alvo.mapa, `Dias de estudo de ${alvo.nome}`)}</div>
         <h2 class="titulo-secao">Histórico de sessões</h2>
         <ul class="eventos caixa mural">${mural.length ? mural.map(itemMural).join('') : '<li class="vazio">Nenhuma sessão ainda.</li>'}</ul>`
      : '<p class="vazio">Esta pessoa não compartilha o tempo de estudo com o grupo.</p>'}</section>`,
  });
}

// ---------- convite, cadastro e mensagens ----------

export function paginaMensagem({ titulo, texto, links = [], usuario = null }) {
  return layout({
    titulo, usuario, classe: 'pg-mensagem',
    corpo: `<section class="envolve mensagem caixa"><h1 class="titulo-gotico">${esc(titulo)}</h1><p>${esc(texto)}</p>
      <div class="foco-botoes">${links.map(([href, rot], i) => `<a class="btn${i === 0 ? ' btn-ouro' : ''}" href="${esc(href)}">${esc(rot)}</a>`).join('')}</div></section>`,
  });
}

export function paginaConviteManual({ usuario }) {
  return layout({
    titulo: 'Convite', usuario, classe: 'pg-mensagem',
    corpo: `<section class="envolve mensagem caixa"><p class="eyebrow">Convite</p><h1 class="titulo-gotico">Tenho um código</h1>
      <p>Digite o código de convite que você recebeu (8 letras e números).</p>
      <form data-form="convite-manual" class="form-conta" novalidate>
        <label>Código<input name="codigo" class="campo-codigo" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" required placeholder="ABCD2345"></label>
        <p class="erro-form" data-erro hidden></p>
        <button class="btn btn-ouro" type="submit">Continuar</button>
      </form></section>`,
  });
}

export function paginaConvite({ usuario, convite, codigo, grupoAtual }) {
  let corpo;
  if (!convite) {
    corpo = `<h1 class="titulo-gotico">Convite inválido</h1><p>O código <b class="codigo">${esc(codigo)}</b> não existe, expirou ou já foi usado. Peça um convite novo a quem te chamou.</p>
      <div class="foco-botoes"><a class="btn" href="/convite">Digitar outro código</a></div>`;
  } else if (usuario) {
    corpo = grupoAtual
      ? `<h1 class="titulo-gotico">${esc(convite.grupo_nome)}</h1><p>Você já participa do grupo <b>${esc(grupoAtual)}</b>. Para entrar neste, saia do atual na página do grupo.</p>
        <div class="foco-botoes"><a class="btn" href="/grupo">Ir para o meu grupo</a></div>`
      : `<p class="eyebrow">Convite</p><h1 class="titulo-gotico">${esc(convite.grupo_nome)}</h1><p>Você foi convidado(a) para este grupo de estudos. Ao entrar, você escolhe o que compartilhar.</p>
        <div class="foco-botoes"><button type="button" class="btn btn-ouro" data-acao-url="/api/convite/aceitar" data-acao-corpo='{"codigo":"${esc(convite.codigo)}"}' data-acao-ir="/grupo">Entrar no grupo</button></div>`;
  } else {
    corpo = `<p class="eyebrow">Convite</p><h1 class="titulo-gotico">${esc(convite.grupo_nome)}</h1><p>Você foi convidado(a) para este grupo de estudos no Ayo Std.</p>
      <div class="foco-botoes"><a class="btn btn-ouro" href="/criar-conta?convite=${esc(convite.codigo)}">Criar minha conta</a>
      <a class="btn" href="/entrar?voltar=${encodeURIComponent(`/convite/${convite.codigo}`)}">Já tenho conta</a></div>`;
  }
  return layout({ titulo: 'Convite', usuario, classe: 'pg-mensagem', corpo: `<section class="envolve mensagem caixa">${corpo}</section>` });
}

export function paginaCriarConta({ convite, codigo, emailAtivo }) {
  return layout({
    titulo: 'Criar conta', classe: 'pg-mensagem',
    corpo: `<section class="envolve mensagem caixa largo">
      <p class="eyebrow">Nova conta${convite ? ` · grupo ${esc(convite.grupo_nome)}` : ''}</p>
      <h1 class="titulo-gotico">Criar conta</h1>
      <form data-form="criar-conta" class="form-conta" novalidate>
        <label>Código do convite<input name="convite" class="campo-codigo" value="${esc(codigo || '')}" maxlength="12" required autocomplete="off"></label>
        <label>Seu nome<input name="nome" maxlength="60" required autocomplete="name"></label>
        <label>@usuário (3 a 24: letras minúsculas, números, . ou _)<input name="arroba" maxlength="25" required autocomplete="username" placeholder="@seunome" spellcheck="false" autocapitalize="none"></label>
        <label>E-mail<input name="email" type="email" maxlength="200" required autocomplete="email"></label>
        <label>Senha (mínimo de 10 caracteres)<input name="senha" type="password" maxlength="200" required autocomplete="new-password"></label>
        <label>Repita a senha<input name="confirmacao" type="password" maxlength="200" required autocomplete="new-password"></label>
        <label class="opcao"><input type="checkbox" name="aceite"> <span>Li e aceito as <a href="/privacidade" target="_blank" rel="noopener">regras de uso e a política de privacidade</a>.</span></label>
        <label class="opcao"><input type="checkbox" name="cookies" checked> <span>Aceito o cookie essencial de sessão.</span></label>
        <p class="erro-form" data-erro hidden></p>
        <button class="btn btn-ouro" type="submit">Criar conta</button>
        <p class="ajuda">Enviaremos um link de confirmação para o seu e-mail. A conta só entra depois da confirmação.${emailAtivo ? '' : ' (O envio de e-mails ainda não está configurado neste servidor: o administrador pode confirmar sua conta manualmente.)'}</p>
      </form>
      <div data-conta-criada hidden><h2>Quase lá!</h2><p>Enviamos um link de confirmação para <b data-email-enviado></b>. Abra o e-mail (confira o spam) e clique no link para ativar sua conta.</p></div>
    </section>`,
  });
}

// ---------- privacidade ----------

export function paginaPrivacidade({ usuario }) {
  return layout({
    titulo: 'Privacidade', usuario, classe: 'pg-privacidade',
    corpo: `<section class="envolve texto-longo caixa">
      <p class="eyebrow">Regras de uso e privacidade</p><h1 class="titulo-gotico">Privacidade</h1>
      <h2>O que guardamos</h2>
      <ul><li>Conta: nome, @usuário, e-mail (depois de confirmado) e a senha cifrada (nunca a senha em si).</li>
        <li>O que você cria aqui: sessões de foco, anotações do caderno, trilhas e notas do seu espaço, progresso e o histórico das suas ações.</li>
        <li>Registros de consentimento: quando aceitou os termos, os cookies e as regras de compartilhamento do grupo.</li></ul>
      <h2>Cookies</h2>
      <p>Usamos <b>um único cookie essencial</b>, o da sessão de login (protegido: só trafega por HTTPS e não é lido por scripts). Preferências como som do pomodoro e modo da caneta ficam apenas no seu navegador. Não há cookies de publicidade nem de rastreamento.</p>
      <h2>Regras entre contas</h2>
      <ol><li>Cada conta só lê e altera os próprios dados. Isso é conferido no servidor em cada pedido, não só escondido na tela.</li>
        <li>Contas novas não têm acesso aos cofres do dono do site; trabalham no próprio espaço.</li>
        <li>No grupo de estudos, cada pessoa vê <b>só o que as outras escolheram compartilhar</b> (tempo e dias de estudo, trilha, assunto). Notas, caderno, cofres e questões nunca são compartilhados.</li>
        <li>Só membros do mesmo grupo, que aceitaram estas regras, veem uns aos outros. Não existe busca de pessoas.</li>
        <li>Convites expiram, têm número limitado de usos e podem ser revogados; tentativas de adivinhar códigos são bloqueadas.</li>
        <li>Contas novas só entram com convite e e-mail confirmado.</li></ol>
      <h2>Seus direitos</h2>
      <p>Em Configurações você pode mudar o que compartilha, baixar todos os seus dados (JSON) e excluir sua conta, o que apaga seus dados do banco. Os backups diários são apagados sozinhos em até 14 dias.</p>
      <h2>Contato</h2><p>Fale com quem administra o site e te convidou.</p>
    </section>`,
  });
}

// ---------- meu espaço ----------

const NOMES_COR = { brasa: 'Brasa', anil: 'Anil', verde: 'Verde', ouro: 'Ouro', violeta: 'Violeta', rubi: 'Rubi' };
const seletorCor = (cores, atual) => `<fieldset class="modos"><legend>Cor</legend>${cores.map((c) => `<label class="modo c-${c}"><input type="radio" name="cor" value="${c}"${c === atual ? ' checked' : ''}><span><i class="amostra"></i>${NOMES_COR[c]}</span></label>`).join('')}</fieldset>`;

export function paginaEspacos({ usuario, trilhas, almas, foco, espacos, cores }) {
  const px = ehPixel(usuario);
  return layout({
    titulo: 'Meu espaço', ativo: 'espaco', usuario, trilhas, almas, foco, classe: 'pg-espaco',
    corpo: `
    <section class="envolve conta-topo"><p class="eyebrow">Meu espaço</p><h1 class="titulo-gotico">Suas trilhas</h1>
      <p class="lema">Monte as suas próprias trilhas: cada uma tem notas em Markdown com checklists, entra no pomodoro, no caderno e no streak.</p></section>
    <section class="envolve"><div class="cartoes">
      ${espacos.map((e) => `<a class="cartao caixa c-${esc(e.cor)}" href="/espaco/${e.id}">
        <span class="cartao-topo">${px ? sprite('picareta', { escala: 3 }) : ''}<span class="cartao-nome">Trilha</span></span>
        <span class="mundo">${esc(e.nome)}</span><span class="cartao-linha">${esc(e.descricao || 'Sem descrição')}</span>
        <span class="barra-rot"><span>Progresso</span><b>${pctTxt(e.pct)}</b></span>${medidor(e.pct, { classe: 'tc', rotulo: `Progresso de ${e.nome}` })}
        <span class="cartao-pe">${e.feitas} de ${e.total} tarefas</span></a>`).join('')}
      <section class="cartao caixa novo-espaco"><h3>Nova trilha</h3>
        <form data-form="espaco-criar" class="form-conta" novalidate>
          <label>Nome<input name="nome" maxlength="60" required placeholder="Ex.: Inglês para viagem"></label>
          <label>Descrição<input name="descricao" maxlength="240" placeholder="Opcional"></label>
          ${seletorCor(cores, 'brasa')}
          <label class="opcao"><input type="checkbox" name="modelo" checked> <span>Começar com uma nota-modelo (objetivo, tarefas e recursos)</span></label>
          <p class="erro-form" data-erro hidden></p>
          <button class="btn btn-ouro" type="submit">Criar trilha</button>
        </form></section>
    </div></section>`,
  });
}

export function paginaEspaco({ usuario, trilhas, almas, foco, e, notas, cores, progresso }) {
  return layout({
    titulo: e.nome, ativo: 'espaco', usuario, trilhas, almas, foco, classe: `pg-espaco c-${esc(e.cor)}`,
    corpo: `
    <section class="trilha-heroi envolve sem-emblema"><div class="heroi-txt">
      <nav class="migalhas"><a href="/espaco">Meu espaço</a> › ${esc(e.nome)}</nav>
      <h1 class="titulo-gotico">${esc(e.nome)}</h1>${e.descricao ? `<p class="lema">${esc(e.descricao)}</p>` : ''}
      <div class="heroi-barra"><span class="barra-rot"><span>${progresso.feitas} de ${progresso.total} tarefas</span><b>${pctTxt(progresso.pct)}</b></span>${medidor(progresso.pct, { classe: 'tc grande', rotulo: 'Progresso' })}</div>
    </div></section>
    <div class="trilha-grade envolve">
      <section><h2 class="titulo-secao">Notas</h2>
        <ul class="notas caixa">${notas.length ? notas.map((n) => `<li><a class="nota-linha" href="/espaco/${e.id}/nota/${n.id}">
          <span class="nota-info"><span class="nota-titulo">${esc(n.titulo)}</span><span class="nota-meta">atualizada ${tempoAtras(n.atualizado)}</span></span>
          <span class="nota-prog">${n.total ? `<b>${n.feitas}/${n.total}</b>${medidor((100 * n.feitas) / n.total, { classe: 'tc' })}` : '<small>sem tarefas</small>'}</span></a></li>`).join('') : '<li class="vazio">Nenhuma nota ainda.</li>'}</ul>
        <form data-form="espaco-nota" data-espaco="${e.id}" class="form-conta nova-nota" novalidate>
          <label>Nova nota<input name="titulo" maxlength="120" required placeholder="Título da nota"></label>
          <p class="erro-form" data-erro hidden></p><button class="btn btn-ouro" type="submit">Criar e editar</button>
        </form>
      </section>
      <aside class="lateral">
        <section class="caixa"><h3>Usar esta trilha</h3><div class="foco-botoes">
          <a class="btn btn-ouro" href="/foco?trilha=e${e.id}">Começar um pomodoro</a><a class="btn" href="${linkAnotar(e.nome, '')}">Anotar no Sketchbook</a></div></section>
        <section class="caixa"><h3>Editar trilha</h3>
          <form data-form="espaco-editar" data-espaco="${e.id}" class="form-conta" novalidate>
            <label>Nome<input name="nome" maxlength="60" required value="${esc(e.nome)}"></label>
            <label>Descrição<input name="descricao" maxlength="240" value="${esc(e.descricao)}"></label>
            ${seletorCor(cores, e.cor)}
            <p class="erro-form" data-erro hidden></p><button class="btn" type="submit">Salvar</button>
          </form>
          <button type="button" class="btn-x" data-acao-url="/api/espaco/${e.id}/remover" data-confirmar data-acao-ir="/espaco">Apagar trilha e notas</button>
        </section>
      </aside>
    </div>`,
  });
}

export function paginaEspacoNota({ usuario, trilhas, almas, foco, e, n, html, toc }) {
  const pct = n.total ? (100 * n.feitas) / n.total : null;
  const indice = toc.length > 1 ? `<nav class="indice caixa" aria-label="Seções"><p class="indice-rot">Seções</p><ol>${toc.map((s2) => `<li class="n${s2.nivel}"><a href="#${esc(s2.id)}" data-secao="${esc(s2.id)}">${esc(s2.texto)}</a></li>`).join('')}</ol></nav>` : '';
  return layout({
    titulo: n.titulo, ativo: 'espaco', usuario, trilhas, almas, foco, classe: `pg-nota c-${esc(e.cor)}`,
    corpo: `
    <div class="envolve nota-cabeca">
      <nav class="migalhas"><a href="/espaco">Meu espaço</a> › <a href="/espaco/${e.id}">${esc(e.nome)}</a> › ${esc(n.titulo)}</nav>
      <div class="nota-acoes">
        ${n.total ? `<span class="barra-rot"><span><b data-feitas>${n.feitas}</b> de <b data-total>${n.total}</b> tarefas</span><b data-pct-txt>${pctTxt(pct)}</b></span>
        ${medidor(pct, { classe: 'tc', marca: ' data-nota-medidor' })}` : ''}
        <div class="nota-botoes"><a class="btn btn-ouro" href="/espaco/${e.id}/nota/${n.id}/editar">Editar</a>
          <a class="btn" href="/foco?trilha=e${e.id}&amp;assunto=${encodeURIComponent(n.titulo)}">Focar</a></div>
      </div>
    </div>
    <div class="nota-grade envolve${indice ? '' : ' sem-indice'}">${indice}
      <article class="nota caixa" data-trilha="e${e.id}" data-arquivo="nota-${n.id}" data-endpoint="/api/espaco/${e.id}/nota/${n.id}/tarefa">
        <h1>${esc(n.titulo)}</h1>${html || '<p class="vazio">Nota vazia. Clique em Editar para escrever.</p>'}</article>
    </div>`,
  });
}

export function paginaEspacoNotaEditar({ usuario, trilhas, almas, foco, e, n }) {
  return layout({
    titulo: `Editar ${n.titulo}`, ativo: 'espaco', usuario, trilhas, almas, foco, classe: `pg-caderno-editor c-${esc(e.cor)}`,
    corpo: `
    <div class="caderno-editor envolve">
      <div class="ed-topo"><a class="btn" href="/espaco/${e.id}/nota/${n.id}">← Voltar sem salvar</a><span class="ed-status"></span>
        <span class="ed-acoes"><button type="button" class="btn-x" data-acao-url="/api/espaco/${e.id}/nota/${n.id}/remover" data-confirmar data-acao-ir="/espaco/${e.id}">Apagar nota</button></span></div>
      <form data-form="espaco-nota-salvar" data-espaco="${e.id}" data-nota="${n.id}" data-versao="${n.versao}" class="caixa ed-painel" novalidate>
        <input class="ed-titulo" name="titulo" maxlength="120" required value="${esc(n.titulo)}" aria-label="Título">
        <p class="ajuda">Markdown: <code>## Seção</code>, <code>- [ ] tarefa</code>, <code>**negrito**</code>, listas e links. As seções viram sugestões de assunto no pomodoro e no caderno.</p>
        <textarea class="ed-texto" name="texto" spellcheck="true" aria-label="Texto da nota">${esc(n.texto)}</textarea>
        <p class="erro-form" data-erro hidden></p>
        <div class="foco-botoes"><button class="btn btn-ouro" type="submit">Salvar nota</button></div>
      </form>
    </div>`,
  });
}

// ---------- configurações ----------

export function paginaConfiguracoes({ usuario, trilhas, almas, foco, conta, emailPendente, membro, usuarios, perfis, emailAtivo }) {
  const nomePerfil = (chave) => perfis.find((p) => p.chave === chave)?.descricao || chave;
  const tema = usuario.tema;
  const gestao = usuarios ? `
    <section class="caixa largo"><h3>Pessoas com acesso</h3>
      <div class="tabela"><table><thead><tr><th>Pessoa</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody>
        ${usuarios.map((x) => `<tr><td>${esc(x.nome || x.usuario)}<br><small>@${esc(x.arroba || x.usuario)}${x.email ? ` · ${esc(x.email)}` : ''}${x.dono ? ' · você, dono' : ''}</small></td>
          <td>${esc(x.perfil)}<br><small>${esc(nomePerfil(x.perfil))}</small></td>
          <td>${x.confirmacao_pendente ? 'aguardando e-mail' : x.trocar_senha ? 'senha provisória' : 'ativa'}</td>
          <td>${x.confirmacao_pendente ? `<button type="button" class="btn-x" data-acao-url="/api/conta/usuarios/confirmar" data-acao-corpo='{"id":${x.id}}' data-acao-msg="Conta confirmada.">Confirmar à mão</button>` : ''}
            ${x.dono ? '' : `<button type="button" class="btn-x" data-acao-url="/api/conta/usuarios/remover" data-acao-corpo='{"id":${x.id}}' data-confirmar data-acao-msg="Conta removida.">Remover</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      ${emailAtivo ? '' : '<p class="ajuda">O envio de e-mail não está configurado (SMTP no .env). Links de confirmação aparecem no log do serviço; use “Confirmar à mão” se precisar.</p>'}
    </section>
    <section class="caixa"><h3>Adicionar pessoa (sem convite)</h3>
      <form data-form="conta-criar" novalidate class="form-conta">
        <label>Usuário<input name="usuario" autocomplete="off" required minlength="3" maxlength="32"></label>
        <label>Senha provisória<input name="senha" type="text" autocomplete="off" required minlength="10" maxlength="200"></label>
        <label>Perfil<select name="perfil">${perfis.map((p) => `<option value="${esc(p.chave)}">${esc(p.chave)} — ${esc(p.descricao)}</option>`).join('')}</select></label>
        <p class="erro-form" data-erro hidden></p><button class="btn" type="submit">Criar conta</button>
      </form>
    </section>
    <section class="caixa"><h3>Redefinir senha de outra pessoa</h3>
      <form data-form="conta-redefinir" novalidate class="form-conta">
        <label>Conta<select name="id">${usuarios.filter((x) => !x.dono).map((x) => `<option value="${x.id}">@${esc(x.arroba || x.usuario)}</option>`).join('')}</select></label>
        <label>Nova senha provisória<input name="senha" type="text" autocomplete="off" required minlength="10" maxlength="200"></label>
        <p class="erro-form" data-erro hidden></p><button class="btn" type="submit">Redefinir</button>
      </form>
    </section>` : '';
  return layout({
    titulo: 'Configurações', ativo: 'conta', usuario, trilhas, almas, foco, classe: 'pg-conta',
    corpo: `
    <section class="envolve conta-topo"><p class="eyebrow">Configurações</p><h1 class="titulo-gotico">${esc(conta.nome || conta.usuario)}</h1>
      <p class="heroi-nome">@${esc(conta.arroba || conta.usuario)}</p>
      ${usuario.trocarSenha ? '<p class="aviso-senha">Você está usando uma senha provisória. Crie a sua senha abaixo para liberar o resto do site.</p>' : ''}</section>
    <div class="conta-grade envolve">
      <section class="caixa"><h3>Senha</h3>
        <form data-form="conta-senha" novalidate class="form-conta">
          <label>Senha atual<input name="atual" type="password" autocomplete="current-password" required maxlength="200"></label>
          <label>Senha nova (mínimo de 10 caracteres)<input name="nova" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label>
          <label>Repita a senha nova<input name="confirmacao" type="password" autocomplete="new-password" required maxlength="200"></label>
          <p class="erro-form" data-erro hidden></p><button class="btn btn-ouro" type="submit">Salvar senha</button>
        </form></section>
      ${usuario.trocarSenha ? '' : `
      <section class="caixa"><h3>Perfil</h3>
        <form data-form="conta-perfil" novalidate class="form-conta">
          <label>Nome<input name="nome" maxlength="60" required value="${esc(conta.nome || conta.usuario)}"></label>
          <label>@usuário<input name="arroba" maxlength="25" required value="${esc(conta.arroba || conta.usuario)}" spellcheck="false" autocapitalize="none"></label>
          <label>Senha atual (só para trocar o @)<input name="senha" type="password" autocomplete="current-password" maxlength="200"></label>
          <p class="ajuda">O @ é como as outras pessoas do grupo te veem e serve para entrar no site.</p>
          <p class="erro-form" data-erro hidden></p><button class="btn" type="submit">Salvar perfil</button>
        </form></section>
      <section class="caixa"><h3>E-mail</h3>
        <p>${conta.email ? `Atual: <b>${esc(conta.email)}</b> (confirmado)` : 'Nenhum e-mail confirmado.'}${emailPendente ? `<br>Aguardando confirmação: <b>${esc(emailPendente)}</b>` : ''}</p>
        <form data-form="conta-email" novalidate class="form-conta">
          <label>${conta.email ? 'Trocar para' : 'Adicionar e-mail'}<input name="email" type="email" maxlength="200" required autocomplete="email"></label>
          <label>Senha atual<input name="senha" type="password" autocomplete="current-password" required maxlength="200"></label>
          <p class="ajuda">Enviamos um link para o e-mail novo; ele só passa a valer depois da confirmação.</p>
          <p class="erro-form" data-erro hidden></p><button class="btn" type="submit">Enviar confirmação</button>
        </form></section>
      <section class="caixa"><h3>Aparência</h3>
        <form data-form="conta-tema" class="form-conta" novalidate>
          <fieldset class="modos"><legend>Tema</legend>
            <label class="modo"><input type="radio" name="tema" value="pixel"${tema === 'pixel' ? ' checked' : ''}><span>Pixel (padrão)</span></label>
            <label class="modo"><input type="radio" name="tema" value="normal"${tema === 'normal' ? ' checked' : ''}><span>Normal</span></label>
          </fieldset>
          <p class="ajuda">Toda conta nova começa no tema padrão. A troca vale na hora.</p>
        </form></section>
      <section class="caixa" id="privacidade"><h3>Privacidade e compartilhamento</h3>
        ${membro ? `<p>Grupo: <b>${esc(membro.grupo_nome)}</b>. O que você compartilha com ele:</p>
        <form data-form="grupo-consentir" class="form-conta" novalidate>
          <label class="opcao"><input type="checkbox" name="tempo"${membro.compartilha_tempo ? ' checked' : ''}> <span>Tempo e dias de estudo (streak, mapa, sessões)</span></label>
          <label class="opcao"><input type="checkbox" name="trilha"${membro.compartilha_trilha ? ' checked' : ''}> <span>Trilha de cada sessão</span></label>
          <label class="opcao"><input type="checkbox" name="assunto"${membro.compartilha_assunto ? ' checked' : ''}> <span>Assunto de cada sessão</span></label>
          <p class="erro-form" data-erro hidden></p><button class="btn" type="submit">Salvar compartilhamento</button>
        </form>` : '<p>Você não participa de um grupo: nada é compartilhado.</p>'}
        <p class="ajuda">Cookies: só o essencial de sessão. <a href="/privacidade">Ler a política</a>.</p>
        <div class="foco-botoes"><a class="btn" href="/configuracoes/meus-dados.json">Baixar meus dados (JSON)</a></div>
      </section>
      ${usuario.dono ? '' : `<section class="caixa"><h3>Excluir conta</h3>
        <p>Apaga sua conta e tudo o que você criou aqui (sessões, caderno, espaço). Não dá para desfazer.</p>
        <form data-form="conta-excluir" class="form-conta" novalidate>
          <label>Senha atual<input name="senha" type="password" autocomplete="current-password" required maxlength="200"></label>
          <p class="erro-form" data-erro hidden></p><button class="btn-x" type="submit">Excluir minha conta</button>
        </form></section>`}
      ${gestao}`}
    </div>`,
  });
}

// ---------- erros ----------

export function paginaErro({ status, usuario = null, trilhas = [], almas = null, foco = null }) {
  const px = ehPixel(usuario);
  const perdido = status === 404;
  return layout({
    titulo: perdido ? (px ? 'Você se perdeu' : 'Página não encontrada') : 'Erro',
    usuario,
    trilhas,
    almas,
    foco,
    classe: 'pg-erro',
    corpo: `
    <section class="cena-erro envolve">
      ${px ? sprite('caveira', { escala: 8 }) : ''}
      <h1 class="titulo-morte">${perdido ? (px ? 'Você se perdeu' : 'Página não encontrada') : 'Algo deu errado'}</h1>
      <p>${perdido ? 'Esta página não existe ou não está disponível para a sua conta.' : 'O servidor encontrou um erro. Nada foi gravado pela metade; tente de novo.'}</p>
      <a class="btn btn-ouro" href="/">${px ? 'Voltar à fogueira' : 'Voltar ao início'}</a>
    </section>`,
  });
}
