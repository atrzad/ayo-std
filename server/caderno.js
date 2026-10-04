// Caderno: anotações de cada pessoa (texto simples ou Markdown + desenho à caneta), ligadas a trilha e assunto.
// Cada gravação confere a versão: duas abas ou aparelhos nunca sobrescrevem um ao outro sem aviso.
import { db, registrarEvento } from './db.js';
import { ErroHttp } from './cofres.js';

const MAX_TEXTO = 200_000;
const MAX_DESENHO = 4_000_000;
const MAX_TRACOS = 5000;
const ALTURA_PAGINA = 1400;
const FERRAMENTAS = new Set(['caneta', 'marca']);

const limpar = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, max);

// Desenho = {v, altura, tracos:[{f, c, w, p:[x, y, pressão, ...]}]}; é refeito campo a campo (nada além disso é guardado).
function validarDesenho(bruto) {
  if (bruto == null || bruto === '') return null;
  const texto = typeof bruto === 'string' ? bruto : JSON.stringify(bruto);
  if (texto.length > MAX_DESENHO) throw new ErroHttp(413, 'O desenho ficou grande demais para uma anotação. Comece uma anotação nova.');
  let d;
  try { d = typeof bruto === 'string' ? JSON.parse(bruto) : bruto; } catch { throw new ErroHttp(400, 'Desenho inválido.'); }
  if (!d || !Array.isArray(d.tracos) || d.tracos.length > MAX_TRACOS) throw new ErroHttp(400, 'Desenho inválido.');
  const altura = Math.min(ALTURA_PAGINA * 20, Math.max(ALTURA_PAGINA, Math.round(Number(d.altura) || ALTURA_PAGINA)));
  const tracos = d.tracos.map((t) => {
    if (!t || !FERRAMENTAS.has(t.f) || !/^#[0-9a-f]{6}$/i.test(t.c) || !Array.isArray(t.p) || t.p.length % 3 || t.p.length > 30000) {
      throw new ErroHttp(400, 'Desenho inválido.');
    }
    const w = Math.min(60, Math.max(0.5, Number(t.w) || 3));
    const p = t.p.map((n) => {
      const v = Number(n);
      if (!Number.isFinite(v)) throw new ErroHttp(400, 'Desenho inválido.');
      return Math.round(v * 100) / 100;
    });
    return { f: t.f, c: t.c.toLowerCase(), w, p };
  });
  if (!tracos.length) return null;
  return JSON.stringify({ v: 1, altura, tracos });
}

function validar(dados, slugsValidos) {
  const data = String(dados.data || '');
  const d = new Date(`${data}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) {
    throw new ErroHttp(400, 'Informe a data no formato AAAA-MM-DD.');
  }
  const trilha = dados.trilha ? String(dados.trilha) : null;
  if (trilha && !slugsValidos.includes(trilha)) throw new ErroHttp(400, 'Escolha uma das suas trilhas.');
  const formato = dados.formato === 'txt' ? 'txt' : 'md';
  const texto = String(dados.texto ?? '');
  if (texto.length > MAX_TEXTO) throw new ErroHttp(413, 'O texto passou de 200 mil caracteres. Divida em duas anotações.');
  return {
    titulo: limpar(dados.titulo, 200).replace(/\s+/g, ' ').trim(),
    data,
    trilha,
    assunto: limpar(dados.assunto, 120).replace(/\s+/g, ' ').trim(),
    formato,
    texto: texto.replace(/\r\n/g, '\n'),
    desenho: validarDesenho(dados.desenho),
  };
}

export function criar(usuarioId, dados, slugsValidos) {
  const a = validar(dados, slugsValidos);
  const agora = Date.now();
  const r = db.prepare(`INSERT INTO caderno (usuario_id, titulo, data, trilha, assunto, formato, texto, desenho, criado, atualizado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(usuarioId, a.titulo, a.data, a.trilha, a.assunto, a.formato, a.texto, a.desenho, agora, agora);
  registrarEvento({ usuarioId, trilha: a.trilha, tipo: 'caderno', detalhe: `Nova anotação: ${a.titulo || a.assunto || 'sem título'}` });
  return { id: Number(r.lastInsertRowid), versao: 1, atualizado: agora };
}

export function atualizar(usuarioId, id, dados, slugsValidos) {
  const a = validar(dados, slugsValidos);
  const versao = Number(dados.versao);
  const agora = Date.now();
  const r = db.prepare(`UPDATE caderno SET titulo = ?, data = ?, trilha = ?, assunto = ?, formato = ?, texto = ?, desenho = ?,
      atualizado = ?, versao = versao + 1
    WHERE id = ? AND usuario_id = ? AND versao = ?`)
    .run(a.titulo, a.data, a.trilha, a.assunto, a.formato, a.texto, a.desenho, agora, Number(id), usuarioId, versao);
  if (!r.changes) {
    const existe = db.prepare('SELECT versao FROM caderno WHERE id = ? AND usuario_id = ?').get(Number(id), usuarioId);
    if (!existe) throw new ErroHttp(404, 'Anotação não encontrada.');
    throw new ErroHttp(409, 'Esta anotação foi alterada em outra aba ou aparelho.');
  }
  return { id: Number(id), versao: versao + 1, atualizado: agora };
}

export function obter(usuarioId, id) {
  const n = db.prepare('SELECT * FROM caderno WHERE id = ? AND usuario_id = ?').get(Number(id), usuarioId);
  if (!n) throw new ErroHttp(404, 'Anotação não encontrada.');
  return n;
}

export function remover(usuarioId, id) {
  const n = obter(usuarioId, id);
  db.prepare('DELETE FROM caderno WHERE id = ? AND usuario_id = ?').run(n.id, usuarioId);
  registrarEvento({ usuarioId, trilha: n.trilha, tipo: 'caderno', detalhe: `Apagou a anotação: ${n.titulo || n.assunto || 'sem título'}` });
}

const escaparLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listar(usuarioId, { trilha = null, busca = '', limite = 200 } = {}) {
  const filtros = ['usuario_id = ?'];
  const args = [usuarioId];
  if (trilha) { filtros.push('trilha = ?'); args.push(trilha); }
  if (busca) {
    filtros.push("(titulo LIKE ? ESCAPE '\\' OR assunto LIKE ? ESCAPE '\\' OR texto LIKE ? ESCAPE '\\')");
    const termo = `%${escaparLike(busca.slice(0, 80))}%`;
    args.push(termo, termo, termo);
  }
  return db.prepare(`SELECT id, titulo, data, trilha, assunto, formato, substr(texto, 1, 400) AS trecho,
      desenho IS NOT NULL AS tem_desenho, atualizado
    FROM caderno WHERE ${filtros.join(' AND ')} ORDER BY data DESC, atualizado DESC LIMIT ?`).all(...args, limite);
}

export function exportarMarkdown(n, nomeTrilha) {
  const fm = ['---', `titulo: "${(n.titulo || '').replace(/"/g, "'")}"`, `data: ${n.data}`, `trilha: ${nomeTrilha || ''}`,
    `assunto: "${(n.assunto || '').replace(/"/g, "'")}"`, `formato: ${n.formato}`, '---', ''].join('\n');
  const corpo = n.formato === 'md' ? n.texto : n.texto.split('\n').map((l) => `    ${l}`).join('\n');
  const aviso = n.desenho ? '\n\n> Esta anotação tem um desenho à caneta; baixe o PNG pelo caderno.\n' : '';
  return `${fm}# ${n.titulo || 'Anotação'}\n\n${corpo}${aviso}\n`;
}
