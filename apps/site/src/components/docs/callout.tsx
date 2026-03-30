const styles = {
  info: {
    border: "var(--color-info)",
    bg: "rgba(96, 165, 250, 0.05)",
    label: "Info",
  },
  warning: {
    border: "var(--color-warning)",
    bg: "rgba(240, 160, 64, 0.05)",
    label: "Warning",
  },
  tip: {
    border: "var(--color-success)",
    bg: "rgba(52, 211, 153, 0.05)",
    label: "Tip",
  },
};

export function Callout({
  type,
  title,
  children,
}: {
  type: "info" | "warning" | "tip";
  title?: string;
  children: React.ReactNode;
}) {
  const s = styles[type];
  return (
    <div
      className="rounded-lg border-l-2 p-4 my-4"
      style={{ borderLeftColor: s.border, backgroundColor: s.bg }}
    >
      <p className="text-[12px] font-semibold text-text-heading mb-1">{title || s.label}</p>
      <div className="text-[13px] text-text-muted leading-relaxed">{children}</div>
    </div>
  );
}
