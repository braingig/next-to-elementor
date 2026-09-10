import CTAButton from "./CTAButton";

export default function HeroContent() {
  return (
    <div className="hero-content flex flex-col items-center gap-6 md:flex-row md:items-start">
      <div className="flex flex-col gap-4 max-w-xl">
        <h1 className="text-4xl font-bold text-slate-900 md:text-5xl">
          Ship landing sections without rebuilding layouts
        </h1>
        <p className="text-lg text-slate-600">
          Convert carefully structured React sections into Elementor Free classic JSON.
        </p>
        <div className="flex flex-row gap-3">
          <CTAButton />
          <a href="/docs" className="text-teal-700 font-medium px-5 py-3">
            Read the docs
          </a>
        </div>
      </div>
      <img
        src="/assets/hero.png"
        alt="Product preview"
        width="480"
        height="320"
        className="rounded-xl w-full max-w-md"
      />
    </div>
  );
}
