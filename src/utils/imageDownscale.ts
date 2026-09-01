// Shrink a user-supplied image to something safe to keep inside the synced
// state blob.
//
// Why this exists: sync POSTs the *entire* AppState as one JSON document
// (see services/syncService.ts → the sync Lambda). API Gateway caps a
// request at 10MB and Lambda at 6MB, and the save fires on a debounce after
// every change anywhere in the app. So an oversized image doesn't just fail
// to upload — it breaks syncing for everything else. A raw iPad screenshot
// is 2–5MB as PNG, which is squarely in that danger zone.
//
// Handwriting on a light background is close to the best case for JPEG, so
// stepping quality down before resolution keeps the notes legible while
// landing comfortably inside budget.

// Max base64 characters we'll accept for a stored photo. ~600KB of string,
// which is roughly 450KB of image — an order of magnitude below the Lambda
// ceiling, leaving the rest of the state plenty of headroom even with a
// photo attached for both today and tomorrow.
export const PHOTO_BUDGET_CHARS = 600_000;

// Tried in order: shed quality first (cheap, barely visible on ink), then
// resolution (costs legibility, so it goes last).
const QUALITY_STEPS = [0.75, 0.6, 0.45];
const MAX_EDGE_STEPS = [1600, 1200, 900];

export interface DownscaleResult {
  dataUrl: string;
  bytesApprox: number;
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file didn't load as an image."));
    };
    img.src = url;
  });
}

function render(img: HTMLImageElement, maxEdge: number, quality: number): string | null {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Flatten onto white: JPEG has no alpha, and a transparent PNG screenshot
  // would otherwise composite onto black and bury the ink.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Downscale until the encoded data URL fits PHOTO_BUDGET_CHARS.
 * Throws with a user-facing message if even the smallest setting is too big.
 */
export async function downscaleForStorage(file: File): Promise<DownscaleResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }
  const img = await loadImage(file);

  let last: string | null = null;
  for (const maxEdge of MAX_EDGE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const dataUrl = render(img, maxEdge, quality);
      if (!dataUrl) throw new Error('Could not process that image on this device.');
      last = dataUrl;
      if (dataUrl.length <= PHOTO_BUDGET_CHARS) {
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        return {
          dataUrl,
          bytesApprox: Math.round((dataUrl.length * 3) / 4),
          width: Math.round(img.naturalWidth * scale),
          height: Math.round(img.naturalHeight * scale),
        };
      }
    }
  }

  throw new Error(
    `That image is still ${Math.round((last?.length ?? 0) / 1024)}KB after shrinking. ` +
      'Try cropping it to just the list, or screenshot a smaller region.'
  );
}
