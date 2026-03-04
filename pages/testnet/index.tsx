import Head from "next/head";
import Link from "next/link";
import { useMemo } from "react";
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

export default function TestnetPortfolio() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: isConnecting, error: connectError } =
    useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const supported = isConnected && chainId === AMOY_CHAIN_ID;

  const polBal = useBalance({
    address,
    chainId: AMOY_CHAIN_ID,
    query: { enabled: Boolean(address) }
  });

  const polText = useMemo(() => {
    if (!polBal.data) return "—";
    return `${Number(polBal.data.formatted).toFixed(4)} ${polBal.data.symbol}`;
  }, [polBal.data]);

  return (
    <>
      <Head>
        <title>Portfolio — Checks Mint (Testnet)</title>
      </Head>

      <div className="page">
        <div className="container">
          <header className="top">
            <Link href="https://explorer.checks.xyz" className="brand">
              ← Checks Explorer
            </Link>

            <div className="topRight">
              {!isConnected ? (
                <button
                  className="btnPrimary"
                  type="button"
                  disabled={isConnecting || connectors.length === 0}
                  onClick={() => connect({ connector: connectors[0] })}
                >
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              ) : (
                <div className="walletBox">
                  <div className="walletLine">
                    <span className="muted">Wallet</span>
                    <span className="mono">{shortAddr(address)}</span>
                  </div>

                  <div className="walletLine">
                    <span className="muted">Network</span>
                    <span className={supported ? "good" : "bad"}>
                      {chainId === AMOY_CHAIN_ID
                        ? "Polygon Amoy ✅"
                        : `Unsupported ❌ (chainId ${chainId})`}
                    </span>
                  </div>

                  <div className="btnRow">
                    {!supported ? (
                      <button
                        className="btnGhost"
                        type="button"
                        disabled={isSwitching}
                        onClick={() => switchChain({ chainId: AMOY_CHAIN_ID })}
                      >
                        {isSwitching ? "Switching…" : "Switch to Amoy"}
                      </button>
                    ) : null}

                    <button className="btnGhost" type="button" onClick={() => disconnect()}>
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          </header>

          {connectError ? (
            <div className="warn">{connectError.message}</div>
          ) : null}

          <h1 className="h1">Portfolio</h1>
          <p className="sub">
            Testnet app • Payment Checks only • Mock USD (mUSD) collateral • Polygon Amoy (80002)
          </p>

          <div className="panel">
            <div className="row">
              <div>
                <div className="label">Gas balance</div>
                <div className="muted">
                  You need test POL to use the app. Balance on Amoy: <b>{polText}</b>
                </div>
                <div className="muted">
                  Get test POL from an Amoy faucet before minting.
                </div>
              </div>
              <a
                className="btnGhostLink"
                href="https://faucet.polygon.technology/"
                target="_blank"
                rel="noreferrer"
              >
                Get test POL
              </a>
            </div>
          </div>

          <div className="panel">
            <div className="row">
              <div>
                <div className="label">Payment Checks</div>
                <div className="muted">
                  Mint and manage payment checks backed by mUSD.
                </div>
              </div>

              <button
                className="btnPrimary"
                type="button"
                disabled={!supported}
                onClick={() => {
                  if (!supported) return;
                  window.location.href = "/testnet/payment/mint";
                }}
              >
                Mint Check
              </button>
            </div>

            {!isConnected ? (
              <div className="hint">Connect your wallet to continue.</div>
            ) : !supported ? (
              <div className="hint">Switch to Polygon Amoy (80002) to mint.</div>
            ) : null}
          </div>

          <footer className="footer">
            <div className="muted">Powered by Checks</div>
            <div className="muted">Tip: This is an early app build. MVP wiring in progress.</div>
          </footer>
        </div>
      </div>

      <style jsx>{styles}</style>
    </>
  );
}

const styles = `
.page{
  font-family: Kanit, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  background:#fff; color:#0f172a; min-height:100vh;
}
.container{max-width:1040px;margin:0 auto;padding:28px 18px 40px;}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:14px;}
.brand{color:#4f46e5;text-decoration:none;font-weight:900;}
.brand:hover{text-decoration:underline;}
.topRight{min-width:280px;display:flex;justify-content:flex-end;}
.h1{font-size:52px;line-height:1.02;margin:10px 0 10px;font-weight:900;letter-spacing:-0.02em;}
.sub{color:#64748b;margin:0 0 18px;font-size:14px;}
.panel{border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff;margin-bottom:16px;}
.row{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;}
.label{font-size:14px;font-weight:900;margin-bottom:6px;color:#0f172a;}
.muted{color:#64748b;font-size:13px;}
.hint{margin-top:10px;color:#64748b;font-size:13px;font-weight:700;}
.btnRow{margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;}
.btnPrimary{
  border:1px solid #4f46e5;background:#4f46e5;color:#fff;
  border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;
  cursor:pointer;
}
.btnPrimary:disabled{opacity:.45;cursor:not-allowed;}
.btnGhost, .btnGhostLink{
  border:1px solid #e5e7eb;background:#fff;color:#0f172a;
  border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;
  cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;
}
.btnGhost:hover,.btnGhostLink:hover{background:#f8fafc;}
.walletBox{border:1px solid #e5e7eb;border-radius:16px;padding:12px 12px;background:#fff;}
.walletLine{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:900;margin-bottom:6px;}
.good{color:#16a34a;}
.bad{color:#dc2626;}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}
.warn{border:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.06);padding:10px 12px;border-radius:12px;font-size:13px;font-weight:800;margin-bottom:12px;}
.footer{margin-top:34px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;}
@media (max-width:520px){.h1{font-size:44px;}}
`;
