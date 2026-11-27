/**
 * Invio del documento al cliente col menu di condivisione del telefono (WhatsApp, email, SMS…):
 * il PDF a striscia fatto dall'app (cassa/pdf.ts), un solo file, sia per gli scontrini veri sia per le prove.
 */
import { Capacitor } from '@capacitor/core';
import type { ScontrinoArchivio } from '../cassa/archivio';
import { messaggioInvio, nomeFile } from '../cassa/ricevuta';

function base64(byte: Uint8Array): string {
  let s = '';
  for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(s);
}

function scarica(blob: Blob, nome: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/** Apre il menu di condivisione. Restituisce false se nel browser si è solo scaricato il file. */
export async function condividiScontrino(s: ScontrinoArchivio, pdf: Uint8Array): Promise<boolean> {
  const testo = messaggioInvio(s);
  const nome = nomeFile(s, 'pdf');
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { uri } = await Filesystem.writeFile({ path: nome, data: base64(pdf), directory: Directory.Cache });
    await Share.share({ title: 'Scontrino VegMan', text: testo, files: [uri], dialogTitle: 'Invia lo scontrino' });
    return true;
  }
  const file = new File([pdf as BlobPart], nome, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ title: 'Scontrino VegMan', text: testo, files: [file] }); return true; }
  scarica(file, file.name);
  return false;
}
