// Push notifications for the desk and the applicant portal, sent by functions/push.js through Firebase Cloud Messaging.
// This worker shows EVERY push as a notification itself. It used to hand that to the Firebase library, which stays
// silent whenever the app is open in front; iPhones count a silent push as a broken promise and, after a few, switch
// notifications off for the app (Nov 10: the owner's alerts died after about two days). So: no Firebase code in here,
// and no push without a notification. The alert text never includes message content, only who and what.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = {}; }
  const n = p.notification || {}, d = p.data || {};
  const title = n.title || d.title || "PVRS";
  const body = n.body || d.body || "";
  const link = (p.fcmOptions && p.fcmOptions.link) || n.click_action || d.link || "/";
  e.waitUntil((async () => {
    await self.registration.showNotification(title, { body, icon: n.icon || "/img/icon-192.png", badge: n.badge || "/img/icon-192.png", data: { link } });
    // An open desk also shows it as a toast.
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    list.forEach(c => c.postMessage({ type: "pvrs-push", title, body }));
  })());
});

// Tapping an alert focuses an open desk (or opens one) at the link the function sent.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const link = (e.notification.data && (e.notification.data.link || e.notification.data.FCM_MSG?.fcmOptions?.link)) || "/";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).origin === self.location.origin);
    if (open) { open.focus(); return open.navigate ? open.navigate(link).catch(() => {}) : null; }
    return clients.openWindow(link);
  }));
});
