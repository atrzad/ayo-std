import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import {
  db, lerAjuste, gravarAjuste, registrarEvento, eventosRecentes, podarEventos, backupDoBanco, feitasNoBanco, marcarNoBanco,
  registrarConsentimento,
} from './db.js';
import {
  autenticar, criarSessao, encerrarSessao, carregarSessao, criarUsuario, existeUsuario, usuarioExiste, listarUsuarios,
  renomearUsuario, conferirSenhaDoUsuario, trocarSenhaPorId, redefinirSenha, removerUsuario,
  validarUsuario, validarSenha, esperaBloqueio, registrarFalha, limparFalhas, limparSessoesExpiradas,
  validarArroba, arrobaExiste, validarEmail, emailExiste, validarNome, criarConta, criarTokenEmail, consumirTokenEmail,
  emailPendenteDe, confirmarManualmente, dadosDaConta, definirPerfilPublico, definirTema, limparConvitePendente, permitir,
} from './auth.js';
import {
  ErroHttp, carregarTrilhas, listarTrilhas, acharTrilha, listarNotas, listarArquivos, lerNota, caminhoSeguro,
  alternarTarefa, lerEstudos, lerRegistros, temRegistro, validarRegistro, adicionarRegistro, removerRegistro, EXT_SERVIDAS, RE_TAREFA,
} from './cofres.js';
import {
  carregarPerfis, nomesPerfis, temaDe, gravaNasNotas, podeVerTrilha, podeVerArquivo, cargosPermitidos, PERFIL_CONTA_NOVA,
} from './perfis.js';
import * as grupo from './grupo.js';
import * as espaco from './espaco.js';
import { enviarConfirmacao, emailConfigurado, urlPublica } from './email.js';
import * as foco from './foco.js';
import * as caderno from './caderno.js';
import { renderizarNota, renderizarTexto, renderizarEspacoNota } from './markdown.js';
import { resumir, hojeISO, diasEntre, dataBR, somarDias, nomeCargo } from './resumo.js';
import {
  paginaEntrar, paginaInicio, paginaTrilha, paginaNota, paginaErro, paginaFoco, paginaConfiguracoes, paginaCaderno, paginaCadernoEditor,
  paginaMensagem, paginaConvite, paginaConviteManual, paginaCriarConta, paginaGrupo, paginaMembro, paginaPrivacidade,
  paginaEspacos, paginaEspaco, paginaEspacoNota, paginaEspacoNotaEditar,
} from './paginas.js';

process.umask(0o077);
carregarTrilhas();
carregarPerfis();

// ---------- manutenção ----------
function manutencao() {
  try {
    limparSessoesExpiradas();
    podarEventos();
    backupDoBanco();
  } catch (e) {
    console.error('[manutencao]', e);
  }
}
manutencao();
setInterval(manutencao, 6 * 60 * 60 * 1000).unref();

// ---------- o que cada pessoa vê ----------

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const mesAno = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;

const trilhasDe = (u) => listarTrilhas().filter((t) => podeVerTrilha(u, t.slug));
// Trilhas para escolher no pomodoro/caderno: cofres permitidos + trilhas do próprio espaço.
const trilhasTodas = (u) => [
  ...trilhasDe(u),
  ...espaco.listarEspacos(u.id).map((e) => ({
    slug: espaco.slugEspaco(e.id), nome: e.nome, curto: e.nome.length > 14 ? `${e.nome.slice(0, 13)}…` : e.nome, espaco: true, cor: e.cor,
  })),
];
const slugsDe = (u) => trilhasTodas(u).map((t) => t.slug);
const nomeDaTrilha = (u) => { const m = new Map(trilhasTodas(u).map((t) => [t.slug, t.nome])); return (slug) => m.get(slug) || 'Outra trilha'; };
// No mural, o nome da trilha é o que o dono da sessão escolheu compartilhar (cofre ou trilha do espaço dele).
function nomeTrilhaCompartilhada(slug) {
  const t = acharTrilha(slug);
  if (t) return t.nome;
  const id = espaco.idDoSlug(slug);
  return (id && db.prepare('SELECT nome FROM espacos WHERE id = ?').get(id)?.nome) || 'Trilha';
}

function exigirTrilha(req) {
  const t = acharTrilha(req.params.slug);
  if (!t || !podeVerTrilha(req.usuario, t.slug)) throw new ErroHttp(404, 'Trilha não encontrada.');
  return t;
}

// Notas visíveis; para quem não grava nas notas, "feitas" vem do progresso próprio no banco.
async function notasDe(u, t) {
  const notas = (await listarNotas(t)).filter((n) => podeVerArquivo(u, t.slug, n.rel));
  if (gravaNasNotas(u)) return notas;
  return notas.map((n) => {
    const feitasSet = feitasNoBanco(u.id, t.slug, n.rel);
    return { ...n, feitas: n.chaves.filter((c) => feitasSet.has(c)).length };
  });
}

const arquivosDe = async (u, t) => (await listarArquivos(t)).filter((a) => podeVerArquivo(u, t.slug, a.rel));

function estudosDe(u, t, estudos) {
  const cs = cargosPermitidos(u, t.slug);
  if (!estudos || !cs) return estudos;
  return { ...estudos, cargos: Object.fromEntries(Object.entries(estudos.cargos || {}).filter(([c]) => cs.includes(c))) };
}

async function registrosDe(u, t) {
  const rs = await lerRegistros(t);
  const cs = cargosPermitidos(u, t.slug);
  return rs && cs ? rs.filter((r) => cs.includes(r.cargo)) : rs;
}

function projecao(t, notas) {
  const comHoras = notas.filter((n) => Number(n.meta.horas) > 0);
  if (!comHoras.length) return null;
  const ajuste = lerAjuste(`projecao:${t.slug}`, {});
  const ritmo = [5, 8, 10, 15, 20, 25, 30, 40].includes(ajuste.ritmo) ? ajuste.ritmo : 15;
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(ajuste.inicio || '') ? ajuste.inicio : (t.inicioPadrao || hojeISO());
  const hoje = hojeISO();
  const partida = inicio > hoje ? inicio : hoje;
  let acumulado = 0;
  let total = 0;
  const porNota = new Map();
  for (const n of comHoras) {
    const h = Number(n.meta.horas);
    total += h;
    const resta = n.total ? h * (1 - n.feitas / n.total) : h;
    acumulado += resta;
    porNota.set(n.rel, resta < 0.5 ? 'concluída' : `até ${mesAno(somarDias(partida, Math.ceil((acumulado / ritmo) * 7)))}`);
  }
  const semanas = acumulado / ritmo;
  return { ritmo, inicio, total, restantes: acumulado, semanas, fim: somarDias(partida, Math.ceil(semanas * 7)), porNota };
}

async function infoTrilha(u, t) {
  const notas = await notasDe(u, t);
  let feitas = 0;
  let total = 0;
  for (const n of notas) { feitas += n.feitas; total += n.total; }
  const proj = gravaNasNotas(u) ? projecao(t, notas) : null;
  const pct = proj ? (100 * (proj.total - proj.restantes)) / proj.total : total ? (100 * feitas) / total : 0;
  const estudos = estudosDe(u, t, await lerEstudos(t));
  const hoje = hojeISO();
  const pixel = temaDe(u) === 'pixel';
  let chamado = '';
  let linhaPrazo = '';
  if (estudos?.prova) {
    const dias = diasEntre(hoje, estudos.prova);
    if (estudos.inicio && hoje < estudos.inicio && t.antesDoInicio) {
      const diasInicio = diasEntre(hoje, estudos.inicio);
      chamado = pixel
        ? t.antesDoInicio.replace('{dias}', diasInicio).replace('{data}', dataBR(estudos.inicio))
        : `O plano começa em ${dataBR(estudos.inicio)} (faltam ${diasInicio} dias). Prova prevista para ${dataBR(estudos.prova)}.`;
      linhaPrazo = `Plano começa em ${dataBR(estudos.inicio)} · prova em ${dataBR(estudos.prova)}`;
    } else if (dias >= 0) {
      chamado = pixel ? (t.chamado || 'Faltam {dias} dias para a prova.').replace('{dias}', dias)
        : `Prova em ${dataBR(estudos.prova)}: faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}.`;
      linhaPrazo = `Prova em ${dataBR(estudos.prova)} · ${dias === 0 ? 'é hoje' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`}`;
    } else {
      chamado = `A prova foi em ${dataBR(estudos.prova)}.`;
      linhaPrazo = chamado;
    }
  } else if (proj) {
    chamado = proj.restantes < 0.5 ? 'Chefe final derrotado.' : `Chefe final previsto para ${mesAno(proj.fim)}, a ${proj.ritmo} h por semana.`;
    linhaPrazo = proj.restantes < 0.5 ? 'Trilha concluída' : `Fim previsto: ${mesAno(proj.fim)} a ${proj.ritmo} h/semana`;
  }
  return { notas, feitas, total, pct, proj, estudos, chamado, linhaPrazo };
}

async function contarAlmas(u) {
  let n = 0;
  for (const t of trilhasDe(u)) for (const nota of await notasDe(u, t)) n += nota.feitas;
  return n;
}

const GENERICOS = /^(tronco de software|hardware e sistemas|regras|fases|selos|encaixe|bancada|t[óo]picos|projeto|recursos|como |metas|datas|arquivos|fontes)/i;
async function assuntosDe(u, t) {
  const notas = await notasDe(u, t);
  const regs = (await registrosDe(u, t)) || [];
  const lista = [...foco.assuntosUsados(u.id, t.slug), ...regs.map((r) => r.materia).reverse(), ...notas.flatMap((n) => n.secoes)];
  return [...new Set(lista.map((s) => s.trim()).filter((s) => s && s.length <= 100 && !GENERICOS.test(s)))].slice(0, 200);
}

async function comum(req) {
  const u = req.usuario;
  return { usuario: u, trilhas: trilhasTodas(u), almas: temaDe(u) === 'pixel' ? await contarAlmas(u) : null, foco: foco.sessaoAtiva(u.id) };
}

const textoEvento = (e) => ({ ...e, texto: e.detalhe });

// ---------- app ----------

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

const ehLocal = (req) => {
  const ip = req.socket.remoteAddress || '';
  const host = (req.hostname || '').toLowerCase();
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)
    && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)
    && !req.headers['x-forwarded-for'] && !req.headers['tailscale-user-login'];
};

// Host desconhecido = possível DNS rebinding; nem chega às rotas.
app.use((req, res, next) => {
  const bruto = String(req.headers.host || '').toLowerCase();
  const host = bruto.startsWith('[') ? bruto.slice(0, bruto.indexOf(']') + 1) : bruto.split(':')[0];
  if (!config.hosts.has(host)) return res.status(421).type('text').send('Host não permitido.');
  next();
});

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; " +
      "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  });
  // Pela internet (Tailscale Funnel) só existe HTTPS: o navegador passa a recusar HTTP para este endereço.
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});

app.get('/saude', (req, res) => res.json({ ok: true }));

app.use('/fonts', express.static(path.join(config.publicDir, 'fonts'), { immutable: true, maxAge: '365d', index: false }));
app.use(express.static(config.publicDir, { index: false, cacheControl: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

app.use(carregarSessao);
app.use((req, res, next) => {
  if (req.usuario) req.usuario.tema = temaDe(req.usuario);
  next();
});

// CSRF: além do cookie SameSite=Strict, toda escrita precisa vir da mesma origem e com um cabeçalho próprio.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origem = req.headers.origin;
  if (origem) {
    let host = null;
    try { host = new URL(origem).host; } catch {}
    if (host !== req.headers.host) return res.status(403).json({ erro: 'Origem não permitida.' });
  }
  if (req.headers['x-ayo'] !== '1') return res.status(403).json({ erro: 'Requisição inválida.' });
  next();
});
// O caderno manda desenhos inteiros (traços da caneta); o resto da API aceita pouco.
app.use('/api/caderno', express.json({ limit: '5mb' }));
app.use('/api', express.json({ limit: '20kb' }));

// ---------- entrada ----------

app.get('/entrar', (req, res) => {
  if (req.usuario) return res.redirect(303, '/');
  if (!existeUsuario()) return res.redirect(303, '/configurar');
  // depois do login, só volta para páginas de convite ou do grupo (nada de redirecionar para fora)
  const voltar = /^\/(convite\/[A-Za-z0-9]{1,16}|grupo)$/.test(String(req.query.voltar || '')) ? String(req.query.voltar) : '';
  res.send(paginaEntrar({ voltar }));
});

app.get('/configurar', (req, res) => {
  if (existeUsuario()) return res.redirect(303, req.usuario ? '/' : '/entrar');
  res.send(paginaEntrar({ primeira: true, local: ehLocal(req) }));
});

app.post('/api/configurar', async (req, res) => {
  if (existeUsuario()) return res.status(409).json({ erro: 'O usuário já foi criado. Entre pela tela de login.' });
  if (!ehLocal(req)) return res.status(403).json({ erro: 'A primeira configuração só pode ser feita nesta máquina.' });
  const { usuario, senha, confirmacao } = req.body ?? {};
  const erro = validarUsuario(String(usuario || '').trim()) || validarSenha(senha) || (senha !== confirmacao ? 'As senhas não são iguais.' : null);
  if (erro) return res.status(400).json({ erro });
  const id = await criarUsuario(usuario.trim(), senha, { dono: true });
  criarSessao(req, res, id);
  registrarEvento({ usuarioId: id, tipo: 'conta', detalhe: 'Acendeu a primeira fogueira' });
  res.json({ ok: true });
});

app.post('/api/entrar', async (req, res) => {
  const espera = esperaBloqueio(req.ip);
  if (espera) {
    res.set('Retry-After', String(espera));
    return res.status(429).json({ erro: `Muitas tentativas. Tente de novo em ${Math.ceil(espera / 60)} min.` });
  }
  const { usuario, senha } = req.body ?? {};
  if (typeof usuario !== 'string' || typeof senha !== 'string' || !usuario.trim() || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }
  const u = await autenticar(usuario.trim(), senha.slice(0, 200));
  if (!u) {
    registrarFalha(req.ip);
    return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
  }
  limparFalhas(req.ip);
  if (u.pendente) return res.status(403).json({ erro: 'Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada (e no spam).', pendente: true });
  criarSessao(req, res, u.id);
  res.json({ ok: true });
});

app.post('/api/sair', (req, res) => {
  encerrarSessao(req, res);
  res.json({ ok: true });
});


// ---------- públicas: privacidade, cookies, convites, cadastro e confirmação de e-mail ----------

app.get('/privacidade', (req, res) => res.send(paginaPrivacidade({ usuario: req.usuario || null })));

app.post('/api/cookies', (req, res) => {
  if (req.usuario) registrarConsentimento(req.usuario.id, 'cookies', 'essenciais');
  res.json({ ok: true });
});

app.get('/convite', (req, res) => res.send(paginaConviteManual({ usuario: req.usuario || null })));

app.post('/api/convite/validar', (req, res) => {
  if (!permitir(`convite:${req.ip}`, 10, 15 * 60_000)) throw new ErroHttp(429, 'Muitas tentativas. Espere 15 minutos.');
  const c = grupo.conviteValido(req.body?.codigo);
  if (!c) throw new ErroHttp(404, 'Código inválido, expirado ou já usado.');
  res.json({ ok: true, codigo: c.codigo });
});

app.get('/convite/:codigo', (req, res) => {
  const c = grupo.conviteValido(req.params.codigo);
  const m = req.usuario ? grupo.membroDe(req.usuario.id) : null;
  if (c && m?.grupo_id === c.grupo_id) return res.redirect(303, '/grupo');
  res.send(paginaConvite({ usuario: req.usuario || null, convite: c, codigo: grupo.normalizarCodigo(req.params.codigo), grupoAtual: m?.grupo_nome || null }));
});

app.get('/criar-conta', (req, res) => {
  if (req.usuario) return res.redirect(303, '/');
  const codigo = grupo.normalizarCodigo(req.query.convite);
  res.send(paginaCriarConta({ convite: codigo ? grupo.conviteValido(codigo) : null, codigo, emailAtivo: emailConfigurado() }));
});

app.post('/api/criar-conta', async (req, res) => {
  if (!permitir(`cadastro:${req.ip}`, 5, 60 * 60_000)) throw new ErroHttp(429, 'Muitos cadastros deste endereço. Tente de novo em 1 hora.');
  const b = req.body ?? {};
  const c = grupo.conviteValido(b.convite);
  if (!c) throw new ErroHttp(400, 'O convite é inválido, expirou ou já foi usado. Peça um novo.');
  const nome = String(b.nome || '').trim();
  const arroba = String(b.arroba || '').trim().toLowerCase().replace(/^@/, '');
  const email = String(b.email || '').trim().toLowerCase();
  const erro = validarNome(nome) || validarArroba(arroba) || validarEmail(email) || validarSenha(b.senha)
    || (b.senha !== b.confirmacao ? 'As senhas não são iguais.' : null)
    || (b.aceite !== true ? 'Para criar a conta, aceite os termos e a política de privacidade.' : null);
  if (erro) throw new ErroHttp(400, erro);
  if (arrobaExiste(arroba)) throw new ErroHttp(409, 'Esse @ já está em uso. Escolha outro.');
  if (emailExiste(email)) throw new ErroHttp(409, 'Já existe uma conta com esse e-mail.');
  const id = await criarConta({ nome, arroba, senha: b.senha, perfil: PERFIL_CONTA_NOVA, convite: c.codigo });
  if (!grupo.usarConvite(c.codigo)) {
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    throw new ErroHttp(409, 'O convite acabou de ser usado por outra pessoa. Peça um novo.');
  }
  registrarConsentimento(id, 'termos-privacidade', 'aceitou no cadastro');
  if (b.cookies === true) registrarConsentimento(id, 'cookies', 'essenciais');
  const enviado = await enviarConfirmacao({ para: email, nome, token: criarTokenEmail(id, email), motivo: 'conta' });
  res.json({ ok: true, enviado, email });
});

app.post('/api/reenviar-confirmacao', async (req, res) => {
  const login = String(req.body?.login || '').trim().toLowerCase().replace(/^@/, '').slice(0, 200);
  // resposta sempre igual: não revela se a conta existe
  if (login && permitir(`reenvio:${req.ip}`, 5, 60 * 60_000) && permitir(`reenvio:${login}`, 3, 60 * 60_000)) {
    const u = db.prepare('SELECT id, nome FROM usuarios WHERE (arroba = ? OR usuario = ? COLLATE NOCASE) AND confirmacao_pendente = 1').get(login, login);
    const email = u && emailPendenteDe(u.id);
    if (email) await enviarConfirmacao({ para: email, nome: u.nome, token: criarTokenEmail(u.id, email), motivo: 'conta' });
  }
  res.json({ ok: true });
});

app.get('/confirmar-email/:token', (req, res) => {
  const r = consumirTokenEmail(req.params.token);
  if (!r) return res.status(400).send(paginaMensagem({ titulo: 'Link inválido ou expirado', texto: 'Este link de confirmação não vale mais. Na tela de entrada, use “Reenviar e-mail de confirmação” para receber outro.', links: [['/entrar', 'Ir para a entrada']] }));
  if (r.erro) return res.status(409).send(paginaMensagem({ titulo: 'Não deu para confirmar', texto: r.erro, links: [['/entrar', 'Ir para a entrada']] }));
  if (r.convite_pendente) {
    const g = grupo.grupoDoCodigo(r.convite_pendente);
    try { if (g) grupo.entrarNoGrupo(r.id, g); } catch {}
    limparConvitePendente(r.id);
  }
  if (!req.usuario || req.usuario.id !== r.id) criarSessao(req, res, r.id);
  registrarEvento({ usuarioId: r.id, tipo: 'conta', detalhe: 'Confirmou o e-mail' });
  res.send(paginaMensagem({ titulo: 'E-mail confirmado', texto: 'Tudo certo. Sua conta está ativa.', links: [['/grupo', 'Ver o grupo de estudos'], ['/', 'Ir para o início']] }));
});

// ---------- daqui para baixo, só com login ----------

app.use((req, res, next) => {
  if (req.usuario) return next();
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ erro: 'Sua sessão terminou. Entre de novo.' });
  res.redirect(303, existeUsuario() ? '/entrar' : '/configurar');
});

// Senha provisória: só a página da conta abre até a pessoa criar a própria senha.
app.use((req, res, next) => {
  if (!req.usuario.trocarSenha) return next();
  if (['/conta', '/configuracoes', '/api/conta/senha', '/api/sair', '/privacidade', '/api/cookies'].includes(req.path)) return next();
  if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ erro: 'Crie a sua senha na página Conta antes de continuar.' });
  res.redirect(303, '/configuracoes');
});

const relDaRota = (req) => (Array.isArray(req.params.caminho) ? req.params.caminho.join('/') : String(req.params.caminho || ''));

app.get('/', async (req, res) => {
  const u = req.usuario;
  const totais = foco.totais(u.id);
  const cards = [];
  for (const t of trilhasDe(u)) {
    const info = await infoTrilha(u, t);
    let semana = '';
    if (info.estudos) {
      const resumo = resumir(info.estudos, await registrosDe(u, t));
      const c = resumo?.cargos?.[0];
      if (resumo && resumo.semanaAtual >= 1 && c) {
        semana = `S${resumo.semanaAtual}: ${c.atual?.q || 0}${c.atual?.metaQ ? ` de ${c.atual.metaQ}` : ''} questões · ${c.nome}`;
      }
    }
    const f = totais.porTrilha[t.slug];
    cards.push({
      slug: t.slug, nome: t.nome, mundo: t.mundo || t.nome, prova: info.estudos?.prova || null,
      provaNome: t.provaNome || t.nome, linhaPrazo: info.linhaPrazo, pct: info.pct, feitas: info.feitas, total: info.total, semana,
      focoSemana: f ? foco.formatarDuracao(f.semanaS) : null,
    });
  }
  for (const e of espaco.listarEspacos(u.id)) {
    const pr = espaco.progressoDoEspaco(u.id, e.id);
    const f = totais.porTrilha[espaco.slugEspaco(e.id)];
    cards.push({
      slug: espaco.slugEspaco(e.id), href: `/espaco/${e.id}`, cor: e.cor, espaco: true, nome: e.nome, mundo: e.nome,
      linhaPrazo: e.descricao || 'Trilha do seu espaço', pct: pr.pct, feitas: pr.feitas, total: pr.total, semana: '',
      focoSemana: f ? foco.formatarDuracao(f.semanaS) : null,
    });
  }
  const eventos = eventosRecentes(u.id, 10).map(textoEvento);
  const m = grupo.membroDe(u.id);
  res.send(paginaInicio({ ...(await comum(req)), cards, eventos, totais, streak: grupo.streakDe(u.id), grupoNome: m?.grupo_nome || null }));
});

app.get('/t/:slug', async (req, res) => {
  const u = req.usuario;
  const t = exigirTrilha(req);
  const info = await infoTrilha(u, t);
  const arquivos = await arquivosDe(u, t);
  const registros = info.estudos ? await registrosDe(u, t) : null;
  const resumo = info.estudos ? resumir(info.estudos, registros) : null;
  const tot = foco.totais(u.id).porTrilha[t.slug] || null;
  res.send(paginaTrilha({
    ...(await comum(req)), t, info, notas: info.notas, arquivos, estudos: info.estudos, resumo, registros,
    proj: info.proj, eventos: eventosRecentes(u.id, 8, t.slug).map(textoEvento), temCSV: await temRegistro(t), focoTrilha: tot,
  }));
});

app.get('/t/:slug/n/*caminho', async (req, res) => {
  const u = req.usuario;
  const t = exigirTrilha(req);
  const rel = relDaRota(req);
  if (!podeVerArquivo(u, t.slug, rel)) throw new ErroHttp(404, 'Nota não encontrada.');
  const notaBruta = await lerNota(t, rel);
  const feitasBanco = gravaNasNotas(u) ? null : feitasNoBanco(u.id, t.slug, rel);
  const nota = feitasBanco ? { ...notaBruta, feitas: notaBruta.chaves.filter((c) => feitasBanco.has(c)).length } : notaBruta;
  const [arquivos, notas] = await Promise.all([arquivosDe(u, t), notasDe(u, t)]);
  const { html, toc } = renderizarNota(nota, {
    slug: t.slug, arquivos, notas, trilhas: trilhasDe(u), feitasBanco, podeVer: (slug, r) => podeVerArquivo(u, slug, r),
  });
  res.send(paginaNota({ ...(await comum(req)), t, nota, html, toc }));
});

app.get('/t/:slug/arquivo/*caminho', async (req, res) => {
  const t = exigirTrilha(req);
  const rel = relDaRota(req);
  if (!podeVerArquivo(req.usuario, t.slug, rel)) throw new ErroHttp(404, 'Arquivo não encontrado.');
  const abs = await caminhoSeguro(t, rel);
  const ext = path.extname(abs).toLowerCase();
  if (!EXT_SERVIDAS.has(ext)) throw new ErroHttp(403, 'Esse tipo de arquivo não é aberto pelo site.');
  const texto = ['.md', '.csv', '.txt', '.json'].includes(ext);
  if (ext === '.pdf') res.removeHeader('Content-Security-Policy'); // o leitor de PDF do navegador precisa rodar
  else res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.set('Cache-Control', 'no-cache');
  res.sendFile(abs, {
    dotfiles: 'deny',
    headers: {
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`,
      ...(texto ? { 'Content-Type': 'text/plain; charset=utf-8' } : {}),
    },
  });
});

async function assuntosPorTrilha(u) {
  const assuntos = {};
  for (const t of trilhasDe(u)) assuntos[t.slug] = await assuntosDe(u, t);
  for (const e of espaco.listarEspacos(u.id)) {
    const slug = espaco.slugEspaco(e.id);
    assuntos[slug] = [...new Set([...foco.assuntosUsados(u.id, slug), ...espaco.assuntosDoEspaco(u.id, e.id)])].slice(0, 200);
  }
  return assuntos;
}

app.get('/foco', async (req, res) => {
  const u = req.usuario;
  const trilhas = trilhasDe(u);
  const assuntos = await assuntosPorTrilha(u);
  const pedida = String(req.query.trilha || '');
  const trilhaInicial = trilhas.find((t) => t.slug === pedida)?.slug || foco.ultimaTrilha(u.id) || trilhas[0]?.slug || '';
  res.send(paginaFoco({
    ...(await comum(req)), totais: foco.totais(u.id), recentes: foco.recentes(u.id, 20), assuntos,
    trilhaInicial: trilhas.some((t) => t.slug === trilhaInicial) ? trilhaInicial : trilhas[0]?.slug || '',
    assuntoInicial: String(req.query.assunto || '').slice(0, 100),
  }));
});

app.get('/foco/exportar.csv', (req, res) => {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sessoes-de-foco-${hojeISO()}.csv"` });
  res.send(foco.exportarCSV(req.usuario.id));
});

// ---------- caderno ----------

// O caderno saiu daqui: tudo leva ao Ayo Sketchbook (as anotações antigas foram migradas para o cofre de cada um).
const SKETCHBOOK = (process.env.SKETCHBOOK_URL || 'http://localhost:3400').replace(/\/$/, '');
app.get('/caderno', (req, res) => res.redirect(302, SKETCHBOOK));
app.get('/caderno/nova', (req, res) => {
  const titulo = String(req.query.assunto || '').slice(0, 100);
  const tag = /^[a-z0-9-]{1,30}$/.test(String(req.query.trilha || '')) ? String(req.query.trilha) : '';
  res.redirect(302, `${SKETCHBOOK}/nova?titulo=${encodeURIComponent(titulo)}${tag ? `&tags=${tag}` : ''}`);
});
app.get('/caderno/:id', (req, res) => res.redirect(302, SKETCHBOOK));
app.get('/caderno/:id/exportar.md', (req, res) => res.redirect(302, SKETCHBOOK));

app.post('/api/caderno/previa', (req, res) => {
  const texto = String(req.body?.texto ?? '');
  if (texto.length > 200_000) throw new ErroHttp(413, 'Texto grande demais.');
  res.json({ html: renderizarTexto(texto) });
});
app.post('/api/caderno', (req, res) => res.json(caderno.criar(req.usuario.id, req.body ?? {}, slugsDe(req.usuario))));
app.post('/api/caderno/:id/remover', (req, res) => { caderno.remover(req.usuario.id, idDaRota(req)); res.json({ ok: true }); });
app.post('/api/caderno/:id', (req, res) => res.json(caderno.atualizar(req.usuario.id, idDaRota(req), req.body ?? {}, slugsDe(req.usuario))));


// ---------- grupo de estudos ----------

app.get('/grupo', async (req, res) => {
  const u = req.usuario;
  const m = grupo.membroDe(u.id);
  let dados = {};
  if (m?.consentiu) {
    dados = {
      membros: grupo.membrosVisiveis(u.id),
      mural: grupo.mural(u.id, { nomeTrilha: nomeTrilhaCompartilhada }),
      convites: grupo.convitesDoGrupo(u.id),
    };
  }
  res.send(paginaGrupo({ ...(await comum(req)), membro: m, ...dados, base: urlPublica(), streak: grupo.streakDe(u.id) }));
});

app.get('/grupo/:arroba', async (req, res) => {
  const u = req.usuario;
  const alvo = grupo.membroVisivel(u.id, req.params.arroba);
  if (!alvo) throw new ErroHttp(404, 'Pessoa não encontrada no seu grupo.');
  const mural = alvo.compartilhaTempo ? grupo.mural(u.id, { soDe: alvo.id, limite: 100, nomeTrilha: nomeTrilhaCompartilhada }) : [];
  res.send(paginaMembro({ ...(await comum(req)), alvo, mural }));
});

app.post('/api/grupo/criar', (req, res) => { grupo.criarGrupo(req.usuario.id, req.body?.nome); res.json({ ok: true }); });
app.post('/api/grupo/compartilhamento', (req, res) => {
  const b = req.body ?? {};
  grupo.definirCompartilhamento(req.usuario.id, { tempo: b.tempo === true, trilha: b.trilha === true, assunto: b.assunto === true });
  res.json({ ok: true });
});
app.post('/api/grupo/sair', (req, res) => { grupo.sairDoGrupo(req.usuario.id); res.json({ ok: true }); });
app.post('/api/grupo/remover', (req, res) => { grupo.removerMembro(req.usuario.id, Number(req.body?.id)); res.json({ ok: true }); });
app.post('/api/grupo/convite', (req, res) => {
  const codigo = grupo.criarConvite(req.usuario.id, { horas: req.body?.horas, usos: req.body?.usos });
  res.json({ ok: true, codigo, link: `${urlPublica()}/convite/${codigo}` });
});
app.post('/api/grupo/convite/revogar', (req, res) => { grupo.revogarConvite(req.usuario.id, req.body?.codigo); res.json({ ok: true }); });
app.post('/api/convite/aceitar', (req, res) => {
  const c = grupo.conviteValido(req.body?.codigo);
  if (!c) throw new ErroHttp(404, 'Convite inválido, expirado ou já usado.');
  grupo.entrarNoGrupo(req.usuario.id, c.grupo_id);
  grupo.usarConvite(c.codigo);
  res.json({ ok: true });
});

// ---------- meu espaço ----------

app.get('/espaco', async (req, res) => {
  const u = req.usuario;
  const espacos = espaco.listarEspacos(u.id).map((e) => ({ ...e, ...espaco.progressoDoEspaco(u.id, e.id) }));
  res.send(paginaEspacos({ ...(await comum(req)), espacos, cores: espaco.CORES }));
});
app.get('/espaco/:id', async (req, res) => {
  const u = req.usuario;
  const e = espaco.obterEspaco(u.id, idDaRota(req));
  res.send(paginaEspaco({ ...(await comum(req)), e, notas: espaco.notasDoEspaco(u.id, e.id), cores: espaco.CORES, progresso: espaco.progressoDoEspaco(u.id, e.id) }));
});
const notaDaRota = (req) => {
  if (!/^\d{1,12}$/.test(req.params.nid)) throw new ErroHttp(404, 'Nota não encontrada.');
  return Number(req.params.nid);
};
app.get('/espaco/:id/nota/:nid', async (req, res) => {
  const u = req.usuario;
  const e = espaco.obterEspaco(u.id, idDaRota(req));
  const n = espaco.obterNota(u.id, e.id, notaDaRota(req));
  const { html, toc } = renderizarEspacoNota(n);
  res.send(paginaEspacoNota({ ...(await comum(req)), e, n, html, toc }));
});
app.get('/espaco/:id/nota/:nid/editar', async (req, res) => {
  const u = req.usuario;
  const e = espaco.obterEspaco(u.id, idDaRota(req));
  res.send(paginaEspacoNotaEditar({ ...(await comum(req)), e, n: espaco.obterNota(u.id, e.id, notaDaRota(req)) }));
});
app.post('/api/espaco', (req, res) => res.json({ ok: true, id: espaco.criarEspaco(req.usuario.id, req.body ?? {}) }));
app.post('/api/espaco/:id', (req, res) => { espaco.editarEspaco(req.usuario.id, idDaRota(req), req.body ?? {}); res.json({ ok: true }); });
app.post('/api/espaco/:id/remover', (req, res) => { espaco.removerEspaco(req.usuario.id, idDaRota(req)); res.json({ ok: true }); });
app.post('/api/espaco/:id/nota', (req, res) => {
  const id = idDaRota(req);
  res.json({ ok: true, id, nota: espaco.criarNota(req.usuario.id, id, req.body ?? {}) });
});
app.post('/api/espaco/:id/nota/:nid', (req, res) => {
  espaco.salvarNota(req.usuario.id, idDaRota(req), notaDaRota(req), req.body ?? {});
  res.json({ ok: true });
});
app.post('/api/espaco/:id/nota/:nid/remover', (req, res) => { espaco.removerNota(req.usuario.id, idDaRota(req), notaDaRota(req)); res.json({ ok: true }); });
app.post('/api/espaco/:id/nota/:nid/tarefa', (req, res) => {
  const { linha, hash, marcado } = req.body ?? {};
  if (typeof hash !== 'string' || typeof marcado !== 'boolean') throw new ErroHttp(400, 'Pedido incompleto.');
  const r = espaco.alternarTarefaEspaco(req.usuario.id, idDaRota(req), notaDaRota(req), Number(linha), hash, marcado);
  res.json({ ok: true, hash: r.hash, feitas: r.feitas, total: r.total, almas: null });
});

app.get('/conta', (req, res) => res.redirect(301, '/configuracoes'));
app.get('/configuracoes', async (req, res) => {
  const u = req.usuario;
  res.send(paginaConfiguracoes({
    ...(await comum(req)), conta: dadosDaConta(u.id), emailPendente: emailPendenteDe(u.id), membro: grupo.membroDe(u.id),
    usuarios: u.dono ? listarUsuarios() : null, perfis: nomesPerfis(), emailAtivo: emailConfigurado(),
  }));
});

app.get('/configuracoes/meus-dados.json', (req, res) => {
  const id = req.usuario.id;
  const tudo = (sql) => db.prepare(sql).all(id);
  const dados = {
    exportado_em: new Date().toISOString(),
    conta: dadosDaConta(id),
    grupo: grupo.membroDe(id),
    pomodoros: tudo('SELECT * FROM pomodoros WHERE usuario_id = ?'),
    caderno: tudo('SELECT * FROM caderno WHERE usuario_id = ?'),
    espacos: tudo('SELECT * FROM espacos WHERE usuario_id = ?'),
    espaco_notas: tudo('SELECT * FROM espaco_notas WHERE usuario_id = ?'),
    progresso: tudo('SELECT * FROM progresso WHERE usuario_id = ?'),
    eventos: tudo('SELECT * FROM eventos WHERE usuario_id = ?'),
    consentimentos: tudo('SELECT * FROM consentimentos WHERE usuario_id = ?'),
  };
  res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="meus-dados-ayo-std-${hojeISO()}.json"` });
  res.send(JSON.stringify(dados, null, 2));
});

// ---------- API: tarefas, questões, ritmo ----------

app.post('/api/t/:slug/tarefa', async (req, res) => {
  const u = req.usuario;
  const t = exigirTrilha(req);
  const { arquivo, linha, hash, chave, marcado } = req.body ?? {};
  if (typeof arquivo !== 'string' || typeof marcado !== 'boolean') throw new ErroHttp(400, 'Pedido incompleto.');
  if (!podeVerArquivo(u, t.slug, arquivo)) throw new ErroHttp(404, 'Nota não encontrada.');
  let feitas;
  let total;
  let texto;
  let novoHash;
  if (gravaNasNotas(u)) {
    if (typeof hash !== 'string') throw new ErroHttp(400, 'Pedido incompleto.');
    const r = await alternarTarefa(t, arquivo, Number(linha), hash, marcado);
    ({ feitas, total, texto } = r);
    novoHash = r.hash;
  } else {
    if (typeof chave !== 'string') throw new ErroHttp(400, 'Pedido incompleto.');
    const nota = await lerNota(t, arquivo);
    const achada = [...nota.chavePorLinha].find(([, c]) => c === chave);
    if (!achada) throw new ErroHttp(409, 'Esta nota mudou depois que a página abriu.');
    marcarNoBanco(u.id, t.slug, arquivo, chave, marcado);
    const set = feitasNoBanco(u.id, t.slug, arquivo);
    feitas = nota.chaves.filter((c) => set.has(c)).length;
    total = nota.total;
    const l = nota.linhas[achada[0]].replace(/\r$/, '');
    texto = l.slice((RE_TAREFA.exec(l)?.[0] || '').length).trim();
  }
  registrarEvento({
    usuarioId: u.id, trilha: t.slug, tipo: 'tarefa', arquivo,
    detalhe: `${marcado ? 'Concluiu' : 'Desmarcou'}: ${texto.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#]/g, '').slice(0, 140)}`,
  });
  res.json({ ok: true, hash: novoHash, feitas, total, almas: temaDe(u) === 'pixel' ? await contarAlmas(u) : null });
});

app.post('/api/t/:slug/registro', async (req, res) => {
  const u = req.usuario;
  const t = exigirTrilha(req);
  const { erro, registro } = validarRegistro(req.body ?? {}, await lerEstudos(t), cargosPermitidos(u, t.slug));
  if (erro) throw new ErroHttp(400, erro);
  await adicionarRegistro(t, registro);
  registrarEvento({
    usuarioId: u.id, trilha: t.slug, tipo: 'registro', arquivo: 'registro-questoes.csv',
    detalhe: `Registrou ${registro.acertos}/${registro.questoes} em ${registro.materia} (${nomeCargo(registro.cargo)})`,
  });
  res.json({ ok: true });
});

app.post('/api/t/:slug/registro/remover', async (req, res) => {
  const u = req.usuario;
  const t = exigirTrilha(req);
  const { linha, hash } = req.body ?? {};
  if (typeof hash !== 'string') throw new ErroHttp(400, 'Pedido incompleto.');
  const cs = cargosPermitidos(u, t.slug);
  const removida = await removerRegistro(t, Number(linha), hash, (r) => !cs || cs.includes(r.cargo));
  registrarEvento({ usuarioId: u.id, trilha: t.slug, tipo: 'remocao', arquivo: 'registro-questoes.csv', detalhe: `Removeu o registro ${removida.slice(0, 120)}` });
  res.json({ ok: true });
});

app.post('/api/t/:slug/projecao', (req, res) => {
  const t = exigirTrilha(req);
  if (!gravaNasNotas(req.usuario)) throw new ErroHttp(403, 'Seu perfil não altera o ritmo desta trilha.');
  const ritmo = Number(req.body?.ritmo);
  const inicio = String(req.body?.inicio || '');
  if (![5, 8, 10, 15, 20, 25, 30, 40].includes(ritmo)) throw new ErroHttp(400, 'Ritmo inválido.');
  if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) throw new ErroHttp(400, 'Data inválida.');
  gravarAjuste(`projecao:${t.slug}`, { ritmo, inicio });
  res.json({ ok: true });
});

// ---------- API: pomodoro ----------

app.post('/api/foco/iniciar', (req, res) => { foco.iniciar(req.usuario.id, req.body ?? {}, slugsDe(req.usuario)); res.json({ ok: true }); });
app.post('/api/foco/pausar', (req, res) => { foco.pausar(req.usuario.id, req.body?.id); res.json({ ok: true }); });
app.post('/api/foco/retomar', (req, res) => { foco.retomar(req.usuario.id, req.body?.id); res.json({ ok: true }); });
app.post('/api/foco/cancelar', (req, res) => { foco.cancelar(req.usuario.id, req.body?.id); res.json({ ok: true }); });
app.post('/api/foco/concluir', (req, res) => {
  const r = foco.concluir(req.usuario.id, req.body?.id, req.body?.automatico === true);
  const s = r.sessao;
  res.json({ ok: true, jaConcluida: !!r.jaConcluida, curta: !!r.curta, tipo: s.tipo, assunto: s.assunto, minutos: Math.round((s.foco_s || 0) / 60) });
});
app.post('/api/foco/manual', (req, res) => { foco.registrarManual(req.usuario.id, req.body ?? {}, slugsDe(req.usuario)); res.json({ ok: true }); });
app.post('/api/foco/remover', (req, res) => { foco.remover(req.usuario.id, req.body?.id); res.json({ ok: true }); });
app.get('/api/foco', (req, res) => res.json({ sessao: foco.sessaoAtiva(req.usuario.id), agora: Date.now() }));

// ---------- API: conta ----------

async function conferirIdentidade(req, senha) {
  const espera = esperaBloqueio(req.ip);
  if (espera) throw new ErroHttp(429, `Muitas tentativas. Tente de novo em ${Math.ceil(espera / 60)} min.`);
  if (typeof senha !== 'string' || !(await conferirSenhaDoUsuario(req.usuario.id, senha.slice(0, 200)))) {
    registrarFalha(req.ip);
    throw new ErroHttp(401, 'A senha atual está incorreta.');
  }
  limparFalhas(req.ip);
}

app.post('/api/conta/nome', async (req, res) => {
  const novo = String(req.body?.usuario || '').trim();
  const erro = validarUsuario(novo);
  if (erro) throw new ErroHttp(400, erro);
  await conferirIdentidade(req, req.body?.senha);
  if (usuarioExiste(novo, req.usuario.id)) throw new ErroHttp(409, 'Esse nome de usuário já está em uso.');
  renomearUsuario(req.usuario.id, novo);
  registrarEvento({ usuarioId: req.usuario.id, tipo: 'conta', detalhe: `Trocou o nome de usuário para ${novo}` });
  res.json({ ok: true });
});

app.post('/api/conta/senha', async (req, res) => {
  const { atual, nova, confirmacao } = req.body ?? {};
  const erro = validarSenha(nova) || (nova !== confirmacao ? 'As senhas novas não são iguais.' : null) || (nova === atual ? 'A senha nova precisa ser diferente da atual.' : null);
  if (erro) throw new ErroHttp(400, erro);
  await conferirIdentidade(req, atual);
  await trocarSenhaPorId(req.usuario.id, nova, req.sessaoHash);
  registrarEvento({ usuarioId: req.usuario.id, tipo: 'conta', detalhe: 'Trocou a senha' });
  res.json({ ok: true });
});

app.post('/api/conta/perfil', async (req, res) => {
  const u = req.usuario;
  const nome = String(req.body?.nome || '').trim();
  const arroba = String(req.body?.arroba || '').trim().toLowerCase().replace(/^@/, '');
  const erroNome = validarNome(nome);
  if (erroNome) throw new ErroHttp(400, erroNome);
  if (arroba !== u.arroba) {
    const erro = validarArroba(arroba, { permitirReservado: u.dono });
    if (erro) throw new ErroHttp(400, erro);
    await conferirIdentidade(req, req.body?.senha);
    if (arrobaExiste(arroba, u.id)) throw new ErroHttp(409, 'Esse @ já está em uso.');
  }
  definirPerfilPublico(u.id, { nome, arroba });
  res.json({ ok: true });
});

app.post('/api/conta/email', async (req, res) => {
  const u = req.usuario;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const erro = validarEmail(email);
  if (erro) throw new ErroHttp(400, erro);
  await conferirIdentidade(req, req.body?.senha);
  if (emailExiste(email, u.id)) throw new ErroHttp(409, 'Esse e-mail já está em uso por outra conta.');
  if (!permitir(`email:${u.id}`, 5, 60 * 60_000)) throw new ErroHttp(429, 'Muitos pedidos de troca de e-mail. Tente em 1 hora.');
  const enviado = await enviarConfirmacao({ para: email, nome: u.nome, token: criarTokenEmail(u.id, email), motivo: 'troca' });
  res.json({ ok: true, enviado });
});

app.post('/api/conta/tema', (req, res) => {
  definirTema(req.usuario.id, req.body?.tema);
  res.json({ ok: true });
});

app.post('/api/conta/excluir', async (req, res) => {
  const u = req.usuario;
  if (u.dono) throw new ErroHttp(400, 'A conta do dono do site não pode ser excluída por aqui.');
  await conferirIdentidade(req, req.body?.senha);
  grupo.sairDoGrupo(u.id);
  db.prepare('DELETE FROM eventos WHERE usuario_id = ?').run(u.id);
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(u.id);
  encerrarSessao(req, res);
  res.json({ ok: true });
});

app.post('/api/conta/usuarios/confirmar', (req, res) => {
  exigirDono(req);
  confirmarManualmente(Number(req.body?.id));
  res.json({ ok: true });
});

function exigirDono(req) {
  if (!req.usuario.dono) throw new ErroHttp(403, 'Só o dono do site gerencia as contas.');
}

app.post('/api/conta/usuarios', async (req, res) => {
  exigirDono(req);
  const usuario = String(req.body?.usuario || '').trim();
  const { senha, perfil } = req.body ?? {};
  const erro = validarUsuario(usuario) || validarSenha(senha) || (!nomesPerfis().some((p) => p.chave === perfil) ? 'Escolha um perfil.' : null);
  if (erro) throw new ErroHttp(400, erro);
  if (usuarioExiste(usuario)) throw new ErroHttp(409, 'Esse nome de usuário já está em uso.');
  await criarUsuario(usuario, senha, { perfil, trocarSenha: true });
  registrarEvento({ usuarioId: req.usuario.id, tipo: 'conta', detalhe: `Criou a conta ${usuario} (${perfil})` });
  res.json({ ok: true });
});

app.post('/api/conta/usuarios/redefinir', async (req, res) => {
  exigirDono(req);
  const id = Number(req.body?.id);
  const erro = validarSenha(req.body?.senha);
  if (erro) throw new ErroHttp(400, erro);
  const alvo = listarUsuarios().find((x) => x.id === id);
  if (!alvo || alvo.id === req.usuario.id) throw new ErroHttp(400, 'Escolha outra conta (a sua senha se troca no formulário acima).');
  await redefinirSenha(id, req.body.senha);
  registrarEvento({ usuarioId: req.usuario.id, tipo: 'conta', detalhe: `Redefiniu a senha de ${alvo.usuario}` });
  res.json({ ok: true });
});

app.post('/api/conta/usuarios/remover', (req, res) => {
  exigirDono(req);
  const id = Number(req.body?.id);
  const alvo = listarUsuarios().find((x) => x.id === id);
  if (!alvo || alvo.dono) throw new ErroHttp(400, 'Essa conta não pode ser removida.');
  removerUsuario(id);
  registrarEvento({ usuarioId: req.usuario.id, tipo: 'conta', detalhe: `Removeu a conta ${alvo.usuario}` });
  res.json({ ok: true });
});

// ---------- erros ----------

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use(async (req, res) => {
  res.status(404).send(paginaErro({ status: 404, ...(req.usuario ? await comum(req) : {}) }));
});

app.use(async (err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err instanceof ErroHttp ? err.status : err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500;
  if (err.status === 404 || err.code === 'ENOENT') status = 404;
  if (status === 500) console.error('[erro]', req.method, req.originalUrl, err);
  const mensagem = status === 500 ? 'Erro interno. Nada foi gravado pela metade.' : err.message;
  if (req.originalUrl.startsWith('/api/')) return res.status(status).json({ erro: mensagem });
  try {
    res.status(status).send(paginaErro({ status, ...(req.usuario ? await comum(req) : {}) }));
  } catch {
    res.status(status).type('text').send(mensagem);
  }
});

const servidor = app.listen(config.porta, config.host, () => {
  console.log(`[ayo-std] ouvindo em http://${config.host}:${config.porta} · dados em ${config.dataDir}`);
  console.log(`[ayo-std] trilhas: ${listarTrilhas().map((t) => `${t.slug} → ${t.pasta}`).join(' | ')}`);
});

function desligar(sinal) {
  console.log(`[ayo-std] ${sinal} recebido, encerrando…`);
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', desligar);
process.on('SIGINT', desligar);
// Erro inesperado: registra e sai; o systemd sobe de novo em seguida, com estado limpo.
process.on('uncaughtException', (e) => { console.error('[fatal]', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('[fatal]', e); process.exit(1); });
