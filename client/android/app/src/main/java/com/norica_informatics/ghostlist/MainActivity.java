package com.norica_informatics.ghostlist;

import android.Manifest;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.PermissionRequest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_MEDIA_PERMISSIONS = 1002;
    private PermissionRequest pendingWebkitPermissionRequest;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;

    private static final String ALIAS_CHARON = "com.norica_informatics.ghostlist.CharonDropShareActivity";
    private static final String ALIAS_CHAT   = "com.norica_informatics.ghostlist.GhostChatShareActivity";

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

        handleShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;

        String target = resolveShareTarget(intent);

        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> extras = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (extras != null) uris.addAll(extras);
        } else {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
            if (uris.isEmpty()) {
                ClipData clip = intent.getClipData();
                if (clip != null) {
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        Uri u = clip.getItemAt(i).getUri();
                        if (u != null) uris.add(u);
                    }
                }
            }
        }

        String text  = intent.getStringExtra(Intent.EXTRA_TEXT)  != null ? intent.getStringExtra(Intent.EXTRA_TEXT)  : "";
        String title = intent.getStringExtra(Intent.EXTRA_TITLE) != null ? intent.getStringExtra(Intent.EXTRA_TITLE) : "";

        if (!uris.isEmpty()) {
            dispatchFileShare(uris, target, text, title);
        } else if (!text.isEmpty()) {
            dispatchTextShare(target, text, title);
        }
    }

    private String resolveShareTarget(Intent intent) {
        if (intent.getComponent() != null) {
            String cls = intent.getComponent().getClassName();
            if (ALIAS_CHAT.equals(cls)) return "chat";
        }
        return "charon";
    }

    private void dispatchFileShare(List<Uri> uris, String target, String text, String title) {
        new Thread(() -> {
            try {
                StringBuilder sb = new StringBuilder();
                sb.append("{\"shareTarget\":\"").append(target).append("\",");
                sb.append("\"text\":\"").append(escapeJson(text)).append("\",");
                sb.append("\"title\":\"").append(escapeJson(title)).append("\",");
                sb.append("\"files\":[");

                for (int i = 0; i < uris.size(); i++) {
                    Uri uri = uris.get(i);
                    String mime = getContentResolver().getType(uri);
                    if (mime == null) mime = "application/octet-stream";

                    String fileName = "shared-file-" + i;
                    android.database.Cursor cursor = getContentResolver().query(uri, null, null, null, null);
                    if (cursor != null && cursor.moveToFirst()) {
                        int idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                        if (idx >= 0) fileName = cursor.getString(idx);
                        cursor.close();
                    }

                    byte[] bytes = readUriBytes(uri);
                    String b64 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            ? Base64.getEncoder().encodeToString(bytes)
                            : android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);

                    if (i > 0) sb.append(",");
                    sb.append("{");
                    sb.append("\"name\":\"").append(escapeJson(fileName)).append("\",");
                    sb.append("\"type\":\"").append(escapeJson(mime)).append("\",");
                    sb.append("\"data\":\"").append(b64).append("\"");
                    sb.append("}");
                }

                sb.append("]}");
                final String json = sb.toString();

                runOnUiThread(() -> getBridge().triggerWindowJSEvent("ghostShareReceived", json));
            } catch (Exception ignored) {
            }
        }).start();
    }

    private void dispatchTextShare(String target, String text, String title) {
        String json = "{\"shareTarget\":\"" + target + "\","
                + "\"text\":\"" + escapeJson(text) + "\","
                + "\"title\":\"" + escapeJson(title) + "\","
                + "\"files\":[]}";
        getBridge().triggerWindowJSEvent("ghostShareReceived", json);
    }

    private byte[] readUriBytes(Uri uri) throws Exception {
        InputStream is = getContentResolver().openInputStream(uri);
        if (is == null) return new byte[0];
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int read;
        while ((read = is.read(chunk)) != -1) buffer.write(chunk, 0, read);
        is.close();
        return buffer.toByteArray();
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
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
