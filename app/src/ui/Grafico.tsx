/** Grafico a linee nel tempo (SVG fatto a mano): una o più serie, soglia facoltativa, numeri esatti sotto. */
export interface Serie {
  nome: string;
  colore: string;
  valori: (number | null)[];
  /** Punti vuoti (es. valori ricalcolati e non fotografati). */
  vuoti?: boolean[];
  sottile?: boolean;
}

const L = 58, R = 14, T = 14, B = 30, W = 600, H = 230;

export function Grafico({ titolo, etichette, serie, formato, soglia }: {
  titolo: string; etichette: string[]; serie: Serie[]; formato: (n: number) => string; soglia?: { valore: number; nome: string };
}) {
  const tutti = serie.flatMap((s) => s.valori.filter((v): v is number => v !== null));
  if (tutti.length === 0) return <p class="nota">Nessun dato da mostrare.</p>;
  const massimo = Math.max(...tutti, soglia?.valore ?? 0) * 1.15 || 1;
  const x = (i: number) => L + (etichette.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (etichette.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / massimo);
  const passo = Math.max(1, Math.ceil(etichette.length / 7));
  const tacche = [0, 0.25, 0.5, 0.75, 1].map((f) => massimo * f / 1.15);
  const tratti = (s: Serie) => {
    const out: string[] = [];
    let cur = '';
    s.valori.forEach((v, i) => {
      if (v === null) { if (cur) out.push(cur); cur = ''; return; }
      cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    });
    if (cur) out.push(cur);
    return out;
  };
  return (
    <figure class="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titolo}>
        {tacche.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} class="griglia" />
            <text x={L - 6} y={y(t) + 4} text-anchor="end" class="asse">{formato(t)}</text>
          </g>
        ))}
        {etichette.map((e, i) => (i % passo === 0 || i === etichette.length - 1) && (
          <text key={e} x={x(i)} y={H - 8} class="asse"
            text-anchor={etichette.length > 1 && i === 0 ? 'start' : etichette.length > 1 && i === etichette.length - 1 ? 'end' : 'middle'}>{e}</text>
        ))}
        {soglia && <>
          <line x1={L} x2={W - R} y1={y(soglia.valore)} y2={y(soglia.valore)} class="soglia" />
          <text x={W - R} y={y(soglia.valore) - 5} text-anchor="end" class="asse soglia-testo">{soglia.nome}</text>
        </>}
        {serie.map((s) => (
          <g key={s.nome} style={{ color: s.colore }}>
            {tratti(s).map((d) => <path key={d} d={d} fill="none" stroke="currentColor" stroke-width={s.sottile ? 1.5 : 3} stroke-linejoin="round" />)}
            {s.valori.map((v, i) => v !== null && (
              <circle key={i} cx={x(i)} cy={y(v)} r={s.sottile ? 3 : 4.5} fill={s.vuoti?.[i] ? 'var(--scheda)' : 'currentColor'} stroke="currentColor" stroke-width={s.sottile ? 1 : 2} />
            ))}
          </g>
        ))}
      </svg>
      {serie.length > 1 && (
        <figcaption class="legenda-grafico">{serie.map((s) => <span key={s.nome}><i style={{ background: s.colore }} />{s.nome}</span>)}</figcaption>
      )}
      <details>
        <summary>Vedi i numeri</summary>
        <div class="scorri">
          <table class="tabella" aria-label={`Numeri: ${titolo}`}>
            <thead><tr><th>Mese</th>{serie.map((s) => <th key={s.nome}>{s.nome}</th>)}</tr></thead>
            <tbody>{etichette.map((e, i) => (
              <tr key={e}><th scope="row">{e}</th>{serie.map((s) => <td key={s.nome}>{s.valori[i] === null ? '—' : `${formato(s.valori[i]!)}${s.vuoti?.[i] ? '*' : ''}`}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export const COLORI_SERIE = ['var(--glaucous)', 'var(--arancio)', 'var(--lampone)', '#3E9B87'];
