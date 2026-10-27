---
name: API Lab Workbench
description: High-density, mineral dark workbench for HTTP and gRPC engineering. Edge-to-edge chrome, crisp 1px hairlines, zero decorative slop.

colors:
  ground: "#0a0b0f"                       # #0a0b0f - page background
  surface: "#101218"                      # #101218 - sidebar & panels
  surface-raised: "#161921"               # #161921 - inputs, active tabs
  surface-hover: "#1e222e"                # #1e222e - hover states
  hairline: "#343a4c"                     # #343a4c - 1px border rule
  hairline-strong: "#4b5563"              # #4b5563 - active border rule

  text-high: "#f9fafb"                    # #f9fafb - primary text, values
  text-med: "#9ca3af"                     # #9ca3af - labels, inactive text
  text-low: "#6b7280"                     # #6b7280 - placeholders, hotkeys

  accent-primary: "#14b8a6"               # #14b8a6 - scientific teal execution CTA
  accent-gradient: "#06b6d4"              # #06b6d4 - secondary cyan brand gradient stop
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
