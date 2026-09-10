/**
 * Icon name comes from a parent prop. Without prop substitution the analyzer
 * sees a dynamic expression for data-icon.
 */
export default function Icon({ name }: { name: string }) {
  return (
    <svg
      data-icon={name}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      className="text-teal-600"
    >
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
    </svg>
  );
}
