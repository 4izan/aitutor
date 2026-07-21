// Assembles the self-contained Artifact page from the template + engine + lessons.
import { readFileSync, writeFileSync } from "fs";

const read = (p) => readFileSync(p, "utf8");
const neutralize = (s) => s.replaceAll("</script", "<\\/script");

let html = read("artifact/template.html");
html = html.replace("<!--THREE-->", () => neutralize(read("web/src/vendor/three.iife.js")));
html = html.replace("<!--ENGINE-->", () => neutralize(read("web/src/anim/tutorAnim.js") + "\n" + read("web/src/anim/tutor3d.js")));
html = html.replace("<!--MARKED-->", () => neutralize(read("node_modules/marked/lib/marked.umd.js")));
html = html.replace("/*LESSONS*/[]", () => neutralize(read("artifact/lessons.json")));

writeFileSync("artifact/tutor-demo.html", html);
console.log(`artifact/tutor-demo.html written (${Math.round(html.length / 1024)} KB)`);
