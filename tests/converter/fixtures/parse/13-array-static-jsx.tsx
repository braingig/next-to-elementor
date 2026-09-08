export default function StaticArrayJsx() {
  return (
    <div>
      {[
        <p key="a">First</p>,
        <p key="b">Second</p>,
        <p key="c">Third</p>,
      ]}
    </div>
  );
}
