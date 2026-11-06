/**
 * Configurazione dei progetti Firebase.
 * Questi valori NON sono segreti: identificano il progetto e finiscono comunque nell'app.
 * I dati sono protetti dalle regole di sicurezza (firestore.rules), non da questi valori.
 */
export type Ambiente = 'prova' | 'produzione';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const CONFIG: Record<Ambiente, FirebaseConfig | null> = {
  prova: {
    apiKey: 'AIzaSyA86CwbIoDLcHo-pf9JwS8EFIAt5iP_4aU',
    authDomain: 'vegman-prova.firebaseapp.com',
    projectId: 'vegman-prova',
    storageBucket: 'vegman-prova.firebasestorage.app',
    messagingSenderId: '142177740062',
    appId: '1:142177740062:web:ee6ff83edf656af9e1d50f',
  },
  produzione: {
    apiKey: 'AIzaSyC9IMrdOJS5d0rIewyreajA4eQgPO7vXNM',
    authDomain: 'vegman-app.firebaseapp.com',
    projectId: 'vegman-app',
    storageBucket: 'vegman-app.firebasestorage.app',
    messagingSenderId: '765161624870',
    appId: '1:765161624870:web:c41cd2a559998472629de7',
  },
};

export function configPer(ambiente: Ambiente): FirebaseConfig {
  const c = CONFIG[ambiente];
  if (!c) throw new Error(`Configurazione Firebase mancante per l'ambiente "${ambiente}"`);
  return c;
}
