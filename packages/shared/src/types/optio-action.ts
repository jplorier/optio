/** Audit trail entry for an Optio agent write action. */
export interface OptioAction {
  id: string;
  userId?: string | null;
  action: string; // tool name e.g. "retry_task", "bulk_cancel_active"
  params?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  success: boolean;
  conversationSnippet?: string | null;
  createdAt: Date;
  /** Joined user info (optional, populated on list queries). */
  user?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}
