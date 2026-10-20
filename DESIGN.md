---
name: API Lab Workbench
description: High-density, mineral dark workbench for HTTP and gRPC engineering. Edge-to-edge chrome, crisp 1px hairlines, zero decorative slop.

colors:
  ground: "oklch(14% 0.01 260)"           # #0e1015 - page background
  surface: "oklch(17% 0.012 260)"         # #14171f - sidebar & panels
  surface-raised: "oklch(20% 0.014 260)"  # #1a1e28 - inputs, active tabs
  surface-hover: "oklch(23% 0.016 260)"   # #212634 - hover states
  hairline: "oklch(27% 0.015 260 / 0.5)"  # 1px border rule
  hairline-strong: "oklch(40% 0.03 260)"  # active border rule

  text-high: "oklch(94% 0.005 260)"       # primary text, values
  text-med: "oklch(72% 0.01 260)"         # labels, inactive text
  text-low: "oklch(50% 0.015 260)"        # placeholders, hotkeys

  accent-primary: "oklch(54.6% 0.245 278)" # #4f46e5 - logo indigo execution CTA
  accent-gradient: "oklch(56.3% 0.248 289)" # #6947e6 - logo violet execution gradient stop
  accent-grpc: "oklch(68% 0.18 290)"      # gRPC reflection accent

  method-get: "oklch(72% 0.17 155)"
  method-post: "oklch(68% 0.18 250)"
  method-put: "oklch(75% 0.16 75)"
  method-delete: "oklch(65% 0.20 25)"

typography:
  ui: "Albert Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  mono: "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace"

radii:
  sm: "3px"
  md: "5px"
  none: "0px"
---

# Design System: API Lab Workbench

## Core Principles

1. **High Information Density:** Desktop tool for professional engineers. Minimize whitespace padding; maximize lines of code and payload visible.
2. **Monolithic Workbench:** Request and response areas are flat edge-to-edge panes separated by thin 1px dividers, never nested floating cards.
3. **No Decorative Slop:** No gradient overlays, no glowing halos, no side-tab borders (`border-l-4` is strictly refused), no drop-shadows on flat chrome.
4. **Instant Affordances:** Primary action (Send) is locked directly into the address bar as a monolithic command pill.
