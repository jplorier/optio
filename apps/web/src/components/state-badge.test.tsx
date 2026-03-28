import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateBadge } from "./state-badge";

describe("StateBadge", () => {
  it("renders the correct label for known states", () => {
    const { rerender } = render(<StateBadge state="running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();

    rerender(<StateBadge state="completed" />);
    expect(screen.getByText("Done")).toBeInTheDocument();

    rerender(<StateBadge state="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();

    rerender(<StateBadge state="pr_opened" />);
    expect(screen.getByText("PR")).toBeInTheDocument();

    rerender(<StateBadge state="needs_attention" />);
    expect(screen.getByText("Attention")).toBeInTheDocument();

    rerender(<StateBadge state="provisioning" />);
    expect(screen.getByText("Setup")).toBeInTheDocument();

    rerender(<StateBadge state="cancelled" />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("renders the raw state for unknown states", () => {
    render(<StateBadge state="unknown_state" />);
    expect(screen.getByText("unknown_state")).toBeInTheDocument();
  });

  it("renders a dot by default", () => {
    const { container } = render(<StateBadge state="running" />);
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots.length).toBeGreaterThan(0);
  });

  it("hides the dot when showDot is false", () => {
    const { container } = render(<StateBadge state="running" showDot={false} />);
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots.length).toBe(0);
  });

  it("applies pulse class for running state", () => {
    const { container } = render(<StateBadge state="running" />);
    const dot = container.querySelector(".rounded-full");
    expect(dot?.className).toContain("glow-dot");
  });

  it("applies pulse class for provisioning state", () => {
    const { container } = render(<StateBadge state="provisioning" />);
    const dot = container.querySelector(".rounded-full");
    expect(dot?.className).toContain("glow-dot");
  });

  it("does not apply pulse class for completed state", () => {
    const { container } = render(<StateBadge state="completed" />);
    const dot = container.querySelector(".rounded-full");
    expect(dot?.className).not.toContain("glow-dot");
  });
});
