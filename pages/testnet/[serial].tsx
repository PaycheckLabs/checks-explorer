import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import serials from "../../data/testnet-serials.json";
import { isValidSerialFormat, normalizeSerial } from "../../lib/serial";

type SerialRecord = {
  chainId: number;
  network: string;
  contract: string;
  tokenId: number;
  memo?: string;
  mintTx?: string;
  transferTx?: string;
  redeemTx?: string;
  voidTx?: string;
  claimableAt?: number; // unix seconds
};

type PageProps = {
  serial: string;
  record: SerialRecord | null;
  origin: string;
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const raw = String(ctx.params?.serial || "");
  const normalized = normalizeSerial(raw);

  // Keep URL normalized (important for consistency)
  if (raw !== normalized) {
    return {
      redirect: { destination: `/testnet/${normalized}`, permanent: false },
    };
  }

  if (!isValidSerialFormat(normalized)) return { notFound: true };

  const record = (serials as Record<string, SerialRecord>)[normalized] ?? null;

  // Build an origin for absolute OG URLs
  const proto = (ctx.req.headers["x-forwarded-proto"] as string) || "https";
  const host = ctx.req.headers.host || "explorer.checks.xyz";
  const origin = `${proto}://${host}`;

  return { props: { serial: normalized, record, origin } };
};

// ---------- helpers ----------

function polygonscanTx(tx: string) {
  return `https://amoy.polygonscan.com/tx/${tx}`;
}

function polygonscanAddress(addr: string) {
  return `https://amoy.polygonscan.com/address/${addr}`;
}

function normalizeTxHash(input?: string | null): string | null {
  if (!input) return null;
  const t = String(input).trim();
  if (!t) return null;

  const with0x = t.startsWith("0x") ? t : `0x${t}`;
  const lower = with0x.toLowerCase();

  // standard tx hash length: 66 chars (0x + 64 hex)
  if (lower.length !== 66) return null;
  if (!/^0x[0-9a-f]{64}$/.test(lower)) return null;

  return lower;
}

function formatUtc(tsSeconds: number) {
  try {
    const d = new Date(tsSeconds * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
  } catch {
    return "";
  }
}

function msToHuman(ms: number) {
  if (ms <= 0) return "0m";

  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (days > 0) return `${days}d ${hrs % 24}h`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

function getCardCandidates(serial: string) {
  return [`/checks/testnet/${serial}.png`, `/testnet/${serial}.png`, `/checks/${serial}.png`];
}

async function pickFirstLoadableImage(candidates: string[]): Promise<string | null> {
  for (const src of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
    if (ok) return src;
  }
  return null;
}

// ---------- page ----------

export default function SerialPage({ serial, record, origin }: PageProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [cardSrc, setCardSrc] = useState<string | null>(null);
  const [cardFailed, setCardFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const candidates = useMemo(() => getCardCandidates(serial), [serial]);

  useEffect(() => {
    let alive = true;
    setCardFailed(false);
    setCardSrc(null);

    pickFirstLoadableImage(candidates).then((picked) => {
      if (!alive) return;
      if (picked) setCardSrc(picked);
      else setCardFailed(true);
    });

    return () => {
      alive = false;
    };
  }, [candidates]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const title = `${serial} — Checks Explorer`;
  const ogImageUrl = `${origin}${cardSrc || candidates[0]}`;

  const normalizedMint = normalizeTxHash(record?.mintTx);
  const normalizedTransfer = normalizeTxHash(record?.transferTx);
  const normalizedRedeem = normalizeTxHash(record?.redeemTx);
  const normalizedVoid = normalizeTxHash(record?.voidTx);

  const isVoided = Boolean(normalizedVoid);
  const isRedeemed = Boolean(normalizedRedeem);

  const claimableAt = record?.claimableAt ?? null;
  const claimableAtMs = claimableAt ? claimableAt * 1000 : null;
  const countdown = claimableAtMs != null ? msToHuman(claimableAtMs - nowMs) : null;

  const claimStatusText = useMemo(() => {
    if (!record) return null;
    if (isVoided) return "This check was voided before it became claimable.";
    if (claimableAtMs == null) return null;
    if (nowMs >= claimableAtMs) return "Claimable now.";
    return `Claimable in ${countdown}`;
  }, [record, isVoided, claimableAtMs, nowMs, countdown]);

  async function copyToClipboard(textToCopy: string, key: string) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
    } catch {
      // ignore
    }
  }

  if (!record) {
    return (
      <>
        <Head>
          <title>{title}</title>
          <meta name="robots" content="noindex,nofollow" />
        </Head>

        <div className="page">
          <div className="container">
            <div className="topBar">
              <Link href="/" className="backLink">
                ← Checks Explorer
              </Link>
            </div>

            <h1 className="title">{serial}</h1>

            <div className="panel">
              <h2 className="h2">Not found</h2>
              <p className="muted">This serial isn’t in the curated testnet list.</p>
            </div>
          </div>
        </div>

        <style jsx global>{baseStyles}</style>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="Checks Explorer testnet serial page." />
        <meta property="og:title" content={title} />
        <meta property="og:description" content="Payment Checks v1 testnet serial page." />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="page">
        <div className="container">
          <div className="topBar">
            <Link href="/" className="backLink">
              ← Checks Explorer
            </Link>

            <button
              className={`pillBtn ${copiedKey === "page" ? "copied" : ""}`}
              onClick={() => copyToClipboard(`${origin}/testnet/${serial}`, "page")}
              type="button"
            >
              {copiedKey === "page" ? "Copied" : "Copy page link"}
            </button>
          </div>

          <h1 className="title">{serial}</h1>

          <div className="chips">
            <span className="chip">Testnet</span>
            <span className="dot">•</span>
            <span className="chip">Polygon Amoy (80002)</span>
            <span className="dot">•</span>
            <span className="chipStatus">
              <span className="chipLabel">Status</span>
              <span className={`chipValue ${isVoided ? "chipRed" : isRedeemed ? "chipGreen" : ""}`}>
                {isVoided ? "Voided" : isRedeemed ? "Redeemed" : "Active"}
              </span>
            </span>
          </div>

          <div className="grid">
            <div className="stack">
              <div className="panel">
                <div className="cardWrap">
                  {cardSrc && (
                    <>
                      <img src={cardSrc} alt={`Check card ${serial}`} className="cardImg" draggable={false} />

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
                    </>
                  )}

                  {cardFailed && (
                    <div className="imgFail">
                      <div className="label">Check image failed to load.</div>
                      <div className="muted">
                        You can open it directly:
                        <div className="btnRow">
                          <a className="pillBtnLink" href={candidates[0]} target="_blank" rel="noreferrer">
                            Open image
                          </a>
                          <a className="pillBtnLink" href={`${origin}/testnet/${serial}`} target="_blank" rel="noreferrer">
                            Open page
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="btnRow">
                  <a className="pillBtnLink" href={cardSrc || candidates[0]} target="_blank" rel="noreferrer">
                    Open image
                  </a>
                  <a className="pillBtnLink" href={`${origin}/testnet/${serial}`} target="_blank" rel="noreferrer">
                    Open page
                  </a>
                </div>
              </div>
            </div>

            <div className="stack">
              <div className="panel">
                <h2 className="h2">Details</h2>

                <div className="detailGrid">
                  <div className="label">Network</div>
                  <div className="valueRight">Polygon Amoy (chainId 80002)</div>

                  <div className="label">Contract</div>
                  <div className="valueRight">
                    <div className="contractBox monoNoWrap">{record.contract}</div>
                    <div className="btnRow detailsBtnRow">
                      <button
                        className={`pillBtn ${copiedKey === "contract" ? "copied" : ""}`}
                        onClick={() => copyToClipboard(record.contract, "contract")}
                        type="button"
                      >
                        {copiedKey === "contract" ? "Copied" : "Copy"}
                      </button>
                      <a
                        className="pillBtnLink"
                        href={polygonscanAddress(record.contract)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Polygonscan
                      </a>
                    </div>
                  </div>

                  <div className="label">TokenID</div>
                  <div className="valueRight">{record.tokenId}</div>

                  <div className="label">Memo</div>
                  <div className="valueRight">
                    <div className="memoText">{record.memo || "—"}</div>
                  </div>

                  {(claimableAt != null || isVoided) && (
                    <>
                      {claimableAt != null && (
                        <>
                          <div className="label">Post-dated until</div>
                          <div className="valueRight">{formatUtc(claimableAt)}</div>

                          <div className="label">Claim countdown</div>
                          <div className="valueRight">
                            {claimableAtMs != null
                              ? nowMs >= claimableAtMs
                                ? "Claimable now"
                                : `Claimable in ${countdown}`
                              : "—"}
                          </div>

                          <div className="label">Status</div>
                          <div className="valueRight">{claimStatusText || "—"}</div>
                        </>
                      )}

                      {claimableAt == null && isVoided && (
                        <>
                          <div className="label">Status</div>
                          <div className="valueRight">{claimStatusText}</div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="panel">
                <h2 className="h2">Links</h2>

                <ul className="ul">
                  <HashItem label="Mint" hash={normalizedMint} copiedKey={copiedKey} onCopy={copyToClipboard} />
                  <HashItem label="Transfer" hash={normalizedTransfer} copiedKey={copiedKey} onCopy={copyToClipboard} />
                  <HashItem label="Redeem" hash={normalizedRedeem} copiedKey={copiedKey} onCopy={copyToClipboard} />
                  {normalizedVoid && (
                    <HashItem label="Void" hash={normalizedVoid} copiedKey={copiedKey} onCopy={copyToClipboard} />
                  )}
                </ul>
              </div>

              <div className="footer">
                <div className="muted">Powered by Checks</div>
                <div className="muted">Tip: This is an early explorer view. Full experience coming soon.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{baseStyles}</style>
    </>
  );
}

function HashItem({
  label,
  hash,
  copiedKey,
  onCopy,
}: {
  label: string;
  hash: string | null;
  copiedKey: string | null;
  onCopy: (textToCopy: string, key: string) => void;
}) {
  const key = `tx:${label.toLowerCase()}`;
  const scanUrl = hash ? polygonscanTx(hash) : null;

  return (
    <li className="li">
      <div className="label">{label}</div>

      {hash ? (
        <>
          <a className="hashLink monoNoWrap" href={scanUrl!} target="_blank" rel="noreferrer">
            {hash}
          </a>
          <div className="btnRow">
            <button
              className={`pillBtn ${copiedKey === key ? "copied" : ""}`}
              onClick={() => onCopy(hash, key)}
              type="button"
            >
              {copiedKey === key ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      ) : (
        <div className="hashLine monoNoWrap">Not available</div>
      )}
    </li>
  );
}

const baseStyles = `
  :global(html, body) {
    padding: 0;
    margin: 0;
  }

  .page {
    font-family: "Kanit", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
      "Apple Color Emoji", "Segoe UI Emoji";
    background: #ffffff;
    color: #0f172a;
  }

  .container {
    max-width: 1040px;
    padding: 28px 18px 40px;
    margin: 0 auto;
  }

  .topBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 12px;
  }

  .backLink {
    color: #4f46e5;
    text-decoration: none;
    font-weight: 700;
  }
  .backLink:hover {
    text-decoration: underline;
  }

  .title {
    font-size: 48px;
    line-height: 1.02;
    margin: 10px 0 14px 0;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .chips {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }

  .chip {
    border: 1px solid #e5e7eb;
    background: #ffffff;
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
  }

  .dot {
    color: #94a3b8;
  }

  .chipStatus {
    border: 1px solid #e5e7eb;
    background: #ffffff;
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    gap: 10px;
    align-items: center;
  }

  .chipLabel {
    color: #0f172a;
    font-weight: 600;
  }

  .chipValue {
    font-weight: 600;
  }

  .chipGreen {
    color: #16a34a;
    font-weight: 800;
  }

  .chipRed {
    color: #dc2626;
    font-weight: 800;
  }

  .grid {
    display: grid;
    grid-template-columns: 1.12fr 1fr;
    gap: 22px;
    align-items: start;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .panel {
    border: 1px solid #e5e7eb;
    border-radius: 18px;
    padding: 18px;
    background: #ffffff;
  }

  .h2 {
    font-size: 28px;
    margin: 0 0 14px 0;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .label {
    color: #64748b;
    font-weight: 700;
    margin-bottom: 6px;
    font-size: 13px;
  }

  .detailGrid {
    display: grid;
    grid-template-columns: 160px 1fr;
    row-gap: 18px;
    column-gap: 16px;
    align-items: start;
  }

  .detailGrid .label {
    margin-bottom: 0;
  }

  .valueRight {
    color: #0f172a;
    font-weight: 600;
  }

  .memoText {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.35;
  }

  .cardWrap {
    position: relative;
    width: 100%;
    min-height: 260px;
  }

  .cardImg {
    width: 100%;
    border-radius: 16px;
    display: block;
    user-select: none;
  }

  /* LOCKED QR overlay — do not edit (see docs/qr-overlay-reference.md) */
  .qrOuter {
    position: absolute;
    right: 18px;  /* +10px (moves overlay left) */
    top: 140px;   /* tuned */
    width: 106px;
    height: 106px;
    background: #ffffff;
    border-radius: 7px;
    border: 1px solid rgba(15, 23, 42, 0.06);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .qrImg {
    width: 95px;
    height: 95px;
    border-radius: 0px;
    display: block;
  }

  .imgFail {
    border: 1px dashed #e5e7eb;
    border-radius: 14px;
    padding: 14px;
    background: #fafafa;
  }

  .btnRow {
    margin-top: 12px;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .detailsBtnRow {
    margin-bottom: 8px;
  }

  .pillBtn,
  .pillBtnLink {
    border: 1px solid #e5e7eb;
    background: #ffffff;
    color: #0f172a;
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    text-decoration: none;
    cursor: pointer;
    font-family: inherit;
  }

  .pillBtn:hover,
  .pillBtnLink:hover {
    background: #f8fafc;
  }

  .pillBtnLink {
    display: inline-flex;
    align-items: center;
  }

  .copied {
    border-color: rgba(34, 197, 94, 0.55) !important;
    background: rgba(34, 197, 94, 0.12) !important;
  }

  .ul {
    margin: 0;
    padding-left: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .li {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .contractBox {
    border: none;
    border-radius: 0;
    padding: 2px 0;
    background: transparent;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    display: block;
  }

  .hashLine,
  .hashLink {
    border: none;
    border-radius: 0;
    padding: 0;
    background: transparent;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    display: block;
  }

  .hashLink {
    text-decoration: none;
    color: #4f46e5;
  }

  .hashLink:hover {
    text-decoration: underline;
  }

  .monoNoWrap {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
      monospace;
    white-space: nowrap;
    font-size: 13px;
  }

  .muted {
    color: #64748b;
    font-size: 13px;
  }

  .footer {
    margin-top: 34px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  @media (max-width: 1040px) {
    .grid {
      grid-template-columns: 1fr;
      gap: 18px;
    }
    .title {
      font-size: 44px;
    }
  }

  /* QR shrinks ONLY on true mobile */
  @media (max-width: 520px) {
    .title {
      font-size: 42px;
    }
    .detailGrid {
      grid-template-columns: 1fr;
    }
    .valueRight {
      font-weight: 600;
    }

    .qrOuter {
      right: 16px;
      top: 132px;
      width: 102px;
      height: 102px;
      border-radius: 7px;
    }

    .qrImg {
      width: 86px;
      height: 86px;
      border-radius: 0px;
    }
  }
`;
