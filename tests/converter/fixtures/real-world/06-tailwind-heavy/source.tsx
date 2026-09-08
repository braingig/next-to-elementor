export function TailwindHeavySection() {
  return (
    <section className="flex flex-col gap-8 px-4 py-12 md:px-8 lg:px-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Tailwind utilities
        </h2>
        <p className="text-sm text-slate-500 md:text-base">
          Known utilities resolve; unknown classes are reported.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="w-full p-6 bg-slate-100 rounded-lg md:w-1/2 unknown-utility-xyz">
          <h3 className="text-lg font-semibold text-slate-800">Panel A</h3>
          <p className="mt-2 text-sm text-slate-600">Padding, radius, background.</p>
        </div>
        <div className="w-full p-6 bg-teal-600 rounded-lg text-white md:w-1/2">
          <h3 className="text-lg font-semibold">Panel B</h3>
          <p className="mt-2 text-sm">Responsive row on md+.</p>
        </div>
      </div>
    </section>
  );
}
