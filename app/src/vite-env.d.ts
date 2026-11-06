/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** «prova» (predefinito) o «produzione». */
  readonly VITE_AMBIENTE?: string;
  /** «1» solo per le prove nel browser: collega l'app agli emulatori locali. */
  readonly VITE_EMULATORI?: string;
}
