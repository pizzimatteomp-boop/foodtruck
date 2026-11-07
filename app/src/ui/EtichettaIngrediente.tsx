/** Sezione «Etichetta e allergeni» della scheda ingrediente: tutto inserito a mano dall'etichetta. */
import type { Firestore } from 'firebase/firestore';
import { useState } from 'preact/hooks';
import { ALLERGENI, type Allergene } from '../etichette/allergeni';
import { segmentiComposizione } from '../etichette/lista';
import type { Ingrediente } from '../foodcost/modello';
import { ErroreIngrediente, preparaEtichetta } from '../ingredienti/operazioni';
import { salvaEtichetta } from '../ingredienti/operazioni.db';

function Anteprima({ testo }: { testo: string }) {
  if (!testo.trim()) return null;
  return <p class="nota">Anteprima: {segmentiComposizione(testo).map((s, i) => (s.grassetto ? <strong key={i}>{s.testo}</strong> : <span key={i}>{s.testo}</span>))}</p>;
}

function Caselle({ etichetta, scelti, onChange, disabilitati = [] }: {
  etichetta: string; scelti: Allergene[]; onChange: (v: Allergene[]) => void; disabilitati?: Allergene[];
}) {
  return (
    <fieldset class="caselle">
      <legend>{etichetta}</legend>
      {ALLERGENI.map((a) => (
        <label key={a.id} class={disabilitati.includes(a.id) ? 'spento' : ''}>
          <input type="checkbox" checked={scelti.includes(a.id)} disabled={disabilitati.includes(a.id)}
            onChange={(e) => onChange(e.currentTarget.checked ? [...scelti, a.id] : scelti.filter((x) => x !== a.id))} />
          {a.it}
        </label>
      ))}
    </fieldset>
  );
}

export function EtichettaIngrediente({ db, ingrediente }: { db: Firestore; ingrediente: Ingrediente }) {
  const e = ingrediente.etichetta;
  const [m, setM] = useState({
    nomeEn: e?.nomeEn ?? '', composizioneIt: e?.composizione.it ?? '', composizioneEn: e?.composizione.en ?? '',
    allergeni: (e?.allergeni ?? []) as Allergene[], tracce: (e?.tracce ?? []) as Allergene[],
    pesoUnitario: e?.pesoUnitario == null ? '' : String(e.pesoUnitario), controllata: e?.controllata ?? false,
  });
  const [esito, setEsito] = useState<{ testo: string; errore: boolean } | null>(null);
  const aPezzi = !['g', 'gr', 'kg', 'ml', 'cl', 'l', 'lt'].includes(ingrediente.unita.trim().toLowerCase());

  async function salva(ev: Event) {
    ev.preventDefault();
    try {
      await salvaEtichetta(db, ingrediente.id, preparaEtichetta(m, ingrediente.unita));
      setEsito({ testo: 'Etichetta salvata.', errore: false });
    } catch (x) {
      setEsito({ testo: x instanceof ErroreIngrediente ? x.message : 'Salvataggio non riuscito: riprova.', errore: true });
    }
  }

  return (
    <form class="nuova" onSubmit={salva} aria-label="Etichetta e allergeni">
      <h2>Etichetta e allergeni</h2>
      <p class="nota">Copia dall'etichetta del prodotto. Se è un ingrediente semplice (es. «Ceci»), lascia vuota la composizione e spunta gli allergeni che contiene. Metti tra asterischi le parole allergeni: <code>acqua, *soia*, *frumento*, sale</code>.</p>
      <input aria-label="Nome in inglese" placeholder="Nome in inglese (es. Soy sauce)" value={m.nomeEn} onInput={(x) => setM({ ...m, nomeEn: x.currentTarget.value })} />
      <textarea aria-label="Composizione in italiano" rows={3} placeholder="Ingredienti in italiano, come sull'etichetta" value={m.composizioneIt}
        onInput={(x) => setM({ ...m, composizioneIt: x.currentTarget.value })} />
      <Anteprima testo={m.composizioneIt} />
      <textarea aria-label="Composizione in inglese" rows={3} placeholder="Ingredients in English" value={m.composizioneEn}
        onInput={(x) => setM({ ...m, composizioneEn: x.currentTarget.value })} />
      <Anteprima testo={m.composizioneEn} />
      <Caselle etichetta="Allergeni contenuti" scelti={m.allergeni}
        onChange={(v) => setM({ ...m, allergeni: v, tracce: m.tracce.filter((t) => !v.includes(t)) })} />
      <Caselle etichetta="Può contenere tracce di" scelti={m.tracce} disabilitati={m.allergeni} onChange={(v) => setM({ ...m, tracce: v })} />
      {aPezzi && (
        <label class="campo"><span>Peso di 1 {ingrediente.unita} (grammi)</span>
          <input aria-label="Peso per pezzo" inputMode="decimal" value={m.pesoUnitario} onInput={(x) => setM({ ...m, pesoUnitario: x.currentTarget.value })} />
        </label>
      )}
      <label class="spunta">
        <input type="checkbox" checked={m.controllata} onChange={(x) => setM({ ...m, controllata: x.currentTarget.checked })} />
        Ho controllato l'etichetta: i dati sono giusti
      </label>
      <button type="submit" class="primario">Salva etichetta</button>
      <p role="status" class={esito?.errore ? 'esito errore' : 'esito'}>{esito?.testo ?? ''}</p>
    </form>
  );
}
