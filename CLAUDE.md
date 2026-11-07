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

## Fatture, ingredienti e food cost (approvato da Matteo il 6/11/2026)
Documento completo: «Super app VegMan · Fatture, ingredienti e food cost» (Claude Docs, https://claude.ai/artifact/Wifev4Vm7Ta2qULCPTrnYu).
- **Giro mensile**: promemoria sul telefono Android il 5 del mese → l'app scarica le fatture ricevute dal cassetto fiscale (portale Fatture e Corrispettivi, stesso accesso Fisconline del DCO, solo dall'app Android) → riconosce gli articoli → aggiorna i prezzi → ricalcola il food cost. Riserva sempre disponibile: caricamento manuale di XML/ZIP. Le fatture non arrivano su altri programmi (né Aruba né commercialista).
- **Righe di fattura in 3 categorie**: alimentare e **packaging** (entrambi nel food cost; il packaging entra nelle ricette a pezzi) e non alimentare (archiviato, fuori dal food cost). Articolo = fornitore + codice/descrizione; collegato una volta a un ingrediente con la quantità per confezione, poi si collega da solo. Tutto correggibile a mano (doppioni, errori); acquisti manuali per chi non fa fattura.
- **Prezzo di un ingrediente** = media pesata degli acquisti degli **ultimi 60 giorni**, di tutte le fonti; senza acquisti recenti l'ultimo prezzo, segnato «vecchio»; senza prezzo il prodotto è «incompleto» con l'elenco di cosa manca. Semilavorati = costo ricetta / resa. Nessun arrotondamento intermedio.
- **Storico**: ogni acquisto resta per sempre; a fine mese si salva la fotografia di prezzo per ingrediente e per fonte e del food cost di ogni prodotto. Grafici dell'andamento nel tempo per ingrediente e prodotto; avvisi su soglia di food cost (es. Kebab 30%) e su rincari mensili oltre una %.
- **Pagine (solo titolare)**: Fatture, Ingredienti, Ricette e prodotti, Avvisi. Il team vede ricette e ingredienti senza prezzi né costi (garantito dalle regole del database).
- **Scelte tecniche**: schermate con Preact; app installabile e apribile senza rete; fatture (XML e .p7m) lette sul dispositivo; dati veri mai nel repository (è pubblico), nei test solo dati inventati.
- **VegMan Planner**: l'attività è ferma, il passaggio è semplice: un import una tantum delle cose utili (ingredienti, prodotti, ricette, fatture, articoli); le 89 comande storiche non si importano.

## Ingredienti, allergeni e menu pubblico (deciso da Matteo il 7/11/2026)
- Ogni ingrediente ha, **inseriti a mano** dall'etichetta (nessun suggerimento automatico, per avere dati certi): composizione in italiano e inglese, i 14 allergeni del Reg. UE 1169/2011 (allegato II), le tracce («può contenere»), il peso per pezzo se si conta a pezzi, e la spunta «etichetta controllata».
- La lista ingredienti di ogni prodotto si calcola dalla ricetta (semilavorati compresi): ordine di peso decrescente, ingredienti composti con il contenuto tra parentesi, allergeni in evidenza, riepilogo «Contiene» e «Può contenere»; il packaging è escluso. Se un ingrediente non è controllato o manca un dato, il prodotto lo segnala.
- Menu pubblico **con i prezzi**, in **italiano e inglese**, aperto a tutti via QR code e stampabile (cartello prodotti × allergeni); si aggiorna solo quando il titolare preme «Pubblica». Contiene solo nomi, prezzi, ingredienti e allergeni.
- Da far vedere al consulente HACCP: il QR affianca il cartello stampato, non lo sostituisce.

## Marchio (Brand Guidelines Manodopera 2024)
- Colori: bianco `#FFFFFF`, nero `#000000`, arancio `#F08A39`, menta `#B9DED3`, lampone `#B7426F`, glaucous `#6B77B7`; crema della «V» `#F3E9D0`. Per il testo piccolo si usano tonalità più scure del glaucous (`#5560A3`, `#4E5899`) per un contrasto ≥ 4,5:1. Combinazioni del manuale: nero su arancio, glaucous su menta, bianco su glaucous, nero su menta.
- Font dei titoli: Luckiest Guy (Apache 2.0), sempre in maiuscolo; in `app/public/font/` (sottoinsieme WOFF2, 16 KB).
- Logo nell'app: monogramma «V» (`app/src/ui/LogoV.tsx`); icone dell'app = V crema su glaucous. Altre versioni (circolare con la carota mascotte, scritta VEGMAN, lettering World Savior) solo nel manuale.
- Il manuale PDF è riservato: non va nel repository (che è pubblico).

## Cassa: desideri di Matteo (7/11/2026, per la fase «comande e cassa»)
- Interfaccia simile a **Billy** (con cui Matteo si è trovato bene); prodotti come pulsanti (già così nella Cassa · prova).
- **Tastierino per importi liberi** (riga a prezzo diverso), come Billy.
- Schermata di Billy (foto del 7/11/2026), da cui prendere l'impostazione, non la grafica:
  - in alto le righe dello scontrino (nome, «1 pz × 10,00 €», totale riga), a righe alterne;
  - barra «Totale (n pz) · importo» con freccia per emettere;
  - campo «Descrizione» per la riga a importo libero;
  - riga di tasti di pagamento CONT / ELET / N.R. (non riscosso) / INT;
  - due pagine scorrevoli: (1) tastierino 0–9, «.», «×» (quantità) con una colonna di 4 prodotti preferiti; (2) ricerca, schede per gruppo (Tutte, Vegman, …) e griglia di prodotti a 4 colonne, colori per gruppo.
  - Nella nostra: colori del marchio, prodotti e gruppi dalla pagina Prodotti, in più i movimenti senza incasso (omaggio, pasto staff, scarto…) e la quadratura.
- **Fatture elettroniche** ai clienti che le chiedono (Billy lo fa): da studiare (invio allo SdI dal portale Fatture e Corrispettivi con lo stesso accesso Fisconline).

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

## Fatture e Corrispettivi: cosa sappiamo (studio nel browser del 7/11/2026)
Solo consultazione, nessun valore personale annotato. Base `https://ivaservizi.agenziaentrate.gov.it` salvo altro dominio. `{ts}` = millisecondi anti-cache.
- **Accesso** (tratto POST → PortaleWeb non registrato: lo strumento perde le richieste tra domini; quel giorno c'era anche il cambio password obbligatorio):
  1. `GET /portale/` → rimando a `iampe…/sam/UI/Login`
  2. `GET iampe…/sam/UI/Login?realm=/agenziaentrate&goto={…/PortaleWeb/home?to=FATBTB}` → 200
  3. La pagina di accesso è un'app React (`/loginam/dist/js/…`): il modulo Fisconline/Entratel (`IDToken1/2/3` e nascosti `goto`, `gotoOnFail`, `SunQueryParamsString`, `encoded`, `gx_charset`, `newpost`) è solo di facciata. L'accesso vero è **`POST https://iampe.agenziaentrate.gov.it/api/login/telematico`** con JSON `{username, password, pin}` e cookie (`withCredentials`); se riesce la pagina va al parametro `goto` (altrimenti `PortaleWeb/home`). Errori in `response.data.details`: `INVALID_CREDENTIALS`, `PASSWORD_EXPIRED`, `FAILED_LOGIN_ATTEMPTS`, `ACCOUNT_LOCKED` (letto dal codice pubblico della pagina il 7/11/2026). Esiste anche `/api/login/sister`
  4. `GET portale.agenziaentrate.gov.it/PortaleWeb/home?to=FATBTB` → rimando a `/instr/InstradamentofcWeb/home`
  5. `GET /instr/instradamento-fatture-rest/rs/initLight`, `/dp/PI2FC`, `/rs/infouser-fc`, `/rs/wizardTemplate` (scelta utenza)
  6. `POST /instr/instradamento-fatture-rest/rs/setUserChoice?v={ts}` → 200, inviata in automatico; campi dal JavaScript: `tipoutenza` (`meStesso`/`delegaDiretta`/`delMassiva`), `cf`, `pIva` (formato del corpo non visto). Prima della scelta `/rs/fullTemplate` risponde 406
  7. Home: `/rs/servizi`, `/rs/comunicazioni`, `/ser/api/fatture/v1/ul/me/adesione/stato`, `/ser/api/portale/v1/gestori/me`
  - La pagina usa `FattCorrActiveB`/`FattCorrActiveToken` nel localStorage; una GET a `iampe…/sam/UI/Login?…goto=…FATBTB` resta «pending» (controllo di sessione)
- **Token**: `GET /cons/cons-services/sc/tokenB2BCookie/get?v={ts}` → 200 corpo vuoto, header di risposta `x-b2bcookie` e `x-token`, da rimandare come header (senza: 409).
- **Elenco**: `GET /cons/cons-services/rs/fe/ricevute/dal/{ggmmaaaa}/al/{ggmmaaaa}/ricerca/{ricezione|emissione}?v={ts}` → JSON `{dataRicercaDa, dataRicercaA, totaleFatture, limiteBloccoTotaleFatture (8000), fatture:[{idFattura (11 cifre), tipoInvio ("FPR"), tipoDocumento, numeroFattura, stato, dataFattura "aaaa-mm-gg", dataAccoglienzaFile, dataConsegna "gg/mm/aaaa", imponibile "+…,dd", imposta, pivaEmittente, denominazioneEmittente, idPaeseCedente, pivaCliente, cfCliente, fileDownload{idInvio, statoFile, fileDownload, presaVisione, …}, …}]}`. **Massimo 93 giorni estremi compresi**: oltre 200 con `fatture: []` senza errore → spezzare. Altri: `/rs/fe/emesse`, `/rs/fe/mc` (messe a disposizione), `/rs/ft/ricevute|emesse` (transfrontaliere). Dettaglio: `/rs/fatture/dettaglio/{tipoInvio}{idFattura}`.
- **File**: `GET /cons/cons-services/rs/fatture/file/{tipoInvio}{idFattura}?tipoFile=FILE_FATTURA&download=1&v={ts}` (stessi header) → `Content-Disposition: attachment; filename=….xml.p7m`, Content-Type `application/xml` ma è CAdES DER (`30 80 06 09`). Non cambia `presaVisione`/`statoVisto`.
- Download massivo (`/cons/mass-web/#/richieste/fatture`): asincrono, non serve per il giro mensile.
- **Adesione**: `GET /ser/api/fatture/v1/ul/me/adesione/stato`; attiva dal 18/04/2023, non revocata.
- **Sessione**: ancora valida dopo 34 minuti di inattività (durata massima da misurare); scaduta → rimando a `iampe…/sam/UI/Login?realm=/agenziaentrate&goto=…FATBTB`. Le pagine HTML `/cons/cons-web/…` aperte direttamente danno 404: usare solo le API.

## Dati utili
- Google Sheet «foodtruck» (ID `1VaprnuFm5gY2Mlorrv9zFS4C7KSW65Nq2wxEKDs8cjo`): scheda **Data**, cella A1 = JSON completo di VegMan Planner (fonte dell'import); schede Ricette, Prodotti, Ingredienti, Acquisti, Comande.
- Scontrini DCO 2026: 6.751, 104.491 € IVA inclusa, scontrino medio 15,48 €.
- Prezzi di vendita: kebab 12 €, Casciu 10 €, VegMan 10 €, patate 5 €, tenerina 5 € (IVA 10%).

## Stato della fase 0
1. [x] Progetti Firebase `vegman-prova` e `vegman-app` creati da Matteo
2. [x] Struttura `app/`, modulo fiscale con 12 test, bozza regole Firestore, workflow GitHub
3. [x] Database: accesso Google, ruoli e regole definitive (27 test sull'emulatore), pannello «Persone» del titolare, prova completa nel browser, pubblicazione automatica su `vegman-prova` con l'account `github-pubblicazione`; primo accesso e profilo titolare di Matteo fatti il 6/11/2026
4. [x] Ingredienti, fatture e ricette (vedi sezione sopra), in due tappe:
   - 4a. [x] Base pulita: Preact, app installabile e apribile senza rete (service worker scritto a mano), menu tra le pagine per ruolo; prove nel browser sul pacchetto vero
   - 4b. In sotto-passi:
     - 4b-1. [x] Motore del food cost (`app/src/foodcost/`) e import da Planner (`app/src/importazione/`, pagina «Importa»): verificato identico a Planner su 200 archivi inventati e sui 13 prodotti veri (6/11/2026). Unica differenza voluta: righe di fattura a quantità 0 non danno prezzo 0 €
     - 4b-2. [x] Pagina Ingredienti (`app/src/ui/Ingredienti.tsx`, `SchedaIngrediente.tsx`, `app/src/ingredienti/`): elenco alimentare/packaging con €/kg, €/L o €/pz e stato del prezzo; scheda con fonti e prezzo per fonte, collegamento articoli con conversione proposta dal nome (es. «CECI 5 KG» → 5000 g), unione dei doppioni (sposta fonti e ricette), nuovo ingrediente
     - 4b-3. [x] Fatture (`app/src/fatture/`, pagina «Fatture»): lettori scritti da zero e senza librerie per XML FatturaPA, buste firmate .p7m (anche spezzate e in base64) e ZIP; fattura riconosciuta da fornitore+tipo+numero+data (niente doppioni, salta quelle già in Planner); articolo = partita IVA + codice (o descrizione), collegato una volta poi automatico; note di credito archiviate senza toccare i prezzi; coda «Da controllare» con le 3 categorie; acquisti senza fattura. Fixture inventate in `app/tests/fatture/` (firmate con un certificato finto)
     - 4b-4. [x] Composizione e allergeni (`app/src/etichette/`, sezione «Etichetta e allergeni» nella scheda ingrediente, pagina «Allergeni»): dati a mano IT/EN, allergeni tra asterischi nella composizione, 14 allergeni + tracce, peso per pezzo, spunta «controllata»; lista per prodotto in ordine di peso con composti e semilavorati tra parentesi, tabella prodotti × allergeni, dati mancanti segnalati. Rifare l'import da Planner non cancella le etichette
     - 4b-5. [x] Editor di ricette e prodotti (pagina «Prodotti», `app/src/prodotti/`): elenco con food cost % e soglia, scheda con righe della ricetta (ingredienti, semilavorati, packaging), costo per riga, food cost e margine, lista ingredienti IT/EN dal vivo; nome inglese, IVA, «in menu», soglia; blocco delle ricette circolari; menu del telefono con 4 pagine principali e le altre nel pannello della Home
     - 4b-6. [x] Menu pubblico (`app/src/menu/`, pagina «Menu e QR»): copia pubblica in `/menu/pubblico` (leggibile da tutti, scritta solo dal titolare, solo nomi/prezzi/ingredienti/allergeni), pubblicazione bloccata se mancano dati delle etichette, avviso di modifiche non pubblicate; pagina clienti `#/menu` senza accesso, IT/EN; QR code (qrcode-generator, verificato decodificandolo con jsQR nei test); stampa A4 con cartello prodotti × allergeni, QR e schede IT/EN
     - 4b-7. [x] Storico e avvisi (`app/src/storico/`, pagina «Avvisi», grafici in `app/src/ui/Grafico.tsx` e `Andamenti.tsx`): prezzo pagato mese per mese dagli acquisti (totale e per fonte, variazioni 1/3/12 mesi); fotografia mensile salvata da sola al primo accesso del titolare nel mese nuovo (`/storico/aaaa-mm`, non modificabile); andamento del food cost con soglia (mesi senza fotografia ricalcolati e segnati); avvisi: soglia superata, rincari oltre la % impostata (iniziale 10%), ingredienti in menu senza prezzo o con prezzo vecchio, articoli da controllare, menu da sistemare o ripubblicare. Data «oggi» sul fuso di Roma; nelle prove nel browser fissata al 7/11/2026
5. [ ] Modulo fiscale di rete: accesso Fisconline, emissione, annullo, PDF, gestione errori, simulatore; con lo stesso accesso download mensile delle fatture ricevute e promemoria il 5 del mese
   - 5a. [x] Motore di emissione sicura (`app/src/fiscal/emissione.ts`, `servizio.ts`, `trasporto.ts`) e simulatore dell'Agenzia (`simulatore.ts`, guasti a comando). Regola anti-doppioni: prima di inviare si annota «invio in sospeso» sul dispositivo; risposta persa → si confronta con «ultima vendita» (stesse righe e data, idtrx diverso dall'ultima emessa da questo dispositivo): se c'è è «recuperato», altrimenti «non emesso» e si può riprovare; se non si riesce a verificare, nessuno scontrino nuovo parte. Annulli/resi persi restano in sospeso e si verificano a mano sul portale. Sessione scaduta e rifiuti dell'Agenzia = niente emesso. Prova a raffica: 300 vendite con guasti casuali → 300 scontrini esatti
   - 5b. [ ] Accesso Fisconline (login, scelta utenza «Me stesso»): motore pronto (`app/src/fiscal/portale.ts`: come la pagina dell'Agenzia, JSON a `/api/login/telematico` con le credenziali dalla cassaforte, motivo del rifiuto dai codici `details`, sceglie «Me stesso», provato su un portale finto) e pulsante «Prova accesso (solo lettura)» nella Cassa · prova (dati esercente DCO, adesione, numero di fatture ricevute in 30 giorni). Resoconto copiabile senza valori (con i messaggi d'errore del telefono, senza parametri); dopo un rifiuto l'app si blocca e non riprova; dopo l'accesso ogni lettura è provata anche se la precedente fallisce. **Prima prova reale 7/11/2026 20:58: accesso riuscito** (`/api/login/telematico` → 200 `{success}`), `PortaleWeb/home` → 200 senza rimando, poi `rs/initLight` → errore di rete sul telefono. Seconda prova 21:07: dopo l'accesso tutte le API di `ivaservizi` rispondono 403 (instradamento) o 401 (DCO, adesione, token): la sessione su `ivaservizi` non si apre. Ipotesi: pagina ponte (SSO tra domini, modulo automatico o rimando via script) che il browser attraversa da solo; dal 7/11 l'app la attraversa (`apriPagina`/`pontePagina`) e apre anche `/instr/InstradamentofcWeb/home`
   - 5c. [ ] Download fatture ricevute dal portale Fatture e Corrispettivi: indirizzi da studiare con Matteo (brief in chat del 7/11/2026)
6. [ ] App Android di prova (Capacitor) installata sullo smartphone di Matteo
   - 6a. [x] Trasporto HTTP nativo (`app/src/fiscal/nativo.ts`) e archivio invii sul telefono (`archivioSuDispositivo`)
   - 6b. [x] Progetto `app/android/` (appId `it.vegman.app`, backup disattivato), accesso Google nativo (`@capacitor-firebase/authentication`, poi `signInWithCredential`), APK firmato costruito da GitHub (job «App Android», segreti `ANDROID_KEYSTORE_BASE64` e `ANDROID_KEYSTORE_PASSWORD`, la chiave non è mai nel repository). App Android registrata in Firebase `vegman-prova` (SHA-1 e SHA-256 della chiave), `google-services.json` nel repository (non segreto). Installata e accesso Google provato da Matteo il 7/11/2026. L'APK si scarica da GitHub > Actions > esecuzione su main > «VegMan-android»
   - 6c. [x] Cassaforte credenziali (`app/src/fiscal/cassaforte.ts`, Keystore AES-GCM con `@aparajita/capacitor-secure-storage`, solo nell'app Android e solo per il titolare; si salvano e si cancellano, mai mostrate) e pagina «Cassa · prova» (`app/src/fiscal/prova.ts`, `app/src/ui/CassaProva.tsx`, `#/cassa`, titolare e cassa): scontrini solo sul simulatore con esercente inventato, guasti a comando, verifica dei sospesi, annullo; archivio invii del simulatore con prefisso separato da quello vero
7. [ ] Matteo inserisce le credenziali sul telefono
8. [ ] Vendita di prova + annullo dall'app, con via libera di Matteo
9. [ ] Verifica di sessione, errori di rete, ripresa senza doppioni; resoconto

Piano completo: documento «Super app VegMan · Piano fase 0» (Claude Docs, https://claude.ai/artifact/14Qe3uca9WUo9e2VtQaCWD).
