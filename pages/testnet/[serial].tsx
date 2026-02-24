import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";

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

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const raw = String(ctx.params?.serial || "");
  const normalized = normalizeSerial(raw);

  if (raw !== normalized) {
    return {
      redirect: { destination: `/testnet/${normalized}`, permanent: false },
    };
  }

  if (!isValidSerialFormat(normalized)) {
    return { notFound: true };
  }

  const record =
    (serials as Record<string, SerialRecord | undefined>)[normalized] || null;

  const proto = (ctx.req.headers["x-forwarded-proto"] as string) || "https";
  const host = ctx.req.headers.host || "explorer.checks.xyz";
  const origin = `${proto}://${host}`;

  return { props: { serial: normalized, record, origin } };
};

function polyscanTx(tx?: string) {
  return tx ? `https://amoy.polygonscan.com/tx/${tx}` : null;
}
function polyscanAddr(addr: string) {
  return `https://amoy.polygonscan.com/address/${addr}`;
}

function shortHex(value: string, left = 10, right = 8) {
  const v = String(value || "");
  if (v.length <= left + right + 3) return v;
  return `${v.slice(0, left)}…${v.slice(-right)}`;
}

export default function TestnetSerialPage({ serial, record, origin }: PageProps) {
  // bump this anytime you want to force-refresh the image endpoint everywhere
  const IMAGE_VERSION = "final";

  const imagePath = `/api/checks/image/${encodeURIComponent(serial)}?v=${IMAGE_VERSION}`;
  const pageUrl = `${origin}/${encodeURIComponent(serial)}`;
  const ogImageUrl = `${origin}${imagePath}`;

  const title = `Checks Explorer Testnet • ${serial}`;
  const description =
    "Payment Checks v1 testnet serial page with on-chain proof links and check card image.";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />

        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImageUrl} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <div className="wrap">
        <div className="top">
          <Link href="/" className="back">
            ← Checks Explorer
          </Link>

          <h1 className="serial">{serial}</h1>

          <div className="pill" aria-label="network pill">
            <span className="pillStrong">Testnet</span>
            <span className="pillDot">•</span>
            <span className="pillStrong">Polygon Amoy (80002)</span>
          </div>
        </div>

        <div className="grid">
          <div className="left">
            <img className="card" src={imagePath} alt={`Check card ${serial}`} />

            <div className="links">
              <a href={imagePath} target="_blank" rel="noreferrer">
                Open image
              </a>
              {" · "}
              <a href={pageUrl} target="_blank" rel="noreferrer">
                Open page URL
              </a>
            </div>
          </div>

          <div className="right">
            <h2 className="h2">Details</h2>

            {!record ? (
              <div className="muted">
                Serial not found. Add it to <code>data/testnet-serials.json</code>.
              </div>
            ) : (
              <>
                <div className="row">
                  <div className="label">Network</div>
                  <div>
                    {record.network} (chainId {record.chainId})
                  </div>
                </div>

                <div className="row">
                  <div className="label">Contract</div>
                  <a
                    className="monoLink"
                    href={polyscanAddr(record.contract)}
                    target="_blank"
                    rel="noreferrer"
                    title={record.contract}
                  >
                    {shortHex(record.contract, 10, 10)}
                  </a>
                </div>

                <div className="row">
                  <div className="label">TokenId</div>
                  <div>{record.tokenId}</div>
                </div>

                {record.claimableAt ? (
                  <div className="row">
                    <div className="label">claimableAt</div>
                    <div className="mono">{record.claimableAt}</div>
                  </div>
                ) : null}

                <h3 className="h3">On-chain links</h3>
                <ul className="ul">
                  {record.mintTx ? (
                    <li>
                      <span className="liLabel">Mint:</span>{" "}
                      <a
                        className="monoLink"
                        href={polyscanTx(record.mintTx) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        title={record.mintTx}
                      >
                        {shortHex(record.mintTx, 12, 10)}
                      </a>
                    </li>
                  ) : null}

                  {record.transferTx ? (
                    <li>
                      <span className="liLabel">Transfer:</span>{" "}
                      <a
                        className="monoLink"
                        href={polyscanTx(record.transferTx) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        title={record.transferTx}
                      >
                        {shortHex(record.transferTx, 12, 10)}
                      </a>
                    </li>
                  ) : null}

                  {record.redeemTx ? (
                    <li>
                      <span className="liLabel">Redeem:</span>{" "}
                      <a
                        className="monoLink"
                        href={polyscanTx(record.redeemTx) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        title={record.redeemTx}
                      >
                        {shortHex(record.redeemTx, 12, 10)}
                      </a>
                    </li>
                  ) : null}

                  {record.voidTx ? (
                    <li>
                      <span className="liLabel">Void:</span>{" "}
                      <a
                        className="monoLink"
                        href={polyscanTx(record.voidTx) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        title={record.voidTx}
                      >
                        {shortHex(record.voidTx, 12, 10)}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className="tip">
          Tip: This is an early explorer view. Full experience coming soon.
        </div>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 1120px;
          margin: 44px auto;
          padding: 0 18px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          color: #111827;
        }

        .top {
          margin-bottom: 22px;
        }

        .back {
          color: #4f46e5;
          text-decoration: none;
        }

        /* Serial: slightly smaller + less bold */
        .serial {
          font-size: 46px;
          line-height: 1.08;
          margin: 12px 0 12px;
          font-weight: 700;
          letter-spacing: -0.6px;
        }

        /* Pill: both segments bold */
        .pill {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          font-size: 14px;
          color: #111827;
        }

        .pillStrong {
          font-weight: 700;
        }

        .pillDot {
          color: #64748b;
        }

        /* More breathing room between image + Details */
        .grid {
          display: grid;
          grid-template-columns: 560px 1fr;
          gap: 40px;
          align-items: start;
        }

        .card {
          width: 100%;
          border-radius: 16px;
          box-shadow: 0 12px 34px rgba(0, 0, 0, 0.08);
          display: block;
        }

        .links {
          margin-top: 12px;
          font-size: 14px;
        }

        .h2 {
          font-size: 28px;
          margin: 0 0 14px 0;
        }

        .row {
          margin-bottom: 14px;
        }

        .label {
          color: #64748b;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .h3 {
          margin-top: 22px;
          margin-bottom: 10px;
          font-size: 18px;
        }

        .ul {
          margin: 0;
          padding-left: 18px;
        }

        .liLabel {
          font-weight: 700;
          color: #111827;
        }

        .tip {
          margin-top: 36px;
          font-size: 14px;
          color: #64748b;
          text-align: left;
        }

        .muted {
          color: #64748b;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        }

        .monoLink {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          word-break: break-all;
        }

        @media (max-width: 1040px) {
          .grid {
            grid-template-columns: 1fr;
            gap: 26px;
          }
        }
      `}</style>
    </>
  );
}
