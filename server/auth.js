import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';
import { config } from './config.js';

const scrypt = promisify(crypto.scrypt);
const DIA = 24 * 60 * 60 * 1000;
export const COOKIE = 'ayo_std';

// ---------- senhas (scrypt da biblioteca padrão, sem dependência nativa) ----------

const SCRYPT = { N: 32768, r: 8, p: 1, tamanho: 64, maxmem: 64 * 1024 * 1024 };

export async function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const { N, r, p, tamanho, maxmem } = SCRYPT;
  const hash = await scrypt(senha, sal, tamanho, { N, r, p, maxmem });
  return `scrypt$${N}$${r}$${p}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

async function conferirSenha(senha, armazenado) {
  const [alg, N, r, p, salB64, hashB64] = String(armazenado).split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hashB64, 'base64');
  const hash = await scrypt(senha, Buffer.from(salB64, 'base64'), esperado.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(hash, esperado);
}

// Gasta o mesmo tempo quando o usuário não existe (não revela quais usuários existem).
const hashFalso = await gerarHash(crypto.randomBytes(16).toString('hex'));

export function validarUsuario(usuario) {
  if (typeof usuario !== 'string' || !/^[\p{L}\p{N}._-]{3,32}$/u.test(usuario)) {
    return 'O usuário deve ter de 3 a 32 letras, números, ponto, hífen ou sublinhado.';
  }
  return null;
}

export function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (senha.length > 200) return 'A senha pode ter no máximo 200 caracteres.';
  return null;
}

export const existeUsuario = () => db.prepare('SELECT count(*) AS n FROM usuarios').get().n > 0;

export async function criarUsuario(usuario, senha, { perfil = 'completo', dono = false, trocarSenha = false } = {}) {
  const r = db.prepare('INSERT INTO usuarios (usuario, arroba, nome, senha_hash, criado_em, perfil, dono, trocar_senha) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(usuario, usuario.toLowerCase(), usuario, await gerarHash(senha), Date.now(), perfil, dono ? 1 : 0, trocarSenha ? 1 : 0);
  return Number(r.lastInsertRowid);
}

export const usuarioExiste = (usuario, excetoId = 0) =>
  !!db.prepare('SELECT 1 FROM usuarios WHERE usuario = ? AND id <> ?').get(usuario, excetoId);

export function listarUsuarios() {
  return db.prepare('SELECT id, usuario, arroba, nome, email, email_confirmado, confirmacao_pendente, perfil, dono, trocar_senha, criado_em FROM usuarios ORDER BY id').all();
}

export function renomearUsuario(id, novo) {
  db.prepare('UPDATE usuarios SET usuario = ?, arroba = lower(?) WHERE id = ?').run(novo, novo, id);
}

export async function conferirSenhaDoUsuario(id, senha) {
  const u = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(id);
  return u ? conferirSenha(senha, u.senha_hash) : false;
}

// Troca a própria senha: mantém a sessão atual, derruba as outras.
export async function trocarSenhaPorId(id, senha, manterSessaoHash) {
  db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?').run(await gerarHash(senha), id);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token_hash <> ?').run(id, manterSessaoHash || '');
}

// O dono redefine a senha de outra pessoa: vira provisória e todas as sessões dela caem.
export async function redefinirSenha(id, senha) {
  db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?').run(await gerarHash(senha), id);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(id);
}

export function removerUsuario(id) {
  db.prepare('DELETE FROM usuarios WHERE id = ? AND dono = 0').run(id);
}

// ---------- limite de tentativas genérico (códigos de convite, cadastro, reenvio de e-mail) ----------
const limites = new Map();
export function permitir(chave, maximo, janelaMs) {
  const agora = Date.now();
  const l = limites.get(chave);
  if (!l || agora - l.inicio > janelaMs) { limites.set(chave, { n: 1, inicio: agora }); return true; }
  l.n++;
  return l.n <= maximo;
}
setInterval(() => { const agora = Date.now(); for (const [k, l] of limites) if (agora - l.inicio > 3600_000) limites.delete(k); }, 600_000).unref();

export async function definirSenha(usuario, senha) {
  const r = db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE usuario = ?').run(await gerarHash(senha), usuario);
  if (r.changes) {
    // Trocar a senha derruba todas as sessões abertas.
    db.prepare('DELETE FROM sessoes WHERE usuario_id = (SELECT id FROM usuarios WHERE usuario = ?)').run(usuario);
  }
  return r.changes > 0;
}

// Entra com @usuário, nome de usuário antigo ou e-mail confirmado.
export async function autenticar(login, senha) {
  const l = String(login).trim().replace(/^@/, '');
  const u = db.prepare(`SELECT id, usuario, senha_hash, confirmacao_pendente FROM usuarios
    WHERE usuario = ? COLLATE NOCASE OR arroba = lower(?) OR (email = lower(?) AND email_confirmado = 1)`).get(l, l, l);
  const ok = await conferirSenha(senha, u ? u.senha_hash : hashFalso);
  return ok && u ? { id: u.id, usuario: u.usuario, pendente: !!u.confirmacao_pendente } : null;
}

const RESERVADOS = new Set(['admin', 'ayo', 'ayostd', 'ayo-std', 'root', 'suporte', 'sistema', 'grupo', 'convite', 'conta', 'configuracoes']);
export function validarArroba(arroba, { permitirReservado = false } = {}) {
  if (typeof arroba !== 'string' || !/^[a-z0-9_.]{3,24}$/.test(arroba)) {
    return 'O @ deve ter de 3 a 24 letras minúsculas, números, ponto ou sublinhado.';
  }
  if (!permitirReservado && RESERVADOS.has(arroba)) return 'Esse @ é reservado. Escolha outro.';
  return null;
}
export const arrobaExiste = (arroba, excetoId = 0) => !!db.prepare('SELECT 1 FROM usuarios WHERE (arroba = ? OR usuario = ? COLLATE NOCASE) AND id <> ?').get(arroba, arroba, excetoId);

export function validarEmail(email) {
  if (typeof email !== 'string' || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Informe um e-mail válido.';
  return null;
}
export const emailExiste = (email, excetoId = 0) => !!db.prepare('SELECT 1 FROM usuarios WHERE email = ? AND id <> ?').get(email, excetoId);

export function validarNome(nome) {
  if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 60) return 'O nome deve ter de 1 a 60 caracteres.';
  return null;
}

// Conta criada por convite: começa bloqueada até a pessoa confirmar o e-mail.
export async function criarConta({ nome, arroba, senha, perfil, convite }) {
  const r = db.prepare(`INSERT INTO usuarios (usuario, arroba, nome, senha_hash, criado_em, perfil, confirmacao_pendente, convite_pendente)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)`).run(arroba, arroba, nome.trim(), await gerarHash(senha), Date.now(), perfil, convite || null);
  return Number(r.lastInsertRowid);
}

// ---------- tokens de e-mail (link de confirmação; só o hash fica no banco) ----------

export function criarTokenEmail(usuarioId, email, horas = 24) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM tokens_email WHERE usuario_id = ? AND usado = 0').run(usuarioId);
  db.prepare('INSERT INTO tokens_email (token_hash, usuario_id, email, criado, expira) VALUES (?, ?, ?, ?, ?)')
    .run(hashToken(token), usuarioId, email, Date.now(), Date.now() + horas * 3600_000);
  return token;
}

// Confirma e devolve o usuário; o e-mail só passa a valer aqui (troca de e-mail também usa este caminho).
export function consumirTokenEmail(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const t = db.prepare('SELECT * FROM tokens_email WHERE token_hash = ?').get(hashToken(token));
  if (!t || t.usado || t.expira < Date.now()) return null;
  if (emailExiste(t.email, t.usuario_id)) return { erro: 'Esse e-mail já está em uso por outra conta.' };
  db.prepare('UPDATE tokens_email SET usado = 1 WHERE token_hash = ?').run(t.token_hash);
  db.prepare('UPDATE usuarios SET email = ?, email_confirmado = 1, confirmacao_pendente = 0 WHERE id = ?').run(t.email, t.usuario_id);
  return db.prepare('SELECT id, usuario, convite_pendente FROM usuarios WHERE id = ?').get(t.usuario_id);
}

export function emailPendenteDe(usuarioId) {
  return db.prepare('SELECT email FROM tokens_email WHERE usuario_id = ? AND usado = 0 AND expira > ? ORDER BY criado DESC LIMIT 1').get(usuarioId, Date.now())?.email || null;
}

export function confirmarManualmente(usuarioId) {
  const t = db.prepare('SELECT email FROM tokens_email WHERE usuario_id = ? AND usado = 0 ORDER BY criado DESC LIMIT 1').get(usuarioId);
  db.prepare('UPDATE tokens_email SET usado = 1 WHERE usuario_id = ?').run(usuarioId);
  if (t && !emailExiste(t.email, usuarioId)) db.prepare('UPDATE usuarios SET email = ?, email_confirmado = 1 WHERE id = ?').run(t.email, usuarioId);
  db.prepare('UPDATE usuarios SET confirmacao_pendente = 0 WHERE id = ?').run(usuarioId);
}

export function dadosDaConta(id) {
  return db.prepare('SELECT id, usuario, arroba, nome, email, email_confirmado, perfil, tema, dono, criado_em FROM usuarios WHERE id = ?').get(id);
}

export function definirPerfilPublico(id, { nome, arroba }) {
  db.prepare('UPDATE usuarios SET nome = ?, arroba = ?, usuario = ? WHERE id = ?').run(nome.trim(), arroba, arroba, id);
}

export function definirTema(id, tema) {
  db.prepare('UPDATE usuarios SET tema = ? WHERE id = ?').run(tema === 'pixel' ? 'pixel' : 'normal', id);
}

export const limparConvitePendente = (id) => db.prepare('UPDATE usuarios SET convite_pendente = NULL WHERE id = ?').run(id);

// ---------- sessões (token aleatório no cookie, só o hash no banco) ----------

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function definirCookie(req, res, valor, maxAgeMs) {
  res.cookie(COOKIE, valor, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSeguro || req.secure,
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function criarSessao(req, res, usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const agora = Date.now();
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, criada_em, expira_em, agente) VALUES (?, ?, ?, ?, ?)')
    .run(hashToken(token), usuarioId, agora, agora + config.sessaoDias * DIA, String(req.headers['user-agent'] || '').slice(0, 200));
  definirCookie(req, res, token, config.sessaoDias * DIA);
}

export function encerrarSessao(req, res) {
  if (req.sessaoHash) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(req.sessaoHash);
  res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: config.cookieSeguro || req.secure });
}

export function limparSessoesExpiradas() {
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(Date.now());
}

function lerCookie(req, nome) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) {
      try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

const buscarSessao = db.prepare(`
  SELECT s.token_hash, s.expira_em, u.id, u.usuario, u.perfil, u.dono, u.trocar_senha, u.arroba, u.nome, u.tema, u.email, u.email_confirmado
  FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
  WHERE s.token_hash = ? AND s.expira_em > ?`);
const renovarSessao = db.prepare('UPDATE sessoes SET expira_em = ? WHERE token_hash = ?');

// Sessão deslizante: cada dia de uso empurra a expiração.
export function carregarSessao(req, res, next) {
  const token = lerCookie(req, COOKIE);
  if (token) {
    const h = hashToken(token);
    const s = buscarSessao.get(h, Date.now());
    if (s) {
      req.usuario = {
        id: s.id, usuario: s.usuario, perfil: s.perfil, dono: !!s.dono, trocarSenha: !!s.trocar_senha,
        arroba: s.arroba || s.usuario.toLowerCase(), nome: s.nome || s.usuario, temaEscolhido: s.tema, email: s.email, emailConfirmado: !!s.email_confirmado,
      };
      req.sessaoHash = h;
      const nova = Date.now() + config.sessaoDias * DIA;
      if (nova - s.expira_em > DIA) {
        renovarSessao.run(nova, h);
        definirCookie(req, res, token, config.sessaoDias * DIA);
      }
    }
  }
  next();
}

// ---------- limite de tentativas de login (por IP, em memória) ----------

const JANELA = 15 * 60 * 1000;
const MAX_FALHAS = 6;
const falhas = new Map();

export function esperaBloqueio(ip) {
  const f = falhas.get(ip);
  if (!f || Date.now() - f.inicio > JANELA) return 0;
  return f.n >= MAX_FALHAS ? Math.ceil((f.inicio + JANELA - Date.now()) / 1000) : 0;
}

export function registrarFalha(ip) {
  const f = falhas.get(ip);
  if (!f || Date.now() - f.inicio > JANELA) falhas.set(ip, { n: 1, inicio: Date.now() });
  else f.n++;
}

export const limparFalhas = (ip) => falhas.delete(ip);

setInterval(() => {
  const agora = Date.now();
  for (const [ip, f] of falhas) if (agora - f.inicio > JANELA) falhas.delete(ip);
}, JANELA).unref();
