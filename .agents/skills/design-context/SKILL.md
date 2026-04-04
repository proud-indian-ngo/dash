---
name: design-context
description: Use when making UI/UX design decisions, creating new components, or reviewing visual design. Contains brand personality, design principles, and accessibility requirements.
---

# Design Context

## Users
Both admins and volunteers use pi-dash daily. Admins manage volunteers, finances, events, and approvals — they need efficiency and at-a-glance clarity. Volunteers check assignments, submit requests, and track status — they need simplicity and speed. Design for both: dense-enough for power users, clear-enough for occasional visitors.

## Brand Personality
**Modern, efficient, sharp.** The interface should feel like a well-crafted productivity tool — intentional, fast, and precise. Not corporate, not playful. Every element earns its place.

## Emotional Goals
- **Confidence & trust**: Users feel in control and trust the data they see.
- **Ease & calm**: Nothing feels overwhelming — tasks flow naturally.

## Aesthetic Direction
**Minimal & precise** — inspired by Linear and Vercel. Clean lines, generous whitespace, typography-driven hierarchy. OKLch color palette with mauve base tones. Inter Variable font. Cyan accent (#4fc3f7) as brand color.

**Anti-references** (what pi-dash must NOT resemble):
- Cluttered enterprise UIs (SAP/Salesforce density)
- Playful/whimsical designs (cartoonish illustrations, bubbly shapes)
- Generic Bootstrap templates (default-looking, unintentional)
- Dark/techy hacker aesthetics (terminal vibes, developer-focused)

## Design Principles
1. **Precision over decoration** — Every pixel serves a purpose. No ornamental elements, drop shadows for show, or gratuitous color. If it doesn't aid comprehension or interaction, remove it.
2. **Quiet confidence** — The UI recedes so content and data lead. Subtle transitions, muted chrome, strong typography hierarchy. The interface feels assured, not loud.
3. **Keyboard-first, touch-ready** — Design interactions for keyboard power users first, then ensure touch targets meet accessibility standards (min 44px). All actions reachable without a mouse.
4. **Progressive density** — Show essentials by default, reveal detail on demand. Admins get dense views when they need them; volunteers see clean, focused screens.
5. **Motion with purpose** — Animations only to convey state changes, spatial relationships, or direct attention. Respect `prefers-reduced-motion`. No decorative motion.

## Accessibility
- WCAG AA compliance (4.5:1 contrast minimum)
- Full keyboard navigation with visible focus indicators
- Screen reader support via semantic HTML and ARIA
- `prefers-reduced-motion` respected — all animations disabled or reduced
- Touch targets minimum 44px effective area
