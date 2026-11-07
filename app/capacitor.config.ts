import type { CapacitorConfig } from '@capacitor/cli';

/** App Android di cassa (vedi CLAUDE.md, «Architettura decisa»). Le pagine sono dentro l'app, non scaricate da internet. */
const config: CapacitorConfig = {
  appId: 'it.vegman.app',
  appName: 'VegMan',
  webDir: 'dist',
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  plugins: {
    // HTTP nativo solo dove lo chiediamo esplicitamente (modulo fiscale), non per tutto.
    CapacitorHttp: { enabled: false },
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com'] },
  },
};
export default config;
