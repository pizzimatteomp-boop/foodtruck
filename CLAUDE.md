# VegMan · istruzioni per Claude

Repository delle app di **VegMan**, street food 100% vegetale di Matteo Pizzi (ditta individuale «Pastare di Pizzi Matteo», P.IVA 02948500422, Osimo AN). Aggiornato al 6/11/2026.

## Come lavorare con Matteo
- In italiano, conciso, con numeri e tabelle. Prima si ragiona, poi si costruisce.
- Un passo alla volta, finito e testato, prima di aprire il successivo.
- Matteo non è uno sviluppatore: spiega cosa cambia per lui, non il dettaglio tecnico, e dagli istruzioni passo passo quando deve fare qualcosa (console Firebase, telefono, GitHub).

## Cosa c'è nel repository
| Percorso | Cosa | Stato |
|---|---|---|
| `index.html` | **VegMan Planner**, app attuale in un solo file (dati nel browser + sincronizzazione col Google Sheet «foodtruck» via Apps Script). Ingredienti, ricette con semilavorati e food cost, eventi con liste di carico, import fatture XML, comande con stampa Bluetooth. | **In uso: non modificarla** finché la nuova app non è pronta e testata |
| `app/` | **Super app VegMan**, la nuova app (fase 0 in corso) | In sviluppo |
| `.github/workflows/app-test.yml` | Test automatici della cartella `app/` (tipi, test con copertura, build, vulnerabilità, regole sull'emulatore, prova nel browser) e pubblicazione automatica da `main` su `vegman-prova` (https://vegman-prova.firebaseapp.com) | Attivo |

## Architettura decisa (approvata da Matteo il 6/11/2026)
- **Un solo codice TypeScript a moduli**, con test automatici (Vitest).
- Gira come **app web (PWA)** su ogni dispositivo (iPad, iPhone, PC) e, impacchettata con **Capacitor**, come **app Android di cassa**. Per la fase 0 la cassa di prova è lo smartphone Android di Matteo; più avanti un tablet Android.
- **Firebase, piano gratuito Spark** (niente carta, niente piano Blaze, niente Cloud Functions): Firestore con cache offline, accesso con Google, regole di sicurezza per ruolo. Due progetti: `vegman-prova` (test) e `vegman-app` (dati veri), database in `europe-west8` (Milano). Configurazioni in `app/src/firebase/config.ts` (non sono segreti).
- **Cassa fiscale sul dispositivo, senza server**: l'app Android parla direttamente con la procedura gratuita «documento commerciale online» (DCO) dell'Agenzia delle Entrate, come fa l'app Billy ma senza far passare le credenziali da server terzi. Da browser non si può (CORS): solo dall'app Android (HTTP nativo di Capacitor).
- **Ruoli**: titolare (tutto), cassa (comande, scontrini, movimenti senza incasso, quadratura), team (eventi e checklist in lettura). Regole in `app/firestore.rules`, provate in `app/tests/regole/`; profilo in `/utenti/{uid}` con `ruolo` e `attivo`, assegnati solo dal titolare.
- Fasi successive: economia eventi e checklist di carico → fatture, prezzi e food cost → comande e cassa → magazzino, lotti ed etichette.

## Vendite e movimenti di prodotto (deciso il 6/11/2026)
- **In Italia ogni vendita pagata ha il suo scontrino DCO**, emesso in automatico dalla comanda. Nessuna funzione per vendere senza scontrino e nessun archivio nascosto di vendite.
- Movimenti **senza incasso**, tutti tracciati con motivo, persona, evento e ora, e scaricati dal magazzino:
  | Tipo | Quando | Scontrino |
  |---|---|---|
  | Omaggio | prodotto regalato (amico, fornitore, artista) | DCO con riga omaggio a 0 € |
  | Pasto staff | consumo del team durante l'evento | nessuno: movimento interno |
  | Prova / assaggio | test di ricetta, assaggi | nessuno: movimento interno |
  | Scarto | prodotto rovinato, caduto, scaduto | nessuno: movimento interno |
  | Errore di cassa | vendita sbagliata | annullo o reso dello scontrino |
  | Pagato dall'organizzatore | pasti per staff, artisti, volontari del festival | fattura all'organizzatore o scontrino «non riscosso» |
- Questi movimenti **non possono avere un incasso**: se c'è un pagamento, è una vendita e va con lo scontrino. Nessun campo importo pagato sui movimenti interni.
- **Quadratura di cassa** a fine evento: contanti e POS contati contro scontrini emessi; le differenze vengono segnalate al titolare.
- Eventi fuori dall'Italia (es. SMIAF, San Marino): ogni evento ha un Paese; con Paese diverso da IT, e solo se attivato dal titolare, l'app fa una ricevuta non fiscale italiana secondo le regole del luogo (da verificare con commercialista e organizzatore).
- Report per ruolo: il team vede checklist, comande ed eventi; il titolare vede tutto (vendite, omaggi, consumi interni, scarti, margini). Business plan e conti sempre con vendite interamente fiscalizzate.

## Regole di sicurezza (non negoziabili)
- **Credenziali Fisconline**: Matteo le inserisce solo nell'app sul telefono; vanno cifrate nel Keystore Android. Mai nel codice, nel database, nei log, in chat o nei test. Non chiederle mai.
- **Nessuno scontrino vero** (vendita, annullo, reso) senza il via libera esplicito di Matteo in quel momento. Per i test di tutti i giorni usare un simulatore del servizio dell'Agenzia.
- Gli scontrini registrati nel database non si modificano né si cancellano (regole Firestore).
- Sviluppare e provare su `vegman-prova`; `vegman-app` solo per i dati veri.

## Documento commerciale online: cosa sappiamo
Studiato sul portale il 6/11/2026; prova reale autorizzata: vendita «Acqua» 1,50 € IVA 22% contanti (DCW2026/6535-7349, idtrx 265328092) e suo annullo (DCW2026/6535-7686, idtrx 265328429).

- Servizio: `https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/`, autenticato dai cookie della sessione del portale. Interfaccia non pubblica: può cambiare senza preavviso.
- Accesso: `https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate`, modulo Fisconline con campi `IDToken1` (codice fiscale), `IDToken2` (password), `IDToken3` (PIN), POST a `/sam/UI/Login`. Nessun captcha né OTP. Poi utenza di lavoro «Me stesso» (P.IVA 02948500422). Il portale riconosce l'utente come tipo `FOL`.
- Chiamate:
  - `GET doc/documenti/dati/fiscali` → dati esercente
  - `POST doc/documenti/` → vendita (V), annullo (A) o reso (R) di un DCO; risposta `{esito, idtrx, progressivo, errori}`
  - `POST doc/documenti_manuale/` → annullo/reso (AX/RX) di documenti non emessi col DCO
  - `GET doc/documenti/{idtrx}/` → documento; `GET doc/documenti/{idtrx}/stampa/?regalo=false` → PDF
  - `GET doc/documenti/ultimo/` → ultima **vendita** confermata (serve a capire se un invio interrotto è andato a buon fine, per non emettere due volte)
  - `GET doc/documenti/?dataDal=MM/gg/aaaa&dataInvioAl=MM/gg/aaaa&start&perPage` → ricerca; massimo 31 giorni; oltre ~900 risultati la lista torna vuota (spezzare per giorni)
  - `doc/posrt/...` → collegamento POS
- Regole del formato DCW10 (implementate e testate in `app/src/fiscal/dco.ts`):
  - errori di contenuto = HTTP 200 con `esito:false` + `errori[{codice, descrizione}]`, niente emesso;
  - `nazione: "IT"` obbligatoria nei dati esercente;
  - righe e totali a 8 decimali, pagamenti a 2, aritmetica bignumber.js half-up come la pagina dell'Agenzia;
  - pagamenti: PC contanti, PE elettronico, TR ticket (+ numero), NR_* non riscosso; devono coincidere col totale;
  - annullo = stesso contenuto senza `vendita`, con `resoAnnullo {tipologia:"A", dataOra, progressivo originario}` e gli `idElementoContabile` originali; i valori letti dall'Agenzia («1.5») vanno riformattati;
  - `dataOra` = gg/mm/aaaa sul fuso Europe/Rome.
- **Collegamento POS** (obbligo dal 1/1/2026): già fatto il 12/04/2026 sul portale (2 SumUp, 1 Nexi). L'app deve solo segnare bene i pagamenti elettronici (PE).
- **Senza rete** non si emette: serve il registro di emergenza (da gestire nell'app) e la regolarizzazione dopo.
- Da verificare nel prototipo: durata della sessione del portale, scadenza della password Fisconline.

## Dati utili
- Google Sheet «foodtruck» (ID `1VaprnuFm5gY2Mlorrv9zFS4C7KSW65Nq2wxEKDs8cjo`): scheda **Data**, cella A1 = JSON completo di VegMan Planner (fonte dell'import); schede Ricette, Prodotti, Ingredienti, Acquisti, Comande.
- Scontrini DCO 2026: 6.751, 104.491 € IVA inclusa, scontrino medio 15,48 €.
- Prezzi di vendita: kebab 12 €, Casciu 10 €, VegMan 10 €, patate 5 €, tenerina 5 € (IVA 10%).

## Stato della fase 0
1. [x] Progetti Firebase `vegman-prova` e `vegman-app` creati da Matteo
2. [x] Struttura `app/`, modulo fiscale con 12 test, bozza regole Firestore, workflow GitHub
3. [x] Database: accesso Google, ruoli e regole definitive (27 test sull'emulatore), pannello «Persone» del titolare, prova completa nel browser, pubblicazione automatica su `vegman-prova` con l'account `github-pubblicazione`; primo accesso e profilo titolare di Matteo fatti il 6/11/2026
4. [ ] Import dei dati da VegMan Planner + controllo dei totali di food cost
5. [ ] Modulo fiscale di rete: accesso Fisconline, emissione, annullo, PDF, gestione errori, simulatore
6. [ ] App Android di prova (Capacitor) installata sullo smartphone di Matteo
7. [ ] Matteo inserisce le credenziali sul telefono
8. [ ] Vendita di prova + annullo dall'app, con via libera di Matteo
9. [ ] Verifica di sessione, errori di rete, ripresa senza doppioni; resoconto

Piano completo: documento «Super app VegMan · Piano fase 0» (Claude Docs, https://claude.ai/artifact/14Qe3uca9WUo9e2VtQaCWD).
