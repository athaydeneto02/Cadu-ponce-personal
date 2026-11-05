// public/push-sw.js

self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      
      const options = {
        body: data.body || 'Você tem uma nova notificação.',
        icon: '/icon.png',
        badge: '/icon.png',
        tag: typeof data.tag === 'string' && data.tag.length <= 200 ? data.tag : undefined,
        renotify: false,
        vibrate: [100, 50, 100],
        data: {
          url: data.url || '/'
        }
      };

      event.waitUntil(
        self.registration.showNotification(data.title || 'Cadu Ponce', options)
      );
    } catch (e) {
      console.error('Error parsing push data:', e);
      // Fallback if data is not JSON
      event.waitUntil(
        self.registration.showNotification('Cadu Ponce', {
          body: event.data.text()
        })
      );
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // This looks to see if the current is already open and
  // focuses if it is
  event.waitUntil(
    clients.matchAll({
      type: "window"
    }).then(function(clientList) {
      let targetUrl = self.location.origin + '/';
      try {
        const candidate = new URL(event.notification.data?.url || '/', self.location.origin);
        if (candidate.origin === self.location.origin) targetUrl = candidate.href;
      } catch { /* Keep the application home for malformed destinations. */ }
      
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
