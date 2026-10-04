// Gera o cofre Obsidian da Trilha Dev a partir de dados/trilha-dev.json.
// Uso: npm run gerar-dev -- [pasta]   (padrão: ~/Documents/Trilha Dev)
// Nunca sobrescreve: se a nota já existe, ela é mantida (o progresso mora nas notas).
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const { FASES, TRILHAS, MODS, KIT } = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'dados/trilha-dev.json'), 'utf8'));
const pasta = path.resolve((process.argv[2] || '~/Documents/Trilha Dev').replace(/^~(?=$|\/)/, os.homedir()));
fs.mkdirSync(pasta, { recursive: true });

const horasFase = (n) => MODS.filter((m) => m.f === n).reduce((s, m) => s + m.h, 0);
const nomeArquivo = (f) => `Fase ${f.n} - ${f.nome}`;
// Identificadores que o Markdown leria como itálico ou tag viram código: *args, __init__, #include, { } [ ] ( )…
const seguro = (s) => s
  .replace(/(^|[\s(])(#[A-Za-z]\w*)/g, '$1`$2`')
  .replace(/(\*{1,2}[A-Za-z]\w*)/g, '`$1`')
  .replace(/(__\w+?__)/g, '`$1`')
  .replace(/((?:[{}[\]()<>=|&;]\s){4,}[{}[\]()<>=|&;]?)/g, (m) => '`' + m.trim() + '`');
const recurso = ([t, u, d]) => `- ${u ? `[${t}](${u})` : t}${d ? ` — ${d}` : ''}`;

function modulo(m) {
  const selos = (m.s || []).map((s) => ` · #${s}`).join('');
  return [
    `### ${m.id} · ${m.n}`,
    '',
    `${TRILHAS[m.t].n} · **${m.h} h**${selos}`,
    '',
    ...(m.w ? [`*${seguro(m.w)}*`, ''] : []),
    '**Tópicos**',
    '',
    ...m.k.map((k) => `- [ ] ${seguro(k)}`),
    '',
    '**Projeto**',
    '',
    `- [ ] ${seguro(m.p)}`,
    '',
    '**Recursos**',
    '',
    ...m.r.map(recurso),
    '',
    '> [!success] Pronto para seguir quando',
    `> ${seguro(m.ok)}`,
    '',
  ].join('\n');
}

function notaFase(f) {
  const ms = MODS.filter((m) => m.f === f.n);
  const sw = ms.filter((m) => !TRILHAS[m.t].hw);
  const hw = ms.filter((m) => TRILHAS[m.t].hw);
  const soma = (a) => a.reduce((s, m) => s + m.h, 0);
  return [
    '---',
    `fase: ${f.n}`,
    `cor: ${f.cor}`,
    `hex: "${f.hex}"`,
    `horas: ${horasFase(f.n)}`,
    '---',
    `# Fase ${f.n} — ${f.nome}`,
    '',
    `> ${f.sub}`,
    '',
    f.why,
    '',
    `Anterior: ${f.n > 0 ? `[[${nomeArquivo(FASES[f.n - 1])}]]` : '[[00 - Como usar]]'} · Próxima: ${f.n < 9 ? `[[${nomeArquivo(FASES[f.n + 1])}]]` : 'fim da trilha'}`,
    '',
    `## Tronco de software (${soma(sw)} h)`,
    '',
    ...sw.map(modulo),
    ...(hw.length ? [`## Hardware e sistemas, em paralelo (${soma(hw)} h)`, '', ...hw.map(modulo)] : []),
  ].join('\n');
}

function notaGuia() {
  const total = MODS.reduce((s, m) => s + m.h, 0);
  const itensKit = ([n, txt]) => [
    `### Fase ${n}`,
    '',
    ...txt.split(/;\s+|\.\s+(?=[A-ZÁÉÍÓÚ])/).map((x) => x.replace(/\.$/, '').trim()).filter(Boolean).map((x) => `- [ ] ${x.charAt(0).toUpperCase()}${x.slice(1)}`),
    '',
  ].join('\n');
  return [
    '---',
    'tipo: guia',
    '---',
    '# 00 — Como usar a Trilha Dev',
    '',
    `> Do elétron ao app: ${FASES.length} fases, ${MODS.length} módulos e cerca de ${total.toLocaleString('pt-BR')} horas, começando do zero.`,
    '',
    '## Regras',
    '',
    '- As horas são estimativas para aprender a fundo: ler, fazer os exercícios e terminar o projeto. Só assistir aula rende pouco.',
    '- Em cada fase, use cerca de 70% do tempo no tronco de software e 30% na trilha de hardware da mesma fase.',
    '- As fases 0 a 3 seguem a ordem à risca. A partir da 7, dá para trocar a ordem conforme o seu objetivo.',
    '- Todo módulo termina com um projeto feito sem tutorial e publicado no GitHub.',
    '- Só avance quando cumprir o critério “Pronto para seguir” do módulo.',
    '- No fim de cada fase, refaça do zero um projeto de uma fase anterior.',
    '- A cor de cada fase segue o código de cores de resistores (0 preto, 1 marrom, 2 vermelho…).',
    '',
    '## Fases',
    '',
    ...FASES.map((f) => `${f.n + 1}. [[${nomeArquivo(f)}]] — ${f.sub} · ${horasFase(f.n)} h`),
    '',
    '## Encaixe com os concursos',
    '',
    '- **Até 06/12/2026:** ENEM (08 e 15/11) e Manaus Previdência (06/12) vêm primeiro. Só a Fase 0, de 3 a 4 h por semana. Módulos com #MP também caem na prova de Técnico de Informática.',
    '- **De 07/12/2026 à prova do BB (prevista para 03/03/2027):** módulos com #BB cobrem o edital de Agente de Tecnologia (base 2022). Use como prática do edital, sem tirar horas das questões.',
    '- **Depois da prova do BB:** ritmo cheio, na ordem das fases.',
    '',
    '## Selos',
    '',
    '- #BB — conteúdo do edital de Agente de Tecnologia do BB (base 2022)',
    '- #MP — conteúdo da prova de Técnico de Informática da Manaus Previdência',
    '',
    '## Bancada: o que comprar e quando',
    '',
    'Não trabalhe com a rede elétrica (127/220 V) nem com baterias de lítio soltas.',
    '',
    ...KIT.map(itensKit),
  ].join('\n');
}

let criadas = 0;
function escrever(nome, conteudo) {
  const destino = path.join(pasta, `${nome}.md`);
  if (fs.existsSync(destino)) { console.log(`mantida: ${nome}.md`); return; }
  fs.writeFileSync(destino, conteudo + '\n', { mode: 0o644 });
  criadas++;
  console.log(`criada:  ${nome}.md`);
}

escrever('00 - Como usar', notaGuia());
for (const f of FASES) escrever(nomeArquivo(f), notaFase(f));
console.log(`${criadas} notas novas em ${pasta}`);
