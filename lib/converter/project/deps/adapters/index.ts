/**
 * Adapter lookup — static adapters only; never loads npm packages.
 */

import type { DependencyAdapter } from "./types";
import { lucideReactAdapter } from "./lucide";
import { framerMotionAdapter } from "./framer-motion";
import { carouselAdapter } from "./carousel";
import { chartsAdapter } from "./charts";

const ADAPTERS: Record<string, DependencyAdapter> = {
  "lucide-react": lucideReactAdapter,
  "framer-motion": framerMotionAdapter,
  carousel: carouselAdapter,
  charts: chartsAdapter,
};

export function getAdapter(adapterId: string): DependencyAdapter | undefined {
  return ADAPTERS[adapterId];
}

export {
  lucideReactAdapter,
  framerMotionAdapter,
  carouselAdapter,
  chartsAdapter,
};
export type {
  DependencyAdapter,
  AdapterApplyResult,
  AdapterApplyInput,
} from "./types";
