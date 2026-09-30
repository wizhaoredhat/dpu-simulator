# dpu-simulator interactive website

A static, offline-capable booth introduction to DPU offload. The six-part tour
compares conventional networking with DPU offload, maps a representative
BlueField-3 deployment to Kind, explains the Kind/VM topology,
and finishes with a copyable Kind quickstart. Presenter profiles identify
William Zhao (Red Hat) and Tim Rozet (NVIDIA).

## Develop

Requires Node.js 22.12 or newer and npm. From the repository root:

```sh
cd website
npm ci
npm run dev
```

Open the local URL printed by Vite, including `/dpu-simulator/`. Hash navigation
keeps chapter links compatible with a static GitHub Pages deployment. The site
does not connect to or deploy a cluster.

## Prepare the booth copy

While connected to the internet, install dependencies and build:

```sh
cd website
npm ci
npm run build
npm run preview -- --port 4173
```

Open `http://127.0.0.1:4173/dpu-simulator/`. Keep the preview process running.
After the build, the entire tour, diagrams, playback, glossary, logos, quickstart,
and QR rendering work with external internet disconnected. A local HTTP server
is still required; do not open `dist/index.html` directly with `file://`.

The **Present** footer control uses browser fullscreen. **Start over** resets
the tour and component state. Packet animation never starts automatically.
Keyboard users can tab to all controls and use Enter/Space; no global arrow-key
shortcuts intercept normal browser behavior. Reduced motion removes moving
packet effects while retaining narrated, manual steps.

External documentation links, the public QR destination, simulator installation,
and simulator image downloads require internet. Website offline support does not
imply that the simulator can be installed without downloaded dependencies.

## Publish through GitHub Pages

The workflow in `.github/workflows/website.yml` builds and tests website changes
on pull requests. Pushes to `main` (and manual runs on `main`) additionally deploy
the tested static build. Existing simulator workflows are unchanged.

1. In the repository's **Settings → Pages → Build and deployment**, select
   **GitHub Actions** as the source.
2. Merge the website changes into `main`, or run the **Website** workflow from
   `main` after the changes exist there.
3. Open the deployment URL reported by the workflow and scan the QR code with a
   phone before the booth session.

The expected upstream URL is `https://ovn-kubernetes.github.io/dpu-simulator/`.
Adding this workflow does not itself publish the site or enable repository Pages
settings. The QR code points to the configured public URL even in a local demo.

### URL configuration

- `WEBSITE_BASE_PATH`: asset base path including leading/trailing slashes;
  local default `/dpu-simulator/`.
- `VITE_PUBLIC_URL`: complete public URL used for the QR code and share link;
  local default `https://ovn-kubernetes.github.io/dpu-simulator/`.

For a local build with a different destination:

```sh
WEBSITE_BASE_PATH=/dpu-simulator/ \
VITE_PUBLIC_URL=https://example.github.io/dpu-simulator/ \
npm run build
```

The Actions workflow derives defaults from the repository owner and name. Set
repository variables `DPU_SIM_SITE_URL` and `WEBSITE_BASE_PATH` to override those
defaults for a custom domain or path. Build the local booth copy with the same
public URL. `VITE_*` variables are public build-time values; never put secrets in
them.

## Verify

```sh
npm run build
npx playwright install chromium
npm test
```

When using an existing Chromium installation:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome npm test
```

Tests use the production build served on port 4180. They cover tour navigation,
exploration return, browser history, packet playback/pause/reset, mode changes,
topology explanations, dialogs, clipboard behavior, mobile overflow, reduced
motion, and operation with external requests blocked. Keep `WEBSITE_BASE_PATH`
and `VITE_PUBLIC_URL` consistent between build and test when overriding defaults.

## Update content

- `src/content.ts`: chapter names, explanations, glossary, quickstart, public URL.
- `src/Topology.tsx`: grouped host/DPU architecture and selection details.
- `src/PacketJourney.tsx`: conceptual packet path and playback state.
- `src/HardwareComparison.tsx` / `src/hardwareContent.ts`: linked BlueField-3/Kind
  diagrams, interface purposes, reservations, and sources.
- `src/App.tsx`: tour shell, presenter profiles, share and glossary dialogs.
- `src/styles.css` / `src/tokens.css`: layouts and visual design.
- `src/hardware.css`: hardware chapter and responsive comparison layout.
- `SOURCES.md`: implementation references, CI evidence, and modeling boundaries.
- `public/brands/NOTICE.md`: provenance of locally bundled company logos.

The website describes the checked-in examples. When those examples, CLI flags,
resource naming, or cluster setup change, update the explanations and quickstart
together. Do not turn recorded CI success into a static “passing” status badge.
