export function UnsafeLink() {
  return (
    <div>
      <h2>Safe</h2>
      <a href="javascript:alert(1)">Bad</a>
    </div>
  );
}
