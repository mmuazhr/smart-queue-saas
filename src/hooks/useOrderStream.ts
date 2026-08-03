"use client";

import { useState, useEffect, useRef } from "react";

// Discriminated union matching the SSE payloads emitted by /api/queue/stream.
// The single-order stream projects only non-PII fields (see ORDER_PUBLIC_FIELDS).
export interface OrderStreamUpdate {
  type: "ORDER_UPDATE";
  id: string;
  queueNumber: number | null;
  status: string;
  paymentStatus: string;
  estimatedWaitMins: number | null;
  estimatedReadyAt: string | null;
  etaMinutes: number | null;
  delayed: boolean;
  delayReason: string | null;
  paidAt: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface StoreQueueUpdate {
  type: "STORE_QUEUE_UPDATE";
  orders: unknown[];
}

export type OrderStreamEvent = OrderStreamUpdate | StoreQueueUpdate;

export function useOrderStream(orderId?: string, storeId?: string) {
  const [data, setData] = useState<OrderStreamEvent | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const eventSourceRef = useRef<EventSource | null>(null);
  const isClosedRef = useRef(false); // true once the component unmounts — prevents reconnect loops

  useEffect(() => {
    if (!orderId && !storeId) return;

    isClosedRef.current = false;
    const query = orderId ? `orderId=${orderId}` : `storeId=${storeId}`;
    const url = `/api/queue/stream?${query}`;

    const connect = () => {
      if (isClosedRef.current) return;

      setStatus("connecting");
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => setStatus("connected");

      es.onmessage = (event) => {
        try {
          setData(JSON.parse(event.data));
        } catch {
          // malformed SSE frame — ignore
        }
      };

      es.onerror = () => {
        setStatus("disconnected");
        es.close();
        // Only reconnect if the component is still mounted
        if (!isClosedRef.current) {
          setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      isClosedRef.current = true;
      eventSourceRef.current?.close();
    };
  }, [orderId, storeId]);

  return { data, status };
}
