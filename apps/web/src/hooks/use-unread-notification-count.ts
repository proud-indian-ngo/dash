import { useCourier } from "@trycourier/courier-react";
import { log } from "evlog";
import { useEffect, useState } from "react";

export function useUnreadNotificationCount() {
  const courier = useCourier();
  const [count, setCount] = useState(0);
  const client = courier.shared.client;

  useEffect(() => {
    if (!client) {
      return;
    }

    let cancelled = false;

    const fetchCount = () => {
      // Courier's runtime returns number but their bundled types resolve to any
      client.inbox
        .getUnreadMessageCount()
        .then((n: number) => {
          if (!cancelled) {
            setCount(n);
          }
        })
        .catch((error: unknown) => {
          log.error({
            component: "useUnreadNotificationCount",
            action: "fetchCount",
            error: error instanceof Error ? error.message : String(error),
          });
        });
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30_000);

    // Listen to the shared datastore for real-time unread count changes
    // (fires when CourierInbox marks messages read/unread/archived).
    let cleanup: (() => void) | undefined;
    import("@trycourier/courier-ui-inbox")
      .then(({ CourierInboxDataStoreListener, CourierInboxDatastore }) => {
        if (cancelled) {
          return;
        }
        const listener = new CourierInboxDataStoreListener({
          onTotalUnreadCountChange(totalUnreadCount) {
            if (!cancelled) {
              setCount(totalUnreadCount);
            }
          },
        });
        CourierInboxDatastore.shared.addDataStoreListener(listener);
        cleanup = () =>
          CourierInboxDatastore.shared.removeDataStoreListener(listener);
      })
      .catch((error: unknown) => {
        log.error({
          component: "useUnreadNotificationCount",
          action: "loadListener",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
      clearInterval(interval);
      cleanup?.();
    };
  }, [client]);

  return count;
}
