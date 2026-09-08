import type { ReactNode } from "react";

type Props = {
  title: string;
  children?: ReactNode;
};

export default function TsxTyped({ title }: Props) {
  return (
    <article>
      <h1>{title}</h1>
      <p>Typed TSX component</p>
    </article>
  );
}
