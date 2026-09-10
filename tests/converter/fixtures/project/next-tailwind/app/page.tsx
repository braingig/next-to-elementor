export default function Home() {
  return (
    <section className="flex flex-col gap-4 p-8 bg-white">
      <h1 className="text-3xl font-bold text-slate-900">Tailwind Sample</h1>
      <p className="text-base text-slate-600 md:text-lg">Curated utility classes only.</p>
      <a className="inline-flex px-4 py-2 bg-slate-900 text-white rounded" href="/go">Get started</a>
    </section>
  );
}
