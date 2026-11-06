/**
 * Avvio di Firebase e accesso con Google.
 * Firestore usa la cache offline: l'app continua a funzionare senza rete e sincronizza dopo.
 * Provato a mano nell'app (serve un vero accesso Google); la logica testabile sta in profilo.ts e ruoli.ts.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence, getAuth, GoogleAuthProvider, onAuthStateChanged, setPersistence,
  signInWithPopup, signOut, type Auth, type User,
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { configPer, type Ambiente } from './config';
import { leggiProfilo, type Profilo } from './profilo';

export interface Servizi {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

export function avviaFirebase(ambiente: Ambiente): Servizi {
  const app = initializeApp(configPer(ambiente));
  const auth = getAuth(app);
  void setPersistence(auth, browserLocalPersistence);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  return { app, auth, db };
}

export async function accediConGoogle({ auth }: Servizi): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return (await signInWithPopup(auth, provider)).user;
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
