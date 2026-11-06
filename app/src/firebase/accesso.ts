/**
 * Avvio di Firebase e accesso con Google.
 * Firestore usa la cache offline: l'app continua a funzionare senza rete e sincronizza dopo.
 * Provato a mano nell'app (serve un vero accesso Google); la logica testabile sta in profilo.ts e ruoli.ts.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence, connectAuthEmulator, getAuth, GoogleAuthProvider, onAuthStateChanged, setPersistence,
  signInWithCredential, signInWithPopup, signOut, type Auth, type User,
} from 'firebase/auth';
import {
  connectFirestoreEmulator, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { configPer, type Ambiente } from './config';
import { leggiProfilo, type Profilo } from './profilo';

export interface Servizi {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

/**
 * Con `emulatori` l'app usa gli emulatori locali (Auth 9099, Firestore 8080) invece di Firebase:
 * serve solo alle prove automatiche nel browser, mai in un pacchetto pubblicato.
 */
export function avviaFirebase(ambiente: Ambiente, opzioni: { emulatori?: boolean } = {}): Servizi {
  const config = configPer(ambiente);
  // Con gli emulatori si usa un progetto «demo-»: nessuna chiamata può arrivare ai progetti veri.
  const app = initializeApp(opzioni.emulatori ? { ...config, projectId: 'demo-vegman' } : config);
  const auth = getAuth(app);
  void setPersistence(auth, browserLocalPersistence);
  const db = initializeFirestore(app, {
    localCache: opzioni.emulatori
      ? memoryLocalCache()
      : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (opzioni.emulatori) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { app, auth, db };
}

export async function accediConGoogle({ auth }: Servizi): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return (await signInWithPopup(auth, provider)).user;
}

/**
 * Solo per le prove con gli emulatori: entra come utente Google simulato, senza la finestra di Google
 * (che scarica codice da apis.google.com). Non va mai usata con i progetti veri.
 */
export async function accediProva({ auth }: Servizi, u: { sub: string; email: string; nome: string }): Promise<User> {
  const token = JSON.stringify({ sub: u.sub, email: u.email, email_verified: true, name: u.nome });
  return (await signInWithCredential(auth, GoogleAuthProvider.credential(token))).user;
}

export function esci({ auth }: Servizi): Promise<void> {
  return signOut(auth);
}

export type StatoAccesso =
  | { stato: 'fuori' }
  | { stato: 'non-abilitato'; uid: string; email: string }
  | { stato: 'dentro'; utente: User; profilo: Profilo };

/** Avvisa a ogni cambio: uscito, entrato ma non abilitato dal titolare, entrato con un ruolo. */
export function osservaAccesso(s: Servizi, avvisa: (stato: StatoAccesso) => void): () => void {
  return onAuthStateChanged(s.auth, async (utente) => {
    if (!utente) return avvisa({ stato: 'fuori' });
    const profilo = await leggiProfilo(s.db, utente.uid);
    if (!profilo || !profilo.attivo) {
      return avvisa({ stato: 'non-abilitato', uid: utente.uid, email: utente.email ?? '' });
    }
    avvisa({ stato: 'dentro', utente, profilo });
  });
}
