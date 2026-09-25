// Shares a result: the native share sheet on phones, clipboard on desktop
// (where navigator.share, if present, opens an OS dialog that's clumsier
// than a quick copy). Resolves to "shared" | "copied" | "failed", or null
// when the player dismissed the share sheet.
export async function shareResult({ text, url }) {
  const full = url ? `${text}\n${url}` : text;
  const isPhone = window.matchMedia?.("(pointer: coarse)").matches;

  if (isPhone && navigator.share) {
    try {
      await navigator.share({ text, url });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return null;
      // Share sheet unavailable (e.g. no permission) — fall back to copying.
    }
  }

  try {
    await navigator.clipboard.writeText(full);
    return "copied";
  } catch {
    // Clipboard API blocked (insecure origin / permissions) — legacy path.
  }

  try {
    const area = document.createElement("textarea");
    area.value = full;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied ? "copied" : "failed";
  } catch {
    return "failed";
  }
}
