self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { title: 'Pengingat tugas', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(self.registration.showNotification(data.title || 'Pengingat tugas', {
    body: data.body || 'Ada tugas yang perlu kamu perhatikan.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.taskId ? `task-${data.taskId}` : 'task-reminder',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url === target);
      if (existing) return existing.focus();
      return clients.openWindow(target);
    }),
  );
});
