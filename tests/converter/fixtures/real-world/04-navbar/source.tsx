export function SiteHeader() {
  return (
    <header className="flex flex-row items-center justify-between px-6 py-4 border-b border-slate-200">
      <img src="https://cdn.example.com/logo.svg" alt="Brand" width="120" height="32" />
      <nav className="flex flex-row gap-6 items-center">
        <a href="/product" className="text-sm text-slate-700">
          Product
        </a>
        <a href="/pricing" className="text-sm text-slate-700">
          Pricing
        </a>
        <a href="/docs" className="text-sm text-slate-700">
          Docs
        </a>
        <button type="button" className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm">
          Open menu
        </button>
      </nav>
    </header>
  );
}
