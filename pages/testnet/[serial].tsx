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

  const record = (serials as Record<string, SerialRecord | undefined>)[normalized] || null;

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
  // Bump this string anytime you change QR placement.
  const IMAGE_VERSION = "qr72";

  const imageUrl = `/api/checks/image/${encodeURIComponent(serial)}?v=${IMAGE_VERSION}`;
  const pageUrl = `${origin}/${encodeURIComponent(serial)}`;
  const ogImageUrl = `${origin}${imageUrl}`;

  const title = `Checks Explorer Testnet • ${serial}`;
  const description =
    "Payment Checks v1 testnet serial page. View details, on-chain links, and the matching check card image + QR.";

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

      <div style={{ maxWidth: 980, margin: "40px auto", padding: "0 16px" }}>
        <div style={{ marginBottom: 12 }}>
          <Link href="/" style={{ color: "#4f46e5" }}>
            ← Checks Explorer
          </Link>
        </div>

        <h1 style={{ fontSize: 48, margin: "0 0 8px 0" }}>{serial}</h1>

        <div
          style={{
            display: "inline-flex",
            gap: 10,
            alignItems: "center",
            padding: "8px 12px",
            border: "1px solid #e5e7eb",
            borderRadius: 999,
            color: "#111827",
            marginBottom: 24,
            fontSize: 14,
          }}
        >
          <strong>Testnet</strong> • Polygon Amoy (80002)
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 520px" }}>
            <img
              src={imageUrl}
              alt={`Check card ${serial}`}
              style={{
                width: "100%",
                borderRadius: 16,
                boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                display: "block",
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
          </div>

          <div style={{ flex: "1 1 360px" }}>
            <h2 style={{ fontSize: 28, marginTop: 0 }}>Details</h2>

            {!record ? (
              <>
                <h3>Serial not found</h3>
                <p>This testnet serial is not in the current mapping file yet.</p>
                <p>
                  If you just minted it, add it to <code>data/testnet-serials.json</code>.
                </p>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#64748b", fontWeight: 600 }}>Network</div>
                  <div>{record.network} (chainId {record.chainId})</div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#64748b", fontWeight: 600 }}>Contract</div>
                  <a href={polyscanAddr(record.contract)} target="_blank" rel="noreferrer">
                    {record.contract}
                  </a>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: "#64748b", fontWeight: 600 }}>TokenId</div>
                  <div>{record.tokenId}</div>
                </div>

                {record.claimableAt ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: "#64748b", fontWeight: 600 }}>claimableAt</div>
                    <div>{record.claimableAt}</div>
                  </div>
                ) : null}

                <h3 style={{ marginTop: 22 }}>On-chain links</h3>
                <ul>
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

        <div style={{ marginTop: 34, fontSize: 14, color: "#64748b" }}>
          Tip: This is an early explorer view. Full experience coming soon.
        </div>
      </div>
    </>
  );
}
