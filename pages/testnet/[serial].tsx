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

export default function TestnetSerialPage({ serial, record, origin }: PageProps) {
  // bump this anytime you want to force-refresh the image endpoint everywhere
  const IMAGE_VERSION = "final-qr";

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

          <div className="pill">
            <strong>Testnet</strong> • Polygon Amoy (80002)
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
                  <a href={polyscanAddr(record.contract)} target="_blank" rel="noreferrer">
                    {record.contract}
                  </a>
                </div>

                <div className="row">
                  <div className="label">TokenId</div>
                  <div>{record.tokenId}</div>
                </div>

                {record.claimableAt ? (
                  <div className="row">
                    <div className="label">claimableAt</div>
                    <div>{record.claimableAt}</div>
                  </div>
                ) : null}

                <h3 className="h3">On-chain links</h3>
                <ul className="ul">
                  {record.mintTx ? (
                    <li>
                      Mint:{" "}
                      <a href={polyscanTx(record.mintTx) || "#"} target="_blank" rel="noreferrer">
                        {record.mintTx}
                      </a>
                    </li>
                  ) : null}
                  {record.transferTx ? (
                    <li>
                      Transfer:{" "}
                      <a
                        href={polyscanTx(record.transferTx) || "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {record.transferTx}
                      </a>
                    </li>
                  ) : null}
                  {record.redeemTx ? (
                    <li>
                      Redeem:{" "}
                      <a
                        href={polyscanTx(record.redeemTx) || "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {record.redeemTx}
                      </a>
                    </li>
                  ) : null}
                  {record.voidTx ? (
                    <li>
                      Void:{" "}
                      <a href={polyscanTx(record.voidTx) || "#"} target="_blank" rel="noreferrer">
                        {record.voidTx}
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
          max-width: 1040px;
          margin: 40px auto;
          padding: 0 16px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          color: #111827;
        }
        .top {
          margin-bottom: 18px;
        }
        .back {
          color: #4f46e5;
          text-decoration: none;
        }
        .serial {
          font-size: 52px;
          line-height: 1.05;
          margin: 10px 0 10px;
          font-weight: 800;
        }
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
        .grid {
          display: grid;
          grid-template-columns: 520px 1fr;
          gap: 28px;
          align-items: start;
        }
        .card {
          width: 100%;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
          display: block;
        }
        .links {
          margin-top: 10px;
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
        .tip {
          margin-top: 34px;
          font-size: 14px;
          color: #64748b;
          text-align: left;
        }
        .muted {
          color: #64748b;
        }

        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
