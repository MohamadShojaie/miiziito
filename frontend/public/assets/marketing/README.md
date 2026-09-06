# Marketing visuals — Miiziito landing page

## Preferred approach: HTML product previews

Landing page previews use **ProductPreviews.tsx** — built from the same structure as production:

### Customer menu
- Colors: `--bg: #1a1612`, `--primary: #c9a227`
- Category rail with SVG icons from `/assets/category/*.svg`
- Line-art item images from `/assets/items/*-line.png`
- Item rows with + button, new badge, cart FAB

### Cashier panel (cp-app)
- Topbar: sidebar toggle, title, «سفارش جدید», sync status
- Sidebar: 11 tabs with icons from `CashierIcons.tsx` / `TAB_ICONS`
- Orders tab: filter chips, order cards with status workflow

## If generating AI images (optional)

Use this structure in prompts — **do not use generic stock cafe photos**:

```
Dark background #1a1612, gold accent #c9a227, RTL Persian UI.
Menu: horizontal category pills with coffee SVG icons; rows with line-art cup illustrations (not photos); gold + buttons.
Admin: left icon sidebar (orders, invoices, tables, menu, stats); order list with status pills (جدید, آماده‌سازی, آماده).
No cafe brand name. Match Miiziito product UI, not App Store mockups.
```

## Assets

| Path | Purpose |
|------|---------|
| `/assets/marketing/digital-menu.png` | Hero + product section — digital menu |
| `/assets/marketing/management-system.png` | Hero + product section — management panel |
| `/assets/category/*.svg` | Category tab icons |
| `/assets/items/*-line.png` | Menu item line-art |
| `ProductPreviews.tsx` | Legacy HTML mocks (unused on landing) |

Avoid using unrelated AI phone mockups — they do not match the product.
