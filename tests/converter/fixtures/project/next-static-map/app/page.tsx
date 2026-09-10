const FEATURES = [
  { title: "Fast", body: "Ship quickly" },
  { title: "Safe", body: "Static only" },
  { title: "Clear", body: "Honest reports" },
];

export default function Home() {
  return (
    <section>
      <h1>Features</h1>
      {FEATURES.map((f) => (
        <article key={f.title}>
          <h2>{f.title}</h2>
          <p>{f.body}</p>
        </article>
      ))}
    </section>
  );
}
