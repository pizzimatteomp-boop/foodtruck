# Super app VegMan

Nuova app di VegMan (fase 0). L'app attuale, `index.html` nella cartella principale, resta in uso finché questa non è pronta e testata.

Piano: «Super app VegMan · Piano fase 0» (Claude Docs).

## Struttura
- `src/fiscal/` — documento commerciale online dell'Agenzia delle Entrate: costruzione di vendite e annulli, con test sui casi reali.
- `src/firebase/` — progetti Firebase (`config.ts`), accesso con Google e cache offline (`accesso.ts`), profilo della persona (`profilo.ts`), permessi per ruolo (`ruoli.ts`).
- `src/main.tsx`, `src/app/` — avvio, stato dell'accesso, pagine e menu per ruolo (`navigazione.ts`, indirizzi con #).
- `src/ui/` — schermate in Preact: accesso, struttura con menu (in basso sul telefono, a lato sul computer), Home, Persone.
- `public/` — icone, `manifest.webmanifest` (app installabile) e `sw.js` (service worker: app apribile senza rete).
- `src/foodcost/` — modello dati (ingredienti, prodotti con ricette, articoli, acquisti) e calcolo di prezzi e food cost; `confronto-planner.test.ts` verifica che dia gli stessi numeri del codice di VegMan Planner.
- `src/importazione/` — import una tantum dal backup di VegMan Planner (lettura, avvisi, salvataggio senza doppioni).
- `src/persone/` — abilitare persone, cambiare ruolo, disattivare (controlli e accesso al database).
- `firebase.json` — pubblicazione (Firebase Hosting, cache: pagina sempre aggiornata, file dell'app in cache per un anno) ed emulatore.
- `firestore.rules` — regole di accesso al database per ruolo; provate in `tests/regole/` sull'emulatore Firestore.

## Comandi
```
npm ci             # installa esattamente le librerie del package-lock
npm run check      # controllo dei tipi + test con copertura minima (come su GitHub)
npm test           # solo i test veloci
npm run test:regole # regole del database sull'emulatore (serve Java 21)
npm run test:browser # prova completa nel browser con gli emulatori (Playwright)
npm run test:watch # test che ripartono a ogni modifica
npm run dev        # app sul computer (http://localhost:5173), ambiente di prova
npm run build      # pacchetto da pubblicare in dist/
```

Su GitHub, a ogni modifica della cartella `app/`, partono in automatico: controllo dei tipi, test con copertura minima (modulo fiscale coperto al 100% delle righe), controllo delle vulnerabilità note, test delle regole del database con tutti i ruoli e prova completa nel browser (persona nuova → abilitata dal titolare → entra con il ruolo). Una volta al mese Dependabot propone l'aggiornamento delle librerie, solo per versioni uscite da almeno 14 giorni.

Pubblicazione: a ogni modifica su `main` che passa tutti i controlli, GitHub pubblica schermate e regole del database su **vegman-prova** (https://vegman-prova.firebaseapp.com), con la chiave `FIREBASE_SERVICE_ACCOUNT_VEGMAN_PROVA` salvata nei segreti del repository. `vegman-app` (dati veri) non viene mai pubblicato in automatico.

Versione di Node: quella in `.nvmrc`.

## Sicurezza
- Le credenziali Fisconline non entrano mai nel codice né nel database: restano cifrate sullo smartphone di cassa.
- La configurazione Firebase non è segreta; i dati sono protetti dalle regole in `firestore.rules`.
