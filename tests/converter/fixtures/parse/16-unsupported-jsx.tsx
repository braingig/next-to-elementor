export default function UnsupportedCases() {
  const items = ["a", "b"];
  return (
    <div>
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
      <input type="text" value={items[0]} onChange={() => {}} />
    </div>
  );
}
