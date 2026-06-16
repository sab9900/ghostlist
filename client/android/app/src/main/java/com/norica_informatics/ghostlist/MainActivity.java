package com.norica_informatics.ghostlist;

import android.webkit.PermissionRequest;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onStart() {
        super.onStart();
        // Grant WebView-level media permissions (microphone) so that
        // navigator.mediaDevices.getUserMedia works inside the Capacitor WebView.
        // The RECORD_AUDIO manifest permission alone is not sufficient —
        // the WebChromeClient must also explicitly grant the PermissionRequest.
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }
        });
    }
}
