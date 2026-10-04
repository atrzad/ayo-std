import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

// ---------- trilhas (config/trilhas.json) ----------

let TRILHAS = [];

export function carregarTrilhas() {
  const lista = JSON.parse(fs.readFileSync(config.trilhasArquivo, 'utf8'));
  TRILHAS = lista.map((t) => ({ ...t, pasta: path.resolve(t.pasta.replace(/^~(?=$|\/)/, os.homedir())) }));
  for (const t of TRILHAS) {
    if (!/^[a-z0-9-]{1,30}$/.test(t.slug)) throw new Error(`slug inválido em trilhas.json: ${t.slug}`);
    if (!fs.existsSync(t.pasta)) console.warn(`[cofres] pasta não encontrada para "${t.slug}": ${t.pasta}`);
  }
  return TRILHAS;
}

export const listarTrilhas = () => TRILHAS;
export const acharTrilha = (slug) => TRILHAS.find((t) => t.slug === slug) || null;

// ---------- caminhos ----------

const IGNORAR = new Set(['__pycache__', 'node_modules']);
const ignorado = (nome) => nome.startsWith('.') || IGNORAR.has(nome);
export const EXT_SERVIDAS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.csv', '.txt', '.json', '.md']);

// Resolve um caminho relativo dentro do cofre, recusando "..", arquivos ocultos e links que saiam dele.
export async function caminhoSeguro(t, rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 400) throw new ErroHttp(400, 'Caminho inválido.');
  const partes = rel.split('/');
  if (partes.some((p) => !p || p === '.' || p === '..' || p.startsWith('.') || /[\\\0]/.test(p))) {
    throw new ErroHttp(400, 'Caminho inválido.');
  }
  const raiz = await fsp.realpath(t.pasta);
  let real;
  try {
    real = await fsp.realpath(path.join(raiz, ...partes));
  } catch {
    throw new ErroHttp(404, 'Arquivo não encontrado no cofre.');
  }
  if (!real.startsWith(raiz + path.sep)) throw new ErroHttp(403, 'Esse arquivo fica fora do cofre.');
  return real;
}

// Lista os arquivos do cofre (até 4 níveis), sem pastas ocultas como .obsidian.
export async function listarArquivos(t) {
  const saida = [];
  async function andar(dir, rel, nivel) {
    let itens;
    try { itens = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const it of itens) {
      if (ignorado(it.name)) continue;
      const relItem = rel ? `${rel}/${it.name}` : it.name;
      const abs = path.join(dir, it.name);
      if (it.isDirectory()) {
        if (nivel < 4) await andar(abs, relItem, nivel + 1);
      } else if (it.isFile()) {
        const st = await fsp.stat(abs);
        saida.push({ rel: relItem, ext: path.extname(it.name).toLowerCase(), tamanho: st.size, mtime: st.mtimeMs });
      }
    }
  }
  await andar(t.pasta, '', 0);
  return saida.sort((a, b) => a.rel.localeCompare(b.rel, 'pt-BR', { numeric: true }));
}

// ---------- análise de notas ----------

// Item de tarefa em lista (também dentro de citação): "- [ ] texto", "1. [x] texto", "> - [ ] texto".
export const RE_TAREFA = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])(\][ \t]+)(?=\S)/;
const RE_CERCA = /^[ \t]*(?:>[ \t]*)*(```|~~~)/;

export const hashLinha = (linha) => crypto.createHash('sha1').update(linha.replace(/\r$/, '')).digest('hex').slice(0, 12);

function lerFrontmatter(linhas) {
  if ((linhas[0] || '').replace(/\r$/, '') !== '---') return { meta: {}, fim: -1 };
  for (let i = 1; i < Math.min(linhas.length, 60); i++) {
    const l = linhas[i].replace(/\r$/, '');
    if (l === '---' || l === '...') {
      const meta = {};
      for (const m of linhas.slice(1, i)) {
        const r = /^([\w-]+):\s*(.*?)\s*$/.exec(m.replace(/\r$/, ''));
        if (!r) continue;
        let v = r[2].replace(/^(["'])(.*)\1$/, '$2');
        if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
        meta[r[1]] = v;
      }
      return { meta, fim: i };
    }
  }
  return { meta: {}, fim: -1 };
}

export function analisarNota(texto) {
  const linhas = texto.split('\n');
  const { meta, fim } = lerFrontmatter(linhas);
  let titulo = null;
  let feitas = 0;
  let total = 0;
  let cerca = false;
  // Chave de cada tarefa = hash do texto (+ ocorrência): sobrevive a linhas que mudam de lugar.
  const chavePorLinha = new Map();
  const ocorrencias = new Map();
  const secoes = [];
  for (let i = fim + 1; i < linhas.length; i++) {
    const l = linhas[i].replace(/\r$/, '');
    if (RE_CERCA.test(l)) { cerca = !cerca; continue; }
    if (cerca) continue;
    if (!titulo) {
      const h = /^#\s+(.+?)\s*#*\s*$/.exec(l);
      if (h) titulo = h[1].replace(/[*_`]/g, '');
    }
    const sec = /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(l);
    if (sec) secoes.push(sec[1].replace(/[*_`]/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim());
    const m = RE_TAREFA.exec(l);
    if (m) {
      total++;
      if (m[2] !== ' ') feitas++;
      const texto = l.slice(m[0].length).trim();
      const n = (ocorrencias.get(texto) || 0) + 1;
      ocorrencias.set(texto, n);
      chavePorLinha.set(i, hashLinha(texto) + (n > 1 ? `-${n}` : ''));
    }
  }
  // Linhas do frontmatter viram linhas vazias: a numeração continua batendo com o arquivo.
  const corpo = fim >= 0 ? linhas.map((l, i) => (i <= fim ? '' : l)).join('\n') : texto;
  return { meta, titulo, feitas, total, corpo, linhas, chavePorLinha, chaves: [...chavePorLinha.values()], secoes };
}

// Cache por arquivo: só relê do disco quando mtime ou tamanho mudam (o Obsidian pode editar a qualquer hora).
const cache = new Map();

export async function lerNota(t, rel) {
  const abs = await caminhoSeguro(t, rel);
  if (path.extname(abs).toLowerCase() !== '.md') throw new ErroHttp(400, 'Só notas .md podem ser abertas aqui.');
  const st = await fsp.stat(abs);
  const c = cache.get(abs);
  if (c && c.mtime === st.mtimeMs && c.tamanho === st.size) return c.nota;
  const texto = await fsp.readFile(abs, 'utf8');
  const nota = { rel, abs, mtime: st.mtimeMs, ...analisarNota(texto) };
  nota.tituloCurto = tituloCurto(nota.titulo || path.basename(rel, '.md'));
  cache.set(abs, { mtime: st.mtimeMs, tamanho: st.size, nota });
  return nota;
}

export function tituloCurto(titulo) {
  return titulo.replace(/^\d{1,3}\s*[—–-]\s*/, '').trim();
}

export async function listarNotas(t) {
  const arquivos = await listarArquivos(t);
  const notas = [];
  for (const a of arquivos) {
    if (a.ext !== '.md') continue;
    try { notas.push(await lerNota(t, a.rel)); } catch (e) { console.warn(`[cofres] ${t.slug}/${a.rel}: ${e.message}`); }
  }
  return notas;
}

// ---------- escrita segura ----------

const travas = new Map();

// Uma escrita por arquivo de cada vez; a fila nunca trava se uma escrita falhar.
function comTrava(chave, fn) {
  const anterior = travas.get(chave) || Promise.resolve();
  const atual = anterior.then(fn);
  const guarda = atual.catch(() => {});
  travas.set(chave, guarda);
  guarda.then(() => { if (travas.get(chave) === guarda) travas.delete(chave); });
  return atual;
}

const carimbo = () => new Date().toISOString().replace(/[:.]/g, '-');

async function backupDoArquivo(t, rel, abs) {
  const dir = path.join(config.dataDir, 'backups', 'cofres', t.slug, rel);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  await fsp.copyFile(abs, path.join(dir, carimbo() + path.extname(rel)));
  const copias = (await fsp.readdir(dir)).sort();
  for (const n of copias.slice(0, Math.max(0, copias.length - config.backupsPorArquivo))) {
    await fsp.rm(path.join(dir, n), { force: true });
  }
}

// Grava por arquivo temporário + rename: o arquivo nunca fica pela metade, nem se a máquina desligar.
async function gravarAtomico(abs, conteudo) {
  const st = await fsp.stat(abs);
  const modo = st.mode & 0o777;
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.ayo-${crypto.randomBytes(4).toString('hex')}.tmp`);
  const fh = await fsp.open(tmp, 'wx', modo);
  try {
    await fh.writeFile(conteudo, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fsp.chmod(tmp, modo);
    await fsp.rename(tmp, abs);
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
  cache.delete(abs);
}

export async function alternarTarefa(t, rel, linha, hash, marcado) {
  const abs = await caminhoSeguro(t, rel);
  if (path.extname(abs).toLowerCase() !== '.md') throw new ErroHttp(400, 'Só notas .md têm tarefas.');
  return comTrava(abs, async () => {
    const texto = await fsp.readFile(abs, 'utf8');
    const linhas = texto.split('\n');
    const mudou = new ErroHttp(409, 'Esta nota mudou depois que a página abriu.');
    if (!Number.isInteger(linha) || linha < 0 || linha >= linhas.length) throw mudou;
    const original = linhas[linha];
    const semCR = original.replace(/\r$/, '');
    if (hashLinha(semCR) !== hash) throw mudou;
    const m = RE_TAREFA.exec(semCR);
    if (!m) throw mudou;
    const nova = semCR.replace(RE_TAREFA, (_, a, _b, c) => a + (marcado ? 'x' : ' ') + c);
    const textoTarefa = semCR.slice(m[0].length).trim();
    if (nova !== semCR) {
      linhas[linha] = nova + (original.endsWith('\r') ? '\r' : '');
      await backupDoArquivo(t, rel, abs);
      await gravarAtomico(abs, linhas.join('\n'));
    }
    const nota = await lerNota(t, rel);
    return { hash: hashLinha(nova), texto: textoTarefa, feitas: nota.feitas, total: nota.total };
  });
}

// ---------- estudos.json e registro-questoes.csv ----------

export const CABECALHO_CSV = ['data', 'cargo', 'materia', 'topico', 'fonte', 'questoes', 'acertos', 'tempo_min'];

export async function lerEstudos(t) {
  try {
    return JSON.parse(await fsp.readFile(path.join(t.pasta, 'estudos.json'), 'utf8'));
  } catch {
    return null;
  }
}

function dividirCSV(linha) {
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (ch === '"') aspas = false;
      else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ',') { campos.push(atual); atual = ''; }
    else atual += ch;
  }
  campos.push(atual);
  return campos;
}

const campoCSV = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const caminhoCSV = (t) => path.join(t.pasta, 'registro-questoes.csv');

export async function temRegistro(t) {
  try { await fsp.access(caminhoCSV(t)); return true; } catch { return false; }
}

export async function lerRegistros(t) {
  let texto;
  try { texto = await fsp.readFile(caminhoCSV(t), 'utf8'); } catch { return null; }
  const linhas = texto.split('\n');
  const cab = dividirCSV((linhas[0] || '').replace(/\r$/, '')).map((c) => c.trim());
  const registros = [];
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i].replace(/\r$/, '');
    if (!l.trim()) continue;
    const campos = dividirCSV(l);
    const r = {};
    cab.forEach((c, j) => { r[c] = (campos[j] ?? '').trim(); });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data)) continue;
    r.questoes = Number(r.questoes) || 0;
    r.acertos = Number(String(r.acertos).replace(',', '.')) || 0;
    r.tempo_min = Number(r.tempo_min) || 0;
    r.linha = i;
    r.hash = hashLinha(l);
    registros.push(r);
  }
  return registros;
}

const limpar = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// cargosPermitidos: lista do perfil de quem registra (null = todos os cargos do estudos.json).
export function validarRegistro(dados, estudos, cargosPermitidos = null) {
  const r = {
    data: limpar(dados.data, 10),
    cargo: limpar(dados.cargo, 40).toLowerCase(),
    materia: limpar(dados.materia, 80),
    topico: limpar(dados.topico, 120),
    fonte: limpar(dados.fonte, 120),
    questoes: Number(dados.questoes),
    acertos: Number(String(dados.acertos ?? '').replace(',', '.')),
    tempo_min: dados.tempo_min === '' || dados.tempo_min == null ? 0 : Number(dados.tempo_min),
  };
  const d = new Date(r.data + 'T12:00:00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data) || isNaN(d) || d.getFullYear() < 2020 || d.getFullYear() > 2100) {
    return { erro: 'Informe a data no formato AAAA-MM-DD.' };
  }
  let cargos = Object.keys(estudos?.cargos || {});
  if (cargosPermitidos) cargos = cargos.filter((c) => cargosPermitidos.includes(c));
  if (cargosPermitidos && !cargos.length) return { erro: 'Seu perfil não registra questões nesta trilha.' };
  if (cargos.length ? !cargos.includes(r.cargo) : !/^[\p{L}\p{N} _-]{1,40}$/u.test(r.cargo)) {
    return { erro: 'Escolha um cargo da lista.' };
  }
  if (!r.materia) return { erro: 'Informe a matéria.' };
  if (!Number.isInteger(r.questoes) || r.questoes < 1 || r.questoes > 1000) {
    return { erro: 'Questões deve ser um número inteiro de 1 a 1000.' };
  }
  if (!Number.isFinite(r.acertos) || r.acertos < 0 || r.acertos > r.questoes) {
    return { erro: 'Acertos deve ficar entre 0 e o número de questões.' };
  }
  if (!Number.isInteger(r.tempo_min) || r.tempo_min < 0 || r.tempo_min > 1440) {
    return { erro: 'Tempo deve ser um número inteiro de minutos (0 a 1440).' };
  }
  return { registro: r };
}

export async function adicionarRegistro(t, r) {
  const abs = caminhoCSV(t);
  return comTrava(abs, async () => {
    let texto;
    try {
      texto = await fsp.readFile(abs, 'utf8');
    } catch {
      await fsp.writeFile(abs, CABECALHO_CSV.join(',') + '\n', { mode: 0o644, flag: 'wx' });
      texto = await fsp.readFile(abs, 'utf8');
    }
    if (!texto.trim()) texto = CABECALHO_CSV.join(',') + '\n';
    if (!texto.endsWith('\n')) texto += '\n';
    const linha = CABECALHO_CSV.map((c) => campoCSV(r[c])).join(',');
    await backupDoArquivo(t, 'registro-questoes.csv', abs);
    await gravarAtomico(abs, texto + linha + '\n');
    return linha;
  });
}

// permitido(registro) decide se quem pede pode apagar aquela linha (ex.: só os próprios cargos).
export async function removerRegistro(t, linha, hash, permitido = () => true) {
  const abs = caminhoCSV(t);
  return comTrava(abs, async () => {
    const texto = await fsp.readFile(abs, 'utf8');
    const linhas = texto.split('\n');
    if (!Number.isInteger(linha) || linha < 1 || linha >= linhas.length || hashLinha(linhas[linha]) !== hash) {
      throw new ErroHttp(409, 'O registro mudou depois que a página abriu.');
    }
    const cab = dividirCSV(linhas[0].replace(/\r$/, '')).map((c) => c.trim());
    const campos = dividirCSV(linhas[linha].replace(/\r$/, ''));
    const registro = Object.fromEntries(cab.map((c, j) => [c, (campos[j] ?? '').trim()]));
    if (!permitido(registro)) throw new ErroHttp(403, 'Você não pode remover este registro.');
    const removida = linhas.splice(linha, 1)[0];
    await backupDoArquivo(t, 'registro-questoes.csv', abs);
    await gravarAtomico(abs, linhas.join('\n'));
    return removida.replace(/\r$/, '');
  });
}
