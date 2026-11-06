/** Lettura del profilo dal database (provata sull'emulatore: tests/regole). */
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { profiloDa, type Profilo } from './profilo';

/**
 * Legge il profilo. null = la persona non è (ancora) abilitata dal titolare:
 * l'app mostra il suo codice utente da comunicare al titolare.
 */
export async function leggiProfilo(db: Firestore, uid: string): Promise<Profilo | null> {
  try {
    const s = await getDoc(doc(db, 'utenti', uid));
    return s.exists() ? profiloDa(uid, s.data()) : null;
  } catch (e) {
    // Senza profilo le regole negano anche la lettura del proprio documento.
    if ((e as { code?: string }).code === 'permission-denied') return null;
    throw e;
  }
}
