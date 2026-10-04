// Copia as fontes pixel (pacotes @fontsource) para public/fonts e gera public/css/fontes.css.
// Assim o site não depende de nenhum servidor externo para carregar.
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '../..');
const FONTES = [
  { pacote: 'jacquarda-bastarda-9', familia: 'Jacquarda Bastarda 9', pesos: [400] },
  { pacote: 'jacquard-24', familia: 'Jacquard 24', pesos: [400] },
  { pacote: 'pixelify-sans', familia: 'Pixelify Sans', pesos: [400, 500, 600, 700] },
  { pacote: 'silkscreen', familia: 'Silkscreen', pesos: [400, 700] },
  { pacote: 'vt323', familia: 'VT323', pesos: [400] },
];
const destino = path.join(raiz, 'public/fonts');
fs.mkdirSync(destino, { recursive: true });
let css = '/* gerado por server/scripts/copiar-fontes.js */\n';
for (const f of FONTES) {
  const dir = path.join(raiz, 'node_modules/@fontsource', f.pacote);
  for (const peso of f.pesos) {
    const fonte = fs.readFileSync(path.join(dir, `${peso}.css`), 'utf8');
    for (const bloco of fonte.match(/@font-face\s*{[^}]+}/g) || []) {
      const sub = /\/\* ([\w-]+) \*\//.exec(fonte.slice(0, fonte.indexOf(bloco)).split('@font-face').pop() || '');
      const arq = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(bloco)?.[1];
      if (!arq || !/-(latin|latin-ext)-/.test(arq)) continue;
      fs.copyFileSync(path.join(dir, 'files', arq), path.join(destino, arq));
      const faixa = /unicode-range:\s*([^;]+);/.exec(bloco)?.[1];
      css += `@font-face{font-family:'${f.familia}';font-style:normal;font-display:swap;font-weight:${peso};` +
        `src:url(/fonts/${arq}) format('woff2');${faixa ? `unicode-range:${faixa};` : ''}}\n`;
      void sub;
    }
  }
}
fs.writeFileSync(path.join(raiz, 'public/css/fontes.css'), css);
console.log(`fontes copiadas para ${destino}`);
