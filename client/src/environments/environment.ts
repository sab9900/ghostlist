export const environment = {
    production: false,
    apiBaseUrl: 'http://localhost:5273/api',
    hubUrl: 'http://localhost:5273/hubs/ghostlist',
    nativeApiBaseUrl: 'http://localhost:5273/api',
    nativeHubUrl: 'http://localhost:5273/hubs/ghostlist',
    nativeShareBaseUrl: 'http://localhost:4200',
    firebase: {
        apiKey: 'AIzaSyBJHGBr6RsQrWZPWUaKekF79e3clqttT_k',
        authDomain: 'ghostlist-ff00f.firebaseapp.com',
        projectId: 'ghostlist-ff00f',
        storageBucket: 'ghostlist-ff00f.firebasestorage.app',
        messagingSenderId: '90820067104',
        appId: '1:90820067104:web:417821cbf29d88da5be145',
        // VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates.
        vapidKey: 'BKp89TSlqlVGc7NCiq0FF604VxgbFVUOgW8r-CSUNLAmJsqKEEqyJ55AJHGFsOEwSWblFYSlk-5tAyhqTk9Q_DU',
    },
};
