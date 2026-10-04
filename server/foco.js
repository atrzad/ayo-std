// Pomodoro: o tempo mora no servidor (início, pausas, duração). Assim o cronômetro sobrevive a
// recarregar a página, trocar de aparelho ou fechar o navegador; a sessão vencida é fechada sozinha.
import { db, registrarEvento } from './db.js';
import { ErroHttp } from './cofres.js';

const SEG = 1000;
const DIA = 864e5;

export function formatarDuracao(s) {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

function inicioDoDia(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function inicioDaSemana(ms = Date.now()) {
  const d = new Date(inicioDoDia(ms));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // segunda-feira
  return d.getTime();
}

function decorar(s, agora = Date.now()) {
  if (!s) return null;
  const pausaAtual = s.estado === 'pausado' ? agora - s.pausado_em : 0;
  const total = s.duracao_s * SEG;
  const decorrido = Math.min(total, Math.max(0, agora - s.inicio - s.pausa_ms - pausaAtual));
  const restanteMs = total - decorrido;
  return { ...s, decorridoMs: decorrido, restanteMs, fimPrevisto: s.estado === 'rodando' ? agora + restanteMs : null };
}

const ativaSt = db.prepare("SELECT * FROM pomodoros WHERE usuario_id = ? AND estado IN ('rodando', 'pausado')");
const porIdSt = db.prepare('SELECT * FROM pomodoros WHERE id = ? AND usuario_id = ?');

function descrever(s, segundos) {
  const tipo = s.tipo === 'foco' ? 'Foco' : 'Pausa';
  return `${tipo} de ${formatarDuracao(segundos)}${s.assunto ? ` em ${s.assunto}` : ''}`;
}

// Sessão rodando cujo tempo já acabou vira concluída com a duração cheia.
export function finalizarVencidas(usuarioId, agora = Date.now()) {
  for (const s of db.prepare("SELECT * FROM pomodoros WHERE usuario_id = ? AND estado = 'rodando'").all(usuarioId)) {
    const fim = s.inicio + s.pausa_ms + s.duracao_s * SEG;
    if (fim > agora) continue;
    db.prepare("UPDATE pomodoros SET estado = 'concluido', fim = ?, foco_s = ? WHERE id = ? AND estado = 'rodando'").run(fim, s.duracao_s, s.id);
    registrarEvento({ usuarioId, trilha: s.trilha, tipo: 'foco', detalhe: descrever(s, s.duracao_s) });
  }
}

export function sessaoAtiva(usuarioId) {
  finalizarVencidas(usuarioId);
  return decorar(ativaSt.get(usuarioId));
}

const limparTexto = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function iniciar(usuarioId, dados, slugsValidos) {
  const trilha = String(dados.trilha || '');
  const tipo = dados.tipo === 'pausa' ? 'pausa' : 'foco';
  const minutos = Number(dados.minutos);
  const assunto = limparTexto(dados.assunto, 100);
  if (!slugsValidos.includes(trilha)) throw new ErroHttp(400, 'Escolha uma trilha.');
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 180) throw new ErroHttp(400, 'A duração deve ser de 1 a 180 minutos.');
  finalizarVencidas(usuarioId);
  if (ativaSt.get(usuarioId)) throw new ErroHttp(409, 'Já existe uma sessão em andamento. Conclua ou abandone antes de começar outra.');
  const r = db.prepare(`INSERT INTO pomodoros (usuario_id, trilha, assunto, tipo, duracao_s, inicio, estado)
    VALUES (?, ?, ?, ?, ?, ?, 'rodando')`).run(usuarioId, trilha, assunto, tipo, minutos * 60, Date.now());
  return decorar(porIdSt.get(Number(r.lastInsertRowid), usuarioId));
}

function ativaPorId(usuarioId, id) {
  finalizarVencidas(usuarioId);
  const s = ativaSt.get(usuarioId);
  if (!s || s.id !== Number(id)) return null;
  return s;
}

export function pausar(usuarioId, id) {
  const s = ativaPorId(usuarioId, id);
  if (!s || s.estado !== 'rodando') throw new ErroHttp(409, 'Não há sessão rodando para pausar.');
  db.prepare("UPDATE pomodoros SET estado = 'pausado', pausado_em = ? WHERE id = ?").run(Date.now(), s.id);
}

export function retomar(usuarioId, id) {
  const s = ativaPorId(usuarioId, id);
  if (!s || s.estado !== 'pausado') throw new ErroHttp(409, 'Não há sessão pausada para retomar.');
  db.prepare("UPDATE pomodoros SET estado = 'rodando', pausa_ms = pausa_ms + ?, pausado_em = NULL WHERE id = ?")
    .run(Date.now() - s.pausado_em, s.id);
}

// automatico = o cronômetro do navegador chegou a zero; só fecha se o servidor concordar.
export function concluir(usuarioId, id, automatico = false) {
  const s = ativaPorId(usuarioId, id);
  if (!s) {
    const antiga = porIdSt.get(Number(id), usuarioId);
    if (antiga) return { sessao: antiga, jaConcluida: true };
    throw new ErroHttp(404, 'Sessão não encontrada.');
  }
  const d = decorar(s);
  if (automatico && d.restanteMs > 5 * SEG) throw new ErroHttp(409, 'Esta sessão ainda não terminou.');
  const segundos = Math.round(d.decorridoMs / SEG);
  const curta = segundos < 60;
  db.prepare('UPDATE pomodoros SET estado = ?, fim = ?, foco_s = ?, pausado_em = NULL WHERE id = ?')
    .run(curta ? 'cancelado' : 'concluido', Date.now(), segundos, s.id);
  if (!curta) registrarEvento({ usuarioId, trilha: s.trilha, tipo: 'foco', detalhe: descrever(s, segundos) });
  return { sessao: porIdSt.get(s.id, usuarioId), curta };
}

export function cancelar(usuarioId, id) {
  const s = ativaPorId(usuarioId, id);
  if (!s) throw new ErroHttp(409, 'Não há sessão em andamento.');
  const d = decorar(s);
  db.prepare("UPDATE pomodoros SET estado = 'cancelado', fim = ?, foco_s = ?, pausado_em = NULL WHERE id = ?")
    .run(Date.now(), Math.round(d.decorridoMs / SEG), s.id);
}

export function registrarManual(usuarioId, dados, slugsValidos) {
  const trilha = String(dados.trilha || '');
  const minutos = Number(dados.minutos);
  const assunto = limparTexto(dados.assunto, 100);
  if (!slugsValidos.includes(trilha)) throw new ErroHttp(400, 'Escolha uma trilha.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data || '') || !/^\d{2}:\d{2}$/.test(dados.hora || '')) {
    throw new ErroHttp(400, 'Informe a data e a hora de início.');
  }
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 600) throw new ErroHttp(400, 'Os minutos devem ser de 1 a 600.');
  const inicio = new Date(`${dados.data}T${dados.hora}:00`).getTime();
  if (!Number.isFinite(inicio)) throw new ErroHttp(400, 'Data ou hora inválida.');
  if (inicio + minutos * 60 * SEG > Date.now() + 60 * SEG) throw new ErroHttp(400, 'A sessão manual precisa ter terminado antes de agora.');
  db.prepare(`INSERT INTO pomodoros (usuario_id, trilha, assunto, tipo, duracao_s, inicio, fim, foco_s, estado, manual)
    VALUES (?, ?, ?, 'foco', ?, ?, ?, ?, 'concluido', 1)`)
    .run(usuarioId, trilha, assunto, minutos * 60, inicio, inicio + minutos * 60 * SEG, minutos * 60);
  registrarEvento({ usuarioId, trilha, tipo: 'foco', detalhe: `Registrou à mão: foco de ${formatarDuracao(minutos * 60)}${assunto ? ` em ${assunto}` : ''}` });
}

export function remover(usuarioId, id) {
  const r = db.prepare("DELETE FROM pomodoros WHERE id = ? AND usuario_id = ? AND estado IN ('concluido', 'cancelado')").run(Number(id), usuarioId);
  if (!r.changes) throw new ErroHttp(404, 'Sessão não encontrada.');
}

export function recentes(usuarioId, limite = 15) {
  finalizarVencidas(usuarioId);
  return db.prepare("SELECT * FROM pomodoros WHERE usuario_id = ? AND estado IN ('concluido', 'cancelado') ORDER BY inicio DESC LIMIT ?").all(usuarioId, limite);
}

// Tempo de foco concluído: hoje e na semana (segunda a domingo), no total e por trilha.
export function totais(usuarioId) {
  finalizarVencidas(usuarioId);
  const hoje0 = inicioDoDia();
  const sem0 = inicioDaSemana();
  const linhas = db.prepare(`SELECT trilha, inicio, foco_s FROM pomodoros
    WHERE usuario_id = ? AND estado = 'concluido' AND tipo = 'foco' AND inicio >= ?`).all(usuarioId, Math.min(hoje0, sem0));
  const t = { hoje: { s: 0, n: 0 }, semana: { s: 0, n: 0 }, porTrilha: {} };
  for (const l of linhas) {
    const p = (t.porTrilha[l.trilha] ||= { hojeS: 0, hojeN: 0, semanaS: 0, semanaN: 0 });
    if (l.inicio >= sem0) { t.semana.s += l.foco_s; t.semana.n++; p.semanaS += l.foco_s; p.semanaN++; }
    if (l.inicio >= hoje0) { t.hoje.s += l.foco_s; t.hoje.n++; p.hojeS += l.foco_s; p.hojeN++; }
  }
  return t;
}

export function ultimaTrilha(usuarioId) {
  return db.prepare('SELECT trilha FROM pomodoros WHERE usuario_id = ? ORDER BY inicio DESC LIMIT 1').get(usuarioId)?.trilha || null;
}

export function assuntosUsados(usuarioId, trilha) {
  return db.prepare(`SELECT assunto, max(inicio) AS ultimo FROM pomodoros WHERE usuario_id = ? AND trilha = ? AND assunto <> ''
    GROUP BY assunto ORDER BY ultimo DESC LIMIT 40`).all(usuarioId, trilha).map((r) => r.assunto);
}

export function exportarCSV(usuarioId) {
  const campo = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const linhas = db.prepare("SELECT * FROM pomodoros WHERE usuario_id = ? AND estado = 'concluido' ORDER BY inicio").all(usuarioId);
  const cab = 'data,hora_inicio,minutos,tipo,trilha,assunto,manual';
  return [cab, ...linhas.map((s) => {
    const d = new Date(s.inicio);
    return [d.toLocaleDateString('sv-SE'), d.toTimeString().slice(0, 5), Math.round(s.foco_s / 60), s.tipo, s.trilha, s.assunto, s.manual ? 'sim' : 'não'].map(campo).join(',');
  })].join('\n') + '\n';
}

export { DIA };
