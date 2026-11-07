/**
 * Cassaforte delle credenziali Fisconline (vedi CLAUDE.md, «Regole di sicurezza»).
 * Le scrive solo Matteo, nell'app Android; restano cifrate nel Keystore del telefono (AES-GCM).
 * Mai nel codice, nel database, nei log o nei messaggi di errore: qui nessun errore contiene un valore.
 * Nel browser la cassaforte non esiste: lì non c'è un posto sicuro dove tenerle.
 */
export interface Credenziali {
  codiceFiscale: string;
  password: string;
  pin: string;
}

/** Stessa forma di SecureStorage (@aparajita/capacitor-secure-storage). */
export interface DepositoSicuro {
  get(chiave: string): Promise<unknown>;
  set(chiave: string, valore: string): Promise<void>;
  remove(chiave: string): Promise<unknown>;
}

const CHIAVE = 'fisconline';

export class ErroreCredenziali extends Error {
  override name = 'ErroreCredenziali';
}

/** Controlla la forma (non la correttezza: quella la dice solo l'Agenzia). */
export function preparaCredenziali(c: Credenziali): Credenziali {
  const codiceFiscale = c.codiceFiscale.trim().toUpperCase();
  const pin = c.pin.trim();
  if (!/^[A-Z0-9]{16}$/.test(codiceFiscale)) throw new ErroreCredenziali('Il codice fiscale deve avere 16 lettere e cifre.');
  if (!c.password) throw new ErroreCredenziali('Manca la password.');
  if (!/^\d{10}$/.test(pin)) throw new ErroreCredenziali('Il PIN Fisconline completo ha 10 cifre.');
  return { codiceFiscale, password: c.password, pin };
}

export function cassaforte(d: DepositoSicuro) {
  return {
    async salva(c: Credenziali): Promise<void> {
      await d.set(CHIAVE, JSON.stringify(preparaCredenziali(c)));
    },
    /** Solo per l'accesso al portale (passo 5b): non mostrarle mai a schermo. */
    async leggi(): Promise<Credenziali | null> {
      const v = await d.get(CHIAVE);
      if (typeof v !== 'string' || !v) return null;
      try {
        const c = JSON.parse(v) as Credenziali;
        return typeof c?.codiceFiscale === 'string' && typeof c.password === 'string' && typeof c.pin === 'string' ? c : null;
      } catch { return null; }
    },
    async presenti(): Promise<boolean> {
      return (await this.leggi()) !== null;
    },
    async cancella(): Promise<void> {
      await d.remove(CHIAVE);
    },
  };
}
