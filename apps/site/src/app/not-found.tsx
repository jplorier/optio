import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="text-center">
        <p className="text-6xl font-bold text-text-heading">404</p>
        <p className="mt-4 text-lg text-text-muted">Page not found.</p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/"
            className="rounded-md bg-primary px-6 py-2.5 text-[14px] font-semibold text-white hover:bg-primary-hover transition-colors"
          >
            Home
          </Link>
          <Link
            href="/docs/getting-started"
            className="rounded-md border border-border px-6 py-2.5 text-[14px] font-semibold text-text hover:bg-bg-hover transition-colors"
          >
            Docs
          </Link>
        </div>
      </div>
    </section>
  );
}
