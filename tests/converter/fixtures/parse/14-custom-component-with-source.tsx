function Card() {
  return (
    <div className="card">
      <h3>Card title</h3>
      <p>Card body</p>
    </div>
  );
}

export default function WithLocalCard() {
  return (
    <section>
      <Card />
    </section>
  );
}
