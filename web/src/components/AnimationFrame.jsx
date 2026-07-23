import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { buildAnimationSrcdoc } from "../lib/buildAnimationSrcdoc.js";
import { findScriptSyntaxError } from "../lib/checkAnimationSyntax.js";

const AnimationFrame = forwardRef(function AnimationFrame({ html }, ref) {
  const [currentHtml, setCurrentHtml] = useState(html);
  const [status, setStatus] = useState("checking"); // "checking" | "fixing" | "ok" | "failed"
  const triedFix = useRef(false);
  const iframeRef = useRef(null);

  useImperativeHandle(ref, () => ({
    resetView() {
      iframeRef.current?.contentWindow?.postMessage({ type: "sketchpad-reset-view" }, "*");
    },
  }));

  async function attemptFix(errorMessage) {
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
        body: JSON.stringify({ code: currentHtml, error: errorMessage }),
      });
      const data = await res.json();
      if (data.code) {
        setCurrentHtml(data.code);
        setStatus("checking");
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    }
  }

  useEffect(() => {
    if (status !== "checking") return;
    const syntaxErr = findScriptSyntaxError(currentHtml);
    if (syntaxErr) {
      attemptFix(syntaxErr);
    } else {
      setStatus("ok");
    }
  }, [status, currentHtml]);

  useEffect(() => {
    function onMessage(e) {
      if (e.data?.type !== "anim-error") return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      attemptFix(e.data.message);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [currentHtml]);

  const srcdoc = useMemo(() => buildAnimationSrcdoc(currentHtml), [currentHtml]);

  if (status === "failed") {
    return <div className="anim-note">⚠ Animation failed to render.</div>;
  }
  if (status !== "ok") {
    return <div className="anim-note">{status === "fixing" ? "Fixing animation…" : "Checking animation…"}</div>;
  }

  return (
    <div className="anim-wrap">
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        title="animation"
        style={{ width: "100%", height: 480, border: "none", borderRadius: 8 }}
      />
    </div>
  );
});

export default AnimationFrame;
