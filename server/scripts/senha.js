// Troca a senha pelo terminal: npm run senha -- <usuario>
// Também derruba todas as sessões abertas desse usuário.
import { definirSenha, validarSenha } from '../auth.js';

const usuario = process.argv[2];
if (!usuario) {
  console.error('Uso: npm run senha -- <usuario>');
  process.exit(1);
}

function perguntarOculto(pergunta) {
  return new Promise((resolve) => {
    process.stdout.write(pergunta);
    const entrada = process.stdin;
    let valor = '';
    entrada.setRawMode?.(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const aoDigitar = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        entrada.setRawMode?.(false);
        entrada.pause();
        entrada.off('data', aoDigitar);
        process.stdout.write('\n');
        resolve(valor);
      } else if (ch === '\u0003') {
        process.exit(130);
      } else if (ch === '\u007f') {
        valor = valor.slice(0, -1);
      } else {
        valor += ch;
      }
    };
    entrada.on('data', aoDigitar);
  });
}

const senha = await perguntarOculto('Nova senha: ');
const erro = validarSenha(senha);
if (erro) { console.error(erro); process.exit(1); }
if ((await perguntarOculto('Repita a senha: ')) !== senha) { console.error('As senhas não são iguais.'); process.exit(1); }
if (await definirSenha(usuario, senha)) console.log(`Senha de "${usuario}" trocada. Sessões antigas encerradas.`);
else { console.error(`Usuário "${usuario}" não existe.`); process.exit(1); }
