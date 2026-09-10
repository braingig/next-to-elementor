export default function UnsupportedCases() {
  // Dynamic receiver — must remain unsupported (not executed / not guessed).
  const items = getItems();
  return (
    <div>
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
      <input type="text" value="x" onChange={() => {}} />
    </div>
  );
}

declare function getItems(): string[];
