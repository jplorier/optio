import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cn, formatRelativeTime, formatDuration, truncate } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("handles empty inputs", () => {
    expect(cn()).toBe("");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for times less than 60 seconds ago', () => {
    const date = new Date("2025-01-15T11:59:30Z");
    expect(formatRelativeTime(date)).toBe("just now");
  });

  it("returns minutes ago for times less than 1 hour ago", () => {
    const date = new Date("2025-01-15T11:55:00Z");
    expect(formatRelativeTime(date)).toBe("5m ago");
  });

  it("returns hours ago for times less than 24 hours ago", () => {
    const date = new Date("2025-01-15T09:00:00Z");
    expect(formatRelativeTime(date)).toBe("3h ago");
  });

  it("returns days ago for times less than 7 days ago", () => {
    const date = new Date("2025-01-13T12:00:00Z");
    expect(formatRelativeTime(date)).toBe("2d ago");
  });

  it("returns formatted date for times more than 7 days ago", () => {
    const date = new Date("2025-01-01T12:00:00Z");
    const result = formatRelativeTime(date);
    // Should be a locale date string, not relative
    expect(result).not.toContain("ago");
  });

  it("accepts string dates", () => {
    const result = formatRelativeTime("2025-01-15T11:59:30Z");
    expect(result).toBe("just now");
  });
});

describe("formatDuration", () => {
  it("returns seconds for durations under 1 minute", () => {
    const start = new Date("2025-01-15T12:00:00Z");
    const end = new Date("2025-01-15T12:00:45Z");
    expect(formatDuration(start, end)).toBe("45s");
  });

  it("returns minutes and seconds", () => {
    const start = new Date("2025-01-15T12:00:00Z");
    const end = new Date("2025-01-15T12:02:30Z");
    expect(formatDuration(start, end)).toBe("2m 30s");
  });

  it("returns just minutes when seconds are 0", () => {
    const start = new Date("2025-01-15T12:00:00Z");
    const end = new Date("2025-01-15T12:05:00Z");
    expect(formatDuration(start, end)).toBe("5m");
  });

  it("returns hours and minutes", () => {
    const start = new Date("2025-01-15T12:00:00Z");
    const end = new Date("2025-01-15T14:15:00Z");
    expect(formatDuration(start, end)).toBe("2h 15m");
  });

  it("returns just hours when minutes are 0", () => {
    const start = new Date("2025-01-15T12:00:00Z");
    const end = new Date("2025-01-15T14:00:00Z");
    expect(formatDuration(start, end)).toBe("2h");
  });

  it('returns "0s" for negative durations', () => {
    const start = new Date("2025-01-15T14:00:00Z");
    const end = new Date("2025-01-15T12:00:00Z");
    expect(formatDuration(start, end)).toBe("0s");
  });

  it("accepts string dates", () => {
    expect(formatDuration("2025-01-15T12:00:00Z", "2025-01-15T12:00:45Z")).toBe("45s");
  });
});

describe("truncate", () => {
  it("returns the string unchanged if under maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged if exactly maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and adds ellipsis when over maxLength", () => {
    expect(truncate("hello world", 5)).toBe("hell\u2026");
  });

  it("handles empty strings", () => {
    expect(truncate("", 5)).toBe("");
  });
});
