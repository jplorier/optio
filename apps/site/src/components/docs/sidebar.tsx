"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { docsNav } from "@/content/docs";

export function DocsSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <nav className="space-y-6">
      {docsNav.map((section) => (
        <div key={section.title}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.pages.map((page) => {
              const isActive = pathname === page.href || pathname === page.href + "/";
              return (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary-light font-medium"
                        : "text-text-muted hover:text-text hover:bg-bg-hover"
                    }`}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="md:hidden border-b border-border px-6 py-3">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex items-center gap-2 text-[13px] font-medium text-text-muted hover:text-text transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          Documentation Menu
        </button>
        {mobileOpen && <div className="mt-3 pb-2">{navContent}</div>}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:block w-60 shrink-0 border-r border-border p-6 sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto">
        {navContent}
      </aside>
    </>
  );
}
