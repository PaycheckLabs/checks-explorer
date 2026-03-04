import Head from "next/head";
import Link from "next/link";

export default function TestnetPortfolio() {
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
            <div className="netPill">
              Testnet • Polygon Amoy (80002)
            </div>
          </header>

          <h1 className="h1">Portfolio</h1>
          <p className="sub">
            This is the Payment Checks testnet app. Vesting and Staking are coming later.
          </p>

          <div className="panel">
            <div className="row">
              <div>
                <div className="label">Payment Checks</div>
                <div className="muted">Mint and manage payment checks backed by Mock USD (mUSD).</div>
              </div>
              <Link href="/testnet/payment/mint" className="btnPrimary">
                Mint Check
              </Link>
            </div>
          </div>

          <div className="panel">
            <div className="label">Connected Wallet</div>
            <div className="muted">
              Wallet connect will be added next. For now, we’re locking UI flow and wiring on-chain reads.
            </div>
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
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.brand{color:#4f46e5;text-decoration:none;font-weight:800;}
.brand:hover{text-decoration:underline;}
.netPill{border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700;color:#0f172a;}
.h1{font-size:52px;line-height:1.02;margin:10px 0 10px;font-weight:900;letter-spacing:-0.02em;}
.sub{color:#64748b;margin:0 0 18px;font-size:14px;}
.panel{border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff;margin-bottom:16px;}
.row{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;}
.label{font-size:14px;font-weight:900;margin-bottom:6px;color:#0f172a;}
.muted{color:#64748b;font-size:13px;}
.btnPrimary{
  display:inline-flex;align-items:center;justify-content:center;
  border:1px solid #4f46e5;background:#4f46e5;color:#fff;
  border-radius:999px;padding:10px 14px;font-size:14px;font-weight:800;text-decoration:none;
}
.btnPrimary:hover{opacity:.92;}
.footer{margin-top:34px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;}
@media (max-width:520px){.h1{font-size:44px;}}
`;
