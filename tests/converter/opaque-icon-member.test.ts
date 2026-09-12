/**
 * Static map opaque component refs + member JSX resolution.
 * <item.icon /> / <s.icon /> → known lucide stub / local component.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeReactSource,
  convertSource,
  loadElementorFreeCatalog,
  type IrNode,
} from "@/lib/converter";
import { lucideReactAdapter } from "@/lib/converter/project/deps/adapters/lucide";

const catalog = loadElementorFreeCatalog("4.2.4");

function walk(node: IrNode, visit: (n: IrNode) => void) {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

function lucideStubs(names: string[]) {
  return lucideReactAdapter.apply({
    packageName: "lucide-react",
    hits: [
      {
        specifier: "lucide-react",
        packageName: "lucide-react",
        fromPath: "page.tsx",
        localNames: names,
        isNamespace: false,
        isDefault: false,
        isSideEffect: false,
      },
    ],
    moduleSources: {
      "page.tsx": `import { ${names.join(", ")} } from "lucide-react"; export default function P(){ return null }`,
    },
    entryFile: "page.tsx",
    entrySource: "",
  }).knownComponentSources!;
}

describe("static map opaque component refs + member JSX", () => {
  it("resolves <item.icon /> to lucide icon IR (TrustBar-like)", () => {
    const known = lucideStubs([
      "ShieldCheck",
      "Gift",
      "TreePine",
      "CalendarCheck",
    ]);
    const { document } = analyzeReactSource(
      `
import { ShieldCheck, Gift, TreePine, CalendarCheck } from "lucide-react";
const ITEMS = [
  { icon: ShieldCheck, title: "Insured" },
  { icon: Gift, title: "Gifts" },
  { icon: TreePine, title: "Trees" },
  { icon: CalendarCheck, title: "Booked" },
];
export default function Trust() {
  return (
    <div>
      {ITEMS.map((item) => (
        <div>
          <item.icon className="h-5 w-5" />
          <span>{item.title}</span>
        </div>
      ))}
    </div>
  );
}
`,
      {
        language: "tsx",
        knownComponentSources: known,
      },
    );

    const icons: string[] = [];
    let fakeEmbeds = 0;
    walk(document.root, (n) => {
      if (n.kind === "icon" && typeof n.props.name === "string") {
        icons.push(n.props.name);
      }
      if (
        n.kind === "html-embed" &&
        typeof n.props.html === "string" &&
        (n.props.html.includes("item.icon") || n.props.html.includes("s.icon"))
      ) {
        fakeEmbeds += 1;
      }
    });
    expect(fakeEmbeds).toBe(0);
    expect(icons.sort()).toEqual(
      ["calendar-check", "gift", "shield-check", "tree-pine"].sort(),
    );
  });

  it("resolves <s.icon /> to lucide icon IR (Services-like)", () => {
    const known = lucideStubs([
      "PencilRuler",
      "Wrench",
      "Lightbulb",
      "Boxes",
    ]);
    const { document } = analyzeReactSource(
      `
import { PencilRuler, Wrench, Lightbulb, Boxes } from "lucide-react";
const SERVICES = [
  { icon: PencilRuler, title: "Design" },
  { icon: Wrench, title: "Install" },
  { icon: Lightbulb, title: "Ideas" },
  { icon: Boxes, title: "Supply" },
];
export default function Services() {
  return (
    <div>
      {SERVICES.map((s) => (
        <article>
          <s.icon className="h-6 w-6" />
          <h3>{s.title}</h3>
        </article>
      ))}
    </div>
  );
}
`,
      {
        language: "tsx",
        knownComponentSources: known,
      },
    );

    const icons: string[] = [];
    walk(document.root, (n) => {
      if (n.kind === "icon" && typeof n.props.name === "string") {
        icons.push(n.props.name);
      }
    });
    expect(icons.sort()).toEqual(
      ["boxes", "lightbulb", "pencil-ruler", "wrench"].sort(),
    );
  });

  it("resolves destructured opaque icon: ({ icon: Icon }) => <Icon />", () => {
    const known = lucideStubs(["Gift"]);
    const { document } = analyzeReactSource(
      `
import { Gift } from "lucide-react";
const ITEMS = [{ icon: Gift, title: "Gifts" }];
export default function App() {
  return (
    <div>
      {ITEMS.map(({ icon: Icon, title }) => (
        <div>
          <Icon />
          <span>{title}</span>
        </div>
      ))}
    </div>
  );
}
`,
      { language: "tsx", knownComponentSources: known },
    );

    let icons = 0;
    walk(document.root, (n) => {
      if (n.kind === "icon" && n.props.name === "gift") icons += 1;
    });
    expect(icons).toBe(1);
  });

  it("does not invent components for opaque non-local Identifiers", () => {
    const { document } = analyzeReactSource(
      `
import Mystery from "./mystery";
const ITEMS = [{ icon: Mystery, title: "X" }];
export default function App() {
  return (
    <div>
      {ITEMS.map((item) => (
        <item.icon />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );

    let fakeEmbeds = 0;
    let unknown = 0;
    walk(document.root, (n) => {
      if (
        n.kind === "html-embed" &&
        typeof n.props.html === "string" &&
        n.props.html.includes("item.icon")
      ) {
        fakeEmbeds += 1;
      }
      if (
        n.kind === "unsupported" &&
        n.props.reasonCode === "unknown-component"
      ) {
        unknown += 1;
      }
    });
    expect(fakeEmbeds).toBe(0);
    expect(unknown).toBeGreaterThanOrEqual(1);
  });

  it("convertSource emits icon widgets for map member icons", () => {
    const known = lucideStubs(["ShieldCheck", "Gift"]);
    const result = convertSource({
      source: `
import { ShieldCheck, Gift } from "lucide-react";
const ITEMS = [
  { icon: ShieldCheck, title: "A" },
  { icon: Gift, title: "B" },
];
export default function Page() {
  return (
    <section>
      {ITEMS.map((item) => (
        <div>
          <item.icon className="h-5" />
          <span>{item.title}</span>
        </div>
      ))}
    </section>
  );
}
`,
      language: "tsx",
      catalog,
      knownComponentSources: known,
    });

    expect(
      result.report.nodes.filter(
        (n) => n.widgetType === "icon" || n.irKind === "icon",
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      result.report.nodes.some(
        (n) =>
          n.decision === "unsupported" && n.reasonCode === "svg-complex",
      ),
    ).toBe(false);
    expect(
      result.report.nodes.some(
        (n) =>
          n.message.includes("item.icon") || n.message.includes("<item.icon"),
      ),
    ).toBe(false);
  });
});
