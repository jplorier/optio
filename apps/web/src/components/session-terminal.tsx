"use client";

import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { getWsBaseUrl } from "@/lib/ws-client.js";

export function SessionTerminal({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let disposed = false;
    let cleanupFn = () => {};

    (async () => {
      const { Terminal: XTerm } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { WebLinksAddon } = await import("@xterm/addon-web-links");

      if (disposed) return;

      const term = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        theme: {
          background: "#09090b",
          foreground: "#fafafa",
          cursor: "#6d28d9",
          selectionBackground: "#6d28d944",
          black: "#09090b",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#f59e0b",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#fafafa",
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(container);
      fitAddon.fit();

      const ws = new WebSocket(`${getWsBaseUrl()}/ws/sessions/${sessionId}/terminal`);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        term.writeln("\x1b[32mConnected to session terminal\x1b[0m\r\n");
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      };

      ws.onmessage = (msg) => {
        if (typeof msg.data === "string") {
          try {
            const parsed = JSON.parse(msg.data);
            if (parsed.error) {
              term.writeln(`\x1b[31mError: ${parsed.error}\x1b[0m`);
              return;
            }
          } catch {
            // Not JSON, write as terminal data
          }
          term.write(msg.data);
        } else {
          term.write(new Uint8Array(msg.data));
        }
      };

      ws.onclose = () => {
        term.writeln("\r\n\x1b[31mDisconnected from session terminal\x1b[0m");
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });

      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });

      const resizeObserver = new ResizeObserver(() => fitAddon.fit());
      resizeObserver.observe(container);

      cleanupFn = () => {
        resizeObserver.disconnect();
        ws.close();
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanupFn();
    };
  }, [sessionId]);

  return (
    <div className="h-full bg-[#09090b]">
      <div ref={containerRef} className="h-full" />
    </div>
  );
}
