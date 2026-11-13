package it.vegman.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin dell'app (prima di super.onCreate, come chiede Capacitor).
        registerPlugin(StampaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
