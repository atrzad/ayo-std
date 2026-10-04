import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const env = process.env;
const lista = (s) => String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const expandir = (p) => p.replace(/^~(?=$|\/)/, os.homedir());

export const config = {
  raiz,
  porta: Number(env.PORTA || 3300),
  // Só a própria máquina acessa por padrão. Para abrir na rede (ex.: Tailscale), mude HOST e HOSTS_EXTRAS.
  host: env.HOST || '127.0.0.1',
  dataDir: path.resolve(expandir(env.DATA_DIR || '~/.local/share/ayo-std')),
  trilhasArquivo: path.resolve(raiz, expandir(env.TRILHAS || 'config/trilhas.json')),
  // Cabeçalho Host aceito (bloqueia DNS rebinding contra o servidor local).
  hosts: new Set(['localhost', '127.0.0.1', '[::1]', os.hostname().toLowerCase(), ...lista(env.HOSTS_EXTRAS)]),
  sessaoDias: Number(env.SESSAO_DIAS || 30),
  trustProxy: env.TRUST_PROXY === 'true' ? 'loopback' : false,
  cookieSeguro: env.COOKIE_SEGURO === 'true',
  backupsPorArquivo: Number(env.BACKUPS_POR_ARQUIVO || 50),
  backupsBanco: Number(env.BACKUPS_BANCO || 14),
  publicDir: path.join(raiz, 'public'),
};

// Dados privados: banco, sessões e backups só legíveis pelo dono.
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
