package it.vegman.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Stampa della pagina dell'app col servizio di stampa di Android (stampanti Wi-Fi, «Salva come PDF»).
 * Dentro l'app window.print() non fa nulla: qui si passa la pagina a PrintManager, che usa gli stili @media print.
 */
@CapacitorPlugin(name = "Stampa")
public class StampaPlugin extends Plugin {
    @PluginMethod
    public void stampa(PluginCall call) {
        String titolo = call.getString("titolo", "VegMan");
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(titolo);
                pm.print(titolo, adapter, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                call.resolve();
            } catch (Exception e) {
                call.reject("Stampa non disponibile", e);
            }
        });
    }
}
