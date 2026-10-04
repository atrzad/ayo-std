// Meu espaço: trilhas criadas pela própria pessoa, com notas em Markdown (checklists marcáveis).
// Tudo filtra por usuario_id: ninguém lê nem altera o espaço de outra pessoa.
import { db, registrarEvento } from './db.js';
import { ErroHttp, RE_TAREFA, hashLinha, analisarNota } from './cofres.js';

export const CORES = ['brasa', 'anil', 'verde', 'ouro', 'violeta', 'rubi'];
const MAX_ESPACOS = 30;
const MAX_NOTAS = 200;
const MAX_TEXTO = 200_000;

const limpar = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const slugEspaco = (id) => `e${id}`;
export const idDoSlug = (slug) => (/^e\d{1,12}$/.test(String(slug)) ? Number(String(slug).slice(1)) : null);

export function listarEspacos(usuarioId) {
  return db.prepare('SELECT * FROM espacos WHERE usuario_id = ? ORDER BY criado').all(usuarioId);
}

export function obterEspaco(usuarioId, id) {
  const e = db.prepare('SELECT * FROM espacos WHERE id = ? AND usuario_id = ?').get(Number(id), usuarioId);
  if (!e) throw new ErroHttp(404, 'Trilha não encontrada no seu espaço.');
  return e;
}

const MODELO = `## Objetivo

Escreva aqui o que você quer alcançar com esta trilha.

## Tarefas

- [ ] Primeira tarefa
- [ ] Segunda tarefa

## Recursos

- Livros, cursos e links que vão ajudar
`;

export function criarEspaco(usuarioId, { nome, cor, descricao, modelo }) {
  const n = limpar(nome, 60);
  if (!n) throw new ErroHttp(400, 'Dê um nome à trilha.');
  if (listarEspacos(usuarioId).length >= MAX_ESPACOS) throw new ErroHttp(429, `Limite de ${MAX_ESPACOS} trilhas no seu espaço.`);
  const c = CORES.includes(cor) ? cor : 'brasa';
  const r = db.prepare('INSERT INTO espacos (usuario_id, nome, cor, descricao, criado) VALUES (?, ?, ?, ?, ?)')
    .run(usuarioId, n, c, limpar(descricao, 240), Date.now());
  const id = Number(r.lastInsertRowid);
  if (modelo) criarNota(usuarioId, id, { titulo: 'Plano', texto: MODELO });
  registrarEvento({ usuarioId, trilha: slugEspaco(id), tipo: 'espaco', detalhe: `Criou a trilha ${n} no seu espaço` });
  return id;
}

export function editarEspaco(usuarioId, id, { nome, cor, descricao }) {
  obterEspaco(usuarioId, id);
  const n = limpar(nome, 60);
  if (!n) throw new ErroHttp(400, 'Dê um nome à trilha.');
  db.prepare('UPDATE espacos SET nome = ?, cor = ?, descricao = ? WHERE id = ? AND usuario_id = ?')
    .run(n, CORES.includes(cor) ? cor : 'brasa', limpar(descricao, 240), Number(id), usuarioId);
}

export function removerEspaco(usuarioId, id) {
  const e = obterEspaco(usuarioId, id);
  db.prepare('DELETE FROM espacos WHERE id = ? AND usuario_id = ?').run(e.id, usuarioId);
  registrarEvento({ usuarioId, tipo: 'espaco', detalhe: `Apagou a trilha ${e.nome} do seu espaço` });
}

// ---------- notas ----------

function decorarNota(n) {
  const a = analisarNota(n.texto);
  return { ...n, feitas: a.feitas, total: a.total, secoes: a.secoes, linhas: a.linhas, corpo: a.corpo };
}

export function notasDoEspaco(usuarioId, espacoId) {
  obterEspaco(usuarioId, espacoId);
  return db.prepare('SELECT * FROM espaco_notas WHERE espaco_id = ? AND usuario_id = ? ORDER BY id').all(Number(espacoId), usuarioId).map(decorarNota);
}

export function obterNota(usuarioId, espacoId, notaId) {
  const n = db.prepare('SELECT * FROM espaco_notas WHERE id = ? AND espaco_id = ? AND usuario_id = ?').get(Number(notaId), Number(espacoId), usuarioId);
  if (!n) throw new ErroHttp(404, 'Nota não encontrada.');
  return decorarNota(n);
}

export function criarNota(usuarioId, espacoId, { titulo, texto = '' }) {
  obterEspaco(usuarioId, espacoId);
  const t = limpar(titulo, 120);
  if (!t) throw new ErroHttp(400, 'Dê um título à nota.');
  const qtd = db.prepare('SELECT count(*) AS n FROM espaco_notas WHERE espaco_id = ?').get(Number(espacoId)).n;
  if (qtd >= MAX_NOTAS) throw new ErroHttp(429, `Limite de ${MAX_NOTAS} notas por trilha.`);
  const r = db.prepare('INSERT INTO espaco_notas (espaco_id, usuario_id, titulo, texto, atualizado) VALUES (?, ?, ?, ?, ?)')
    .run(Number(espacoId), usuarioId, t, String(texto).slice(0, MAX_TEXTO), Date.now());
  return Number(r.lastInsertRowid);
}

export function salvarNota(usuarioId, espacoId, notaId, { titulo, texto, versao }) {
  const t = limpar(titulo, 120);
  if (!t) throw new ErroHttp(400, 'Dê um título à nota.');
  const corpo = String(texto ?? '').replace(/\r\n/g, '\n');
  if (corpo.length > MAX_TEXTO) throw new ErroHttp(413, 'A nota passou de 200 mil caracteres.');
  const r = db.prepare(`UPDATE espaco_notas SET titulo = ?, texto = ?, atualizado = ?, versao = versao + 1
    WHERE id = ? AND espaco_id = ? AND usuario_id = ? AND versao = ?`).run(t, corpo, Date.now(), Number(notaId), Number(espacoId), usuarioId, Number(versao));
  if (!r.changes) {
    obterNota(usuarioId, espacoId, notaId);
    throw new ErroHttp(409, 'Esta nota foi alterada em outra aba. Recarregue antes de salvar.');
  }
}

export function removerNota(usuarioId, espacoId, notaId) {
  obterNota(usuarioId, espacoId, notaId);
  db.prepare('DELETE FROM espaco_notas WHERE id = ? AND usuario_id = ?').run(Number(notaId), usuarioId);
}

// Marca/desmarca uma tarefa pela linha, conferindo o hash (igual às notas dos cofres).
export function alternarTarefaEspaco(usuarioId, espacoId, notaId, linha, hash, marcado) {
  const n = obterNota(usuarioId, espacoId, notaId);
  const linhas = n.texto.split('\n');
  const mudou = new ErroHttp(409, 'Esta nota mudou depois que a página abriu.');
  if (!Number.isInteger(linha) || linha < 0 || linha >= linhas.length || hashLinha(linhas[linha]) !== hash) throw mudou;
  const m = RE_TAREFA.exec(linhas[linha]);
  if (!m) throw mudou;
  const nova = linhas[linha].replace(RE_TAREFA, (_, a, _b, c) => a + (marcado ? 'x' : ' ') + c);
  linhas[linha] = nova;
  db.prepare('UPDATE espaco_notas SET texto = ?, atualizado = ?, versao = versao + 1 WHERE id = ? AND usuario_id = ?')
    .run(linhas.join('\n'), Date.now(), n.id, usuarioId);
  const a = analisarNota(linhas.join('\n'));
  return { hash: hashLinha(nova), feitas: a.feitas, total: a.total, texto: nova.slice(m[0].length).trim() };
}

export function progressoDoEspaco(usuarioId, espacoId) {
  let feitas = 0;
  let total = 0;
  for (const n of notasDoEspaco(usuarioId, espacoId)) { feitas += n.feitas; total += n.total; }
  return { feitas, total, pct: total ? (100 * feitas) / total : 0 };
}

export function assuntosDoEspaco(usuarioId, espacoId) {
  return notasDoEspaco(usuarioId, espacoId).flatMap((n) => [n.titulo, ...n.secoes]);
}
