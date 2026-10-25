# Documentation visual redesign

## Goal

Give the CloudDev AI documentation a clear product identity and a useful first screen. The documentation should feel like a considered developer product, not the default Material for MkDocs theme.

## Current context

The published site uses the default Material layout, palette, and typography. Its home page is a plain sequence of paragraphs and links. The repository already pins Material for MkDocs 9.8.0 and keeps the existing Markdown sources, search, and navigation.

## Approaches considered

1. Keep the default theme and add a small palette tweak. This is low effort, but would not give the home page a memorable hierarchy or explain the shared-workspace idea at a glance.
2. Replace the site with a custom JavaScript application. This would give full control, but duplicates documentation navigation and search and adds a separate build surface.
3. Keep Material for MkDocs and add a local visual system, brand mark, and purpose-built landing page. This preserves existing content, search, and navigation while allowing a strong product-specific first screen. This is the chosen approach.

## Design

- Use graphite surfaces, mint accents, restrained cyan light, a fine grid, and system fonts. Do not load third-party fonts or images.
- Make the home page explain that desktop VS Code, browser VS Code, and CloudCLI mobile use one persistent workspace. Show the clients converging on `/workspace` without implying that editor windows share UI state.
- Give the deployment guide and current release status clear primary actions.
- Add three concise route cards for deployment, architecture, and operations, followed by explicit notes about provider-key boundaries and restart recovery.
- Keep the existing sidebar and search. Hide only the home page table of contents when it adds no useful navigation.
- Reflow the hero and route cards for narrow screens. Respect reduced-motion preferences and visible keyboard focus.

## Guardrails

- Do not change runtime behavior or release claims.
- Do not promise that a task process survives a workspace restart. State that only supported, explicit session recovery is available.
- Do not add external assets, new JavaScript dependencies, or a new site framework.

## Acceptance

- Strict MkDocs build and documentation artifact checks pass.
- Automated source checks cover the brand asset, custom stylesheet, landing-page routes, and truthful cross-device/recovery language.
- Playwright inspection confirms the actual rendered desktop and mobile layouts, working navigation, and no horizontal overflow.
