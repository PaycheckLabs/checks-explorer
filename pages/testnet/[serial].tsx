import { GetServerSideProps } from "next";
import Link from "next/link";
import serials from "../../data/testnet-serials.json";

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

function isValidSerialFormat(s: string) {
  // LLL-NNNNLL-LLNN, using uppercase letters and digits (hyphens included)
  return /^[A-Z]{3}-[0-9]{4}[A-Z]{2}-[A-Z]{2}[0-9]{2}$/.test(s);
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const raw = String(ctx.params?.serial || "");
  const normalized = raw.trim().toUpperCase();

  // Canonical redirect to uppercase
  if (raw !== normalized) {
    return {
      redirect: {
        destination: `/testnet/${normalized}`,
        permanent: false
      }
    };
  }

  if (!isValidSerialFormat(normalized)) {
    return { notFound: true };
  }

  const record = (serials as Record<string, SerialRecord>)[normalized] || null;

  return {
    props: {
      serial: normalized,
      record
    }
  };
};

export default function TestnetSerialPage({
  serial,
  record
}: {
  serial: string;
  record: SerialRecord | null;
}) {
  const polyscanTx = (tx?: string) => (tx ? `https://amoy.polygonscan.com/tx/${tx}` : null);
  const polyscanAddr = (addr: string) => `https://amoy.polygonscan.com/address/${addr}`;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, lineHeight: 1.4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Link href="/" style={{ opacity: 0.8, textDecoration: "none" }}>← Checks Explorer</Link>
          <h1 style={{ margin: "10px 0 0 0" }}>{serial}</h1>
          <div style={{ marginTop: 6, display: "inline-block", padding: "4px 10px", borderRadius: 999, background: "#222", color: "#fff", fontSize: 12 }}>
            Testnet
          </div>
        </div>
      </div>

      {!record ? (
        <div style={{ marginTop: 18, padding: 16, border: "1px solid #333", borderRadius: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Serial not found</h2>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            This testnet serial is not in the current mapping file yet.
          </p>
          <p style={{ marginTop: 8 }}>
            If you just minted it, add it to <code>data/testnet-serials.json</code>.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr", gap: 14, maxWidth: 900 }}>
          <div style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Details</h2>
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "180px 1fr", rowGap: 8, columnGap: 12 }}>
              <div style={{ opacity: 0.7 }}>Network</div><div>{record.network} (chainId {record.chainId})</div>
              <div style={{ opacity: 0.7 }}>Contract</div>
              <div><a href={polyscanAddr(record.contract)} target="_blank" rel="noreferrer">{record.contract}</a></div>
              <div style={{ opacity: 0.7 }}>TokenId</div><div>{record.tokenId}</div>
              {record.claimableAt ? (
                <>
                  <div style={{ opacity: 0.7 }}>claimableAt</div><div>{record.claimableAt}</div>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>On-chain links</h2>
            <ul style={{ marginTop: 10 }}>
              {record.mintTx ? <li>Mint: <a href={polyscanTx(record.mintTx)!} target="_blank" rel="noreferrer">{record.mintTx}</a></li> : null}
              {record.transferTx ? <li>Transfer: <a href={polyscanTx(record.transferTx)!} target="_blank" rel="noreferrer">{record.transferTx}</a></li> : null}
              {record.redeemTx ? <li>Redeem: <a href={polyscanTx(record.redeemTx)!} target="_blank" rel="noreferrer">{record.redeemTx}</a></li> : null}
              {record.voidTx ? <li>Void: <a href={polyscanTx(record.voidTx)!} target="_blank" rel="noreferrer">{record.voidTx}</a></li> : null}
            </ul>
          </div>

          <div style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Next</h2>
            <p style={{ marginTop: 8, opacity: 0.8 }}>
              Next upgrade is to render the NFT check image and QR that points to this page:
              <br />
              <code>https://explorer.checks.xyz/testnet/{serial}</code>
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
