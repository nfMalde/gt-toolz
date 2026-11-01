// The overlay page's own CSS (served as /overlay.css with the elements' looks, the pages may load no inline
// styles): a transparent page for OBS, the stage at the top left, scaled to the browser source (client.ts), and the
// hint when the source has another shape than the canvas.

import { OVERLAY_CSS } from '../src/view';

export const PAGE_CSS = `
html, body { margin: 0; background: transparent; overflow: hidden; }
#stage { transform-origin: 0 0; transition: opacity 0.4s; }
#stage.hidden { opacity: 0; }
#notice {
  position: fixed; left: 12px; top: 12px; max-width: calc(100vw - 24px); padding: 8px 12px; border-radius: 8px;
  background: #ff8a3d; color: #160f09; font: 600 15px/1.3 'Segoe UI', system-ui, sans-serif;
}
#notice[hidden] { display: none; }
${OVERLAY_CSS}
body.index { background: #0d0a07; color: #f1ebe5; font: 15px/1.5 'Segoe UI', system-ui, sans-serif; padding: 24px; overflow: auto; }
body.index a { color: #ff8a3d; }
`;
