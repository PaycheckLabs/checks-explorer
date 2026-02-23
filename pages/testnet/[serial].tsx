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
  redeemTx?: string;
  transferTx?: string;
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
  const imageUrl = `/api/checks/image/${encodeURIComponent(serial)}`;
  const pageUrl = `${origin}/testnet/${encodeURIComponent(serial)}`;
  const ogImageUrl = `${origin}/api/checks/image/${encodeURIComponent(serial)}`;

  const title = `Checks Explorer Testnet • ${serial}`;
  const description =
    "Payment Checks v1 testnet serial page. View details, on-chain links, and the matching check card image + QR.";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />

        <link rel="canonical" href={pageUrl} />

        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={ogImageUrl} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <main
        style={{
          maxWidth: 980,
          margin: "40px auto",
          padding: "0 20px",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          lineHeight: 1.4,
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          ← Checks Explorer
        </Link>

        <h1 style={{ margin: "14px 0 8px", fontSize: 40 }}>{serial}</h1>

        <div
          style={{
            display: "inline-flex",
            gap: 10,
            alignItems: "center",
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "#f8fafc",
            color: "#0f172a",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          <span>Testnet</span>
          <span style={{ color: "#64748b" }}>•</span>
          <span>Polygon Amoy (80002)</span>
        </div>

        <div
          style={{
            marginTop: 26,
            display: "flex",
            gap: 22,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <section style={{ flex: "1 1 460px", minWidth: 320 }}>
            <img
              src={imageUrl}
              alt={`NFT Check ${serial}`}
              style={{
                width: "100%",
                borderRadius: 18,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            />

            <div style={{ marginTop: 10, fontSize: 14 }}>
              <a href={imageUrl} target="_blank" rel="noreferrer">
                Open image
              </a>
              {" · "}
              <a href={pageUrl} target="_blank" rel="noreferrer">
                Open page URL
              </a>
            </div>
          </section>

          <section style={{ flex: "1 1 420px", minWidth: 320 }}>
            {!record ? (
              <>
                <h2 style={{ marginTop: 0 }}>Serial not found</h2>
                <p style={{ marginTop: 8 }}>
                  This testnet serial is not in the current mapping file yet.
                </p>
                <p style={{ marginTop: 8 }}>
                  If you just minted it, add it to{" "}
                  <code>data/testnet-serials.json</code>.
                </p>
              </>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>Details</h2>

                <div style={{ marginTop: 10 }}>
                  <div style={{ color: "#64748b", fontWeight: 700 }}>
                    Network
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {record.network} (chainId {record.chainId})
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ color: "#64748b", fontWeight: 700 }}>
                    Contract
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <a
                      href={polyscanAddr(record.contract)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {record.contract}
                    </a>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ color: "#64748b", fontWeight: 700 }}>
                    TokenId
                  </div>
                  <div style={{ marginTop: 4 }}>{record.tokenId}</div>
                </div>

                {record.claimableAt ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ color: "#64748b", fontWeight: 700 }}>
                      claimableAt
                    </div>
                    <div style={{ marginTop: 4 }}>{record.claimableAt}</div>
                  </div>
                ) : null}

                <h3 style={{ marginTop: 22 }}>On-chain links</h3>

                <ul style={{ marginTop: 10, paddingLeft: 18 }}>
                  {record.mintTx ? (
                    <li>
                      Mint:{" "}
                      <a
                        href={polyscanTx(record.mintTx) as string}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {record.mintTx}
                      </a>
                    </li>
                  ) : null}

                  {record.transferTx ? (
                    <li>
                      Transfer:{" "}
                      <a
                        href={polyscanTx(record.transferTx) as string}
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
                        href={polyscanTx(record.redeemTx) as string}
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
                      <a
                        href={polyscanTx(record.voidTx) as string}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {record.voidTx}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </>
            )}
          </section>
        </div>

        <div style={{ marginTop: 34, fontSize: 14, color: "#64748b" }}>
          Tip: keep serials uppercase. The explorer canonicalizes to uppercase on
          load.
        </div>
      </main>
    </>
  );
}
