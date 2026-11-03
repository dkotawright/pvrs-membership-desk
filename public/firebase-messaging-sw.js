// Push notifications for the desk (new applications, messages, bookings…), sent by functions/push.js.
// Classic service worker (Safari/Firefox don't all run module workers), so it uses the compat SDK. The config below is
// public and must match public/js/config.js. The alert text never includes message content, only who and what.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAmPIMyTAPdJLdhEFwoSNi9Bfdx5YqCcDY",
  projectId: "pvrs-membership",
  messagingSenderId: "1066878367633",
  appId: "1:1066878367633:web:84e23e24b83916e4360c30",
});
// Messages carry a `notification` block, so the browser shows them itself while the desk is closed or in the background.
firebase.messaging();

// Tapping an alert focuses an open desk (or opens one) at the link the function sent.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const link = (e.notification.data && (e.notification.data.FCM_MSG?.fcmOptions?.link || e.notification.data.link)) || "/";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).origin === self.location.origin);
    if (open) { open.focus(); return open.navigate ? open.navigate(link).catch(() => {}) : null; }
    return clients.openWindow(link);
  }));
});
