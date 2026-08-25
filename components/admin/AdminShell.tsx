import Link from "next/link";

const navigation = [
  { key: "screens", label: "Screens", href: "/" },
  { key: "walls", label: "Display walls", href: "/walls" },
  { key: "packages", label: "Creative packages", href: "/packages" },
  { key: "assets", label: "Assets", href: "/assets" },
  { key: "playlists", label: "Playlists", href: "/playlists" },
  { key: "campaigns", label: "Campaigns", href: "/campaigns" },
  { key: "content", label: "Content", href: "/content" },
] as const;

type NavKey = (typeof navigation)[number]["key"];

export default function AdminShell({
  active,
  title,
  description,
  children,
}: {
  active: NavKey;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl dark:border-zinc-800 dark:bg-black/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-950 text-xs font-black tracking-tighter text-emerald-100 ring-1 ring-emerald-700/50">
              G·S
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
                G-SPAN Screen Network
              </div>
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-950">
            {navigation.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-lg px-3 py-2 transition-colors hover:no-underline ${
                  item.key === active
                    ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/player"
              className="rounded-lg px-3 py-2 text-emerald-700 transition-colors hover:bg-emerald-50 hover:no-underline dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            >
              Pair player
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8">{children}</main>
    </div>
  );
}
