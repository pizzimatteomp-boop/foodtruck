/** Promemoria sul telefono (solo app Android). I plugin non si restituiscono mai da funzioni async (vedi plugin.test.ts). */
import { ID_PROMEMORIA_FATTURE, notificaFatture, paginaDaNotifica } from '../fatture/promemoria';

export async function promemoriaAttivo(): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const { notifications } = await LocalNotifications.getPending();
  return notifications.some((n) => n.id === ID_PROMEMORIA_FATTURE);
}

/** Chiede il permesso (se serve) e programma il promemoria. false se il permesso è negato. */
export async function attivaPromemoria(): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const p = await LocalNotifications.requestPermissions();
  if (p.display !== 'granted') return false;
  await LocalNotifications.cancel({ notifications: [{ id: ID_PROMEMORIA_FATTURE }] });
  await LocalNotifications.schedule({ notifications: [notificaFatture()] });
  return true;
}

/** Toccando la notifica si apre la pagina giusta. */
export async function ascoltaNotifiche(): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const pagina = paginaDaNotifica(a.notification.extra);
    if (pagina) location.hash = pagina;
  });
}
