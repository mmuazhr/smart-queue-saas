"use client";

import { useState, useEffect, useRef } from "react";

export function useOrderStream(orderId?: string, storeId?: string) {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!orderId && !storeId) return;

    const query = orderId ? `orderId=${orderId}` : `storeId=${storeId}`;
    const url = `/api/queue/stream?${query}`;

    const connect = () => {
      setStatus("connecting");
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus("connected");
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
        } catch (err) {
          console.error("SSE parse error:", err);
        }
      };

      es.onerror = () => {
        setStatus("disconnected");
        es.close();
        // Exponential backoff for reconnection
        setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [orderId, storeId]);

  return { data, status };
}
