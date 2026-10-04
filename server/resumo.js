// Mesma conta do resumo.py dos cofres: semana S1 começa em estudos.json "inicio",
// metas de % e de questões podem variar por fase ([[até_semana, valor], ...]).

const DIA = 864e5;

export const hojeISO = () => new Date().toLocaleDateString('sv-SE');
export const diaUTC = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};
export const diasEntre = (deISO, ateISO) => Math.round((diaUTC(ateISO) - diaUTC(deISO)) / DIA);
export const somarDias = (iso, n) => new Date(diaUTC(iso) + n * DIA).toISOString().slice(0, 10);

export function dataBR(iso, comAno = true) {
  const [a, m, d] = iso.split('-');
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
}

const porFase = (valor, semana) => {
  if (!Array.isArray(valor)) return valor ?? null;
  const achado = valor.find(([ate]) => semana <= ate);
  return (achado || valor[valor.length - 1])[1];
};

const NOMES_CARGO = {
  informatica: 'Técnico de Informática',
  administrativa: 'Técnico Administrativo',
  tecnologia: 'Agente de Tecnologia',
  comercial: 'Agente Comercial',
  enem: 'ENEM',
};
export const nomeCargo = (c) => NOMES_CARGO[c] || c.charAt(0).toUpperCase() + c.slice(1);

export function resumir(estudos, registros, hoje = hojeISO()) {
  if (!estudos?.inicio) return null;
  const semanaDe = (iso) => Math.floor(diasEntre(estudos.inicio, iso) / 7) + 1;
  const semanaAtual = semanaDe(hoje);
  const metaPct = (s) => porFase(estudos.meta_pct || [[99, 70]], s);
  const cargosCfg = estudos.cargos || {};
  const chaves = Object.keys(cargosCfg);
  for (const r of registros || []) if (r.cargo && !chaves.includes(r.cargo)) chaves.push(r.cargo);

  const cargos = chaves.map((chave) => {
    const cfg = cargosCfg[chave] || {};
    const semanas = new Map();
    const pegar = (s) => {
      if (!semanas.has(s)) semanas.set(s, { s, q: 0, a: 0, min: 0, materias: new Map(), redacao: [] });
      return semanas.get(s);
    };
    for (const r of registros || []) {
      if (r.cargo !== chave) continue;
      const w = pegar(semanaDe(r.data));
      if (/^reda[çc][ãa]o/i.test(r.materia)) {
        if (r.questoes > 0) w.redacao.push((100 * r.acertos) / r.questoes);
        continue;
      }
      w.q += r.questoes;
      w.a += r.acertos;
      w.min += r.tempo_min;
      const m = w.materias.get(r.materia) || { materia: r.materia, q: 0, a: 0 };
      m.q += r.questoes;
      m.a += r.acertos;
      w.materias.set(r.materia, m);
    }
    const ultima = Math.max(semanaAtual, ...semanas.keys(), 1);
    const primeira = Math.max(1, ultima - 15);
    const lista = [];
    for (let s = primeira; s <= ultima; s++) {
      const w = pegar(s);
      lista.push({
        s,
        inicio: somarDias(estudos.inicio, (s - 1) * 7),
        q: w.q,
        a: w.a,
        min: w.min,
        pct: w.q ? (100 * w.a) / w.q : null,
        metaQ: porFase(cfg.meta_questoes_semana, s),
        metaPct: metaPct(s),
        redacao: w.redacao.length ? w.redacao.reduce((x, y) => x + y, 0) / w.redacao.length : null,
        materias: [...w.materias.values()].map((m) => ({ ...m, pct: m.q ? (100 * m.a) / m.q : null }))
          .sort((x, y) => y.q - x.q),
      });
    }
    const atual = lista.find((w) => w.s === semanaAtual) || null;
    const totalQ = lista.reduce((s, w) => s + w.q, 0);
    return { chave, nome: nomeCargo(chave), horasSemana: cfg.horas_semana ?? null, obs: cfg.obs || '', semanas: lista, atual, totalQ };
  });

  return { semanaAtual, inicio: estudos.inicio, prova: estudos.prova || null, concurso: estudos.concurso || '', cargos };
}
