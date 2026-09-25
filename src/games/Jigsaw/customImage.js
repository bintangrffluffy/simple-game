// Player-supplied jigsaw pictures. The upload keeps its original aspect
// ratio (the board is shaped to match it) and is only downscaled, then kept
// as a JPEG data URL so it can be remembered in localStorage for the next
// visit. Everything stays on the device — nothing is uploaded anywhere.

const STORAGE_KEY = "fluffy_jigsaw_custom_image";
const MAX_SIDE = 1200;

export function loadSavedCustomImage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveCustomImage(src) {
  try {
    localStorage.setItem(STORAGE_KEY, src);
  } catch {
    // Quota exceeded / storage blocked: the image still works this session.
  }
}

export function toCustomAsset(src) {
  return { id: "custom", name: "Your photo", type: "image", src };
}

export async function fileToImage(file) {
  if (file.type && !file.type.startsWith("image/")) throw new Error("not-an-image");

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) throw new Error("empty-image");
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // JPEG has no alpha: transparent PNGs go white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Width / height of any picture (built-in or uploaded); square if unknown.
export function measureAspect(src) {
  return new Promise((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el.naturalWidth && el.naturalHeight ? el.naturalWidth / el.naturalHeight : 1);
    el.onerror = () => resolve(1);
    el.src = src;
  });
}
