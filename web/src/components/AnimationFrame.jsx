import { useEffect, useMemo, useRef, useState } from "react";
import threeSource from "../vendor/three.iife.js?raw";
import coreSource from "../anim/tutorAnim.js?raw";
import tutor3dSource from "../anim/tutor3d.js?raw";
import { buildAnimationSrcdoc } from "../lib/buildAnimationSrcdoc.js";

export default function AnimationFrame({ code }) {
  const [currentCode, setCurrentCode] = useState(code);
  const [status, setStatus] = useState("ok"); // "ok" | "fixing" | "failed"
  const triedFix = useRef(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    async function onMessage(e) {
      if (e.data?.type !== "anim-error") return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (triedFix.current) {
        setStatus("failed");
        return;
      }
      triedFix.current = true;
      setStatus("fixing");
      try {
        const res = await fetch("/api/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: currentCode, error: e.data.message }),
        });
        const data = await res.json();
        if (data.code) {
          setCurrentCode(data.code);
          setStatus("ok");
        } else {
          setStatus("failed");
        }
      } catch {
        setStatus("failed");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [currentCode]);

  const srcdoc = useMemo(
    () => buildAnimationSrcdoc(threeSource, `${coreSource}\n${tutor3dSource}`, currentCode),
    [currentCode]
  );

  if (status === "failed") {
    return <div className="anim-note">⚠ Animation failed to render.</div>;
  }

  return (
    <div className="anim-wrap">
      {status === "fixing" && <div className="anim-note">Fixing animation…</div>}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        title="animation"
        style={{ width: "100%", height: 480, border: "none", borderRadius: 8 }}
      />
    </div>
  );
}
