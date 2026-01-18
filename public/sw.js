/* public/sw.js */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "DayOff", body: "You have a notification." };
  }

  const title = data.title || "DayOff";
  const options = {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.openWindow(url)
  );
});
