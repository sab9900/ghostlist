package com.norica_informatics.ghostlist;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.webkit.PermissionRequest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_RECORD_AUDIO = 1001;
    private PermissionRequest pendingWebkitPermissionRequest;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;

    @Override
    public void onStart() {
        super.onStart();
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);

        // Grant WebView-level media permissions (microphone) so that
        // navigator.mediaDevices.getUserMedia works inside the Capacitor WebView.
        // The RECORD_AUDIO manifest permission alone is not sufficient —
        // (1) the WebChromeClient must grant the PermissionRequest,
        // (2) the Android runtime permission must be granted by the user, AND
        // (3) the app must hold AudioFocus in MODE_IN_COMMUNICATION, otherwise
        //     Android's audio HAL refuses to open the capture source and
        //     getUserMedia rejects with NotReadableError.
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                pendingWebkitPermissionRequest = request;
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                    acquireAudioFocusAndGrant(request);
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

    private void acquireAudioFocusAndGrant(PermissionRequest request) {
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAcceptsDelayedFocusGain(false)
                    .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        request.grant(request.getResources());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_RECORD_AUDIO && pendingWebkitPermissionRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                acquireAudioFocusAndGrant(pendingWebkitPermissionRequest);
            } else {
                pendingWebkitPermissionRequest.deny();
            }
            pendingWebkitPermissionRequest = null;
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        // Release audio focus when app goes to background.
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
            } else {
                audioManager.abandonAudioFocus(null);
            }
            audioManager.setMode(AudioManager.MODE_NORMAL);
        }
    }
}
