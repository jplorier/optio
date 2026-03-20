"use client";

import { useEffect, useRef, useState } from "react";
import { useLogs } from "@/hooks/use-logs";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  Trash2,
  Terminal,
  AlertCircle,
  Info,
  Wrench,
  ChevronRight,
  DollarSign,
} from "lucide-react";

export function LogViewer({ taskId }: { taskId: string }) {
  const { logs, connected, clear } = useLogs(taskId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showThinking, setShowThinking] = useState(false);
  const [showResults, setShowResults] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const filteredLogs = logs.filter((l) => {
    if (l.logType === "thinking" && !showThinking) return false;
    if (l.logType === "tool_result" && !showResults) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-bg">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-card">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span
            className={cn("w-2 h-2 rounded-full", connected ? "bg-success" : "bg-text-muted/30")}
          />
          <span>{connected ? "Live" : "Ended"}</span>
          <span className="opacity-40">·</span>
          <span>{logs.length} events</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowThinking(!showThinking)}
            className={cn(
              "px-2 py-0.5 rounded text-xs transition-colors",
              showThinking ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-bg-hover",
            )}
          >
            Thinking
          </button>
          <button
            onClick={() => setShowResults(!showResults)}
            className={cn(
              "px-2 py-0.5 rounded text-xs transition-colors",
              showResults ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-bg-hover",
            )}
          >
            Results
          </button>
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                containerRef.current?.scrollTo({
                  top: containerRef.current.scrollHeight,
                  behavior: "smooth",
                });
              }}
              className="p-1 rounded hover:bg-bg-hover text-text-muted"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={clear}
            className="p-1 rounded hover:bg-bg-hover text-text-muted"
            title="Clear"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-text-muted text-center py-8">Waiting for output...</div>
        ) : (
          filteredLogs.map((log, i) => <LogLine key={i} log={log} />)
        )}
      </div>
    </div>
  );
}

function LogLine({
  log,
}: {
  log: { content: string; logType?: string; metadata?: Record<string, unknown> };
}) {
  const type = log.logType ?? "text";

  // System messages — subtle
  if (type === "system") {
    return (
      <div className="flex items-center gap-2 py-0.5 text-info/60">
        <Info className="w-3 h-3 shrink-0" />
        <span>{log.content}</span>
      </div>
    );
  }

  // Thinking — italic, muted
  if (type === "thinking") {
    return (
      <div className="py-1 pl-4 border-l-2 border-text-muted/10 text-text-muted/40 italic">
        {log.content}
      </div>
    );
  }

  // Tool use — one-line command style
  if (type === "tool_use") {
    const toolName = (log.metadata?.toolName as string) ?? "";
    const isBash = toolName === "Bash";
    return (
      <div className="flex items-start gap-2 py-0.5 text-primary/80">
        {isBash ? (
          <Terminal className="w-3 h-3 mt-0.5 shrink-0" />
        ) : (
          <Wrench className="w-3 h-3 mt-0.5 shrink-0" />
        )}
        <span className={cn("whitespace-pre-wrap", isBash && "text-primary")}>{log.content}</span>
      </div>
    );
  }

  // Tool result — muted output
  if (type === "tool_result") {
    return (
      <div className="py-0.5 pl-5 text-text-muted/50 whitespace-pre-wrap break-all">
        {log.content}
      </div>
    );
  }

  // Info/result — highlighted summary
  if (type === "info") {
    const cost = log.metadata?.cost as number | undefined;
    return (
      <div className="flex items-start gap-2 py-1 text-success">
        <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
        <div>
          <span className="whitespace-pre-wrap">{log.content}</span>
          {cost != null && cost > 0 && (
            <span className="ml-2 text-text-muted/50 inline-flex items-center gap-0.5">
              <DollarSign className="w-2.5 h-2.5" />
              {cost.toFixed(4)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Error
  if (type === "error") {
    return (
      <div className="flex items-start gap-2 py-0.5 text-error">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
        <span className="whitespace-pre-wrap">{log.content}</span>
      </div>
    );
  }

  // Text — default agent output
  return <div className="py-0.5 text-text/80 whitespace-pre-wrap break-words">{log.content}</div>;
}
