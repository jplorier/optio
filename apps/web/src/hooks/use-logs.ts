"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api-client";
import { createLogClient, type WsClient } from "@/lib/ws-client";

export interface LogEntry {
  content: string;
  stream: string;
  timestamp: string;
  logType?: string;
  metadata?: Record<string, unknown>;
}

export function useLogs(taskId: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<WsClient | null>(null);
  const historicalCountRef = useRef(0);

  // Load historical logs, then connect WebSocket for live streaming
  useEffect(() => {
    // Buffer live events that arrive before historical logs load
    const pendingLive: LogEntry[] = [];
    let historicalLoaded = false;

    const client = createLogClient(taskId);
    clientRef.current = client;

    client.on("task:log", (event) => {
      const entry: LogEntry = {
        content: event.content,
        stream: event.stream,
        timestamp: event.timestamp,
        logType: event.logType,
        metadata: event.metadata,
      };
      if (!historicalLoaded) {
        pendingLive.push(entry);
      } else {
        setLogs((prev) => [...prev, entry]);
      }
    });

    client.connect();
    setConnected(true);

    api
      .getTaskLogs(taskId, { limit: 500 })
      .then((res) => {
        const historical = res.logs.map((l: any) => ({
          content: l.content,
          stream: l.stream,
          timestamp: l.timestamp,
          logType: l.logType ?? undefined,
          metadata: l.metadata ?? undefined,
        }));
        historicalCountRef.current = historical.length;
        historicalLoaded = true;

        // Deduplicate: drop any live events already in the historical set
        const historicalTimestamps = new Set(
          historical.map((l: LogEntry) => l.timestamp + l.content),
        );
        const uniqueLive = pendingLive.filter(
          (l) => !historicalTimestamps.has(l.timestamp + l.content),
        );

        setLogs([...historical, ...uniqueLive]);
      })
      .catch(() => {
        historicalLoaded = true;
        setLogs(pendingLive);
      });

    return () => {
      client.disconnect();
      setConnected(false);
    };
  }, [taskId]);

  const clear = useCallback(() => setLogs([]), []);

  return { logs, connected, clear };
}
