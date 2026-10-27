---
name: API Lab Workbench
description: High-density, mineral dark workbench for HTTP and gRPC engineering. Edge-to-edge chrome, crisp 1px hairlines, zero decorative slop.

colors:
  ground: "oklch(15% 0.01 260)"           # #0f1117 - page background
  surface: "oklch(18% 0.012 260)"         # #171a21 - sidebar & primary panels
  surface-raised: "oklch(22% 0.014 260)"  # #1f242d - dialogs, elevated panels
  surface-hover: "oklch(27% 0.016 260)"   # #292f3a - hover states
  hairline: "oklch(31% 0.015 260)"        # #303744 - 1px border rule
  hairline-strong: "oklch(40% 0.03 260)"  # active border rule

  text-high: "oklch(98% 0.005 260)"       # #f9fafb - primary text
  text-med: "oklch(72% 0.01 260)"         # #9ca3af - labels, secondary text
  text-low: "oklch(55% 0.015 260)"        # #6b7280 - muted labels, hotkeys

  accent-primary: "oklch(75.5% 0.18 70)"  # #f59e0b - main brand amber
  accent-gradient: "oklch(69.8% 0.20 45)" # #f97316 - brand gradient stop & secondary orange
  accent-hover: "oklch(64.5% 0.17 65)"    # #d97706 - button cta & active state

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
