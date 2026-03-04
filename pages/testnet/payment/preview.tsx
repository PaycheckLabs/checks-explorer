import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  formatUnits,
  parseUnits,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import {
  AMOY_CHAIN_ID,
  MAX_UINT256,
  MUSD_ABI,
  MUSD_ADDRESS,
  PCHK_ABI,
  PCHK_ADDRESS,
} from "../../../lib/testnetContracts";

type Draft = {
  type: "payment" | "vesting" | "staking";
  title: string;
  memo: string;
  amount: string;
  recipient: string;
  claimableAtMode: "instant" | "postdated";
  claimableAt: string; // ISO string from <input type="datetime-local">
  serial?: string;
};

const DRAFT_KEY = "checks_testnet_draft_v1";

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randChar(set: string) {
  return set[randInt(0, set.length - 1)];
}

// Format: AAA-1234BB-CC12 (no I/O to reduce confusion)
function generateSerial(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  const a = `${randChar(letters)}${randChar(letters)}${randChar(letters)}`;
  const b = `${randChar(digits)}${randChar(digits)}${randChar(digits)}${randChar(
    digits
  )}`;
  const c = `${randChar(letters)}${randChar(letters)}`;
  const d = `${randChar(letters)}${randChar(letters)}${randChar(digits)}${randChar(
    digits
  )}`;
  return `${a}-${b}${c}-${d}`;
}

function shortAddr(a?: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type Stage = "idle" | "faucet" | "approve" | "mint" | "success" | "error";

export default function PaymentPreview() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mintHash, setMintHash] = useState<`0x${string}` | null>(null);

  // wallet
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  // NOTE: This cast is intentional to keep TS strict mode + wagmi v3 happy on Vercel.
  const { writeContractAsync } = useWriteContract() as unknown as {
    writeContractAsync: (args: any) => Promise<`0x${string}`>;
  };

  const publicClient = usePublicClient({ chainId: AMOY_CHAIN_ID });

  const supported = isConnected && chainId === AMOY_CHAIN_ID;

  // Narrow the constants to wagmi/viem-friendly types
  const MUSD = MUSD_ADDRESS as Address;
  const PCHK = PCHK_ADDRESS as Address;
  const MUSD_ABI_T = MUSD_ABI as unknown as Abi;
  const PCHK_ABI_T = PCHK_ABI as unknown as Abi;

  // token meta
  const decimalsRes = useReadContract({
    address: MUSD,
    abi: MUSD_ABI_T,
    functionName: "decimals",
  });
  const symbolRes = useReadContract({
    address: MUSD,
    abi: MUSD_ABI_T,
    functionName: "symbol",
  });

  const decimals = Number(decimalsRes.data ?? 6);
  const symbol = (symbolRes.data as string | undefined) ?? "mUSD";

  // balances + allowance
  const musdBalRes = useReadContract({
    address: MUSD,
    abi: MUSD_ABI_T,
    functionName: "balanceOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const allowanceRes = useReadContract({
    address: MUSD,
    abi: MUSD_ABI_T,
    functionName: "allowance",
    args: address ? [address as Address, PCHK] : undefined,
    query: { enabled: Boolean(address) },
  });

  const polBal = useBalance({
    address: address as Address | undefined,
    chainId: AMOY_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) {
        setDraft(null);
        return;
      }
      const parsed = JSON.parse(raw) as Draft;
      if (!parsed.serial) {
        parsed.serial = generateSerial();
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(parsed));
      }
      setDraft(parsed);
    } catch {
      setDraft(null);
    }
  }, []);

  const amountUnits = useMemo(() => {
    if (!draft) return 0n;
    const amt = (draft.amount || "").trim();
    if (!amt) return 0n;
    try {
      return parseUnits(amt, decimals);
    } catch {
      return 0n;
    }
  }, [draft, decimals]);

  const musdBal = (musdBalRes.data as bigint | undefined) ?? 0n;
  const allowance = (allowanceRes.data as bigint | undefined) ?? 0n;

  const hasEnough = amountUnits > 0n && musdBal >= amountUnits;
  const hasAllowance = amountUnits > 0n && allowance >= amountUnits;

  const claimText = useMemo(() => {
    if (!draft) return "—";
    if (draft.claimableAtMode === "instant") return "Instant Claim";
    return draft.claimableAt ? `Post-dated: ${draft.claimableAt}` : "Post-dated";
  }, [draft]);

  function bytes32FromString(s: string): Hex {
    return stringToHex(s, { size: 32 });
  }

  function validateDraft(): string | null {
    if (!draft) return "No draft found. Go back to the mint page.";
    if (!draft.title.trim()) return "Title is required.";
    if (!draft.recipient.trim()) return "Recipient is required.";
    if (amountUnits <= 0n) return "Enter a valid amount.";

    // memo <= 160 bytes
    const memoBytes = new TextEncoder().encode(draft.memo || "");
    if (memoBytes.length > 160) return "Memo is too long (max 160 bytes).";

    // title <= 32 bytes
    const titleBytes = new TextEncoder().encode(draft.title.trim());
    if (titleBytes.length > 32) return "Title is too long (max 32 bytes).";

    // serial <= 32 bytes
    const serialBytes = new TextEncoder().encode(draft.serial || "");
    if (serialBytes.length > 32) return "Serial is too long (max 32 bytes).";

    if (draft.claimableAtMode === "postdated" && !draft.claimableAt) {
      return "Choose a post-dated time.";
    }

    return null;
  }

  async function ensureAmoy(): Promise<boolean> {
    if (!isConnected) return false;
    if (chainId === AMOY_CHAIN_ID) return true;

    try {
      await switchChainAsync({ chainId: AMOY_CHAIN_ID });
      return true;
    } catch (e: any) {
      setError(e?.message || "Failed to switch to Polygon Amoy.");
      return false;
    }
  }

  async function getTestMusd() {
    setError(null);

    if (!isConnected) {
      setError("Connect your wallet first.");
      return;
    }

    const ok = await ensureAmoy();
    if (!ok) return;

    if (!publicClient) {
      setError("Public client not ready.");
      return;
    }

    try {
      setStage("faucet");

      // Faucet enough to cover 10x the requested amount (min 1,000 mUSD)
      const desired =
        amountUnits > 0n ? amountUnits * 10n : parseUnits("1000", decimals);

      const hash = await writeContractAsync({
        address: MUSD,
        abi: MUSD_ABI_T,
        functionName: "faucet",
        args: [desired],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setStage("idle");
    } catch (e: any) {
      setStage("error");
      setError(e?.shortMessage || e?.message || "mUSD faucet failed.");
    }
  }

  async function approveMusd() {
    setError(null);

    if (!isConnected) {
      setError("Connect your wallet first.");
      return;
    }

    const ok = await ensureAmoy();
    if (!ok) return;

    if (!publicClient) {
      setError("Public client not ready.");
      return;
    }

    try {
      setStage("approve");

      const hash = await writeContractAsync({
        address: MUSD,
        abi: MUSD_ABI_T,
        functionName: "approve",
        args: [PCHK, MAX_UINT256],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setStage("idle");
    } catch (e: any) {
      setStage("error");
      setError(e?.shortMessage || e?.message || "Approve failed.");
    }
  }

  async function mintOnTestnet() {
    setError(null);

    const v = validateDraft();
    if (v) {
      setError(v);
      return;
    }

    if (!isConnected) {
      setError("Connect your wallet first.");
      return;
    }

    const ok = await ensureAmoy();
    if (!ok) return;

    if (!publicClient) {
      setError("Public client not ready.");
      return;
    }

    if (!hasEnough) {
      setError(`Not enough ${symbol}. Use “Get test mUSD” first.`);
      return;
    }

    if (!hasAllowance) {
      setError(`Approval needed. Click “Approve ${symbol}” first.`);
      return;
    }

    try {
      setStage("mint");

      const serialB32 = bytes32FromString(draft!.serial!);
      const titleB32 = bytes32FromString(draft!.title.trim());

      const claimableAt =
        draft!.claimableAtMode === "instant"
          ? 0
          : Math.floor(new Date(draft!.claimableAt).getTime() / 1000);

      const hash = await writeContractAsync({
        address: PCHK,
        abi: PCHK_ABI_T,
        functionName: "mintPaymentCheck",
        args: [
          draft!.recipient.trim() as Address,
          amountUnits,
          BigInt(claimableAt),
          serialB32,
          titleB32,
          draft!.memo || "",
        ],
      });

      setMintHash(hash);

      await publicClient.waitForTransactionReceipt({ hash });
      setStage("success");

      // Redirect to explorer by serial
      window.location.href = `https://explorer.checks.xyz/testnet/${draft!.serial}`;
    } catch (e: any) {
      setStage("error");
      setError(e?.shortMessage || e?.message || "Mint failed.");
    }
  }

  const polText = useMemo(() => {
    if (!polBal.data) return "—";
    try {
      return `${formatUnits(polBal.data.value, polBal.data.decimals)} ${polBal.data.symbol}`;
    } catch {
      return `${polBal.data.symbol}`;
    }
  }, [polBal.data]);

  const musdText = useMemo(() => {
    if (!musdBalRes.data) return "—";
    return `${formatUnits(musdBal, decimals)} ${symbol}`;
  }, [musdBalRes.data, musdBal, decimals, symbol]);

  const connectConnector =
    connectors?.find((c) => c.id === "injected") ?? connectors?.[0];

  return (
    <>
      <Head>
        <title>Preview Payment Check — Testnet</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="container">
        <div className="topbar">
          <Link href="/testnet/payment/mint" className="backLink">
            ← Back to Mint
          </Link>
        </div>

        <h1 className="title">Preview</h1>

        <div className="pillRow">
          <span className="pill">Testnet</span>
          <span className="pill">Polygon Amoy (80002)</span>
          <span className={`pill ${supported ? "pillOk" : "pillWarn"}`}>
            Status {supported ? "Ready" : "Network"}
          </span>
        </div>

        <div className="grid">
          <div className="card">
            <h2>Wallet</h2>

            <div className="row">
              <div className="label">Account</div>
              <div className="value">
                {!isConnected ? "Not connected" : shortAddr(address)}
              </div>
            </div>

            <div className="row">
              <div className="label">Network</div>
              <div className="value">
                {isConnected
                  ? chainId === AMOY_CHAIN_ID
                    ? "Polygon Amoy ✅"
                    : `Unsupported ❌ (chainId ${chainId})`
                  : "—"}
              </div>
            </div>

            <div className="btnRow">
              {!isConnected ? (
                <button
                  className="btn"
                  onClick={() =>
                    connectConnector && connect({ connector: connectConnector })
                  }
                  disabled={!connectConnector || isConnecting}
                >
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              ) : (
                <button className="btn" onClick={() => disconnect()}>
                  Disconnect
                </button>
              )}

              {isConnected && chainId !== AMOY_CHAIN_ID ? (
                <button
                  className="btnSecondary"
                  onClick={() => switchChainAsync({ chainId: AMOY_CHAIN_ID })}
                  disabled={isSwitching}
                >
                  {isSwitching ? "Switching…" : "Switch to Amoy"}
                </button>
              ) : null}
            </div>

            <h3 className="subhead">Balances (Amoy)</h3>

            <div className="row">
              <div className="label">POL</div>
              <div className="value">{polText}</div>
            </div>

            <div className="row">
              <div className="label">{symbol}</div>
              <div className="value">{musdText}</div>
            </div>

            <div className="help">
              <a
                href="https://faucet.polygon.technology/"
                target="_blank"
                rel="noreferrer"
              >
                Get test POL
              </a>
            </div>
          </div>

          <div className="card">
            <h2>Preview</h2>

            {!draft ? (
              <>
                <div className="muted">
                  No draft found. Return to the mint page to enter check details.
                </div>
                <div style={{ marginTop: 12 }}>
                  <Link href="/testnet/payment/mint" className="btnLink">
                    Go to Mint
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="previewBox">
                  <div className="previewTitle">Payment Check</div>

                  <div className="row">
                    <div className="label">Serial</div>
                    <div className="value">{draft.serial}</div>
                  </div>

                  <div className="row">
                    <div className="label">Title</div>
                    <div className="value">{draft.title || "—"}</div>
                  </div>

                  <div className="row">
                    <div className="label">Recipient</div>
                    <div className="value">{draft.recipient || "—"}</div>
                  </div>

                  <div className="row">
                    <div className="label">Amount</div>
                    <div className="value">
                      {draft.amount || "—"} {symbol}
                    </div>
                  </div>

                  <div className="row">
                    <div className="label">Claim</div>
                    <div className="value">{claimText}</div>
                  </div>

                  <div className="row">
                    <div className="label">Memo</div>
                    <div className="value">{draft.memo || "—"}</div>
                  </div>

                  <div className="muted" style={{ marginTop: 10 }}>
                    Serial is stored on-chain at mint. QR can be derived from the
                    explorer URL after mint.
                  </div>
                </div>

                {error ? <div className="errorBox">{error}</div> : null}

                <div className="btnRow" style={{ marginTop: 14 }}>
                  <button className="btnSecondary" onClick={() => history.back()}>
                    Back
                  </button>

                  <button
                    className="btnSecondary"
                    onClick={getTestMusd}
                    disabled={stage !== "idle" || !isConnected}
                  >
                    {stage === "faucet" ? "Getting mUSD…" : `Get test ${symbol}`}
                  </button>

                  <button
                    className="btnSecondary"
                    onClick={approveMusd}
                    disabled={stage !== "idle" || !isConnected}
                  >
                    {stage === "approve" ? "Approving…" : `Approve ${symbol}`}
                  </button>

                  <button
                    className="btn"
                    onClick={mintOnTestnet}
                    disabled={stage !== "idle" || !isConnected}
                  >
                    {stage === "mint" ? "Minting…" : "Mint on Testnet"}
                  </button>
                </div>

                {mintHash ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    Mint tx:{" "}
                    <a
                      href={`https://amoy.polygonscan.com/tx/${mintHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {mintHash}
                    </a>
                  </div>
                ) : null}

                <div className="summary">
                  <h3>Summary</h3>
                  <div className="row">
                    <div className="label">Check Type</div>
                    <div className="value">Payment</div>
                  </div>
                  <div className="row">
                    <div className="label">Token</div>
                    <div className="value">{symbol}</div>
                  </div>
                  <div className="row">
                    <div className="label">Network</div>
                    <div className="value">Polygon Amoy (80002)</div>
                  </div>
                  <div className="row">
                    <div className="label">Serial</div>
                    <div className="value">{draft.serial}</div>
                  </div>

                  <div className="muted" style={{ marginTop: 8 }}>
                    After mint, you will be redirected to:
                    <br />
                    {`https://explorer.checks.xyz/testnet/${draft.serial}`}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="footer">
          <div>Powered by Checks</div>
          <div className="muted">
            Tip: This is an early preview step. Full mint wiring is next.
          </div>
        </div>
      </div>

      {/* Keep styling local + minimal. */}
      <style jsx>{`
        .container {
          max-width: 980px;
          margin: 0 auto;
          padding: 32px 18px 50px;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
            Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
          color: #0f172a;
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .backLink {
          text-decoration: none;
          color: #2f77fb;
          font-weight: 600;
        }
        .title {
          font-size: 44px;
          line-height: 1.05;
          letter-spacing: -0.02em;
          margin: 10px 0 16px;
        }
        .pillRow {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }
        .pill {
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 13px;
          background: #fff;
        }
        .pillOk {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }
        .pillWarn {
          border-color: #fed7aa;
          background: #fff7ed;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1.35fr;
          gap: 18px;
        }
        @media (max-width: 860px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
        .card {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 18px;
          background: #fff;
          box-shadow: 0 1px 10px rgba(15, 23, 42, 0.04);
        }
        h2 {
          margin: 0 0 12px;
          font-size: 20px;
          letter-spacing: -0.01em;
        }
        h3 {
          margin: 14px 0 8px;
          font-size: 15px;
          letter-spacing: -0.01em;
        }
        .subhead {
          margin-top: 16px;
        }
        .row {
          display: flex;
          gap: 12px;
          justify-content: space-between;
          align-items: baseline;
          padding: 6px 0;
        }
        .label {
          font-size: 12px;
          color: #64748b;
          min-width: 110px;
        }
        .value {
          font-size: 14px;
          color: #0f172a;
          word-break: break-all;
          text-align: right;
        }
        .btnRow {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .btn,
        .btnSecondary,
        .btnLink {
          appearance: none;
          border: 1px solid #cbd5e1;
          background: #0f172a;
          color: #fff;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn:disabled,
        .btnSecondary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .btnSecondary {
          background: #fff;
          color: #0f172a;
        }
        .btnLink {
          background: #fff;
          color: #0f172a;
        }
        .help {
          margin-top: 10px;
        }
        .help a {
          color: #2f77fb;
          text-decoration: none;
          font-weight: 600;
          font-size: 13px;
        }
        .muted {
          color: #64748b;
          font-size: 13px;
        }
        .previewBox {
          border: 1px dashed #e2e8f0;
          background: #f8fafc;
          border-radius: 14px;
          padding: 14px;
        }
        .previewTitle {
          font-weight: 800;
          margin-bottom: 8px;
        }
        .errorBox {
          margin-top: 12px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #991b1b;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          white-space: pre-wrap;
        }
        .summary {
          margin-top: 16px;
          border-top: 1px solid #e2e8f0;
          padding-top: 14px;
        }
        .footer {
          margin-top: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
      `}</style>
    </>
  );
}
