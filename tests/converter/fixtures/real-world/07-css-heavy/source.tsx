export function CssHeavySection() {
  return (
    <section className="css-hero">
      <div className="css-hero__inner">
        <h2 className="css-hero__title">CSS-driven layout</h2>
        <p className="css-hero__copy">
          Styles come from external CSS with class and descendant selectors plus media queries.
        </p>
        <a role="button" className="css-hero__cta" href="/learn">
          Learn more
        </a>
      </div>
    </section>
  );
}
