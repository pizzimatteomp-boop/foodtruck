import { describe, expect, it } from 'vitest';
import { ID_PROMEMORIA_FATTURE, notificaFatture, paginaDaNotifica } from './promemoria';

describe('promemoria mensile delle fatture', () => {
  it('il 5 di ogni mese alle 9:07, senza sveglia esatta, apre le Fatture', () => {
    const n = notificaFatture();
    expect(n.id).toBe(ID_PROMEMORIA_FATTURE);
    expect(n.schedule.on).toEqual({ day: 5, hour: 9, minute: 7 });
    expect(n.isExactNotification).toBe(false);
    expect(paginaDaNotifica(n.extra)).toBe('#/fatture');
    expect(paginaDaNotifica({ pagina: 'javascript:x' })).toBeNull();
    expect(paginaDaNotifica(null)).toBeNull();
  });
});
