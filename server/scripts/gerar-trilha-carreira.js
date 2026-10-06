// Gera o cofre Obsidian da Trilha Carreira a partir de dados/trilha-carreira.json.
// Uso: npm run gerar-carreira -- [pasta] [pasta-dos-curriculos]
//   padrão: ~/Documents/Trilha Carreira e ~/Documents/curriculo
// Nunca sobrescreve: nota ou PDF que já existe é mantido (o progresso mora nas notas).
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const { PARTES, VAGAS, MODS } = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'dados/trilha-carreira.json'), 'utf8'));
const expandir = (p) => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));
const pasta = expandir(process.argv[2] || '~/Documents/Trilha Carreira');
const pastaCurriculos = expandir(process.argv[3] || '~/Documents/curriculo');
const DEV = '~/Documents/Trilha Dev';
fs.mkdirSync(pasta, { recursive: true });

const CURRICULOS = {
  TEL: 'glaydson-oliveira-telecom.pdf',
  QA: 'glaydson-oliveira-qa.pdf',
  AUT: 'glaydson-oliveira-eldorado-automacao.pdf',
};
const linkCurriculo = (v) => `[${CURRICULOS[v]}](Currículos/${CURRICULOS[v]})`;

const horasParte = (n) => MODS.filter((m) => m.p === n).reduce((s, m) => s + m.h, 0);
const nomeArquivo = (p) => `Parte ${p.n} - ${p.nome}`;
const parteDe = (id) => PARTES.find((p) => p.n === MODS.find((m) => m.id === id).p);
// "C-01" → "C-01 ([[Parte 1 - Programação]])"; vários: "C-01, C-02 ([[…]])" agrupados por parte.
function refs(ids) {
  const porParte = new Map();
  for (const id of ids) {
    const p = parteDe(id);
    if (!porParte.has(p)) porParte.set(p, []);
    porParte.get(p).push(id);
  }
  return [...porParte].map(([p, lista]) => `${lista.join(', ')} em [[${nomeArquivo(p)}]]`).join('; ');
}
// Identificadores que o Markdown leria como itálico ou tag viram código: *args, __init__, #include…
const seguro = (s) => s
  .replace(/(^|[\s(])(#[A-Za-z]\w*)/g, '$1`$2`')
  .replace(/(\*{1,2}[A-Za-z]\w*)/g, '`$1`')
  .replace(/(__\w+?__)/g, '`$1`');
const recurso = ([t, u, d]) => `- ${u ? `[${t}](${u})` : t}${d ? ` — ${d}` : ''}`;

function modulo(m) {
  const selos = m.v.map((v) => `#${v}`).join(' ');
  return [
    `### ${m.id} · ${m.n}`,
    '',
    `**${m.h} h** · ${selos}`,
    '',
    `*${seguro(m.w)}*`,
    '',
    '**Revisão rápida** — o mínimo para a véspera da entrevista',
    '',
    ...m.r.map((k) => `- [ ] ${seguro(k)}`),
    '',
    '**Tópicos**',
    '',
    ...m.k.map((k) => `- [ ] ${seguro(k)}`),
    '',
    '**Projeto**',
    '',
    `- [ ] ${seguro(m.proj)}`,
    '',
    '**Recursos**',
    '',
    ...m.rec.map(recurso),
    '',
    ...(m.dev.length ? [
      '**Para aprofundar na Trilha Dev**',
      '',
      ...m.dev.map(([nota, mods]) => `- ${mods} em \`${DEV}/${nota}.md\``),
      '',
    ] : []),
    '> [!success] Pronto para seguir quando',
    `> ${seguro(m.ok)}`,
    '',
  ].join('\n');
}

function notaParte(p) {
  const ms = MODS.filter((m) => m.p === p.n);
  const anterior = p.n > 1 ? `[[${nomeArquivo(PARTES[p.n - 2])}]]` : '[[01 - Vagas e currículos]]';
  const proxima = p.n < PARTES.length ? `[[${nomeArquivo(PARTES[p.n])}]]` : 'fim da trilha';
  return [
    '---',
    `parte: ${p.n}`,
    `hex: "${p.hex}"`,
    `horas: ${horasParte(p.n)}`,
    '---',
    `# Parte ${p.n} — ${p.nome}`,
    '',
    `> ${p.sub}`,
    '',
    p.why,
    '',
    `Anterior: ${anterior} · Próxima: ${proxima}`,
    '',
    `## Módulos (${horasParte(p.n)} h)`,
    '',
    ...ms.map(modulo),
  ].join('\n');
}

function notaGuia() {
  const total = MODS.reduce((s, m) => s + m.h, 0);
  return [
    '---',
    'tipo: guia',
    '---',
    '# 00 — Como usar a Trilha Carreira',
    '',
    `> Tudo o que as vagas de estágio em testes, automação e Android pedem, e o que você precisa para sustentar cada linha dos seus currículos: ${PARTES.length} partes, ${MODS.length} módulos e cerca de ${total} horas.`,
    '',
    '## Regras',
    '',
    '- Cada módulo começa pela **Revisão rápida**: o mínimo para revisar na véspera de uma entrevista. Os tópicos aprofundam.',
    '- Marque as tarefas aqui no Obsidian ou no Ayo Std. A nota é a fonte da verdade.',
    '- Todo projeto vai para o GitHub **glwydson** (o seu perfil profissional), com README e CI.',
    '- Use o Ayo Música como laboratório: casos de teste, automação, evidências e causa raiz.',
    '- Quando o assunto existe na Trilha Dev, o módulo aponta para lá. Aqui fica a versão para entrevista; a Trilha Dev aprofunda.',
    '- Chegou uma vaga nova? Acrescente uma seção em [[01 - Vagas e currículos]] e ligue os requisitos aos módulos.',
    '',
    '## Partes',
    '',
    ...PARTES.map((p) => `${p.n}. [[${nomeArquivo(p)}]] — ${p.sub} · ${horasParte(p.n)} h`),
    '',
    '## Rota rápida até 24/11/2026 (inscrição no Eldorado)',
    '',
    'Até 06/12 o ENEM (08 e 15/11) e a Manaus Previdência vêm primeiro. Use cerca de 3 h por semana, só com:',
    '',
    `1. Instalar e usar o Gemini Code Assist — ${refs(['C-13'])}`,
    `2. Revisão rápida de Java — ${refs(['C-01', 'C-02'])}`,
    `3. Revisão rápida de Android e automação — ${refs(['C-08', 'C-09'])}`,
    '4. Começar o projeto do C-01 (Java) e publicar no glwydson, mesmo pequeno',
    `5. Apresentação de 1 minuto em inglês — ${refs(['C-15'])}`,
    '',
    '## Depois de 06/12',
    '',
    'Ritmo cheio, na ordem das partes, dividindo as horas com o plano do BB (de 07/12 até a prova, prevista para março de 2027). A projeção na página da trilha começa em 07/12; ajuste o ritmo lá.',
    '',
    '## Selos',
    '',
    ...Object.entries(VAGAS).map(([v, nome]) => `- #${v} — ${nome}`),
    '',
    '## Mapa: vaga → módulos',
    '',
    '| Vaga | Módulos essenciais | Currículo |',
    '| --- | --- | --- |',
    `| ${VAGAS.TEL} | C-03, C-04, C-08, C-09, C-11, C-12 | ${linkCurriculo('TEL')} |`,
    `| ${VAGAS.QA} | C-05, C-06, C-07, C-08 | ${linkCurriculo('QA')} |`,
    `| ${VAGAS.AUT} | C-01, C-02, C-03, C-09, C-10, C-13 | ${linkCurriculo('AUT')} |`,
    '',
    'Todas as vagas: C-14 (Git e CI), C-15 (inglês) e C-16 (entrevista).',
  ].join('\n');
}

function notaVagas() {
  const vaga = ({ v, titulo, info, requisitos, perguntas }) => [
    `## ${titulo}`,
    '',
    `#${v} · currículo: ${linkCurriculo(v)}`,
    '',
    ...info.map((l) => `- ${l}`),
    '',
    '### Requisitos e onde estudar',
    '',
    ...requisitos.map(([texto, ids]) => `- [ ] ${texto}${ids.length ? ` — ${refs(ids)}` : ''}`),
    '',
    '### Consigo responder',
    '',
    ...perguntas.map((q) => `- [ ] ${q}`),
    '',
  ].join('\n');
  return [
    '---',
    'tipo: vagas',
    '---',
    '# 01 — Vagas e currículos',
    '',
    '> As vagas de 2026, o que cada uma pede e o que você ainda precisa conseguir mostrar. Marque um requisito quando conseguir prová-lo com um projeto ou uma resposta.',
    '',
    'Os PDFs ficam em `Currículos/` neste cofre. Os arquivos editáveis (.html) ficam em `~/Documents/curriculo`.',
    '',
    vaga({
      v: 'TEL', titulo: VAGAS.TEL,
      info: [
        'Formação: cursando Engenharia (Elétrica, Telecomunicações, Computação, Software, Eletrônica), Ciência da Computação ou afins; desejável a partir do 5º período (você está no 3º).',
        'Atividades: testes de software para smartphones Android em laboratório de telecom; operar e parametrizar analisadores de protocolo 2G a 5G; manter softwares de automação em Linux; testes, análises e validações.',
        'Idioma: inglês intermediário.',
      ],
      requisitos: [
        ['Lógica de programação', ['C-01', 'C-03']],
        ['Conhecimento básico em desenvolvimento de software (Ayo Música, Repo Manager)', []],
        ['Interesse por telecom e redes móveis (residência do Eldorado)', ['C-12']],
        ['Diferencial: automação de testes', ['C-09']],
        ['Diferencial: protocolos de redes celulares 2G a 5G', ['C-12']],
        ['Diferencial: C/C++ ou Python', ['C-03', 'C-04']],
        ['Diferencial: automação em Linux', ['C-11']],
        ['Inglês intermediário', ['C-15']],
      ],
      perguntas: [
        'Como você integrou o whisper.cpp e o Chromaprint ao app Android via NDK/JNI?',
        'O que você testava no emulador com o ADB, e como?',
        'O que você aprendeu na residência de redes celulares do Eldorado?',
        'Qual a diferença entre a arquitetura do 4G e a do 5G?',
        'O que o Repo Manager faz e por que ele é em C?',
      ],
    }),
    vaga({
      v: 'QA', titulo: VAGAS.QA,
      info: [
        'Presencial, Manaus. Formação: Ciência da Computação, Engenharia de Software ou da Computação, Sistemas de Informação ou afins, a partir do 3º período (você atende).',
        'Atividades: validação de testes, teste de software, análise de requisitos e gerenciamento de projetos; testes caixa-preta, funcionais, de aceitação e exploratórios; report e acompanhamento de bugs.',
        'Idioma: inglês intermediário.',
      ],
      requisitos: [
        ['Noções dos conceitos de testes', ['C-05']],
        ['Execução de testes mobile', ['C-08']],
        ['Habilidade de usuário em Android', ['C-08']],
        ['Report e acompanhamento de bugs', ['C-06']],
        ['Análise de requisitos', ['C-07']],
        ['Scrum e Kanban', ['C-07']],
        ['Inglês intermediário', ['C-15']],
      ],
      perguntas: [
        'Qual a diferença entre teste caixa-preta e caixa-branca? Dê um exemplo.',
        'Como você reportaria um bug que só acontece às vezes?',
        'Dê um exemplo de bug com severidade alta e prioridade baixa.',
        'Como era a validação em produção na NHN e o que os testes com Playwright cobriam?',
        'Como você testou o Ayo Música no emulador?',
        'O que você faz quando o desenvolvedor diz que o bug "não é bug"?',
      ],
    }),
    vaga({
      v: 'AUT', titulo: VAGAS.AUT,
      info: [
        'Remoto. Inscrições até 24/11/2026. Formação: Ciência da Computação, Engenharia da Computação ou de Software, Sistemas de Informação ou afins.',
        'Atividades: automação de testes para smartphones Android; ferramentas e scripts de coleta, processamento e análise de dados; automatizar validação, captura de evidências e relatórios; investigar falhas e apoiar a análise de causa raiz; Java, Python e Android; Gemini Code Assist no dia a dia.',
        'Idioma: inglês avançado (o seu hoje é intermediário).',
      ],
      requisitos: [
        ['Java, com um projeto público no glwydson', ['C-01', 'C-02']],
        ['Python', ['C-03']],
        ['Plataforma Android e as ferramentas de desenvolvimento', ['C-08']],
        ['Uso comprovado de IA no desenvolvimento, especialmente o Gemini Code Assist', ['C-13']],
        ['Lógica, orientação a objetos e estruturas de dados', ['C-01']],
        ['Inglês avançado', ['C-15']],
        ['Diferencial: Git e controle de versão', ['C-14']],
        ['Diferencial: frameworks de automação de testes', ['C-02', 'C-09']],
        ['Diferencial: IA ou análise de dados (whisper.cpp e Chromaprint no Ayo Música)', ['C-03']],
      ],
      perguntas: [
        'Como você automatizou testes no emulador do Ayo Música (ADB, capturas de tela, smoke tests)?',
        'Conte a investigação do travamento com 12 mil músicas.',
        'Como funciona o relatório de erros do app (registro de falhas e logs)?',
        'Como você usa IA no desenvolvimento, e quando ela errou?',
        'Explique os quatro pilares da orientação a objetos em Java.',
        'O que roda no CI do Ayo Música?',
      ],
    }),
    '## Pendências dos currículos',
    '',
    '- [ ] Corrigir o link do LinkedIn no README do perfil glwydson (aponta para /in/glwydson; o certo é /in/glaydson-oliveira)',
    '- [ ] Publicar no glwydson um projeto Android ou de automação (o Ayo Música é privado e o recrutador não consegue abrir)',
    '- [ ] Publicar no glwydson um projeto em Java (o projeto do C-01)',
    '- [ ] Atualizar os currículos quando terminar uma parte desta trilha',
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
escrever('01 - Vagas e currículos', notaVagas());
for (const p of PARTES) escrever(nomeArquivo(p), notaParte(p));

const destinoCv = path.join(pasta, 'Currículos');
fs.mkdirSync(destinoCv, { recursive: true });
for (const nome of Object.values(CURRICULOS)) {
  const origem = path.join(pastaCurriculos, nome);
  const destino = path.join(destinoCv, nome);
  if (fs.existsSync(destino)) { console.log(`mantido: Currículos/${nome}`); continue; }
  if (!fs.existsSync(origem)) { console.warn(`não achei ${origem}`); continue; }
  fs.copyFileSync(origem, destino);
  fs.chmodSync(destino, 0o644);
  console.log(`copiado: Currículos/${nome}`);
}
console.log(`${criadas} notas novas em ${pasta}`);
