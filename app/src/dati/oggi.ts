/** Data di oggi (aaaa-mm-gg) sul fuso di Roma. */
export function dataRoma(quando: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(quando);
}

/** Oggi; solo nelle prove con gli emulatori si può fissare una data (localStorage «vegman-oggi»). */
export function oggi(): string {
  if (import.meta.env.VITE_EMULATORI === '1') {
    try {
      const fissa = localStorage.getItem('vegman-oggi');
      if (fissa && /^\d{4}-\d{2}-\d{2}$/.test(fissa)) return fissa;
    } catch { /* senza localStorage si usa la data vera */ }
  }
  return dataRoma();
}
