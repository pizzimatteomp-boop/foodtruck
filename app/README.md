# Super app VegMan

Nuova app di VegMan (fase 0). L'app attuale, `index.html` nella cartella principale, resta in uso finché questa non è pronta e testata.

Piano: «Super app VegMan · Piano fase 0» (Claude Docs).

## Struttura
- `src/fiscal/` — documento commerciale online dell'Agenzia delle Entrate: costruzione di vendite e annulli, con test sui casi reali.
- `src/firebase/` — progetti Firebase (`config.ts`), accesso con Google e cache offline (`accesso.ts`), profilo della persona (`profilo.ts`), permessi per ruolo (`ruoli.ts`).
- `firestore.rules` — regole di accesso al database per ruolo; provate in `tests/regole/` sull'emulatore Firestore.

## Comandi
```
npm ci             # installa esattamente le librerie del package-lock
npm run check      # controllo dei tipi + test con copertura minima (come su GitHub)
npm test           # solo i test veloci
npm run test:regole # regole del database sull'emulatore (serve Java 21)
npm run test:watch # test che ripartono a ogni modifica
```

Su GitHub, a ogni modifica della cartella `app/`, partono in automatico: controllo dei tipi, test con copertura minima (modulo fiscale coperto al 100% delle righe), controllo delle vulnerabilità note e test delle regole del database con tutti i ruoli. Una volta al mese Dependabot propone l'aggiornamento delle librerie, solo per versioni uscite da almeno 14 giorni.

Versione di Node: quella in `.nvmrc`.

## Sicurezza
- Le credenziali Fisconline non entrano mai nel codice né nel database: restano cifrate sullo smartphone di cassa.
- La configurazione Firebase non è segreta; i dati sono protetti dalle regole in `firestore.rules`.
