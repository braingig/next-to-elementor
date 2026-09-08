export function HeroSection() {
  return (
    <section className="flex flex-col items-center gap-6 px-6 py-16 md:flex-row md:items-start md:py-24">
      <div className="flex flex-col gap-4 max-w-xl">
        <h1 className="text-4xl font-bold text-slate-900 md:text-5xl">
          Build pages faster
        </h1>
        <p className="text-lg text-slate-600">
          Convert carefully structured React sections into Elementor Free layouts.
        </p>
        <div className="flex flex-row gap-3">
          <a role="button" href="/start" className="bg-teal-600 text-white px-5 py-3 rounded-lg font-semibold">
            Get started
          </a>
          <a href="/docs" className="text-teal-700 font-medium px-5 py-3">
            Read docs
          </a>
        </div>
      </div>
      <img
        src="https://cdn.example.com/hero.png"
        alt="Product preview"
        width="480"
        height="320"
        className="rounded-xl w-full max-w-md"
      />
    </section>
  );
}
