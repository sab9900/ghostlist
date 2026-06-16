package com.norica_informatics.ghostlist;

import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_RECORD_AUDIO = 1001;
    private PermissionRequest pendingWebkitPermissionRequest;

    @Override
    public void onStart() {
        super.onStart();
        // Grant WebView-level media permissions (microphone) so that
        // navigator.mediaDevices.getUserMedia works inside the Capacitor WebView.
        // The RECORD_AUDIO manifest permission alone is not sufficient —
        // (1) the WebChromeClient must grant the PermissionRequest, AND
        // (2) the Android runtime permission must be granted by the user.
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                pendingWebkitPermissionRequest = request;
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                    pendingWebkitPermissionRequest = null;
                } else {
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{Manifest.permission.RECORD_AUDIO},
                            REQUEST_RECORD_AUDIO
                    );
                }
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO && pendingWebkitPermissionRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingWebkitPermissionRequest.grant(pendingWebkitPermissionRequest.getResources());
            } else {
                pendingWebkitPermissionRequest.deny();
            }
            pendingWebkitPermissionRequest = null;
        }
    }
}
