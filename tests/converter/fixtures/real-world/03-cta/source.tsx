export function CtaSection() {
  return (
    <section className="flex flex-col items-center gap-6 px-6 py-20 bg-teal-700 md:py-24">
      <h2 className="text-3xl font-bold text-white text-center md:text-4xl">
        Ready to ship your next section?
      </h2>
      <p className="text-base text-white text-center max-w-xl">
        Start with Free-native widgets and keep custom fallbacks scoped to individual nodes.
      </p>
      <a
        role="button"
        href="/signup"
        className="bg-white text-teal-700 px-6 py-3 rounded-lg font-semibold"
      >
        Start free
      </a>
    </section>
  );
}
