export function FeatureSection() {
  return (
    <section className="flex flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-2 items-center text-center">
        <h2 className="text-3xl font-bold text-slate-900">Everything you need</h2>
        <p className="text-base text-slate-600 max-w-2xl">
          Native Free widgets first, with honest fallbacks when accuracy requires it.
        </p>
      </div>
      <div className="flex flex-col gap-6 md:flex-row">
        <article className="flex flex-col gap-3 p-6 rounded-xl border border-slate-200 bg-white">
          <svg data-icon="bolt" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
          </svg>
          <h3 className="text-xl font-semibold text-slate-900">Fast</h3>
          <p className="text-sm text-slate-600">Deterministic conversion for supported constructs.</p>
        </article>
        <article className="flex flex-col gap-3 p-6 rounded-xl border border-slate-200 bg-white">
          <svg data-icon="shield" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
          </svg>
          <h3 className="text-xl font-semibold text-slate-900">Accurate</h3>
          <p className="text-sm text-slate-600">No silent approximation of unsupported behavior.</p>
        </article>
        <article className="flex flex-col gap-3 p-6 rounded-xl border border-slate-200 bg-white">
          <svg data-icon="layers" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M12 2l9 5-9 5-9-5 9-5zm0 9l9 5-9 5-9-5 9-5z" />
          </svg>
          <h3 className="text-xl font-semibold text-slate-900">Granular</h3>
          <p className="text-sm text-slate-600">Node-scoped custom HTML only where needed.</p>
        </article>
      </div>
    </section>
  );
}
