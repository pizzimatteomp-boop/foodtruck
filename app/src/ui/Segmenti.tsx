import type { Segmento } from '../etichette/lista';

/** Testo con le parti in grassetto (allergeni). */
export function Segmenti({ s }: { s: readonly Segmento[] }) {
  return <>{s.map((x, i) => (x.grassetto ? <strong key={i}>{x.testo}</strong> : <span key={i}>{x.testo}</span>))}</>;
}
