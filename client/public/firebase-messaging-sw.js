// Firebase Cloud Messaging service worker.
// Handles push notifications while the GhostList web app is in the
// background or closed. Runs separately from the Angular service worker
// (ngsw-worker.js), which only handles app-shell caching.
//
// IMPORTANT: this file must be served from the site root (e.g.
// https://app.ghost-list.com/firebase-messaging-sw.js) so its scope covers
// the whole app. The Angular CLI copies everything under client/public/ to
// the build output root, so no extra build config is needed.

importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

// These values are public client identifiers (not secrets) and match
// client/src/environments/environment*.ts.
firebase.initializeApp({
    apiKey: 'AIzaSyBJHGBr6RsQrWZPWUaKekF79e3clqttT_k',
    authDomain: 'ghostlist-ff00f.firebaseapp.com',
    projectId: 'ghostlist-ff00f',
    storageBucket: 'ghostlist-ff00f.firebasestorage.app',
    messagingSenderId: '90820067104',
    appId: '1:90820067104:web:417821cbf29d88da5be145',
});

const messaging = firebase.messaging();

// GhostList never sends decryptable content in push payloads (zero-knowledge),
// so the notification body is always a generic, pre-defined text plus a
// listId used only for in-app navigation on click.
messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title ?? 'GhostList';
    const body = payload.notification?.body ?? '';
    const listId = payload.data?.listId;

    self.registration.showNotification(title, {
        body,
        icon: '/web-app-manifest-192x192.png',
        badge: '/favicon-96x96.png',
        data: { listId },
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const listId = event.notification.data?.listId;
    const targetUrl = listId ? `/list/${listId}` : '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate(targetUrl).catch(() => {});
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        }),
    );
});
