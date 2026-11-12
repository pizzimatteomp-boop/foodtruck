/** Disegno dell'etichetta in millimetri: anteprima sul telefono e stampa dalla Stazione. */
import type { ContenutoEtichetta, Misura } from '../produzione/produzione';
import { corpoIngredienti } from '../produzione/produzione';

export function EtichettaVista({ c, misura, scala }: { c: ContenutoEtichetta; misura: Misura; scala?: number }) {
  const corpo = corpoIngredienti(c, misura);
  return (
    <div class="etichetta" style={{ width: `${misura.larghezza}mm`, height: `${misura.altezza}mm`, ...(scala ? { zoom: scala } : {}) }}>
      <div class="etichetta-testa">
        <strong class="etichetta-nome">{c.prodotto}</strong>
        <span class="etichetta-qta">{c.quantita}</span>
      </div>
      <div class="etichetta-dati">Prodotto il <strong>{c.data}</strong> · Lotto <strong>{c.lotto}</strong></div>
      <div class="etichetta-ingredienti" style={{ fontSize: `${corpo}mm` }}>
        <span>Ingredienti: </span>
        {c.ingredienti.length ? c.ingredienti.map((s, i) => (s.grassetto ? <b key={i}>{s.testo.toUpperCase()}</b> : <span key={i}>{s.testo}</span>)) : <span>—</span>}
        {c.contiene && <><br /><b>Contiene: {c.contiene}.</b></>}
        {c.puoContenere && <> Può contenere: {c.puoContenere}.</>}
        {c.nota && <><br />{c.nota}</>}
      </div>
    </div>
  );
}
