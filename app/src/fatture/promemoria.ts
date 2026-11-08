/** Promemoria mensile delle fatture (vedi CLAUDE.md, «Giro mensile»): notifica del telefono il 5 alle 9:07. */
export const ID_PROMEMORIA_FATTURE = 5005;

export function notificaFatture() {
  return {
    id: ID_PROMEMORIA_FATTURE,
    title: 'VegMan · fatture del mese',
    body: 'È il 5: scarica le fatture ricevute dal cassetto fiscale e aggiorna i prezzi.',
    // Ogni mese, il giorno 5 alle 9:07 (ora del telefono). Non serve precisione al minuto: niente permesso «sveglie esatte».
    schedule: { on: { day: 5, hour: 9, minute: 7 }, allowWhileIdle: true },
    isExactNotification: false,
    extra: { pagina: 'fatture' },
  };
}

/** Pagina da aprire quando si tocca una notifica (solo pagine note). */
export function paginaDaNotifica(extra: unknown): string | null {
  const p = (extra as { pagina?: unknown } | null)?.pagina;
  return p === 'fatture' ? '#/fatture' : null;
}
