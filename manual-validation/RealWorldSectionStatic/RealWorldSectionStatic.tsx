import HeroContent from "./HeroContent";
import FeatureCard from "./FeatureCard";

/**
 * Isolation fixture: same multi-file / nested-import shape as RealWorldSection,
 * but no Array.map() and only static literal props at call sites.
 *
 * Entry for sectionName "RealWorldSectionStatic".
 */
export default function RealWorldSectionStatic() {
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
        <FeatureCard
          icon="bolt"
          title="Fast setup"
          description="Convert a section folder without rebuilding Elementor layouts by hand."
        />
        <FeatureCard
          icon="shield"
          title="Reliable output"
          description="Free 4.2.4 widgets only — unsupported constructs are reported honestly."
        />
        <FeatureCard
          icon="sparkle"
          title="Responsive design"
          description="Mobile-first Tailwind classes cascade into Elementor responsive tiers."
        />
      </div>
    </section>
  );
}
