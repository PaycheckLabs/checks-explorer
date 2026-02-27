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
  mintTx?: string;
  transferTx?: string;
  redeemTx?: string;
  voidTx?: string;
  claimableAt?: number;
};

type PageProps = {
  serial: string;
  record: SerialRecord | null;
  origin: string;
};

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const raw = String(ctx.params?.serial || "");
  const normalized = normalizeSerial(raw);

  if (raw !== normalized) {
    return {
      redirect: { destination: `/testnet/${normalized}`, permanent: false },
    };
  }

  if (!isValidSerialFormat(normalized)) return { notFound: true };

  const record = (serials as Record<string, SerialRecord | undefined>)[normalized] || null;

  const proto = (ctx.req.headers["x-forwarded-proto"] as string) || "https";
  const host = ctx.req.headers.host || "explorer.checks.xyz";
  const origin = `${proto}://${host}`;

  return { props: { serial: normalized, record, origin } };
};

function polyscanTx(tx: string) {
  return `https://amoy.polygonscan.com/tx/${tx}`;
}

function polyscanAddress(addr: string) {
  return `https://amoy.polygonscan.com/address/${addr}`;
}

function normalizeTxHash(input?: string) {
  if (!input) return "";
  const trimmed = input.trim();

  // If it’s 64 hex chars without 0x, add it.
  if (!trimmed.startsWith("0x") && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return `0x${trimmed}`;
  }

  return trimmed;
}

function isTxHash(input?: string) {
  if (!input) return false;
  const tx = normalizeTxHash(input);
  return /^0x[0-9a-fA-F]{64}$/.test(tx);
}

export default function SerialPage({ serial, record, origin }: PageProps) {
  const [copyState, setCopyState] = useState<Record<string, string>>({});

  // Prefer API-rendered image (works even when baked PNGs don’t exist).
  const apiCardPath = `/api/checks/image/${serial}?v=final`;
  const bakedCardPath = `/checks/testnet/${serial}.png?v=final`;

  const [cardSrc, setCardSrc] = useState(apiCardPath);

  // If serial changes, reset to API path.
  useEffect(() => {
    setCardSrc(apiCardPath);
  }, [apiCardPath]);

  const openImageHref = `${origin}${apiCardPath}`;

  const tx = useMemo(() => {
    if (!record) return null;
    return {
      mint: normalizeTxHash(record.mintTx),
      transfer: normalizeTxHash(record.transferTx),
      redeem: normalizeTxHash(record.redeemTx),
      void: normalizeTxHash(record.voidTx),
    };
  }, [record]);

  async function copyWithFeedback(key: string, value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyState((s) => ({ ...s, [key]: "Copied" }));
      window.setTimeout(() => setCopyState((s) => ({ ...s, [key]: "" })), 900);
    } catch {
      setCopyState((s) => ({ ...s, [key]: "Failed" }));
      window.setTimeout(() => setCopyState((s) => ({ ...s, [key]: "" })), 900);
    }
  }

  function labelFor(key: string, fallback: string) {
    return copyState[key] || fallback;
  }

  if (!record) {
    return (
      <>
        <Head>
          <title>Checks Explorer — {serial}</title>
        </Head>
        <main className="wrap">
          <div className="topRow">
            <Link className="back" href="/">
              ← Checks Explorer
            </Link>
          </div>

          <h1 className="h1">{serial}</h1>
          <p className="muted">Serial not found in curated list.</p>
        </main>
      </>
    );
  }

  const status = record.voidTx ? "Voided" : record.redeemTx ? "Redeemed" : "Active";

  // For consistent UI:
  // - Normal checks: show Mint / Transfer / Redeem (Redeem may be Not available if not redeemed yet)
  // - Voided checks: show Mint / Transfer / Void
  const showVoid = Boolean(record.voidTx);
  const showRedeem = !showVoid;

  return (
    <>
      <Head>
        <title>Checks Explorer — {serial}</title>
      </Head>

      <main className="wrap">
        <div className="topRow">
          <Link className="back" href="/">
            ← Checks Explorer
          </Link>

          <button
            className="copyPage"
            type="button"
            onClick={() => copyWithFeedback("page", `${origin}/testnet/${serial}`)}
          >
            {labelFor("page", "Copy page link")}
          </button>
        </div>

        <h1 className="h1">{serial}</h1>

        <div className="chipsRow">
          <div className="chip">Testnet</div>
          <div className="chip">Polygon Amoy (80002)</div>
          <div className={`chip status ${status.toLowerCase()}`}>Status {status}</div>
        </div>

        <div className="grid">
          <section className="left">
            <div className="subLabel">Check card {serial}</div>

            <div className="cardWrap">
              <img
                className="cardImg"
                src={cardSrc}
                alt={`Check card ${serial}`}
                onError={() => {
                  // Fallback to baked PNG if the API route fails for any reason.
                  if (cardSrc !== bakedCardPath) setCardSrc(bakedCardPath);
                }}
              />
            </div>

            <div className="actions">
              <a className="actionLink" href={openImageHref} target="_blank" rel="noreferrer">
                Open image
              </a>
              <span className="dot">·</span>
              <a className="actionLink" href={`${origin}/testnet/${serial}`} target="_blank" rel="noreferrer">
                Open page
              </a>
            </div>
          </section>

          <section className="right">
            <h2 className="h2">Details</h2>

            <div className="detailRow">
              <div className="k">Network</div>
              <div className="v">{record.network} (chainId {record.chainId})</div>
            </div>

            <div className="detailRow">
              <div className="k">Contract</div>
              <div className="v">
                <div className="inline">
                  <span className="mono">{record.contract}</span>
                  <button className="copyBtn" onClick={() => copyWithFeedback("contract", record.contract)} type="button">
                    {labelFor("contract", "Copy")}
                  </button>
                  <a className="btn" href={polyscanAddress(record.contract)} target="_blank" rel="noreferrer">
                    Open in Polygonscan
                  </a>
                </div>
              </div>
            </div>

            <div className="detailRow">
              <div className="k">TokenID</div>
              <div className="v">{record.tokenId}</div>
            </div>

            <div className="divider" />

            <h2 className="h2">Links</h2>

            <ul className="linksList">
              <li className="li">
                <div className="label">Mint</div>
                <div className="inline">
                  {tx?.mint ? (
                    isTxHash(tx.mint) ? (
                      <a className="monoLink" href={polyscanTx(tx.mint)} target="_blank" rel="noreferrer">
                        {tx.mint}
                      </a>
                    ) : (
                      <span className="mono invalid">{tx.mint}</span>
                    )
                  ) : (
                    <span className="muted">Not available</span>
                  )}
                  <button className="copyBtn" onClick={() => copyWithFeedback("mint", tx?.mint || "")} type="button">
                    {labelFor("mint", "Copy")}
                  </button>
                </div>
              </li>

              <li className="li">
                <div className="label">Transfer</div>
                <div className="inline">
                  {tx?.transfer ? (
                    isTxHash(tx.transfer) ? (
                      <a className="monoLink" href={polyscanTx(tx.transfer)} target="_blank" rel="noreferrer">
                        {tx.transfer}
                      </a>
                    ) : (
                      <span className="mono invalid">{tx.transfer}</span>
                    )
                  ) : (
                    <span className="muted">Not available</span>
                  )}
                  <button className="copyBtn" onClick={() => copyWithFeedback("transfer", tx?.transfer || "")} type="button">
                    {labelFor("transfer", "Copy")}
                  </button>
                </div>
              </li>

              {showRedeem ? (
                <li className="li">
                  <div className="label">Redeem</div>
                  <div className="inline">
                    {tx?.redeem ? (
                      isTxHash(tx.redeem) ? (
                        <a className="monoLink" href={polyscanTx(tx.redeem)} target="_blank" rel="noreferrer">
                          {tx.redeem}
                        </a>
                      ) : (
                        <span className="mono invalid">{tx.redeem}</span>
                      )
                    ) : (
                      <span className="muted">Not available</span>
                    )}
                    <button className="copyBtn" onClick={() => copyWithFeedback("redeem", tx?.redeem || "")} type="button">
                      {labelFor("redeem", "Copy")}
                    </button>
                  </div>
                </li>
              ) : (
                <li className="li">
                  <div className="label">Void</div>
                  <div className="inline">
                    {tx?.void ? (
                      isTxHash(tx.void) ? (
                        <a className="monoLink" href={polyscanTx(tx.void)} target="_blank" rel="noreferrer">
                          {tx.void}
                        </a>
                      ) : (
                        <span className="mono invalid">{tx.void}</span>
                      )
                    ) : (
                      <span className="muted">Not available</span>
                    )}
                    <button className="copyBtn" onClick={() => copyWithFeedback("void", tx?.void || "")} type="button">
                      {labelFor("void", "Copy")}
                    </button>
                  </div>
                </li>
              )}
            </ul>
          </section>
        </div>

        <div className="footerNote">Tip: This is an early explorer view. Full experience coming soon.</div>

        <style jsx>{`
          .wrap {
            max-width: 1100px;
            margin: 0 auto;
            padding: 24px 18px 40px;
          }
          .topRow {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .back {
            color: #4f46e5;
            font-weight: 700;
            text-decoration: none;
          }
          .copyPage {
            border: 1px solid #e5e7eb;
            background: #fff;
            border-radius: 999px;
            padding: 8px 12px;
            font-weight: 700;
            cursor: pointer;
          }
          .h1 {
            margin: 14px 0 10px;
            font-size: 48px;
            letter-spacing: -0.02em;
          }
          .chipsRow {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 18px;
          }
          .chip {
            border: 1px solid #e5e7eb;
            border-radius: 999px;
            padding: 8px 12px;
            font-weight: 700;
            background: #fff;
          }
          .status.redeemed {
            background: #dcfce7;
            border-color: #86efac;
          }
          .status.voided {
            background: #fee2e2;
            border-color: #fca5a5;
          }
          .grid {
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            gap: 28px;
            align-items: start;
          }
          @media (max-width: 900px) {
            .grid {
              grid-template-columns: 1fr;
            }
            .h1 {
              font-size: 56px;
            }
          }
          .subLabel {
            color: #6b7280;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .cardWrap {
            width: 100%;
            max-width: 680px;
          }
          .cardImg {
            width: 100%;
            height: auto;
            display: block;
            border-radius: 14px;
          }
          .actions {
            margin-top: 10px;
            display: flex;
            gap: 10px;
            align-items: center;
          }
          .actionLink {
            color: #4f46e5;
            font-weight: 700;
          }
          .dot {
            color: #9ca3af;
          }
          .h2 {
            font-size: 28px;
            margin: 0 0 10px;
            letter-spacing: -0.01em;
          }
          .detailRow {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 12px;
            padding: 10px 0;
          }
          .k {
            color: #6b7280;
            font-weight: 700;
          }
          .v {
            font-weight: 700;
          }
          .inline {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
          }
          .mono {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-weight: 800;
          }
          .monoLink {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-weight: 900;
            color: #4f46e5;
            text-decoration: none;
          }
          .invalid {
            color: #dc2626;
          }
          .btn {
            border: 1px solid #c7d2fe;
            background: #eef2ff;
            color: #3730a3;
            border-radius: 999px;
            padding: 8px 12px;
            font-weight: 900;
            text-decoration: none;
          }
          .copyBtn {
            border: 1px solid #e5e7eb;
            background: #fff;
            border-radius: 999px;
            padding: 6px 10px;
            font-weight: 900;
            cursor: pointer;
          }
          .divider {
            height: 1px;
            background: #e5e7eb;
            margin: 16px 0;
          }
          .linksList {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          .li {
            padding: 12px 0;
            border-bottom: 1px solid #f3f4f6;
          }
          .label {
            color: #6b7280;
            font-weight: 900;
            margin-bottom: 6px;
          }
          .muted {
            color: #6b7280;
            font-weight: 800;
          }
          .footerNote {
            margin-top: 18px;
            color: #6b7280;
            font-weight: 700;
            font-size: 13px;
          }
        `}</style>
      </main>
    </>
  );
}
