export default function DynamicExpression() {
  const name = "Ada";
  return (
    <div>
      <h1>Hello {name}</h1>
      <p>{name.toUpperCase()}</p>
    </div>
  );
}
