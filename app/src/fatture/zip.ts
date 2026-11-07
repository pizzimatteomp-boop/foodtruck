/**
 * Lettura degli archivi ZIP (es. il download di più fatture dal portale): elenco dei file e contenuto.
 * Supporta file non compressi e compressi «deflate», gli unici usati in pratica. Niente librerie.
 */
export class ErroreZip extends Error {
  override name = 'ErroreZip';
}

export interface FileZip { nome: string; dati: Uint8Array }

const u16 = (b: Uint8Array, p: number) => b[p]! | (b[p + 1]! << 8);
const u32 = (b: Uint8Array, p: number) => (b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16) | (b[p + 3]! << 24)) >>> 0;

async function inflate(dati: Uint8Array): Promise<Uint8Array> {
  const flusso = new Blob([dati as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flusso).arrayBuffer());
}

export const eZip = (b: Uint8Array) => b.length > 4 && u32(b, 0) === 0x04034b50;

export async function leggiZip(b: Uint8Array): Promise<FileZip[]> {
  // Fine della directory centrale: cercata dal fondo (può esserci un commento).
  let fine = -1;
  for (let p = b.length - 22; p >= Math.max(0, b.length - 65557); p--) {
    if (u32(b, p) === 0x06054b50) { fine = p; break; }
  }
  if (fine < 0) throw new ErroreZip('Archivio ZIP non valido o incompleto.');
  const quanti = u16(b, fine + 10);
  let p = u32(b, fine + 16);
  const file: FileZip[] = [];
  for (let i = 0; i < quanti; i++) {
    if (u32(b, p) !== 0x02014b50) throw new ErroreZip('Archivio ZIP rovinato.');
    const metodo = u16(b, p + 10);
    const compresso = u32(b, p + 20);
    const lNome = u16(b, p + 28), lExtra = u16(b, p + 30), lCommento = u16(b, p + 32);
    const locale = u32(b, p + 42);
    const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + lNome));
    p += 46 + lNome + lExtra + lCommento;
    if (nome.endsWith('/')) continue; // cartella
    if (u32(b, locale) !== 0x04034b50) throw new ErroreZip('Archivio ZIP rovinato.');
    const inizio = locale + 30 + u16(b, locale + 26) + u16(b, locale + 28);
    const grezzo = b.subarray(inizio, inizio + compresso);
    if (metodo === 0) file.push({ nome, dati: grezzo });
    else if (metodo === 8) file.push({ nome, dati: await inflate(grezzo) });
    else throw new ErroreZip(`Compressione non supportata nel file «${nome}».`);
  }
  return file;
}
