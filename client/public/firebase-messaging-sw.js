importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyBJHGBr6RsQrWZPWUaKekF79e3clqttT_k',
    authDomain: 'ghostlist-ff00f.firebaseapp.com',
    projectId: 'ghostlist-ff00f',
    storageBucket: 'ghostlist-ff00f.firebasestorage.app',
    messagingSenderId: '90820067104',
    appId: '1:90820067104:web:417821cbf29d88da5be145',
});

const messaging = firebase.messaging();

let _badgeCount = 0;

self.addEventListener('message', (event) => {
    if (event.data?.type === 'BADGE_COUNT_SYNC') {
        _badgeCount = event.data.count ?? 0;
    }
});

function incrementAndSetBadge() {
    _badgeCount++;
    if ('setAppBadge' in self.navigator) {
        self.navigator.setAppBadge(_badgeCount).catch(() => {});
    }
}

function routeForType(type) {
    switch (type) {
        case 'message':
            return 'chat';
        case 'whisper_invite':
            return 'whisper';
        default:
            return 'items';
    }
}

messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title ?? 'GhostList';
    const body = payload.notification?.body ?? '';
    const listId = payload.data?.listId;
    const type = payload.data?.type;

    incrementAndSetBadge();

    self.registration.showNotification(title, {
        body,
        icon: '/web-app-manifest-192x192.png',
        badge: '/favicon-96x96.png',
        data: { listId, type },
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if ('clearAppBadge' in self.navigator) {
        self.navigator.clearAppBadge().catch(() => {});
    }
    _badgeCount = 0;

    const listId = event.notification.data?.listId;
    const type = event.notification.data?.type;
    const targetUrl = listId ? `/list/${listId}/${routeForType(type)}` : '/';

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
