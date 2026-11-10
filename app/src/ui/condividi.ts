/**
 * Invio dello scontrino al cliente: menu di condivisione (WhatsApp, email, …) con la ricevuta VegMan
 * e, quando c'è, il PDF dell'Agenzia. Nell'app Android con Share/Filesystem, nel browser con navigator.share.
 */
import { Capacitor } from '@capacitor/core';
import type { ScontrinoArchivio } from '../cassa/archivio';
import { contenutoRicevuta, messaggioInvio, nomeFile } from '../cassa/ricevuta';
import { immagineRicevuta } from './ricevutaImmagine';

async function base64(b: Blob): Promise<string> {
  const byte = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Prepara i file e apre il menu di condivisione. Restituisce false se l'utente non ha potuto condividere. */
export async function condividiScontrino(s: ScontrinoArchivio, quando: Date, pdf?: Uint8Array): Promise<boolean> {
  const png = await immagineRicevuta(contenutoRicevuta(s, quando));
  const file: { nome: string; blob: Blob }[] = [{ nome: nomeFile(s, 'png'), blob: png }];
  if (pdf?.length) file.push({ nome: nomeFile(s, 'pdf'), blob: new Blob([pdf as BlobPart], { type: 'application/pdf' }) });
  const testo = messaggioInvio(s);
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const uri: string[] = [];
    for (const f of file) uri.push((await Filesystem.writeFile({ path: f.nome, data: await base64(f.blob), directory: Directory.Cache })).uri);
    await Share.share({ title: 'Scontrino VegMan', text: testo, files: uri, dialogTitle: 'Invia lo scontrino' });
    return true;
  }
  const comeFile = file.map((f) => new File([f.blob], f.nome, { type: f.blob.type }));
  if (navigator.canShare?.({ files: comeFile })) {
    await navigator.share({ title: 'Scontrino VegMan', text: testo, files: comeFile });
    return true;
  }
  // Browser senza condivisione di file: si scarica la ricevuta.
  const a = document.createElement('a');
  a.href = URL.createObjectURL(png);
  a.download = file[0]!.nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return false;
}
