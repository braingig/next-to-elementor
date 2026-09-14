export {
  convertToNativeElementor,
  type ConvertToNativeOptions,
} from "./convert";
export type {
  NativeStrategy,
  NativeNodeDecision,
  NativeConversionResult,
  ElementorDocument,
  ElementorElement,
  ElementorSettings,
} from "./types";
export { elementorIdFromIrId, NativeStrategySchema } from "./types";
export { mapIrStyleToSettings, cascadeMobileFirstToElementorTiers } from "./styles/map-style";
export { toBoxShadow, toSlider, toGridColumns, toGaps, toGapsAxes } from "./styles/values";
export {
  isButtonLikeLink,
  flattenButtonLikeLinkContent,
  linkNodeAsButton,
} from "./widgets/button-like-link";
export {
  extractImageLikeLink,
  isVisuallyHiddenNode,
  unwrapToSingleImage,
} from "./widgets/image-like-link";
export {
  detectNativeFidelityGap,
  detectAbsoluteClusterFidelityGap,
  type NativeFidelityGap,
} from "./fidelity";
