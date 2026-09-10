import type { Metadata } from "next";
import { ConverterWorkspace } from "@/app/components/converter-workspace";

export const metadata: Metadata = {
  title: "React → Elementor Free Converter",
  description:
    "Convert TSX/JSX sections or React/Next project ZIPs into Elementor Free 4.2.4 classic JSON with native widgets, scoped HTML fallbacks, and an honest unsupported report.",
};

export default function Home() {
  return (
    <main className="min-h-full bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#fafafa_45%,_#f4f4f5_100%)]">
      <ConverterWorkspace />
    </main>
  );
}
