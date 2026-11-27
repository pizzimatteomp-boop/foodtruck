#!/usr/bin/env bash
# Controllo quotidiano del portale dell'Agenzia delle Entrate (solo pagine pubbliche, NESSUNA credenziale).
# Confronta le risposte di oggi con quelle viste quando l'app funzionava: se qualcosa cambia, l'accesso
# della cassa o lo scarico delle fatture potrebbero rompersi. Esce con 1 se c'è una differenza.
# Uso: bash app/scripts/controlla-agenzia.sh
set -u
IVA=https://ivaservizi.agenziaentrate.gov.it
POR=https://portale.agenziaentrate.gov.it
GOTO=https%3A%2F%2Fportale.agenziaentrate.gov.it%2FPortaleWeb%2Fhome%3Fto%3DFATBTB
LOGIN="https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=/agenziaentrate&goto=$GOTO"
JSON='Accept: application/json, text/plain, */*'

diff=0
# controlla "descrizione" "atteso" "ottenuto"
controlla() {
  if [ "$2" = "$3" ]; then echo "OK      $1: $3"; else echo "CAMBIATO $1: atteso «$2», oggi «$3»"; diff=1; fi
}
codice() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }

# 1. Pagina di accesso (app/src/fiscal/portale.ts, PAGINA_ACCESSO): deve restare la pagina React «loginam».
pagina=$(curl -s -L --max-time 30 -w '\n%{http_code} %{url_effective}' "$LOGIN")
fine=$(printf '%s' "$pagina" | tail -n1)
controlla "pagina di accesso" "200 $LOGIN" "$fine"
if printf '%s' "$pagina" | grep -q 'loginam/dist/js/app.bundle'; then controlla "codice della pagina di accesso" "loginam" "loginam"
else controlla "codice della pagina di accesso" "loginam" "assente"; fi

# 2. Servizio di accesso (/api/login/telematico): senza credenziali risponde 401 (esiste ancora).
controlla "servizio di accesso" 401 "$(codice -X POST -H 'Content-Type: application/json' -d '{}' https://iampe.agenziaentrate.gov.it/api/login/telematico)"

# 3. Passaggio verso Fatture e Corrispettivi (versoFatture in portale.ts), senza sessione.
controlla "portale (PortaleWeb/home)" 200 "$(codice "$POR/PortaleWeb/home?to=FATBTB")"
controlla "avvio portale (initPortale)" 401 "$(codice -H "$JSON" "$POR/portale-rest/rs/initPortale?to=FATBTB")"
controlla "vai a Fatture (vaiAFatturazione)" 401 "$(codice -H "$JSON" "$POR/portale-rest/rs/servizi/vaiAFatturazione/b2b")"
controlla "/portale/ (rimando)" "301 $IVA/instr/InstradamentofcWeb/wizard" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 30 "$IVA/portale/")"
controlla "pagina Fatture e Corrispettivi" 200 "$(codice "$IVA/instr/InstradamentofcWeb/home")"
controlla "avvio Fatture (initLight)" 401 "$(codice -H "$JSON" "$IVA/instr/instradamento-fatture-rest/rs/initLight?to=FATBTB")"

# 4. Scontrini (DCO) e fatture: senza sessione rispondono 401 / rimandano al portale.
controlla "scontrini DCO (dati/fiscali)" 401 "$(codice -H "$JSON" "$IVA/ser/api/documenti/v1/doc/documenti/dati/fiscali")"
controlla "adesione fatture" 401 "$(codice -H "$JSON" "$IVA/ser/api/fatture/v1/ul/me/adesione/stato")"
controlla "gettoni fatture (tokenB2BCookie)" "302 $POR/PortaleWeb/home?to=FATBTB" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "$JSON" --max-time 30 "$IVA/cons/cons-services/sc/tokenB2BCookie/get")"

if [ $diff = 0 ]; then echo "Tutto come prima."; else echo "ATTENZIONE: il portale dell'Agenzia è cambiato."; fi
exit $diff
