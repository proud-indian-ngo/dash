import { useCourier } from "@trycourier/courier-react";
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
      client.inbox.getUnreadMessageCount().then((n) => {
        if (!cancelled) {
          setCount(n);
        }
      });
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30_000);

    // Listen to the shared datastore for real-time unread count changes
    // (fires when CourierInbox marks messages read/unread/archived).
    let cleanup: (() => void) | undefined;
    import("@trycourier/courier-ui-inbox").then(
      ({ CourierInboxDataStoreListener, CourierInboxDatastore }) => {
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
      }
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
      cleanup?.();
    };
  }, [client]);

  return count;
}
