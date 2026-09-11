import { describe, expect, it } from "vitest";
import {
  analyzeReactSource,
  convertSectionInput,
  loadElementorFreeCatalog,
  type IrNode,
} from "@/lib/converter";
import { MAX_STATIC_ARRAY_MAP_ELEMENTS } from "@/lib/converter/parse/analyze/static-array-map";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const catalog = loadElementorFreeCatalog("4.2.4");

function walk(node: IrNode, visit: (n: IrNode) => void) {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

function texts(root: IrNode): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    if (
      (n.kind === "text" ||
        n.kind === "heading" ||
        n.kind === "button" ||
        n.kind === "link") &&
      typeof n.props.text === "string" &&
      n.props.text.length > 0
    ) {
      out.push(n.props.text);
    }
  });
  return out;
}

function unsupportedReasons(root: IrNode): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    if (n.kind === "unsupported") out.push(String(n.props.reasonCode));
  });
  return out;
}

describe("Phase E static Array.map() expansion", () => {
  it("1. expands static array map into three cards", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
const features = [
  { title: "Fast setup" },
  { title: "Reliable output" },
  { title: "Responsive design" },
];
export function App() {
  return (
    <div>
      {features.map((feature) => (
        <Card title={feature.title} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    const t = texts(document.root);
    expect(t).toContain("Fast setup");
    expect(t).toContain("Reliable output");
    expect(t).toContain("Responsive design");
    expect(unsupportedReasons(document.root)).toEqual([]);
    expect(
      document.diagnostics.some((d) => d.code === "static-array-map"),
    ).toBe(true);
  });

  it("2. passes static object properties as props", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title, description }: { title: string; description: string }) {
  return (
    <article>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
const items = [{ title: "A", description: "Alpha" }];
export function App() {
  return (
    <div>
      {items.map((item) => (
        <Card title={item.title} description={item.description} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toEqual(
      expect.arrayContaining(["A", "Alpha"]),
    );
  });

  it("3. expands string / number / boolean static values", () => {
    const { document } = analyzeReactSource(
      `
function Flag({ on }: { on: boolean }) {
  return on ? <span>yes</span> : <span>no</span>;
}
const rows = [
  { label: "hello", count: 3, on: true },
];
export function App() {
  return (
    <div>
      {rows.map((row) => (
        <div>
          <p>{row.label}</p>
          <p>{row.count}</p>
          <Flag on={row.on} />
        </div>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    const t = texts(document.root);
    expect(t).toContain("hello");
    expect(t).toContain("3");
    expect(t).toContain("yes");
    expect(t).not.toContain("no");
  });

  it("4. supports map with index parameter", () => {
    const { document } = analyzeReactSource(
      `
const labels = ["first", "second"];
export function App() {
  return (
    <div>
      {labels.map((label, index) => (
        <p>
          {index}:{label}
        </p>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    const t = texts(document.root);
    expect(t.some((s) => s.includes("0") && s.includes("first"))).toBe(true);
    expect(t.some((s) => s.includes("1") && s.includes("second"))).toBe(true);
  });

  it("5. expands multiple independent map expressions", () => {
    const { document } = analyzeReactSource(
      `
const a = [{ title: "One" }];
const b = [{ title: "Two" }];
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
export function App() {
  return (
    <div>
      {a.map((x) => (
        <Card title={x.title} />
      ))}
      {b.map((x) => (
        <Card title={x.title} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toEqual(
      expect.arrayContaining(["One", "Two"]),
    );
  });

  it("6. nests local components inside mapped JSX", () => {
    const { document } = analyzeReactSource(
      `
function Inner({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
function Outer({ title }: { title: string }) {
  return <Inner title={title} />;
}
const items = [{ title: "Nested map" }];
export function App() {
  return (
    <div>
      {items.map((item) => (
        <Outer title={item.title} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("Nested map");
    expect(unsupportedReasons(document.root)).toEqual([]);
  });

  it("7. rejects function-returned / dynamic arrays", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
export function App() {
  const features = getFeatures();
  return (
    <div>
      {features.map((f) => (
        <Card title={f.title} />
      ))}
    </div>
  );
}
declare function getFeatures(): { title: string }[];
`,
      { language: "tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
    expect(texts(document.root)).not.toContain("guessed");
  });

  it("8. rejects unresolved identifier receivers", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
export function App() {
  return (
    <div>
      {features.map((f) => (
        <Card title={f.title} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
  });

  it("9. does not execute map callbacks with unsupported body logic", () => {
    const { document } = analyzeReactSource(
      `
const items = [{ title: "X" }];
export function App() {
  return (
    <div>
      {items.map((item) => {
        const upper = item.title.toUpperCase();
        return <h3>{upper}</h3>;
      })}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
    expect(texts(document.root)).not.toContain("X");
  });

  it("10. scopes known-component arrays — QuoteForm SERVICES must not expand Services", () => {
    const { document } = analyzeReactSource(
      `
export function App() {
  return (
    <div>
      <Services />
    </div>
  );
}
`,
      {
        language: "tsx",
        knownComponentSources: {
          QuoteForm: `
const SERVICES = ["Design", "Installation", "Removal", "Storage", "Full-Service Package"];
export function QuoteForm() {
  return (
    <div>
      {SERVICES.map((s) => (
        <option>{s}</option>
      ))}
    </div>
  );
}
`,
          Services: `
import porch from "@/assets/porch.jpg";
import roofline from "@/assets/roofline.jpg";
import trees from "@/assets/trees.jpg";
import residential from "@/assets/residential.jpg";
const SERVICES = [
  { image: porch, title: "Design", text: "A" },
  { image: roofline, title: "Install", text: "B" },
  { image: trees, title: "Removal", text: "C" },
  { image: residential, title: "Storage", text: "D" },
];
export function Services() {
  return (
    <div>
      {SERVICES.map((s) => (
        <article>
          <img src={s.image} alt={s.title} />
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </article>
      ))}
    </div>
  );
}
`,
        },
      },
    );
    const titles = texts(document.root);
    expect(titles).toEqual(
      expect.arrayContaining(["Design", "Install", "Removal", "Storage"]),
    );
    expect(titles).not.toContain("Installation");
    expect(titles).not.toContain("Full-Service Package");
    // 4 real expansions (not 5 string hijacks)
    let imageLike = 0;
    walk(document.root, (n) => {
      if (
        n.kind === "image" ||
        (n.kind === "unsupported" && n.props.reasonCode === "asset-unresolved")
      ) {
        imageLike += 1;
      }
    });
    expect(imageLike).toBe(4);
  });

  it("11. static imported asset fields are materializable (opaque until string)", () => {
    const { document } = analyzeReactSource(
      `
import img1 from "./a.jpg";
const ITEMS = [{ src: img1, title: "One" }];
export function App() {
  return (
    <div>
      {ITEMS.map((item) => (
        <div>
          <img src={item.src} alt="" />
          <h3>{item.title}</h3>
        </div>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("One");
    expect(
      document.diagnostics.some((d) => d.code === "static-array-map"),
    ).toBe(true);
    // Without a public URL string, src stays unresolved — but map expanded.
    expect(unsupportedReasons(document.root)).toContain("asset-unresolved");
    expect(unsupportedReasons(document.root)).not.toContain("dynamic-children");
  });

  it("12. one-level member item.src resolves when field is a string", () => {
    const { document } = analyzeReactSource(
      `
const ITEMS = [
  { src: "https://cdn.example/a.jpg", title: "A" },
  { src: "https://cdn.example/b.jpg", title: "B" },
];
export function App() {
  return (
    <div>
      {ITEMS.map((item) => (
        <img src={item.src} alt={item.title} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    const srcs: string[] = [];
    walk(document.root, (n) => {
      if (n.kind === "image" && typeof n.props.src === "string") {
        srcs.push(n.props.src);
      }
    });
    expect(srcs).toEqual([
      "https://cdn.example/a.jpg",
      "https://cdn.example/b.jpg",
    ]);
  });

  it("13. generic static fields item.title / item.text resolve", () => {
    const { document } = analyzeReactSource(
      `
const ITEMS = [{ title: "Hello", text: "World" }];
export function App() {
  return (
    <div>
      {ITEMS.map((item) => (
        <div>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </div>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toEqual(
      expect.arrayContaining(["Hello", "World"]),
    );
  });

  it("14. gallery-like: 6 static objects with imported images expand to 6 children", () => {
    const { document } = analyzeReactSource(
      `
import a from "@/assets/a.jpg";
import b from "@/assets/b.jpg";
import c from "@/assets/c.jpg";
import d from "@/assets/d.jpg";
import e from "@/assets/e.jpg";
import f from "@/assets/f.jpg";
const ITEMS = [
  { src: a, label: "A" },
  { src: b, label: "B" },
  { src: c, label: "C" },
  { src: d, label: "D" },
  { src: e, label: "E" },
  { src: f, label: "F" },
];
export function App() {
  return (
    <div>
      {ITEMS.map((item) => (
        <figure>
          <img src={item.src} alt={item.label} />
          <figcaption>{item.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toEqual(
      expect.arrayContaining(["A", "B", "C", "D", "E", "F"]),
    );
    let figures = 0;
    walk(document.root, (n) => {
      if (
        n.kind === "unsupported" &&
        n.props.reasonCode === "asset-unresolved"
      ) {
        figures += 1;
      }
    });
    expect(figures).toBe(6);
    expect(unsupportedReasons(document.root)).not.toContain("dynamic-children");
  });

  it("15. services-like: opaque icons + image imports expand 4 cards", () => {
    const { document } = analyzeReactSource(
      `
import IconA from "lucide-react";
import img1 from "@/assets/1.jpg";
import img2 from "@/assets/2.jpg";
import img3 from "@/assets/3.jpg";
import img4 from "@/assets/4.jpg";
const SERVICES = [
  { icon: IconA, image: img1, title: "T1", text: "D1" },
  { icon: IconA, image: img2, title: "T2", text: "D2" },
  { icon: IconA, image: img3, title: "T3", text: "D3" },
  { icon: IconA, image: img4, title: "T4", text: "D4" },
];
export function App() {
  return (
    <div>
      {SERVICES.map((s) => (
        <article>
          <img src={s.image} alt={s.title} />
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </article>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toEqual(
      expect.arrayContaining(["T1", "T2", "T3", "T4", "D1", "D2", "D3", "D4"]),
    );
    let imgs = 0;
    walk(document.root, (n) => {
      if (
        n.kind === "unsupported" &&
        n.props.reasonCode === "asset-unresolved"
      ) {
        imgs += 1;
      }
    });
    expect(imgs).toBe(4);
  });

  it("16. Array.from remains dynamic", () => {
    const { document } = analyzeReactSource(
      `
export function App() {
  const bulbs = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div>
      {bulbs.map((i) => (
        <span>{i}</span>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
  });

  it("17. runtime/dynamic array remains dynamic", () => {
    const { document } = analyzeReactSource(
      `
export function App({ items }: { items: { title: string }[] }) {
  return (
    <div>
      {items.map((item) => (
        <h3>{item.title}</h3>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
  });

  it("18. expansion cap is enforced without silent truncation", () => {
    const n = MAX_STATIC_ARRAY_MAP_ELEMENTS + 1;
    const items = Array.from({ length: n }, (_, i) => `{ title: "T${i}" }`).join(
      ",",
    );
    const { document } = analyzeReactSource(
      `
const ITEMS = [${items}];
export function App() {
  return (
    <div>
      {ITEMS.map((item) => (
        <h3>{item.title}</h3>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
    expect(
      document.diagnostics.some(
        (d) =>
          d.code === "dynamic-children" &&
          d.message.includes("exceed limit"),
      ),
    ).toBe(true);
    expect(texts(document.root)).toHaveLength(0);
  });

  it("19. cross-file named static array import expands NAV_LINKS.map", () => {
    const brand = `
export const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Services", href: "#services" },
  { label: "Gallery", href: "#gallery" },
];
export function Logo() { return <img src="https://x/logo.png" alt="logo" />; }
`;
    const header = `
import { NAV_LINKS } from "./brand";
export function Header() {
  return (
    <nav>
      {NAV_LINKS.map((l) => (
        <a href={l.href}>{l.label}</a>
      ))}
    </nav>
  );
}
`;
    const { document } = analyzeReactSource(
      `
import { Header } from "./header";
export function App() {
  return <Header />;
}
`,
      {
        language: "tsx",
        sourcePath: "src/App.tsx",
        knownComponentSources: {
          Header: header,
          Logo: brand,
          NAV_LINKS: brand,
        },
        moduleSources: {
          "src/App.tsx": `
import { Header } from "./header";
export function App() {
  return <Header />;
}
`,
          "src/header.tsx": header,
          "src/brand.tsx": brand,
        },
      },
    );
    const t = texts(document.root);
    expect(t).toEqual(expect.arrayContaining(["Home", "Services", "Gallery"]));
    expect(unsupportedReasons(document.root)).not.toContain("dynamic-children");
    expect(
      document.diagnostics.some((d) => d.code === "static-array-map"),
    ).toBe(true);
  });

  it("20. import alias LINKS.map expands", () => {
    const brand = `
export const NAV_LINKS = [
  { label: "A", href: "#a" },
  { label: "B", href: "#b" },
];
`;
    const header = `
import { NAV_LINKS as LINKS } from "./brand";
export function Header() {
  return (
    <nav>
      {LINKS.map((l) => (
        <a href={l.href}>{l.label}</a>
      ))}
    </nav>
  );
}
`;
    const { document } = analyzeReactSource(
      `import { Header } from "./header"; export function App(){ return <Header />; }`,
      {
        language: "tsx",
        sourcePath: "src/App.tsx",
        knownComponentSources: { Header: header },
        moduleSources: {
          "src/App.tsx": `import { Header } from "./header"; export function App(){ return <Header />; }`,
          "src/header.tsx": header,
          "src/brand.tsx": brand,
        },
      },
    );
    expect(texts(document.root)).toEqual(expect.arrayContaining(["A", "B"]));
  });

  it("21. cross-file static object import resolves member fields", () => {
    const brand = `
export const THEME = { title: "Festive", tagline: "Lights" };
`;
    const header = `
import { THEME } from "./brand";
export function Header() {
  return (
    <div>
      <h1>{THEME.title}</h1>
      <p>{THEME.tagline}</p>
    </div>
  );
}
`;
    const { document } = analyzeReactSource(
      `import { Header } from "./header"; export function App(){ return <Header />; }`,
      {
        language: "tsx",
        sourcePath: "src/App.tsx",
        knownComponentSources: { Header: header },
        moduleSources: {
          "src/App.tsx": `import { Header } from "./header"; export function App(){ return <Header />; }`,
          "src/header.tsx": header,
          "src/brand.tsx": brand,
        },
      },
    );
    expect(texts(document.root)).toEqual(
      expect.arrayContaining(["Festive", "Lights"]),
    );
  });

  it("22. unrelated module with same export name must NOT resolve", () => {
    const quote = `
export const SERVICES = ["Design", "Installation", "Removal"];
export function QuoteForm() {
  return <div>{SERVICES.map((s) => <span>{s}</span>)}</div>;
}
`;
    const services = `
export const SERVICES = [
  { title: "Design", text: "A" },
  { title: "Install", text: "B" },
];
export function Services() {
  return (
    <div>
      {SERVICES.map((s) => (
        <article>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </article>
      ))}
    </div>
  );
}
`;
    const { document } = analyzeReactSource(
      `
import { Services } from "./services";
export function App() {
  return <Services />;
}
`,
      {
        language: "tsx",
        sourcePath: "src/App.tsx",
        knownComponentSources: {
          Services: services,
          QuoteForm: quote,
        },
        moduleSources: {
          "src/App.tsx": `
import { Services } from "./services";
export function App() {
  return <Services />;
}
`,
          "src/services.tsx": services,
          "src/quote-form.tsx": quote,
        },
      },
    );
    const t = texts(document.root);
    expect(t).toEqual(expect.arrayContaining(["Design", "Install", "A", "B"]));
    expect(t).not.toContain("Installation");
    expect(t).not.toContain("Removal");
  });

  it("23. runtime-generated exported array remains dynamic", () => {
    const data = `
export function buildItems() { return [{ title: "X" }]; }
export const ITEMS = buildItems();
`;
    const page = `
import { ITEMS } from "./data";
export function Page() {
  return (
    <div>
      {ITEMS.map((item) => (
        <h3>{item.title}</h3>
      ))}
    </div>
  );
}
`;
    const { document } = analyzeReactSource(
      `import { Page } from "./page"; export function App(){ return <Page />; }`,
      {
        language: "tsx",
        sourcePath: "src/App.tsx",
        knownComponentSources: { Page: page },
        moduleSources: {
          "src/App.tsx": `import { Page } from "./page"; export function App(){ return <Page />; }`,
          "src/page.tsx": page,
          "src/data.tsx": data,
        },
      },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
  });

  it("24. Array.from exported value remains dynamic", () => {
    const data = `
export const ITEMS = Array.from({ length: 3 }, (_, i) => ({ title: String(i) }));
`;
    const page = `
import { ITEMS } from "./data";
export function Page() {
  return (
    <div>
      {ITEMS.map((item) => (
        <h3>{item.title}</h3>
      ))}
    </div>
  );
}
`;
    const { document } = analyzeReactSource(
      `import { Page } from "./page"; export function App(){ return <Page />; }`,
      {
        language: "tsx",
        sourcePath: "src/App.tsx",
        knownComponentSources: { Page: page },
        moduleSources: {
          "src/App.tsx": `import { Page } from "./page"; export function App(){ return <Page />; }`,
          "src/page.tsx": page,
          "src/data.tsx": data,
        },
      },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
  });

  it("25. missing export remains dynamic", () => {
    const brand = `export const OTHER = [{ label: "X", href: "#" }];`;
    const header = `
import { NAV_LINKS } from "./brand";
export function Header() {
  return (
    <nav>
      {NAV_LINKS.map((l) => (
        <a href={l.href}>{l.label}</a>
      ))}
    </nav>
  );
}
`;
    const { document } = analyzeReactSource(
      `import { Header } from "./header"; export function App(){ return <Header />; }`,
      {
        language: "tsx",
        sourcePath: "src/App.tsx",
        knownComponentSources: { Header: header },
        moduleSources: {
          "src/App.tsx": `import { Header } from "./header"; export function App(){ return <Header />; }`,
          "src/header.tsx": header,
          "src/brand.tsx": brand,
        },
      },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
  });

  it("26. circular module graph does not recurse indefinitely", () => {
    const a = `
import { B_ITEMS } from "./b";
export const A_ITEMS = [{ title: "A" }];
export function CompA() {
  return <div>{B_ITEMS.map((i) => <h3>{i.title}</h3>)}</div>;
}
`;
    const b = `
import { A_ITEMS } from "./a";
export const B_ITEMS = [{ title: "B" }];
export function CompB() {
  return <div>{A_ITEMS.map((i) => <h3>{i.title}</h3>)}</div>;
}
`;
    // Direct export consts are static; cross-import of the *other* array is fine
    // without evaluating modules. Ensure analysis completes.
    const { document } = analyzeReactSource(
      `import { CompA } from "./a"; export function App(){ return <CompA />; }`,
      {
        language: "tsx",
        sourcePath: "src/App.tsx",
        knownComponentSources: { CompA: a, CompB: b },
        moduleSources: {
          "src/App.tsx": `import { CompA } from "./a"; export function App(){ return <CompA />; }`,
          "src/a.tsx": a,
          "src/b.tsx": b,
        },
      },
    );
    expect(document.root).toBeTruthy();
    expect(texts(document.root)).toContain("B");
  });
});

describe("Phase E RealWorldSection folder fixture", () => {
  const FIXTURE = join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/section-input/RealWorldSection",
  );

  function loadComponentFiles(dir: string): Record<string, string> {
    const files: Record<string, string> = {};
    function walkDir(current: string) {
      for (const name of readdirSync(current)) {
        const abs = join(current, name);
        const rel = relative(dir, abs).replace(/\\/g, "/");
        if (statSync(abs).isDirectory()) {
          walkDir(abs);
          continue;
        }
        if (/\.(tsx|ts|jsx|js|css)$/i.test(name)) {
          files[rel] = readFileSync(abs, "utf8");
        }
      }
    }
    walkDir(dir);
    return files;
  }

  it("12. expands FeatureCard map into Elementor JSON with distinct props", () => {
    const files = loadComponentFiles(FIXTURE);
    const result = convertSectionInput({
      files,
      sectionName: "RealWorldSection",
      convert: {
        language: "tsx",
        catalog,
        css: files["styles.css"] ?? "",
        title: "RealWorldSection",
      },
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    expect(result.elementorJson).not.toBeNull();
    expect(result.report.summary.unsupportedCount).toBe(0);
    expect(result.report.summary.errorCount).toBe(0);

    const html = JSON.stringify(result.elementorJson);
    expect(html).toContain("Fast setup");
    expect(html).toContain("Reliable output");
    expect(html).toContain("Responsive design");
    expect(html).toContain("Start converting");
    expect(html).toContain("Ship landing sections");
    expect(html).toContain("fas fa-bolt");
    expect(html).toContain("/start");
  });
});
