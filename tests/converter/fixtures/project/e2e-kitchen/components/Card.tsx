export function Card({ title, body }: { title: string; body: string }) {
  return (
    <article className="p-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm">{body}</p>
    </article>
  );
}
