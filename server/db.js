import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(path.join(config.dataDir, 'ayo-std.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const MIGRACOES = [
  `CREATE TABLE usuarios (
     id INTEGER PRIMARY KEY,
     usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
     senha_hash TEXT NOT NULL,
     criado_em INTEGER NOT NULL
   );
   CREATE TABLE sessoes (
     token_hash TEXT PRIMARY KEY,
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     criada_em INTEGER NOT NULL,
     expira_em INTEGER NOT NULL,
     agente TEXT NOT NULL DEFAULT ''
   );
   CREATE TABLE ajustes (
     chave TEXT PRIMARY KEY,
     valor TEXT NOT NULL
   );
   CREATE TABLE eventos (
     id INTEGER PRIMARY KEY,
     quando INTEGER NOT NULL,
     usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
     trilha TEXT,
     tipo TEXT NOT NULL,
     arquivo TEXT,
     detalhe TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX eventos_quando ON eventos(quando DESC);`,
  // 2: pomodoro
  `CREATE TABLE pomodoros (
     id INTEGER PRIMARY KEY,
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     trilha TEXT NOT NULL,
     assunto TEXT NOT NULL DEFAULT '',
     tipo TEXT NOT NULL CHECK (tipo IN ('foco', 'pausa')),
     duracao_s INTEGER NOT NULL,
     inicio INTEGER NOT NULL,
     pausado_em INTEGER,
     pausa_ms INTEGER NOT NULL DEFAULT 0,
     fim INTEGER,
     foco_s INTEGER,
     estado TEXT NOT NULL CHECK (estado IN ('rodando', 'pausado', 'concluido', 'cancelado')),
     manual INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX pomodoros_usuario_inicio ON pomodoros(usuario_id, inicio DESC);
   CREATE UNIQUE INDEX pomodoros_um_ativo ON pomodoros(usuario_id) WHERE estado IN ('rodando', 'pausado');`,
  // 3: perfis de acesso e progresso próprio de quem não grava nas notas
  `ALTER TABLE usuarios ADD COLUMN perfil TEXT NOT NULL DEFAULT 'completo';
   ALTER TABLE usuarios ADD COLUMN dono INTEGER NOT NULL DEFAULT 0;
   UPDATE usuarios SET dono = 1 WHERE id = (SELECT min(id) FROM usuarios);
   CREATE TABLE progresso (
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     trilha TEXT NOT NULL,
     arquivo TEXT NOT NULL,
     chave TEXT NOT NULL,
     atualizado INTEGER NOT NULL,
     PRIMARY KEY (usuario_id, trilha, arquivo, chave)
   );`,
  // 4: senha provisória obriga a troca no primeiro acesso
  'ALTER TABLE usuarios ADD COLUMN trocar_senha INTEGER NOT NULL DEFAULT 0;',
  // 5: caderno de anotações (texto/markdown + desenho à caneta)
  `CREATE TABLE caderno (
     id INTEGER PRIMARY KEY,
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     titulo TEXT NOT NULL DEFAULT '',
     data TEXT NOT NULL,
     trilha TEXT,
     assunto TEXT NOT NULL DEFAULT '',
     formato TEXT NOT NULL DEFAULT 'md' CHECK (formato IN ('txt', 'md')),
     texto TEXT NOT NULL DEFAULT '',
     desenho TEXT,
     criado INTEGER NOT NULL,
     atualizado INTEGER NOT NULL,
     versao INTEGER NOT NULL DEFAULT 1
   );
   CREATE INDEX caderno_usuario_data ON caderno(usuario_id, data DESC, atualizado DESC);`,
  // 6: contas por convite com e-mail, @, tema próprio, grupos de estudo, consentimentos e espaço próprio
  `ALTER TABLE usuarios ADD COLUMN nome TEXT NOT NULL DEFAULT '';
   ALTER TABLE usuarios ADD COLUMN arroba TEXT;
   ALTER TABLE usuarios ADD COLUMN email TEXT;
   ALTER TABLE usuarios ADD COLUMN email_confirmado INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE usuarios ADD COLUMN confirmacao_pendente INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE usuarios ADD COLUMN tema TEXT;
   ALTER TABLE usuarios ADD COLUMN convite_pendente TEXT;
   UPDATE usuarios SET arroba = lower(usuario), nome = usuario;
   CREATE UNIQUE INDEX usuarios_arroba ON usuarios(arroba);
   CREATE UNIQUE INDEX usuarios_email ON usuarios(email) WHERE email IS NOT NULL;
   CREATE TABLE tokens_email (
     token_hash TEXT PRIMARY KEY,
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     email TEXT NOT NULL,
     criado INTEGER NOT NULL,
     expira INTEGER NOT NULL,
     usado INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE grupos (
     id INTEGER PRIMARY KEY,
     nome TEXT NOT NULL,
     dono_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
     criado INTEGER NOT NULL
   );
   CREATE TABLE grupo_membros (
     grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
     usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
     entrou INTEGER NOT NULL,
     consentiu INTEGER,
     compartilha_tempo INTEGER NOT NULL DEFAULT 0,
     compartilha_trilha INTEGER NOT NULL DEFAULT 0,
     compartilha_assunto INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (grupo_id, usuario_id)
   );
   CREATE TABLE convites (
     id INTEGER PRIMARY KEY,
     codigo TEXT NOT NULL UNIQUE,
     grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
     criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
     criado INTEGER NOT NULL,
     expira INTEGER NOT NULL,
     usos_max INTEGER NOT NULL,
     usos INTEGER NOT NULL DEFAULT 0,
     revogado INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE consentimentos (
     id INTEGER PRIMARY KEY,
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     tipo TEXT NOT NULL,
     detalhe TEXT NOT NULL DEFAULT '',
     quando INTEGER NOT NULL
   );
   CREATE TABLE espacos (
     id INTEGER PRIMARY KEY,
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     nome TEXT NOT NULL,
     cor TEXT NOT NULL DEFAULT 'brasa',
     descricao TEXT NOT NULL DEFAULT '',
     criado INTEGER NOT NULL
   );
   CREATE TABLE espaco_notas (
     id INTEGER PRIMARY KEY,
     espaco_id INTEGER NOT NULL REFERENCES espacos(id) ON DELETE CASCADE,
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     titulo TEXT NOT NULL,
     texto TEXT NOT NULL DEFAULT '',
     atualizado INTEGER NOT NULL,
     versao INTEGER NOT NULL DEFAULT 1
   );`,
];

{
  const { user_version: versao } = db.prepare('PRAGMA user_version').get();
  for (let i = versao; i < MIGRACOES.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRACOES[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

// ---------- ajustes (chave → JSON) ----------

const lerAjusteSt = db.prepare('SELECT valor FROM ajustes WHERE chave = ?');
const gravarAjusteSt = db.prepare(
  'INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');

export function lerAjuste(chave, padrao = null) {
  const r = lerAjusteSt.get(chave);
  if (!r) return padrao;
  try { return JSON.parse(r.valor); } catch { return padrao; }
}

export function gravarAjuste(chave, valor) {
  gravarAjusteSt.run(chave, JSON.stringify(valor));
}

// ---------- histórico de atividade ----------

const eventoSt = db.prepare(
  'INSERT INTO eventos (quando, usuario_id, trilha, tipo, arquivo, detalhe) VALUES (?, ?, ?, ?, ?, ?)');

export function registrarEvento({ usuarioId = null, trilha = null, tipo, arquivo = null, detalhe = '' }) {
  eventoSt.run(Date.now(), usuarioId, trilha, tipo, arquivo, String(detalhe).slice(0, 300));
}

// Cada pessoa vê só as próprias ações.
export function eventosRecentes(usuarioId, limite = 12, trilha = null) {
  return trilha
    ? db.prepare('SELECT * FROM eventos WHERE usuario_id = ? AND trilha = ? ORDER BY quando DESC LIMIT ?').all(usuarioId, trilha, limite)
    : db.prepare('SELECT * FROM eventos WHERE usuario_id = ? ORDER BY quando DESC LIMIT ?').all(usuarioId, limite);
}

// ---------- progresso de quem não grava nas notas (perfil com progresso "banco") ----------

export function feitasNoBanco(usuarioId, trilha, arquivo) {
  return new Set(db.prepare('SELECT chave FROM progresso WHERE usuario_id = ? AND trilha = ? AND arquivo = ?')
    .all(usuarioId, trilha, arquivo).map((r) => r.chave));
}

export function marcarNoBanco(usuarioId, trilha, arquivo, chave, marcado) {
  if (marcado) {
    db.prepare(`INSERT INTO progresso (usuario_id, trilha, arquivo, chave, atualizado) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET atualizado = excluded.atualizado`).run(usuarioId, trilha, arquivo, chave, Date.now());
  } else {
    db.prepare('DELETE FROM progresso WHERE usuario_id = ? AND trilha = ? AND arquivo = ? AND chave = ?').run(usuarioId, trilha, arquivo, chave);
  }
}

export function podarEventos(manter = 5000) {
  db.prepare('DELETE FROM eventos WHERE id NOT IN (SELECT id FROM eventos ORDER BY quando DESC LIMIT ?)').run(manter);
}

// ---------- backup diário do banco ----------

export function backupDoBanco() {
  const dir = path.join(config.dataDir, 'backups', 'banco');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const hoje = new Date().toLocaleDateString('sv-SE');
  const destino = path.join(dir, `ayo-std-${hoje}.sqlite`);
  if (!fs.existsSync(destino)) {
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  }
  const antigos = fs.readdirSync(dir).filter((n) => n.endsWith('.sqlite')).sort();
  for (const n of antigos.slice(0, Math.max(0, antigos.length - config.backupsBanco))) {
    fs.rmSync(path.join(dir, n), { force: true });
  }
}

export function registrarConsentimento(usuarioId, tipo, detalhe = '') {
  db.prepare('INSERT INTO consentimentos (usuario_id, tipo, detalhe, quando) VALUES (?, ?, ?, ?)').run(usuarioId, tipo, String(detalhe).slice(0, 300), Date.now());
}
