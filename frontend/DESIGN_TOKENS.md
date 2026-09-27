# MedBridge Design Tokens

Single source of truth for visual styling. Every component must use these tokens —
no ad-hoc Tailwind palette classes (`amber-500`, `emerald-50`, `red-600`, …) and no
ad-hoc radii/shadows in component code. Recharts SVG attributes use the pinned hex
values listed below (SVG attributes can't use Tailwind classes).

## Color

| Token | Role |
| --- | --- |
| `primary-50 … primary-950` | Slate scale. Text, structure, neutral surfaces. `primary-950/900` for headings & active tab fill, `primary-500/400` for secondary text, `primary-100/200` for borders. |
| `clinical-50 … clinical-900` | Teal scale. **The single accent.** Primary actions, active/health-positive states, focus rings. `clinical-600` = button fill, `clinical-700` = hover, `clinical-50/100` = tinted backgrounds, `clinical-200` = tinted borders. |
| `surface-base` | Page background (`#F8FAFC`). |
| `surface-card` | Card background (white). |
| `surface-subtle` | Tinted fills inside cards, table headers. |
| `surface-border` | All card/divider borders (`#E2E8F0`). |
| `warning` (DEFAULT/text/bg/border) | Amber semantic set. Pending states, conflict warnings. |
| `danger` (DEFAULT/text/bg/border) | Red semantic set. Destructive, out-of-range, errors. |
| `success` (DEFAULT/text/bg/border) | Green semantic set. Completed, in-range, confirmed. |

**Banned in component code:** raw `amber-*`, `emerald-*`, `red-*`, `orange-*`, `sky-*`,
`indigo-*` classes. Use `warning-*`, `danger-*`, `success-*`, `clinical-*` instead.

**Recharts pinned hex values** (match tokens):
line `#0F172A` (primary-900) · in-range dot/accent `#0D9488` (clinical-600) ·
band fill `#0D9488` @ 8% opacity · band border `#14B8A6` @ 40% ·
grid `#F1F5F9` (primary-100) · axis `#E2E8F0` (primary-200) · tick text `#64748B` (primary-500).

## Typography

| Role | Classes |
| --- | --- |
| Page title | `font-heading font-extrabold text-xl sm:text-2xl text-primary-950 tracking-tight` |
| Section/card title | `font-heading font-bold text-base text-primary-900` |
| Sub-block title | `font-heading font-bold text-sm text-primary-900` |
| Card eyebrow/label | `text-[11px] uppercase tracking-wider font-bold text-primary-500` |
| Body | `text-xs text-primary-600/700` (dense) · `text-sm text-primary-700` (roomy) |
| Meta/caption | `text-[11px] text-primary-400/500` |
| Numeric/mono | `font-mono` for readings, dates, values |

Fonts: Plus Jakarta Sans (headings, via `font-heading`), Inter (body, default sans),
JetBrains Mono (`font-mono`). Do not introduce new families.

## Spacing

- Card padding: `p-5` standard, `p-4` dense grids, `p-3` inner chips/rows.
- Page rhythm: sections separated by `space-y-6`; inside cards `space-y-4`.
- Page wrapper (both dashboards): `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6`.
- Button padding: `px-4 py-2` (md) · `px-3 py-1.5` (sm).

## Radius scale (3 values only)

| Token | Value | Use |
| --- | --- | --- |
| `rounded-card` | 10px | Cards, panels, modals, timeline cards |
| `rounded-button` | 8px | Buttons, inputs, selects, tab pills |
| `rounded-full` | pill | Badges, status chips, avatars, dots |

**Banned:** `rounded`, `rounded-md`, `rounded-lg`, `rounded-xl` in new/edited code
(legacy instances are swept as files are touched).

## Shadow scale (3 values only)

| Token | Use |
| --- | --- |
| `shadow-subtle` | Resting cards, toolbars, active tab fill |
| `shadow-card` | Raised hero blocks (login card, greeting hero) |
| `shadow-modal` | Modal dialogs only |

**Banned:** `shadow-sm`, `shadow-xs`, `shadow-md/lg/xl` in component code.

## Buttons (`common/Button.jsx`)

| Variant | Style |
| --- | --- |
| `primary` | `bg-clinical-600 hover:bg-clinical-700 text-white shadow-subtle` |
| `secondary` | `bg-white border border-surface-border text-primary-800 hover:bg-surface-subtle` |
| `ghost` | `text-primary-600 hover:text-primary-900 hover:bg-surface-subtle` |
| `danger` | `bg-danger hover:bg-danger-text text-white` |

Sizes: `sm` = `text-xs px-3 py-1.5` · `md` = `text-xs px-4 py-2`. All get
`rounded-button font-semibold transition-med disabled:opacity-50 disabled:cursor-not-allowed`.

## Modals (`common/Modal.jsx`)

Overlay: `bg-primary-950/60 backdrop-blur-sm`. Panel: `bg-surface-card border
border-surface-border rounded-card shadow-modal animate-fadeIn`, header with icon +
title + close button, scrollable body, footer right-aligned actions. Sizes: `sm`
(max-w-md), `md` (max-w-xl), `lg` (max-w-4xl). Never re-implement overlay/panel
markup by hand — use the primitive.

## Status badges (`common/Badge.jsx` variants)

`clinical` = teal info/verified · `success` = completed/confirmed/in-range ·
`warning` = pending/requested · `danger` = cancelled/out-of-range/urgent ·
`default`/`subtle` = neutral. Sizes `sm`/`md`/`lg` per component.

## Motion

`transition-med` (180ms) on all interactive state changes. `animate-fadeIn` on
modals, toasts, and panels that appear. No other durations/keyframes without
adding them here first.

## Feedback states

- Loading: `Skeleton` family (`SkeletonLine`, `SkeletonCard`, `SkeletonTimeline`, `SkeletonChart`). Never plain "Loading…" text.
- Empty: `EmptyState` with contextual icon, title, description, optional action.
- Error: `ErrorState` with message + `onRetry`. Every async surface has all three.
