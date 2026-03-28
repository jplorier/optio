"use client";

import { useState } from "react";
import { Check, X, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OptioPendingAction } from "@/hooks/use-optio-chat";

interface ActionCardProps {
  action: OptioPendingAction;
  onApprove: (actionId: string) => void;
  onDeny: (actionId: string, feedback: string) => void;
}

export function ActionCard({ action, onApprove, onDeny }: ActionCardProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  const decided = action.decision !== null;
  const approved = action.decision === true;
  const denied = action.decision === false;

  const handleDeny = () => {
    setShowFeedback(true);
  };

  const handleSubmitFeedback = () => {
    onDeny(action.id, feedback.trim() || "No changes specified");
    setShowFeedback(false);
  };

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden transition-colors",
        decided
          ? approved
            ? "border-success/30 bg-success/5"
            : "border-error/30 bg-error/5"
          : "border-primary/30 bg-primary/5",
      )}
    >
      <div className="px-3.5 py-3">
        {action.description && <p className="text-sm text-text mb-2">{action.description}</p>}

        <ul className="space-y-1.5">
          {action.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
              <span className="text-primary mt-0.5 shrink-0">&bull;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-inherit px-3.5 py-2.5">
        {decided ? (
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              approved ? "text-success" : "text-error",
            )}
          >
            {approved ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            {approved ? "Approved" : "Denied"}
          </div>
        ) : showFeedback ? (
          <div className="space-y-2">
            <p className="text-xs text-text-muted">What should I change?</p>
            <div className="flex items-end gap-2">
              <input
                type="text"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitFeedback();
                }}
                placeholder="Your feedback..."
                autoFocus
                className="flex-1 text-sm bg-bg-card border border-border rounded-md px-2.5 py-1.5 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50"
              />
              <button
                onClick={handleSubmitFeedback}
                className="shrink-0 px-3 py-1.5 rounded-md bg-error/10 text-error text-xs font-medium hover:bg-error/20 transition-colors btn-press"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleDeny}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bg-card border border-border text-xs text-text-muted hover:text-text hover:bg-bg-hover transition-colors btn-press"
            >
              <MessageSquare className="w-3 h-3" />
              Deny
            </button>
            <button
              onClick={() => onApprove(action.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary-hover transition-colors btn-press"
            >
              <Check className="w-3 h-3" />
              Approve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
