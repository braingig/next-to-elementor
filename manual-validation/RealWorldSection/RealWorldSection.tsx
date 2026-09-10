import HeroContent from "./HeroContent";
import FeatureCard from "./FeatureCard";

/**
 * Realistic multi-file section fixture.
 * Uses a static array + Array.map() (Phase E) with static prop binding (Phase D).
 * Entry for sectionName "RealWorldSection".
 */
const features = [
  {
    icon: "bolt",
    title: "Fast setup",
    description:
      "Convert a section folder without rebuilding Elementor layouts by hand.",
  },
  {
    icon: "shield",
    title: "Reliable output",
    description:
      "Free 4.2.4 widgets only — unsupported constructs are reported honestly.",
  },
  {
    icon: "sparkle",
    title: "Responsive design",
    description:
      "Mobile-first Tailwind classes cascade into Elementor responsive tiers.",
  },
];

export default function RealWorldSection() {
  return (
    <section className="real-world-section flex flex-col gap-12 px-6 py-16">
      <HeroContent />
      <div className="flex flex-col gap-2 items-center text-center">
        <h2 className="text-3xl font-bold text-slate-900">
          Why teams choose FlowSpace
        </h2>
        <p className="text-base text-slate-600 max-w-2xl">
          Native Free widgets first, with honest fallbacks when accuracy requires it.
        </p>
      </div>
      <div className="flex flex-col gap-6 md:flex-row">
        {features.map((feature) => (
          <FeatureCard
            key={feature.title}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>
    </section>
  );
}
