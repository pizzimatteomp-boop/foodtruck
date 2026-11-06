# Super app VegMan

Nuova app di VegMan (fase 0). L'app attuale, `index.html` nella cartella principale, resta in uso finché questa non è pronta e testata.

Piano: «Super app VegMan · Piano fase 0» (Claude Docs).

## Struttura
- `src/fiscal/` — documento commerciale online dell'Agenzia delle Entrate: costruzione di vendite e annulli, con test sui casi reali.
- `src/firebase/` — configurazione dei progetti Firebase (`vegman-prova`, `vegman-app`).
- `firestore.rules` — regole di accesso al database per ruolo.

## Comandi
```
npm ci             # installa esattamente le librerie del package-lock
npm run check      # controllo dei tipi + test con copertura minima (come su GitHub)
npm test           # solo i test
npm run test:watch # test che ripartono a ogni modifica
```

Su GitHub, a ogni modifica della cartella `app/`, partono in automatico: controllo dei tipi, test con copertura minima (modulo fiscale coperto al 100% delle righe) e controllo delle vulnerabilità note. Una volta al mese Dependabot propone l'aggiornamento delle librerie, solo per versioni uscite da almeno 14 giorni.

Versione di Node: quella in `.nvmrc`.

## Sicurezza
- Le credenziali Fisconline non entrano mai nel codice né nel database: restano cifrate sullo smartphone di cassa.
- La configurazione Firebase non è segreta; i dati sono protetti dalle regole in `firestore.rules`.
