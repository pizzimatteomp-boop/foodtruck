package it.vegman.app;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Schermo sempre acceso mentre la cassa è aperta (il telefono non va in standby durante il servizio).
 * Vale solo finché l'app è in primo piano: è il flag della finestra, nessun permesso speciale.
 */
@CapacitorPlugin(name = "Schermo")
public class SchermoPlugin extends Plugin {
    @PluginMethod
    public void acceso(PluginCall call) {
        boolean si = Boolean.TRUE.equals(call.getBoolean("si", true));
        getActivity().runOnUiThread(() -> {
            if (si) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }
}
