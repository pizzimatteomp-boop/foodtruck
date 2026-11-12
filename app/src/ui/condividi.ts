/**
 * Invio dello scontrino al cliente col menu di condivisione del telefono (WhatsApp, email, SMS…).
 * Scontrino vero: il PDF dell'Agenzia (il documento fiscale). Simulatore, o PDF non disponibile:
 * la ricevuta in testo semplice. Niente immagini: è il modo più sicuro perché arrivi.
 */
import { Capacitor } from '@capacitor/core';
import type { ScontrinoArchivio } from '../cassa/archivio';
import { messaggioInvio, nomeFile, testoRicevuta } from '../cassa/ricevuta';

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
export async function condividiScontrino(s: ScontrinoArchivio, quando: Date, pdf?: Uint8Array): Promise<boolean> {
  const conPdf = !!pdf?.length;
  const testo = conPdf ? messaggioInvio(s) : testoRicevuta(s, quando);
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    if (conPdf) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { uri } = await Filesystem.writeFile({ path: nomeFile(s, 'pdf'), data: base64(pdf!), directory: Directory.Cache });
      await Share.share({ title: 'Scontrino VegMan', text: testo, files: [uri], dialogTitle: 'Invia lo scontrino' });
    } else {
      await Share.share({ title: 'Scontrino VegMan', text: testo, dialogTitle: 'Invia lo scontrino' });
    }
    return true;
  }
  if (conPdf) {
    const file = new File([pdf as BlobPart], nomeFile(s, 'pdf'), { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ title: 'Scontrino VegMan', text: testo, files: [file] }); return true; }
    scarica(file, file.name);
    return false;
  }
  if (typeof navigator.share === 'function') { await navigator.share({ title: 'Scontrino VegMan', text: testo }); return true; }
  scarica(new Blob([testo], { type: 'text/plain;charset=utf-8' }), nomeFile(s, 'txt'));
  return false;
}
