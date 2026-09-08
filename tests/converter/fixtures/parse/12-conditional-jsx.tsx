export default function ConditionalJsx() {
  // Intentionally non-static for the analyzer (not a boolean literal).
  const flag = someRuntimeFlag();
  return (
    <div>
      {true && <p>Shown when true</p>}
      {false && <p>Hidden when false</p>}
      {true ? <h2>Yes branch</h2> : <h2>No branch</h2>}
      {flag ? <span>Dynamic</span> : <span>Other</span>}
    </div>
  );
}

declare function someRuntimeFlag(): boolean;
