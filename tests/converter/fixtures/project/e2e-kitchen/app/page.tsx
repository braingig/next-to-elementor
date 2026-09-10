import "./home.css";
import { Check } from "lucide-react";
import { Card } from "../components/Card";
const ITEMS = [
  { title: "Alpha", body: "First" },
  { title: "Beta", body: "Second" },
];
export default function Home() {
  return (
    <section className="hero flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Kitchen Sink</h1>
      <Check size={18} />
      {ITEMS.map((item) => (
        <Card key={item.title} title={item.title} body={item.body} />
      ))}
    </section>
  );
}
