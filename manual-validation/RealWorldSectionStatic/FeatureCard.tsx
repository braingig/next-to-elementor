import Icon from "./Icon";

/**
 * Accepts static literal props at the call site.
 * Prop substitution is NOT implemented yet — this fixture measures that gap.
 */
export default function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <article className="feature-card flex flex-col gap-3 p-6 rounded-xl border border-slate-200 bg-white">
      <Icon name={icon} />
      <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
    </article>
  );
}
