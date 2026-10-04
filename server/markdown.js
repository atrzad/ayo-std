import os from 'node:os';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { RE_TAREFA, hashLinha } from './cofres.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const caminhoURL = (rel) => rel.split('/').map(encodeURIComponent).join('/');

export function slugTexto(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'secao';
}

// html: false → HTML cru das notas aparece como texto (as notas não injetam nada na página).
const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

// ---------- [[wikilinks]] do Obsidian ----------
md.inline.ruler.before('link', 'wikilink', (state, silencioso) => {
  const src = state.src;
  if (src.charCodeAt(state.pos) !== 0x5b || src.charCodeAt(state.pos + 1) !== 0x5b) return false;
  const fim = src.indexOf(']]', state.pos + 2);
  if (fim < 0) return false;
  const corpo = src.slice(state.pos + 2, fim);
  if (!corpo || corpo.length > 200 || corpo.includes('\n')) return false;
  if (!silencioso) {
    const [alvo, apelido] = corpo.split('|');
    const tok = state.push('wikilink', '', 0);
    tok.meta = { alvo: alvo.split('#')[0].trim(), texto: (apelido || alvo).trim() };
  }
  state.pos = fim + 2;
  return true;
});

md.renderer.rules.wikilink = (tokens, i, _o, env) => {
  const { alvo, texto } = tokens[i].meta;
  const rel = env.notasPorNome?.get(alvo.toLowerCase());
  return rel
    ? `<a class="wikilink" href="/t/${env.slug}/n/${caminhoURL(rel)}">${esc(texto)}</a>`
    : `<span class="wikilink quebrado" title="Nota não encontrada">${esc(texto)}</span>`;
};

// ---------- #tags do Obsidian (só depois de espaço ou no início, então "C#" não vira tag) ----------
md.inline.ruler.push('tag', (state, silencioso) => {
  if (state.src.charCodeAt(state.pos) !== 0x23) return false;
  if (state.pos > 0 && !/\s|\(/.test(state.src[state.pos - 1])) return false;
  const m = /^#([\p{L}][\p{L}\p{N}_/-]{0,40})/u.exec(state.src.slice(state.pos));
  if (!m) return false;
  if (!silencioso) {
    const tok = state.push('tag', '', 0);
    tok.content = m[1];
  }
  state.pos += m[0].length;
  return true;
});

md.renderer.rules.tag = (tokens, i) => {
  const nome = tokens[i].content;
  return `<span class="tag tag-${esc(slugTexto(nome))}">${esc(nome)}</span>`;
};

// ---------- títulos com âncora + índice, tarefas e callouts ----------
md.core.ruler.push('ayo', (state) => {
  const { tokens, env } = state;
  const usados = new Set();
  env.toc = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.type === 'heading_open') {
      const inline = tokens[i + 1];
      const texto = inline.children.filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('');
      let id = slugTexto(texto);
      for (let n = 2; usados.has(id); n++) id = `${slugTexto(texto)}-${n}`;
      usados.add(id);
      tok.attrSet('id', id);
      const nivel = Number(tok.tag.slice(1));
      if (nivel >= 2 && nivel <= 3) env.toc.push({ nivel, texto, id });
    }

    if (tok.type === 'inline' && tokens[i - 1]?.type === 'paragraph_open' && tokens[i - 2]?.type === 'list_item_open') {
      const m = /^\[([ xX])\][ \t]+/.exec(tok.content);
      const primeiro = tok.children[0];
      if (m && primeiro?.type === 'text' && primeiro.content.startsWith(m[0])) {
        const item = tokens[i - 2];
        const linha = item.map ? item.map[0] : -1;
        const fonte = env.linhas?.[linha]?.replace(/\r$/, '') ?? '';
        const valida = linha >= 0 && RE_TAREFA.test(fonte);
        // Quem não grava nas notas vê o próprio progresso (do banco), não o [x] do arquivo.
        const chave = env.chavePorLinha?.get(linha);
        const feito = env.feitasBanco ? !!(chave && env.feitasBanco.has(chave)) : m[1] !== ' ';
        const dados = env.feitasBanco
          ? (chave ? ` data-chave="${chave}"` : ' disabled')
          : (valida ? ` data-linha="${linha}" data-hash="${hashLinha(fonte)}"` : ' disabled');
        primeiro.content = primeiro.content.slice(m[0].length);
        const abre = new state.Token('html_inline', '', 0);
        abre.content = `<label class="tarefa"><input type="checkbox" class="cb"${feito ? ' checked' : ''}${dados}><span class="tarefa-txt">`;
        const fecha = new state.Token('html_inline', '', 0);
        fecha.content = '</span></label>';
        tok.children.unshift(abre);
        tok.children.push(fecha);
        item.attrJoin('class', feito ? 'item-tarefa feito' : 'item-tarefa');
      }
    }

    if (tok.type === 'blockquote_open' && tokens[i + 1]?.type === 'paragraph_open' && tokens[i + 2]?.type === 'inline') {
      const inline = tokens[i + 2];
      const primeiro = inline.children[0];
      const m = primeiro?.type === 'text' ? /^\[!([\w-]+)\][+-]?\s*(.*)$/.exec(primeiro.content) : null;
      if (m) {
        const tipo = m[1].toLowerCase();
        tok.attrJoin('class', `callout callout-${slugTexto(tipo)}`);
        const titulo = new state.Token('html_inline', '', 0);
        titulo.content = `<span class="callout-titulo">${esc(m[2] || tipo)}</span>`;
        inline.children.splice(0, 1, titulo);
        if (inline.children[1]?.type === 'softbreak') inline.children.splice(1, 1);
      }
    }
  }
});

// ---------- links: notas e arquivos do cofre viram rotas do site ----------
function resolverRelativo(env, href) {
  let alvo;
  try { alvo = decodeURIComponent(href.split('#')[0].split('?')[0]); } catch { return null; }
  if (!alvo) return null;
  const rel = path.posix.normalize(path.posix.join(env.dirNota || '', alvo));
  if (rel.startsWith('..') || rel.startsWith('/')) return null;
  return rel;
}

function rotaDeArquivo(env, rel, slug = env.slug) {
  return rel.toLowerCase().endsWith('.md')
    ? `/t/${slug}/n/${caminhoURL(rel)}`
    : `/t/${slug}/arquivo/${caminhoURL(rel)}`;
}

md.renderer.rules.link_open = (tokens, i, opcoes, env, self) => {
  const tok = tokens[i];
  const href = tok.attrGet('href') || '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    if (/^https?:/i.test(href)) {
      tok.attrSet('target', '_blank');
      tok.attrSet('rel', 'noopener noreferrer');
      tok.attrJoin('class', 'externo');
    }
  } else if (!href.startsWith('#')) {
    const rel = resolverRelativo(env, href);
    if (rel && env.arquivos?.has(rel)) {
      const ancora = href.includes('#') ? '#' + slugTexto(href.split('#')[1]) : '';
      tok.attrSet('href', rotaDeArquivo(env, rel) + ancora);
    } else {
      tok.attrJoin('class', 'quebrado');
    }
  }
  return self.renderToken(tokens, i, opcoes);
};

// `arquivo.md` ou `~/Documents/ENEM/x.md` em código vira link quando o arquivo existe (inclusive em outro cofre).
md.renderer.rules.code_inline = (tokens, i, _o, env) => {
  const conteudo = tokens[i].content;
  const html = `<code>${esc(conteudo)}</code>`;
  if (!/\.(md|pdf|csv)$/i.test(conteudo) || conteudo.length > 200 || /\s{2}/.test(conteudo)) return html;
  if (/^(~\/|\/)/.test(conteudo) && env.trilhas) {
    const abs = path.resolve(conteudo.replace(/^~(?=\/)/, os.homedir()));
    for (const t of env.trilhas) {
      if (abs.startsWith(t.pasta + path.sep)) {
        const rel = abs.slice(t.pasta.length + 1).split(path.sep).join('/');
        if (env.podeVer && !env.podeVer(t.slug, rel)) return html;
        return `<a class="ref-arquivo" href="${rotaDeArquivo(env, rel, t.slug)}">${html}</a>`;
      }
    }
    return html;
  }
  const rel = resolverRelativo(env, conteudo);
  if (rel && env.arquivos?.has(rel)) return `<a class="ref-arquivo" href="${rotaDeArquivo(env, rel)}">${html}</a>`;
  return html;
};

md.renderer.rules.table_open = () => '<div class="tabela"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

export function renderizarNota(nota, { slug, arquivos, notas, trilhas, feitasBanco = null, podeVer = null }) {
  const notasPorNome = new Map();
  for (const n of notas) notasPorNome.set(path.posix.basename(n.rel, '.md').toLowerCase(), n.rel);
  const env = {
    slug,
    dirNota: path.posix.dirname(nota.rel) === '.' ? '' : path.posix.dirname(nota.rel),
    linhas: nota.linhas,
    arquivos: new Set(arquivos.map((a) => a.rel)),
    notasPorNome,
    trilhas,
    chavePorLinha: nota.chavePorLinha,
    feitasBanco,
    podeVer,
  };
  const html = md.render(nota.corpo, env);
  return { html, toc: env.toc };
}

// Texto livre (caderno): mesmas regras, sem cofre por trás — links internos aparecem como texto.
export function renderizarTexto(texto) {
  return md.render(String(texto || ''), { slug: null, linhas: null, toc: [] });
}

// Nota do "Meu espaço": tarefas clicáveis pela linha (o texto mora no banco, não num cofre).
export function renderizarEspacoNota(nota) {
  const env = { slug: null, linhas: nota.linhas, toc: [] };
  const html = md.render(nota.corpo, env);
  return { html, toc: env.toc };
}
