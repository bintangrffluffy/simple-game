import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { shareResult } from "@/games/utils/share";

const LABELS = { copied: "Copied!", shared: "Shared!", failed: "Couldn't share" };

export default function ShareButton({ text, url }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!state) return undefined;
    const timer = setTimeout(() => setState(null), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const handleShare = async () => {
    const outcome = await shareResult({ text, url });
    if (outcome) setState(outcome);
  };

  const done = state === "copied" || state === "shared";
  return (
    <button type="button" className="btn btn-secondary w-full" onClick={handleShare} aria-live="polite">
      {done ? <Check size={16} /> : <Share2 size={16} />} {LABELS[state] ?? "Share result"}
    </button>
  );
}
