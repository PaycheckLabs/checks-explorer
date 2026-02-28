# QR Overlay Reference (LOCKED, CODE INCLUDED)

Canonical showcase serial: **FMV-8427BC-UK45**  
Source file: `pages/testnet/[serial].tsx`  
Locked on: 2026-02-27

This file is the single source of truth for **everything QR related** (markup + sizing + positioning + responsive overrides).
If the QR ever drifts, changes size, becomes rounded, or gets “fixed” accidentally, restore the serial file to match the code blocks below exactly.

---

## 0) Change control rule

Any commit that changes **any** QR-related code in `pages/testnet/[serial].tsx` must update this file in the **same commit**.

---

## 1) QR overlay JSX (TSX) — VERBATIM

This QR overlay is rendered on top of the card image (inside the card render where the card image is shown):

```tsx
{/* QR overlay */}
<div className="qrOuter" aria-hidden="true">
  <img
    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
      `${origin}/testnet/${serial}`
    )}`}
    className="qrImg"
    alt=""
  />
</div>
