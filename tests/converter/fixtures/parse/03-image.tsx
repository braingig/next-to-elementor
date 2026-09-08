/* eslint-disable @next/next/no-img-element -- analyzer fixture uses raw img */
export default function ImageBlock() {
  return (
    <img
      src="/images/hero.jpg"
      alt="Product screenshot"
      width={1200}
      height={800}
      loading="lazy"
    />
  );
}
