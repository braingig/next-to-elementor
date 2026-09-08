declare function FancyWidget(props: { title: string }): null;

export default function UnknownCustom() {
  return (
    <section>
      <FancyWidget title="Hello" />
    </section>
  );
}
