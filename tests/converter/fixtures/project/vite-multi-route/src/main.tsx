import { Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { About } from "./pages/About";

export default function App() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">Vite Multi Route</h1>
      <p>Static shell; router paths discovered separately.</p>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </main>
  );
}
