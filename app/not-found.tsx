import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="space-y-4 text-center">
        <p className="text-primary text-sm font-semibold tracking-wide">
          75 Soft
        </p>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <Link
          className="bg-primary text-primary-foreground focus-visible:ring-primary inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold shadow-sm hover:bg-[#24583f] focus-visible:ring-2 focus-visible:ring-offset-2"
          href="/today"
        >
          Go to Today
        </Link>
      </div>
    </main>
  );
}
