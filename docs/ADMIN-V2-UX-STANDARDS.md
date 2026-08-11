# IZHE Admin v2 — UX Standards

## Product principle

Admin v2 is one administration product. Identical actions use identical wording, hierarchy, component behavior, keyboard support, and loading/error treatment across modules.

## Information architecture

Persistent left navigation:

- Overview
- Catalog
  - Products
  - Collections
  - Media Library
- Content
  - Website Content
  - Visual Editor
  - Teaching Library
- Operations
  - Orders
  - Give One
  - Fulfillment
  - Production Batches
  - Church Pickup
- Campaigns
- Accountability
- Administration
  - Administrators & Roles
  - Active Sessions
  - Audit Log

Navigation items are projected by permission and never replace server authorization. Deep links are canonical and survive refresh.

## Theme

Admin v2 is intentionally light and distinct from the public storefront.

Core tokens:

- application background: `#F7F8FA`
- surface: `#FFFFFF`
- primary text: `#172033`
- secondary text: `#64748B`
- subtle text: `#94A3B8`
- border: `#E2E8F0`
- hover surface: `#F1F5F9`
- IZHE gold: `#FBBF24`
- dark navy navigation: `#0F172A`

Use the local system-font stack. Do not load runtime Tailwind, Google Fonts, or external icon JavaScript in Admin v2.

## Button hierarchy

### Primary

Use one dominant action per page/major workflow: **New Product**, **Save Changes**, **Publish**, **Create Campaign**. Gold/dark-primary treatment is reserved for priority actions.

### Secondary

Neutral bordered control for supporting actions such as:

- **Choose from Media Library**
- **Upload New**
- **Preview**
- **More Filters**

### Quiet

Use for low-priority navigation/details actions.

### Destructive

Use a danger treatment and confirmation for destructive/irreversible actions.

## Canonical vocabulary

Use exactly:

- Choose from Media Library
- Upload New
- Save Draft
- Save Changes
- Publish
- Unpublish
- Archive
- More Filters
- More Actions
- View Details
- Duplicate
- Export

Do not reintroduce `Choose approved site media` or `Select from media` for the same Media Library action.

## Layout and container rules

- The main workspace is fluid after the navigation rail; do not globally constrain operational tables to a dashboard max width.
- Use cards for a limited number of independent KPI/alert summaries only.
- Primary workspaces are flat page surfaces using headings, whitespace, dividers, tables, drawers, dialogs, and sticky action bars.
- Avoid bordered card nesting.
- Long editors use section headings/dividers plus a sticky save/action bar.

## Forms

- One or two columns depending on available width; one column on mobile.
- Labels above controls.
- Required fields identified semantically and visually.
- Help text only when it resolves a meaningful decision.
- Field-level validation where possible.
- Revision/conflict errors remain explicit.
- Unsaved changes are visible and navigation-away warnings apply to long editors.

## Tables

- Full-width within the workspace.
- Clear primary/secondary row information.
- Text status label/badge; never color alone.
- Server pagination for large datasets.
- Empty/loading/error states.
- Overflow **More Actions** menu instead of rows of buttons.
- Horizontal scrolling only when a compact responsive representation is not practical.

## Filters

Desktop priority order:

`Search … | Status | high-frequency filter | Date | More Filters`

Low-frequency criteria live under **More Filters**. Active filters render as removable chips.

At narrower widths, secondary filters collapse behind one **Filters** control while search remains visible where practical. Normal desktop widths must not wrap **More Filters** onto a second toolbar row.

## Drawers and dialogs

Use drawers for on-demand detail/edit contexts that benefit from preserving the list behind them. Use dialogs for bounded decisions, confirmation, duplication, filters, and media selection.

Dialogs must:

- receive initial focus;
- trap keyboard focus while open;
- close on Escape where safe;
- restore focus to the invoking control;
- expose an accessible name/description; and
- prevent duplicate mutations while an action is pending.

## Menus

Overflow/dropdown menus support:

- Enter/Space opening;
- Arrow navigation;
- Home/End where appropriate;
- Escape close;
- outside-click close;
- visible focus;
- correct ARIA menu semantics; and
- focus restoration.

## Shared Media Library picker

The action label is exactly **Choose from Media Library** in every relevant module.

The picker supports:

- search and filters;
- cursor pagination;
- thumbnails;
- alt text;
- usage/rights/product-accuracy state;
- current selection;
- clear selection;
- context-specific eligibility with an explanation; and
- **Upload New** only when the user has upload permission.

Approval status is an asset attribute inside the picker, not a different action name.

## Product duplication

**Duplicate** appears in the product row menu and editor context. The confirmation explains copied vs reset fields and permits target collection selection. Successful duplication opens the new paused draft in the editor.

## Responsive behavior

Acceptance widths:

- 1920 × 1080
- 1440 × 900
- 1280 × 800
- 1024 × 768
- 768 × 1024
- 390 × 844

Large/desktop: full navigation and wide tables.
Medium: collapsible navigation, preserved table utility.
Small/mobile: navigation drawer, filter sheet/control, one-column forms, drawers/dialogs bounded to viewport.

## Accessibility target

Target WCAG 2.2 AA. Verify:

- full keyboard operation;
- visible focus;
- skip link;
- dialog focus management;
- status/error announcements;
- accessible labels;
- text alternatives;
- color contrast;
- text in addition to status color;
- practical pointer targets;
- reduced-motion behavior;
- forced-colors behavior;
- accessible tables; and
- mobile navigation/filter controls.

`tests/browser/admin-v2.spec.mjs` exercises representative routes, menus, filters, Media Library, responsive layouts, and mobile navigation in Chromium and stores screenshot evidence.
