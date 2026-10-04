// Grupo de estudos: cada pessoa participa de no máximo um grupo e decide o que compartilha.
// Regras de privacidade (valem em toda função daqui):
//  - só quem é membro do mesmo grupo e já aceitou o compartilhamento vê os outros membros;
//  - de cada membro só sai o que ele marcou: tempo/dias (streak), trilha e assunto das sessões;
//  - nada de notas, caderno, cofres ou questões passa pelo grupo.
import crypto from 'node:crypto';
import { db, registrarEvento, registrarConsentimento } from './db.js';
import { ErroHttp } from './cofres.js';

const DIA = 864e5;
export const MINUTOS_PARA_CONTAR = 10; // um dia entra no streak com pelo menos 10 min de foco concluído
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I

const diaLocal = (ms) => new Date(ms).toLocaleDateString('sv-SE');
const diaAnterior = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv-SE');
};

// ---------- grupo e membros ----------

export function membroDe(usuarioId) {
  return db.prepare(`SELECT m.*, g.nome AS grupo_nome, g.dono_id FROM grupo_membros m JOIN grupos g ON g.id = m.grupo_id WHERE m.usuario_id = ?`).get(usuarioId) || null;
}

export function criarGrupo(usuarioId, nome) {
  const n = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!n) throw new ErroHttp(400, 'Dê um nome ao grupo.');
  if (membroDe(usuarioId)) throw new ErroHttp(409, 'Você já participa de um grupo. Saia dele antes de criar outro.');
  const g = db.prepare('INSERT INTO grupos (nome, dono_id, criado) VALUES (?, ?, ?)').run(n, usuarioId, Date.now());
  const id = Number(g.lastInsertRowid);
  db.prepare('INSERT INTO grupo_membros (grupo_id, usuario_id, entrou) VALUES (?, ?, ?)').run(id, usuarioId, Date.now());
  registrarEvento({ usuarioId, tipo: 'grupo', detalhe: `Criou o grupo ${n}` });
  return id;
}

export function entrarNoGrupo(usuarioId, grupoId) {
  const atual = membroDe(usuarioId);
  if (atual?.grupo_id === grupoId) return;
  if (atual) throw new ErroHttp(409, `Você já participa do grupo “${atual.grupo_nome}”. Saia dele antes de entrar em outro.`);
  db.prepare('INSERT INTO grupo_membros (grupo_id, usuario_id, entrou) VALUES (?, ?, ?)').run(grupoId, usuarioId, Date.now());
  const g = db.prepare('SELECT nome FROM grupos WHERE id = ?').get(grupoId);
  registrarEvento({ usuarioId, tipo: 'grupo', detalhe: `Entrou no grupo ${g?.nome || ''}` });
}

export function definirCompartilhamento(usuarioId, { tempo, trilha, assunto }) {
  const m = membroDe(usuarioId);
  if (!m) throw new ErroHttp(404, 'Você não participa de nenhum grupo.');
  // trilha e assunto dependem de compartilhar as sessões
  const t = tempo ? 1 : 0;
  const tr = t && trilha ? 1 : 0;
  const as = tr && assunto ? 1 : 0;
  db.prepare(`UPDATE grupo_membros SET consentiu = ?, compartilha_tempo = ?, compartilha_trilha = ?, compartilha_assunto = ?
    WHERE usuario_id = ?`).run(Date.now(), t, tr, as, usuarioId);
  registrarConsentimento(usuarioId, 'compartilhamento-grupo', `grupo ${m.grupo_id}: tempo=${t} trilha=${tr} assunto=${as}`);
}

export function sairDoGrupo(usuarioId) {
  const m = membroDe(usuarioId);
  if (!m) return;
  db.prepare('DELETE FROM grupo_membros WHERE usuario_id = ?').run(usuarioId);
  const restam = db.prepare('SELECT usuario_id FROM grupo_membros WHERE grupo_id = ? ORDER BY entrou').all(m.grupo_id);
  if (!restam.length) db.prepare('DELETE FROM grupos WHERE id = ?').run(m.grupo_id);
  else if (m.dono_id === usuarioId) db.prepare('UPDATE grupos SET dono_id = ? WHERE id = ?').run(restam[0].usuario_id, m.grupo_id);
  registrarConsentimento(usuarioId, 'saiu-do-grupo', `grupo ${m.grupo_id}`);
  registrarEvento({ usuarioId, tipo: 'grupo', detalhe: `Saiu do grupo ${m.grupo_nome}` });
}

export function removerMembro(donoId, alvoId) {
  const m = membroDe(donoId);
  if (!m || m.dono_id !== donoId) throw new ErroHttp(403, 'Só quem administra o grupo remove membros.');
  const alvo = membroDe(alvoId);
  if (!alvo || alvo.grupo_id !== m.grupo_id || alvoId === donoId) throw new ErroHttp(404, 'Membro não encontrado.');
  sairDoGrupo(alvoId);
}

// ---------- convites ----------

function gerarCodigo() {
  const bytes = crypto.randomBytes(8);
  return [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
}

export const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

export function criarConvite(usuarioId, { horas, usos }) {
  const m = membroDe(usuarioId);
  if (!m || !m.consentiu) throw new ErroHttp(403, 'Entre no grupo e aceite o compartilhamento antes de convidar alguém.');
  const h = [24, 72, 168].includes(Number(horas)) ? Number(horas) : 24;
  const u = [1, 3, 5].includes(Number(usos)) ? Number(usos) : 1;
  const ativos = db.prepare('SELECT count(*) AS n FROM convites WHERE grupo_id = ? AND revogado = 0 AND expira > ? AND usos < usos_max').get(m.grupo_id, Date.now()).n;
  if (ativos >= 10) throw new ErroHttp(429, 'O grupo já tem 10 convites ativos. Revogue algum antes.');
  let codigo;
  do { codigo = gerarCodigo(); } while (db.prepare('SELECT 1 FROM convites WHERE codigo = ?').get(codigo));
  db.prepare('INSERT INTO convites (codigo, grupo_id, criado_por, criado, expira, usos_max) VALUES (?, ?, ?, ?, ?, ?)')
    .run(codigo, m.grupo_id, usuarioId, Date.now(), Date.now() + h * 3600_000, u);
  return codigo;
}

// Convite válido = existe, não foi revogado, não expirou e ainda tem usos.
export function conviteValido(codigo) {
  const c = db.prepare(`SELECT c.*, g.nome AS grupo_nome FROM convites c JOIN grupos g ON g.id = c.grupo_id WHERE c.codigo = ?`).get(normalizarCodigo(codigo));
  if (!c || c.revogado || c.expira < Date.now() || c.usos >= c.usos_max) return null;
  return c;
}

export function usarConvite(codigo) {
  const r = db.prepare('UPDATE convites SET usos = usos + 1 WHERE codigo = ? AND revogado = 0 AND expira > ? AND usos < usos_max')
    .run(normalizarCodigo(codigo), Date.now());
  return r.changes > 0;
}

export function convitesDoGrupo(usuarioId) {
  const m = membroDe(usuarioId);
  if (!m) return [];
  return db.prepare(`SELECT c.codigo, c.expira, c.usos, c.usos_max, c.criado_por = ? AS meu FROM convites c
    WHERE c.grupo_id = ? AND c.revogado = 0 AND c.expira > ? AND c.usos < c.usos_max ORDER BY c.criado DESC`).all(usuarioId, m.grupo_id, Date.now());
}

export function revogarConvite(usuarioId, codigo) {
  const m = membroDe(usuarioId);
  const r = db.prepare('UPDATE convites SET revogado = 1 WHERE codigo = ? AND grupo_id = ? AND (criado_por = ? OR ? = ?)')
    .run(normalizarCodigo(codigo), m?.grupo_id ?? -1, usuarioId, m?.dono_id ?? -1, usuarioId);
  if (!r.changes) throw new ErroHttp(404, 'Convite não encontrado.');
}

// ---------- estudo: dias, streak e mapa ----------

function minutosPorDia(usuarioId, desde = 0) {
  const linhas = db.prepare(`SELECT inicio, foco_s FROM pomodoros WHERE usuario_id = ? AND estado = 'concluido' AND tipo = 'foco' AND inicio >= ?`).all(usuarioId, desde);
  const dias = new Map();
  for (const l of linhas) {
    const d = diaLocal(l.inicio);
    dias.set(d, (dias.get(d) || 0) + Math.round((l.foco_s || 0) / 60));
  }
  return dias;
}

export function streakDe(usuarioId) {
  const dias = minutosPorDia(usuarioId);
  const conta = (d) => (dias.get(d) || 0) >= MINUTOS_PARA_CONTAR;
  const hoje = diaLocal(Date.now());
  // o streak segue vivo até o fim do dia: se hoje ainda não contou, conta a partir de ontem
  let d = conta(hoje) ? hoje : diaAnterior(hoje);
  let atual = 0;
  while (conta(d)) { atual++; d = diaAnterior(d); }
  // recorde: maior sequência no histórico
  const ordenados = [...dias.keys()].filter(conta).sort();
  let recorde = 0;
  let seq = 0;
  let anterior = null;
  for (const dia of ordenados) {
    seq = anterior && diaAnterior(dia) === anterior ? seq + 1 : 1;
    recorde = Math.max(recorde, seq);
    anterior = dia;
  }
  return { atual, recorde: Math.max(recorde, atual), hojeConta: conta(hoje), minutosHoje: dias.get(hoje) || 0, diasEstudados: ordenados.length };
}

// Mapa das últimas N semanas (segunda a domingo), um quadrado por dia.
export function mapaDe(usuarioId, semanas = 12) {
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const fim = new Date(hoje);
  fim.setDate(fim.getDate() + (6 - ((fim.getDay() + 6) % 7)));
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - (semanas * 7 - 1));
  const dias = minutosPorDia(usuarioId, inicio.getTime() - DIA);
  const hojeISO = diaLocal(Date.now());
  const saida = [];
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    const iso = d.toLocaleDateString('sv-SE');
    saida.push({ dia: iso, min: dias.get(iso) || 0, futuro: iso > hojeISO });
  }
  return saida;
}

// ---------- o que o grupo vê ----------

// Só devolve dados se quem pede é membro do mesmo grupo e já aceitou compartilhar (reciprocidade).
function exigirMembroAtivo(usuarioId) {
  const m = membroDe(usuarioId);
  if (!m) throw new ErroHttp(404, 'Você não participa de nenhum grupo.');
  if (!m.consentiu) throw new ErroHttp(403, 'Aceite as regras de compartilhamento para ver o grupo.');
  return m;
}

export function membrosVisiveis(usuarioId) {
  const m = exigirMembroAtivo(usuarioId);
  return db.prepare(`SELECT u.id, u.nome, u.arroba, gm.entrou, gm.consentiu, gm.compartilha_tempo, gm.compartilha_trilha, gm.compartilha_assunto
    FROM grupo_membros gm JOIN usuarios u ON u.id = gm.usuario_id WHERE gm.grupo_id = ? ORDER BY gm.entrou`).all(m.grupo_id)
    .map((x) => {
      const ativo = !!x.consentiu && !!x.compartilha_tempo;
      return {
        id: x.id, nome: x.nome || x.arroba, arroba: x.arroba, souEu: x.id === usuarioId, admin: x.id === m.dono_id,
        pendente: !x.consentiu, compartilhaTempo: ativo,
        streak: ativo ? streakDe(x.id) : null,
        mapa: ativo ? mapaDe(x.id, 12) : null,
      };
    });
}

export function membroVisivel(usuarioId, arroba) {
  const lista = membrosVisiveis(usuarioId);
  return lista.find((x) => x.arroba === String(arroba).toLowerCase().replace(/^@/, '')) || null;
}

// Mural: sessões concluídas de quem compartilha tempo; trilha e assunto só se a pessoa permitiu.
export function mural(usuarioId, { soDe = null, limite = 40, nomeTrilha = (s) => s } = {}) {
  const m = exigirMembroAtivo(usuarioId);
  const linhas = db.prepare(`SELECT p.id, p.usuario_id, p.trilha, p.assunto, p.inicio, p.foco_s, p.manual, u.nome, u.arroba,
      gm.compartilha_trilha, gm.compartilha_assunto
    FROM pomodoros p
    JOIN grupo_membros gm ON gm.usuario_id = p.usuario_id AND gm.grupo_id = ?
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.estado = 'concluido' AND p.tipo = 'foco' AND gm.consentiu IS NOT NULL AND gm.compartilha_tempo = 1
      AND p.inicio >= gm.entrou - 7 * ? ${soDe ? 'AND p.usuario_id = ?' : ''}
    ORDER BY p.inicio DESC LIMIT ?`).all(m.grupo_id, DIA, ...(soDe ? [soDe] : []), limite);
  return linhas.map((l) => ({
    id: l.usuario_id, sessao: l.id, nome: l.nome || l.arroba, arroba: l.arroba, souEu: l.usuario_id === usuarioId,
    quando: l.inicio, minutos: Math.round((l.foco_s || 0) / 60), manual: !!l.manual,
    trilha: l.compartilha_trilha ? nomeTrilha(l.trilha) : null,
    assunto: l.compartilha_trilha && l.compartilha_assunto ? l.assunto : null,
  }));
}

// Grupo de um convite mesmo já usado (a conta nova consome o uso no cadastro e entra ao confirmar o e-mail).
export const grupoDoCodigo = (codigo) => db.prepare('SELECT grupo_id FROM convites WHERE codigo = ?').get(normalizarCodigo(codigo))?.grupo_id || null;
