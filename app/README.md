# Super app VegMan

Nuova app di VegMan (fase 0). L'app attuale, `index.html` nella cartella principale, resta in uso finché questa non è pronta e testata.

Piano: «Super app VegMan · Piano fase 0» (Claude Docs).

## Struttura
- `src/fiscal/` — documento commerciale online dell'Agenzia delle Entrate: costruzione di vendite e annulli, con test sui casi reali.
- `src/firebase/` — configurazione dei progetti Firebase (`vegman-prova`, `vegman-app`).
- `firestore.rules` — regole di accesso al database per ruolo.

## Comandi
```
npm install
npm test        # test automatici
npm run typecheck
```

I test girano anche su GitHub a ogni modifica della cartella `app/`.

## Sicurezza
- Le credenziali Fisconline non entrano mai nel codice né nel database: restano cifrate sullo smartphone di cassa.
- La configurazione Firebase non è segreta; i dati sono protetti dalle regole in `firestore.rules`.
