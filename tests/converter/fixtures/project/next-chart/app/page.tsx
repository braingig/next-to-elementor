import { LineChart } from "recharts";
const data = [{ x: 1, y: 2 }, { x: 2, y: 4 }];
export default function Home() {
  return (
    <section>
      <h1>Stats</h1>
      <LineChart width={200} height={100} data={data} />
    </section>
  );
}
