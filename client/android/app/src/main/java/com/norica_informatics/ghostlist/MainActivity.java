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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_MEDIA_PERMISSIONS = 1002;
    private PermissionRequest pendingWebkitPermissionRequest;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;

    @Override
    public void onStart() {
        super.onStart();
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);

        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                pendingWebkitPermissionRequest = request;
                String[] resources = request.getResources();
                
                List<String> osPermissionsNeeded = new ArrayList<>();
                
                if (hasResource(resources, PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                            != PackageManager.PERMISSION_GRANTED) {
                        osPermissionsNeeded.add(Manifest.permission.RECORD_AUDIO);
                    }
                }
                
                if (hasResource(resources, PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                            != PackageManager.PERMISSION_GRANTED) {
                        osPermissionsNeeded.add(Manifest.permission.CAMERA);
                    }
                }

                if (osPermissionsNeeded.isEmpty()) {
                    processAndGrant(request);
                    pendingWebkitPermissionRequest = null;
                } else {
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            osPermissionsNeeded.toArray(new String[0]),
                            REQUEST_MEDIA_PERMISSIONS
                    );
                }
            }
        });
    }

    private boolean hasResource(String[] resources, String resource) {
        if (resources == null) return false;
        for (String r : resources) {
            if (r.equals(resource)) return true;
        }
        return false;
    }

    private void processAndGrant(PermissionRequest request) {
        String[] resources = request.getResources();
        
        if (hasResource(resources, PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
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
        }
        
        request.grant(resources);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == REQUEST_MEDIA_PERMISSIONS && pendingWebkitPermissionRequest != null) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }

            if (allGranted) {
                processAndGrant(pendingWebkitPermissionRequest);
            } else {
                pendingWebkitPermissionRequest.deny();
            }
            pendingWebkitPermissionRequest = null;
        }
    }

    @Override
    public void onStop() {
        super.onStop();
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