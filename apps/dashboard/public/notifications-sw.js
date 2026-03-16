self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title
      : "SlugSwap update";
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body
      : "You have a new notification.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag:
        typeof payload.eventType === "string" && payload.eventType
          ? payload.eventType
          : "slugswap-notification",
      data: payload,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
          return undefined;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
