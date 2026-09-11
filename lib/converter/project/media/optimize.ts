/**
 * Phase 14d — safe image optimization before WordPress media upload.
 *
 * Derives upload bytes from immutable VFS bytes. Never mutates ProjectVirtualFS.
 * Never touches convertSource() / Elementor IR. sharp is soft-loaded.
 */

export type MediaOptimizationStatus =
  | "optimized"
  | "original-smaller-or-equal"
  | "skipped"
  | "fallback";

export type AssetOptimizationResult = {
  /** Bytes chosen for upload (optimized only when strictly smaller). */
  bytes: Uint8Array;
  originalBytes: number;
  optimizedBytes?: number;
  savingsBytes?: number;
  savingsPercent?: number;
  optimizer?: string;
  optimizationStatus: MediaOptimizationStatus;
  fallbackReason?: string;
};

/** Env kill-switch: `N2E_MEDIA_OPTIMIZE=0|false|off|no` disables 14d. Default: enabled. */
export const MEDIA_OPTIMIZE_ENV = {
  enabled: "N2E_MEDIA_OPTIMIZE",
} as const;

export const MEDIA_OPTIMIZE_LIMITS = {
  maxLongestEdge: 4096,
  maxPixels: 16_000_000,
  jpegQuality: 80,
  webpQuality: 80,
} as const;

/** Extensions eligible for V1 optimization (same container; no format conversion). */
export const MEDIA_OPTIMIZE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

type SharpFactory = (typeof import("sharp"))["default"];

export type OptimizeAssetOptions = {
  assetPath: string;
  extension: string;
  bytes: Uint8Array;
  /** When false, skip optimization (kill-switch / Media OFF path). Default true. */
  enabled?: boolean;
  /**
   * Injectable sharp loader for tests. Return null to simulate unavailable sharp.
   * Default: soft dynamic import("sharp").
   */
  loadSharp?: () => Promise<SharpFactory | null>;
};

let cachedSharp: SharpFactory | null | undefined;

/**
 * Soft-load sharp. Failure → null (pipeline uploads originals).
 */
export async function loadSharpSoft(): Promise<SharpFactory | null> {
  if (cachedSharp !== undefined) return cachedSharp;
  try {
    const mod = await import("sharp");
    const factory = (mod.default ?? mod) as SharpFactory;
    cachedSharp = typeof factory === "function" ? factory : null;
  } catch {
    cachedSharp = null;
  }
  return cachedSharp;
}

/** Test helper: clear cached sharp module resolution. */
export function resetSharpCacheForTests(): void {
  cachedSharp = undefined;
}

/**
 * Read optimize kill-switch from env.
 * Enabled by default; disabled when N2E_MEDIA_OPTIMIZE is 0/false/off/no.
 */
export function isMediaOptimizeEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[MEDIA_OPTIMIZE_ENV.enabled];
  if (raw === undefined || raw === "") return true;
  const v = raw.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

function skipped(
  bytes: Uint8Array,
  reason: string,
): AssetOptimizationResult {
  return {
    bytes,
    originalBytes: bytes.byteLength,
    optimizationStatus: "skipped",
    fallbackReason: reason,
  };
}

function fallback(
  bytes: Uint8Array,
  reason: string,
): AssetOptimizationResult {
  return {
    bytes,
    originalBytes: bytes.byteLength,
    optimizationStatus: "fallback",
    fallbackReason: reason,
  };
}

function optimizerLabel(sharp: SharpFactory): string {
  try {
    const versions = (
      sharp as SharpFactory & {
        versions?: { sharp?: string };
      }
    ).versions;
    const ver = versions?.sharp;
    return ver ? `sharp@${ver}` : "sharp";
  } catch {
    return "sharp";
  }
}

function computeScale(width: number, height: number): number | null {
  if (width <= 0 || height <= 0) return null;
  const longest = Math.max(width, height);
  const pixels = width * height;
  let scale = 1;
  if (longest > MEDIA_OPTIMIZE_LIMITS.maxLongestEdge) {
    scale = Math.min(
      scale,
      MEDIA_OPTIMIZE_LIMITS.maxLongestEdge / longest,
    );
  }
  const scaledPixels = width * scale * (height * scale);
  if (scaledPixels > MEDIA_OPTIMIZE_LIMITS.maxPixels) {
    scale = Math.min(
      scale,
      Math.sqrt(MEDIA_OPTIMIZE_LIMITS.maxPixels / (width * height)),
    );
  }
  if (scale >= 1) return null;
  return scale;
}

/**
 * Optimize image bytes for upload. Never mutates `bytes` in place for VFS;
 * returns a new Uint8Array only when a strictly smaller result is selected.
 */
export async function optimizeAsset(
  options: OptimizeAssetOptions,
): Promise<AssetOptimizationResult> {
  const { bytes } = options;
  const originalBytes = bytes.byteLength;
  const ext = options.extension.toLowerCase();

  if (options.enabled === false) {
    return skipped(bytes, "optimize-disabled");
  }

  if (ext === ".gif") {
    return skipped(bytes, "format-gif");
  }
  if (ext === ".svg") {
    return skipped(bytes, "format-svg");
  }
  if (!MEDIA_OPTIMIZE_EXTENSIONS.has(ext)) {
    return skipped(bytes, "format-unsupported");
  }

  const load = options.loadSharp ?? loadSharpSoft;
  let sharp: SharpFactory | null;
  try {
    sharp = await load();
  } catch {
    return fallback(bytes, "sharp-unavailable");
  }
  if (!sharp) {
    return fallback(bytes, "sharp-unavailable");
  }

  const label = optimizerLabel(sharp);

  try {
    const input = Buffer.from(bytes);
    // rotate() applies EXIF orientation; withMetadata keeps ICC when present.
    let pipeline = sharp(input, { failOn: "error" }).rotate().withMetadata();
    const meta = await sharp(input, { failOn: "error" }).rotate().metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const scale = computeScale(width, height);
    if (scale !== null) {
      const newW = Math.max(1, Math.floor(width * scale));
      const newH = Math.max(1, Math.floor(height * scale));
      pipeline = pipeline.resize(newW, newH, {
        fit: "fill",
        withoutEnlargement: true,
      });
    }

    let outBuf: Buffer;
    if (ext === ".jpg" || ext === ".jpeg") {
      outBuf = await pipeline
        .jpeg({
          quality: MEDIA_OPTIMIZE_LIMITS.jpegQuality,
          mozjpeg: true,
        })
        .toBuffer();
    } else if (ext === ".png") {
      outBuf = await pipeline
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: false,
        })
        .toBuffer();
    } else {
      // .webp — keep WebP; quality mode preserves alpha when present.
      outBuf = await pipeline
        .webp({
          quality: MEDIA_OPTIMIZE_LIMITS.webpQuality,
          alphaQuality: 100,
        })
        .toBuffer();
    }

    const optimizedBytes = outBuf.byteLength;
    if (optimizedBytes < originalBytes) {
      const savingsBytes = originalBytes - optimizedBytes;
      return {
        bytes: new Uint8Array(outBuf),
        originalBytes,
        optimizedBytes,
        savingsBytes,
        savingsPercent:
          Math.round((savingsBytes / originalBytes) * 1000) / 10,
        optimizer: label,
        optimizationStatus: "optimized",
      };
    }

    return {
      bytes,
      originalBytes,
      optimizedBytes,
      savingsBytes: 0,
      savingsPercent: 0,
      optimizer: label,
      optimizationStatus: "original-smaller-or-equal",
      fallbackReason: "original-smaller-or-equal",
    };
  } catch {
    return fallback(bytes, "optimize-failed");
  }
}
