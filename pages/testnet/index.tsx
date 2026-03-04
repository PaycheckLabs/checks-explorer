import Head from "next/head";
import Link from "next/link";
import { useMemo } from "react";
import { formatUnits } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain
} from "wagmi";
import { AMOY_CHAIN_ID } from "../../lib/testnetContracts";

function shortAddr(a?: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function TestnetHome() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const polBal = useBalance({
    address,
    chainId: AMOY_CHAIN_ID
  });

  const wrongNetwork = isConnected && chainId !== AMOY_CHAIN_ID;

  const polText = useMemo(() => {
    const d = polBal.data;
    if (!d) return "—";

    const s = formatUnits(d.value, d.decimals);
    const n = Number(s);
    const pretty = Number.isFinite(n) ? n.toFixed(4) : s;

    return `${pretty} ${d.symbol}`;
  }, [polBal.data]);

  return (
    <>
      <Head>
        <title>Checks — Testnet</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="page">
        <div className="container">
          <div className="top">
            <Link href="/testnet" className="brand">
              ← Checks Explorer
            </Link>

            <div className="topRight">
              <div className="netPill">Polygon Amoy (80002)</div>

              {!isConnected ? (
                <button
                  className="btn"
                  onClick={() => connect({ connector: connectors[0] })}
                  disabled={isPending}
                >
                  {isPending ? "Connecting…" : "Connect Wallet"}
                </button>
              ) : (
                <button className="btn" onClick={() => disconnect()}>
                  Disconnect ({shortAddr(address)})
                </button>
              )}
            </div>
          </div>

          <h1 className="h1">Testnet</h1>

          <div className="sub">
            Build mode: Payment Checks + Explorer only. Currency: Mock USD (mUSD).
          </div>

          {isConnected && wrongNetwork && (
            <div className="banner">
              <div>
                <div className="bannerTitle">Wrong network</div>
                <div className="bannerBody">
                  Please switch to Polygon Amoy (chainId 80002) to use the testnet mint flow.
                </div>
              </div>

              <button
                className="btnPrimary"
                onClick={() => switchChain({ chainId: AMOY_CHAIN_ID })}
                disabled={isSwitching}
              >
                {isSwitching ? "Switching…" : "Switch to Amoy"}
              </button>
            </div>
          )}

          <div className="grid">
            <div className="panel">
              <h2 className="h2">Portfolio</h2>
              <div className="muted">
                This is the starting point for the MVP flow. Users connect wallet → land here →
                mint checks.
              </div>

              <div className="row">
                <div className="kv">
                  <div className="k">Wallet</div>
                  <div className={`v ${!isConnected ? "muted" : ""}`}>
                    {isConnected ? shortAddr(address) : "Not connected"}
                  </div>
                </div>

                <div className="kv">
                  <div className="k">Network</div>
                  <div className="v">{isConnected ? (wrongNetwork ? "Unsupported" : "Supported") : "—"}</div>
                </div>

                <div className="kv">
                  <div className="k">POL balance</div>
                  <div className="v">{isConnected ? polText : "—"}</div>
                </div>
              </div>

              <div className="actions">
                <Link
                  href="/testnet/payment/mint"
                  className={`btnPrimary ${!isConnected || wrongNetwork ? "disabled" : ""}`}
                  aria-disabled={!isConnected || wrongNetwork}
                  onClick={(e) => {
                    if (!isConnected || wrongNetwork) e.preventDefault();
                  }}
                >
                  Mint Check
                </Link>

                <a
                  className="btn"
                  href="https://faucet.polygon.technology/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get test POL
                </a>
              </div>

              <div className="note muted">
                Next: Add an mUSD faucet button here (after wallet connect), then wire approve + mint.
              </div>
            </div>

            <div className="panel">
              <h2 className="h2">Explorer</h2>
              <div className="muted">
                Explore checks by serial (curated list + on-chain fallback).
              </div>

              <div className="linkList">
                <Link className="link" href="/testnet/FMV-8427BC-UK45">
                  View showcase check (FMV)
                </Link>
                <Link className="link" href="/testnet/PCH-0001AA-AM01">
                  View minted check (PCH-0001AA-AM01)
                </Link>
              </div>

              <div className="note muted">
                Note: On-chain serial lookup is working. Image rendering can come later.
              </div>
            </div>
          </div>

          <footer className="footer">
            <div className="muted">Powered by Checks</div>
            <div className="muted">Tip: This is an early explorer/mint flow. Full MVP wiring in progress.</div>
          </footer>
        </div>
      </div>

      <style jsx>{styles}</style>
    </>
  );
}

const styles = `
.page{
  font-family:Kanit,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
  background:#fff;
  color:#0f172a;
  min-height:100vh;
}
.container{
  max-width:1040px;
  margin:0 auto;
  padding:28px 18px 40px;
}
.top{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  flex-wrap:wrap;
  margin-bottom:10px;
}
.topRight{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
.brand{
  color:#4f46e5;
  text-decoration:none;
  font-weight:800;
}
.brand:hover{text-decoration:underline;}
.netPill{
  border:1px solid #e5e7eb;
  border-radius:999px;
  padding:8px 12px;
  font-size:13px;
  font-weight:700;
  color:#0f172a;
}
.h1{
  font-size:52px;
  line-height:1.02;
  margin:6px 0 10px;
  font-weight:900;
  letter-spacing:-0.02em;
}
.sub{
  color:#64748b;
  font-size:14px;
  margin-bottom:16px;
}
.banner{
  border:1px solid rgba(239,68,68,.25);
  background:rgba(239,68,68,.05);
  border-radius:16px;
  padding:14px 14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
  margin:14px 0 18px;
}
.bannerTitle{font-weight:900;margin-bottom:2px;}
.bannerBody{color:#64748b;font-size:13px;}
.grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:22px;
  align-items:start;
}
.panel{
  border:1px solid #e5e7eb;
  border-radius:18px;
  padding:18px;
  background:#fff;
}
.h2{
  font-size:28px;
  margin:0 0 12px;
  font-weight:900;
  letter-spacing:-0.01em;
}
.row{
  display:grid;
  grid-template-columns:1fr;
  gap:10px;
  margin-top:14px;
}
.kv{
  display:flex;
  justify-content:space-between;
  gap:12px;
  border:1px solid #f1f5f9;
  background:#fafafa;
  padding:10px 12px;
  border-radius:14px;
}
.k{color:#64748b;font-size:12px;font-weight:900;}
.v{font-size:12px;font-weight:900;}
.actions{
  margin-top:14px;
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}
.btn, .btnPrimary{
  border-radius:999px;
  padding:10px 14px;
  font-size:14px;
  font-weight:900;
  cursor:pointer;
  text-decoration:none;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.btn{
  border:1px solid #e5e7eb;
  background:#fff;
  color:#0f172a;
}
.btn:hover{background:#f8fafc;}
.btnPrimary{
  border:1px solid #4f46e5;
  background:#4f46e5;
  color:#fff;
}
.btnPrimary:hover{opacity:.92;}
.disabled{
  opacity:.45;
  pointer-events:none;
}
.note{margin-top:14px;}
.linkList{margin-top:12px;display:flex;flex-direction:column;gap:10px;}
.link{color:#4f46e5;text-decoration:none;font-weight:900;}
.link:hover{text-decoration:underline;}
.muted{color:#64748b;font-size:13px;}
.footer{
  margin-top:34px;
  display:flex;
  justify-content:space-between;
  gap:16px;
  flex-wrap:wrap;
}
@media (max-width:1040px){
  .grid{grid-template-columns:1fr;gap:18px;}
  .h1{font-size:44px;}
}
`;
