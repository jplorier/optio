"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useLogs, type LogEntry } from "@/hooks/use-logs";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  Trash2,
  Terminal,
  AlertCircle,
  Info,
  Wrench,
  ChevronRight,
  ChevronDown,
  DollarSign,
  FileText,
  Pencil,
  Search,
} from "lucide-react";

const TOOL_ICONS: Record<string, any> = {
  Bash: Terminal,
  Read: FileText,
  Edit: Pencil,
  Write: FileText,
  Grep: Search,
  Glob: Search,
};

export function LogViewer({ taskId }: { taskId: string }) {
  const { logs, connected, clear } = useLogs(taskId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showThinking, setShowThinking] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

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

  const toggleCollapse = useCallback((index: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // Build grouped log entries: pair tool_use with following tool_result
  const filteredLogs = logs.filter((l) => {
    if (l.logType === "thinking" && !showThinking) return false;
    return true;
  });

  // Group consecutive tool_use + tool_result pairs
  type LogGroup =
    | { type: "single"; entry: LogEntry; index: number }
    | { type: "tool_call"; use: LogEntry; result?: LogEntry; index: number };

  const groups: LogGroup[] = [];
  let i = 0;
  while (i < filteredLogs.length) {
    const entry = filteredLogs[i];
    if (entry.logType === "tool_use") {
      const next = i + 1 < filteredLogs.length ? filteredLogs[i + 1] : null;
      if (next?.logType === "tool_result") {
        groups.push({ type: "tool_call", use: entry, result: next, index: i });
        i += 2;
        continue;
      }
      groups.push({ type: "tool_call", use: entry, index: i });
      i++;
      continue;
    }
    if (entry.logType === "tool_result" && !showResults) {
      i++;
      continue;
    }
    groups.push({ type: "single", entry, index: i });
    i++;
  }

  return (
    <div className="flex flex-col h-full border border-border rounded-xl overflow-hidden bg-bg">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-bg-card">
        <div className="flex items-center gap-2.5 text-xs text-text-muted">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              connected ? "bg-success animate-pulse" : "bg-text-muted/30",
            )}
          />
          <span className="font-medium">{connected ? "Live" : "Ended"}</span>
          <span className="text-text-muted/30">&middot;</span>
          <span className="tabular-nums">{logs.length} events</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowThinking(!showThinking)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              showThinking
                ? "bg-bg-hover text-text"
                : "text-text-muted/50 hover:text-text-muted hover:bg-bg-hover",
            )}
          >
            Thinking
          </button>
          <button
            onClick={() => setShowResults(!showResults)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              showResults
                ? "bg-bg-hover text-text"
                : "text-text-muted/50 hover:text-text-muted hover:bg-bg-hover",
            )}
          >
            Results
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={clear}
            className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted/50 hover:text-text-muted transition-colors"
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
        className="flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-6 relative"
      >
        {groups.length === 0 ? (
          <div className="text-text-muted/40 text-center py-12 font-sans">
            Waiting for output...
          </div>
        ) : (
          groups.map((group) => {
            if (group.type === "tool_call") {
              return (
                <ToolCallGroup
                  key={group.index}
                  group={group}
                  isCollapsed={collapsed.has(group.index)}
                  onToggle={() => toggleCollapse(group.index)}
                  showResults={showResults}
                />
              );
            }
            return <LogLine key={group.index} log={group.entry} />;
          })
        )}
      </div>

      {/* Scroll to bottom */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            containerRef.current?.scrollTo({
              top: containerRef.current.scrollHeight,
              behavior: "smooth",
            });
          }}
          className="absolute bottom-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-bg-card border border-border text-xs text-text-muted hover:text-text shadow-lg transition-colors flex items-center gap-1.5 font-sans"
        >
          <ArrowDown className="w-3 h-3" />
          Scroll to bottom
        </button>
      )}
    </div>
  );
}

function ToolCallGroup({
  group,
  isCollapsed,
  onToggle,
  showResults,
}: {
  group: { use: LogEntry; result?: LogEntry };
  isCollapsed: boolean;
  onToggle: () => void;
  showResults: boolean;
}) {
  const toolName = (group.use.metadata?.toolName as string) ?? "Tool";
  const Icon = TOOL_ICONS[toolName] ?? Wrench;
  const showBody = !isCollapsed && group.result && showResults;

  return (
    <div className="rounded-lg border border-border/50 my-1.5 overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-left bg-bg-card hover:bg-bg-card-hover transition-colors"
      >
        {group.result ? (
          isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-text-muted/40 shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-text-muted/40 shrink-0" />
          )
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}
        <Icon className="w-3 h-3 text-primary shrink-0" />
        <span className="text-[11px] font-medium text-primary font-sans">{toolName}</span>
        <span className="text-text-muted/60 truncate flex-1">{group.use.content}</span>
      </button>
      {showBody && (
        <div className="px-3 py-2 border-t border-border/30 bg-bg max-h-60 overflow-auto">
          <pre className="text-text-muted/50 whitespace-pre-wrap break-all">
            {group.result!.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function LogLine({
  log,
}: {
  log: { content: string; logType?: string; metadata?: Record<string, unknown> };
}) {
  const type = log.logType ?? "text";

  if (type === "system") {
    return (
      <div className="flex items-center gap-2 py-1 text-info/50 font-sans text-[11px]">
        <Info className="w-3 h-3 shrink-0" />
        <span>{log.content}</span>
      </div>
    );
  }

  if (type === "thinking") {
    return (
      <div className="py-1.5 pl-4 border-l-2 border-text-muted/20 text-text-muted/50 italic bg-bg-subtle/30 rounded-r-md my-0.5">
        {log.content}
      </div>
    );
  }

  if (type === "tool_result") {
    return (
      <div className="py-0.5 pl-5 text-text-muted/50 whitespace-pre-wrap break-all">
        {log.content}
      </div>
    );
  }

  if (type === "info") {
    const cost = log.metadata?.cost as number | undefined;
    return (
      <div className="flex items-start gap-2 py-1.5 text-success/80">
        <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
        <div>
          <span className="whitespace-pre-wrap">{log.content}</span>
          {cost != null && cost > 0 && (
            <span className="ml-2 text-text-muted/40 inline-flex items-center gap-0.5 tabular-nums">
              <DollarSign className="w-2.5 h-2.5" />
              {cost.toFixed(4)}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (type === "error") {
    return (
      <div className="flex items-start gap-2 py-1.5 px-2 -mx-1 rounded-md bg-error/5 text-error my-0.5">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
        <span className="whitespace-pre-wrap">{log.content}</span>
      </div>
    );
  }

  // Text — default agent output
  return <div className="py-0.5 text-text/90 whitespace-pre-wrap break-words">{log.content}</div>;
}
