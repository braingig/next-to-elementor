export function MixedStylesSection() {
  return (
    <section
      className="mixed-wrap flex flex-col gap-4 p-8 md:flex-row"
      style={{ backgroundColor: "#f8fafc" }}
    >
      <div className="mixed-card rounded-xl p-6" style={{ borderWidth: "1px", borderStyle: "solid", borderColor: "#e2e8f0" }}>
        <h2 className="text-2xl font-bold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
          Mixed sources
        </h2>
        <p className="mixed-card__body mt-3 text-sm text-slate-600">
          Tailwind utilities, stylesheet rules, and inline styles on one section.
        </p>
        <a role="button" href="/mix" className="mt-4 bg-slate-900 text-white px-4 py-2 rounded-md inline-block">
          Continue
        </a>
      </div>
    </section>
  );
}
