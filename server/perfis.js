// Perfis de acesso (config/perfis.json): quais trilhas, quais arquivos, quais cargos e qual tema cada pessoa vê.
// Perfil desconhecido não vê nada: um erro de digitação nunca abre acesso total.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const NADA = { descricao: 'sem acesso', tema: 'normal', progresso: 'banco', trilhas: [] };
let PERFIS = { completo: { descricao: 'Tudo', tema: 'pixel', progresso: 'arquivo', trilhas: '*' } };

export function carregarPerfis() {
  const arq = path.join(config.raiz, 'config/perfis.json');
  if (fs.existsSync(arq)) PERFIS = JSON.parse(fs.readFileSync(arq, 'utf8'));
  for (const p of Object.values(PERFIS)) {
    p.excluirRe = p.excluirPadrao ? new RegExp(p.excluirPadrao, 'i') : null;
  }
  return PERFIS;
}

export const perfilDe = (usuario) => PERFIS[usuario?.perfil] || NADA;
export const nomesPerfis = () => Object.entries(PERFIS).map(([chave, p]) => ({ chave, descricao: p.descricao || chave }));
// A escolha da própria pessoa (configurações) vale mais que o padrão do perfil.
export const temaDe = (usuario) => ((usuario?.temaEscolhido || perfilDe(usuario).tema) === 'pixel' ? 'pixel' : 'normal');
export const PERFIL_CONTA_NOVA = 'pessoal';
export const gravaNasNotas = (usuario) => perfilDe(usuario).progresso === 'arquivo';

export function podeVerTrilha(usuario, slug) {
  const p = perfilDe(usuario);
  return p.trilhas === '*' || (Array.isArray(p.trilhas) && p.trilhas.includes(slug));
}

export function podeVerArquivo(usuario, slug, rel) {
  if (!podeVerTrilha(usuario, slug)) return false;
  const p = perfilDe(usuario);
  const ext = path.extname(rel).toLowerCase();
  if (p.extensoes && !p.extensoes.includes(ext)) return false;
  if (p.excluirRe && p.excluirRe.test(rel)) return false;
  if (p.excluirArquivos && p.excluirArquivos.includes(rel)) return false;
  return true;
}

// null = todos os cargos do estudos.json
export const cargosPermitidos = (usuario, slug) => perfilDe(usuario).cargos?.[slug] || null;
