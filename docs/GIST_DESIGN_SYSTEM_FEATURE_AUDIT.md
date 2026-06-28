# Gist Design System Feature Audit

Last updated: 2026-06-28

This audit maps the supplied Gist Design System package to Morphic's current product surface. The goal is to adopt the new mobile PWA and desktop browser app language without losing source-first features that already exist in the app.

## Carried Over In This Pass

- Self-hosted design fonts: `GraphikRegular.otf` and `FaktPro-Normal.ttf` are served from `public/fonts`.
- Core Gist tokens: OKLCH grayscale, indigo accent, story tint variables, Apple-style radii, hairlines, material blur, and motion tokens are available through `app/globals.css` and `app/native-shell.css`.
- Shell primitives: the existing `ShellLayout`, `AppNavBar`, `TabBar`, `ShellFrame`, and `ScrollContainer` remain the routing and scroll owners.
- Mobile-safe scrolling: the single scroll container, safe-area variables, keyboard response, and route scroll restoration remain intact.
- Brand treatment: the home title now renders as a `gist.` wordmark with the indigo accent dot.
- Search composer: existing upload, search mode, model picker, new chat, submit/stop, and disabled-model states remain wired while using the new material surface.
- Gist cards: summary/context/originals cards now use the new rounded material surface, while source-backed entity chips and source chips remain.
- Source cards: save, reader, guarded original links, favicon fallback, source preferences, and metadata remain available with the new material card surface.
- Navigation: home, search, discovery, library, and settings tabs are preserved.
- Auth flows: login, sign-up, password reset, confirmation, and auth error states now use the Gist auth shell, material cards, sentence-case copy, focused auth chrome, and mobile-safe layout.

## Present In Product, Needs Deeper Design-System Coverage

- Source preferences and preference profiles: implemented in settings and ranking, but the new design package does not yet define the full settings, profile, import/export, or per-topic lens UI.
- Evidence panel and claim verification: evidence components exist, including fact-checking support, but the design package only sketches the concept. It needs a first-class claim drawer, status language, and citation-to-claim interaction model.
- Source comparison and disagreement: the product has source normalization and source cards, but no finished disagreement/comparison card pattern.
- Rich source metadata and feedback: source cards carry metadata and actions, but trust metrics, per-citation feedback, and source-quality badges need a unified visual language.
- Library and reading queue: library routes exist, but the design package only partially covers saved sources, read state, collections, and offline/queue states.
- Feeds, podcasts, and followed sources: feed/podcast tools exist, but the design system needs follow management, transcript snippets, and audio timestamp playback states.
- Search modes and action categories: quick/adaptive modes exist, but the design package needs the complete mode selector, category chips, and signed-out gating states.
- Research process trace: tool progress exists, but the design package needs an explicit multi-agent/process trace pattern.
- Overlay system: shell sheets and dialogs exist, but the design package calls for a formal back-stack, focus trap, drag-dismiss, and side-panel contract.
- Guest mode and account settings: guest search gating exists, but signed-in account management, profile/history/bookmark tabs, and connector states still need fuller Gist coverage.
- Share and feedback: site feedback exists, but thread sharing and per-answer/citation reporting need a complete pattern.

## Missing Or Deferred From This Pass

- File attachment previews and drag-over/dropzone states in the composer.
- Generative UI artifacts panel placement inside the new shell language.
- Desktop-specific split-pane source/evidence layouts beyond the existing sidebar and shell frame.
- Formal empty, skeleton, list-row, and loading system components for all routes.
- Full design-system screenshots converted into production page layouts.
- Topic-specific source preference profiles inspired by search lenses.

## Implementation Rule

New visual work should be layered on existing feature-bearing components first. Avoid replacing production components with static UI-kit mock components unless the replacement preserves routing, auth, provider/model data, source safety, telemetry, and error handling.
