import { DocsSidebar } from "@/components/docs/sidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-65px)]">
      <DocsSidebar />
      <div className="flex-1 px-6 md:px-12 py-10 max-w-4xl">{children}</div>
    </div>
  );
}
