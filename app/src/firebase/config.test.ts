import { CONFIG, configPer } from './config';

describe('configurazione Firebase', () => {
  it('prova e produzione puntano a progetti diversi', () => {
    expect(configPer('prova').projectId).toBe('vegman-prova');
    expect(configPer('produzione').projectId).toBe('vegman-app');
  });

  it('se manca una configurazione lo dice chiaramente', () => {
    const salvata = CONFIG.prova;
    CONFIG.prova = null;
    try {
      expect(() => configPer('prova')).toThrow('Configurazione Firebase mancante');
    } finally {
      CONFIG.prova = salvata;
    }
  });
});
