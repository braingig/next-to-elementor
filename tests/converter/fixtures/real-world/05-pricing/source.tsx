export function PricingSection() {
  return (
    <section className="flex flex-col gap-8 px-6 py-16 items-center">
      <h2 className="text-3xl font-bold text-slate-900">Simple pricing</h2>
      <div className="flex flex-col gap-6 w-full max-w-4xl md:flex-row">
        <article className="flex flex-col gap-4 p-8 rounded-2xl border border-slate-200 bg-white shadow-md w-full">
          <h3 className="text-xl font-semibold text-slate-900">Starter</h3>
          <p className="text-4xl font-bold text-slate-900">$19</p>
          <p className="text-sm text-slate-600">For small marketing sites.</p>
          <hr className="border-slate-200" />
          <a role="button" href="/buy/starter" className="bg-slate-900 text-white px-4 py-3 rounded-lg text-center font-medium">
            Choose Starter
          </a>
        </article>
        <article className="flex flex-col gap-4 p-8 rounded-2xl border border-teal-600 bg-white shadow-lg w-full">
          <h3 className="text-xl font-semibold text-teal-700">Pro</h3>
          <p className="text-4xl font-bold text-slate-900">$49</p>
          <p className="text-sm text-slate-600">For growing teams.</p>
          <div aria-hidden="true" data-spacer="true" className="h-4" />
          <a role="button" href="/buy/pro" className="bg-teal-600 text-white px-4 py-3 rounded-lg text-center font-medium">
            Choose Pro
          </a>
        </article>
      </div>
    </section>
  );
}
