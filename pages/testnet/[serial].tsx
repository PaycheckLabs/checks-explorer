import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  createPublicClient,
  fallback,
  formatUnits,
  hexToString,
  http,
  parseAbiItem,
  stringToHex,
  type Hex,
} from "viem";
import { polygonAmoy } from "viem/chains";

import serials from "../../data/testnet-serials.json";
import { isValidSerialFormat, normalizeSerial } from "../../lib/serial";

type SerialRecord = {
  chainId: number;
  network: string;
  contract: string;
  tokenId: number;
  memo?: string;
  mintTx?: string;
  transferTx?: string;
  redeemTx?: string;
  voidTx?: string;
  claimableAt?: number; // unix seconds
};

type PageProps = {
  serial: string;
  record: SerialRecord | null;
  origin: string;
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const raw = String(ctx.params?.serial || "");
  const normalized = normalizeSerial(raw);

  // Keep URL normalized (important for QR + share)
  if (raw !== normalized) {
    const origin = `${ctx.req.headers["x-forwarded-proto"] || "https"}://${ctx.req.headers.host}`;
    return {
      redirect: {
        destination: `${origin}/testnet/${normalized}`,
        permanent: true,
      },
    };
  }

  const record = (serials as any)[normalized] as SerialRecord | undefined;

  const origin = `${ctx.req.headers["x-forwarded-proto"] || "https"}://${ctx.req.headers.host}`;

  return {
    props: {
      serial: normalized,
      record: record ?? null,
      origin,
    },
  };
};

const AMOY_NAME = "Polygon Amoy (80002)";
const AMOY_SCAN_BASE = "https://amoy.polygonscan.com";

const AMOY_RPC_PRIMARY = "https://polygon-amoy-bor-rpc.publicnode.com/";
const AMOY_RPC_FALLBACK = "https://rpc-amoy.polygon.technology/";

type DeploymentConfig = {
  label: string;
  contract: string; // PaymentChecks contract
  token: string; // MockUSD collateral token
  fromBlock: bigint;
};

// Canonical first, then legacy fallback.
// Canonical: docs/deployments/amoy-payment-checks.md
// Legacy:   docs/deployments/amoy-payment-checks-legacy.md
const DEPLOYMENTS: DeploymentConfig[] = [
  {
    label: "Payment Checks",
    contract: "0x9ED92dd2626E372DB3FD71Fe300f76d90aF2d589",
    token: "0x0D085A1EBb74f050cE3A8ed18E3f998F04A23268",
    // Safe lower bound (includes infra txs at 34840100 and PaymentChecks deploy at 34840101)
    fromBlock: 34840100n,
  },
  {
    label: "Payment Checks (Legacy)",
    contract: "0x4dC6db5f06DAF4716b749EAb8d8efa27BcEE1218",
    token: "0xa01C7368672b61AdE32FAEf6aeD5aeC1845dedb5",
    fromBlock: 34655184n,
  },
];

const amoyClient = createPublicClient({
  chain: polygonAmoy,
  transport: fallback([
    http(AMOY_RPC_PRIMARY, { timeout: 15_000, retryCount: 2, retryDelay: 500 }),
    http(AMOY_RPC_FALLBACK, { timeout: 15_000, retryCount: 1, retryDelay: 500 }),
  ]),
});

// --- viem TS compat ---
// viem's typings can vary across versions. This keeps the file stable in Next/Vercel type checking.
async function readContractCompat(args: any) {
  return amoyClient.readContract(args as any) as any;
}

// --- helpers ---
function scanAddr(addr: string) {
  return `${AMOY_SCAN_BASE}/address/${addr}`;
}
function scanTx(hash: string) {
  return `${AMOY_SCAN_BASE}/tx/${hash}`;
}
function bytes32ToTrimmedAscii(hex: Hex): string {
  try {
    const s = hexToString(hex, { size: 32 });
    return s.replace(/\u0000/g, "").trim();
  } catch {
    return "";
  }
}

function serialToBytes32(serial: string): Hex {
  // Serial is ASCII, <= 32 bytes guaranteed by our generation rules
  return stringToHex(serial, { size: 32 });
}

// ABI for PaymentChecks (canonical contract)
const PCHK_ABI = [
  {
    type: "function",
    name: "tokenIdForSerial",
    stateMutability: "view",
    inputs: [{ name: "serial", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getPaymentCheck",
    stateMutability: "view",
    inputs: [{ name: "checkId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "issuer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "createdAt", type: "uint64" },
          { name: "claimableAt", type: "uint64" },
          { name: "serial", type: "bytes32" },
          { name: "title", type: "bytes32" },
          { name: "memo", type: "string" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "accountOf",
    stateMutability: "view",
    inputs: [{ name: "checkId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// ERC20 reads
const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type OnchainViewModel = {
  deploymentLabel: string;
  contract: string;
  token: string;

  tokenId: bigint;
  issuer: string;
  holder: string;
  tba: string;
  amount: bigint;
  decimals: number;
  symbol: string;
  claimableAt: bigint;
  title: string;
  memo: string;
  status: number;
  mintTx: string | null;
  redeemTx: string | null;
  voidTx: string | null;
  tbaBalance: bigint;
};

async function resolveDeploymentAndTokenId(serialB32: Hex): Promise<{
  deployment: DeploymentConfig;
  tokenId: bigint;
} | null> {
  for (const d of DEPLOYMENTS) {
    const tokenId = (await readContractCompat({
      address: d.contract,
      abi: PCHK_ABI,
      functionName: "tokenIdForSerial",
      args: [serialB32],
    })) as bigint;

    if (tokenId && tokenId !== 0n) return { deployment: d, tokenId };
  }
  return null;
}

function StatusPill({ status }: { status: number }) {
  // 0 NONE, 1 ACTIVE, 2 REDEEMED, 3 VOID
  const label = status === 1 ? "ACTIVE" : status === 2 ? "REDEEMED" : status === 3 ? "VOID" : "UNKNOWN";
  const cls = status === 1 ? "active" : status === 2 ? "redeemed" : status === 3 ? "void" : "unknown";
  return <span className={`pill ${cls}`}>{label}</span>;
}

export default function TestnetSerialPage(props: PageProps) {
  const { serial, record, origin } = props;

  // Serial validation (defense)
  const isValid = useMemo(() => isValidSerialFormat(serial), [serial]);

  if (!isValid) {
    return (
      <>
        <Head>
          <title>Invalid Serial — Checks Explorer</title>
        </Head>
        <div className="page">
          <div className="header">
            <Link className="back" href="/testnet">
              ← Back
            </Link>
            <h1 className="title">Invalid serial</h1>
          </div>
          <div className="card">
            <div className="label">Serial</div>
            <div className="value mono">{serial}</div>
            <div className="note">
              This does not match the Checks serial format. Please verify the URL or QR code source.
            </div>
          </div>
        </div>
        <style jsx>{styles}</style>
      </>
    );
  }

  // If curated record exists, render the curated view (FMV etc)
  if (record) {
    return (
      <>
        <Head>
          <title>{serial} — Checks Explorer (Testnet)</title>
        </Head>

        <div className="page">
          <div className="header">
            <Link className="back" href="/testnet">
              ← Back
            </Link>
            <div className="titleRow">
              <h1 className="title">{serial}</h1>
              <div className="pillWrap">
                <span className="pill active">ACTIVE</span>
              </div>
            </div>
            <div className="sub">Testnet serial page. This page is curated for specific demo checks.</div>
          </div>

          <div className="grid">
            <div className="left">
              <div className="checkWrap">
                <div className="checkBox">
                  {/* Check image */}
                  <img
                    src={`/checks/testnet/${serial}.png`}
                    alt={`Check ${serial}`}
                    className="checkImg"
                    draggable={false}
                  />

                  {/* QR overlay locked — do not change desktop positioning */}
                  <div className="qrOuter">
                    <img
                      src={`/qr/testnet/${serial}.png`}
                      alt={`QR for ${serial}`}
                      className="qrImg"
                      draggable={false}
                    />
                  </div>
                </div>
              </div>

              <div className="noteCard">
                <div className="noteTitle">Note</div>
                <div className="noteText">
                  This is a curated testnet demo. For newly minted checks, this route falls back to on-chain lookup.
                </div>
              </div>
            </div>

            <div className="right">
              <div className="card">
                <div className="sectionTitle">Details</div>

                <div className="detailGrid">
                  <div className="label">Serial</div>
                  <div className="valueRight monoNoWrap">{serial}</div>

                  <div className="label">Network</div>
                  <div className="valueRight">{record.network}</div>

                  <div className="label">Contract</div>
                  <div className="valueRight">
                    <div className="contractBox monoNoWrap">{record.contract}</div>
                    <div className="btnRow detailsBtnRow">
                      <a className="pillBtnLink" href={scanAddr(record.contract)} target="_blank" rel="noreferrer">
                        Open in Polygonscan
                      </a>
                    </div>
                  </div>

                  <div className="label">TokenID</div>
                  <div className="valueRight">{record.tokenId}</div>

                  {record.memo ? (
                    <>
                      <div className="label">Memo</div>
                      <div className="valueRight">{record.memo}</div>
                    </>
                  ) : null}

                  {record.claimableAt ? (
                    <>
                      <div className="label">Claimable At</div>
                      <div className="valueRight monoNoWrap">
                        {new Date(record.claimableAt * 1000).toLocaleString()}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="card">
                <div className="sectionTitle">Transactions</div>

                <ul className="ul">
                  {record.mintTx ? (
                    <li className="li">
                      <div className="label">Mint</div>
                      <a className="hashLink monoNoWrap" href={scanTx(record.mintTx)} target="_blank" rel="noreferrer">
                        {record.mintTx}
                      </a>
                    </li>
                  ) : null}

                  {record.redeemTx ? (
                    <li className="li">
                      <div className="label">Redeem</div>
                      <a className="hashLink monoNoWrap" href={scanTx(record.redeemTx)} target="_blank" rel="noreferrer">
                        {record.redeemTx}
                      </a>
                    </li>
                  ) : null}

                  {record.voidTx ? (
                    <li className="li">
                      <div className="label">Void</div>
                      <a className="hashLink monoNoWrap" href={scanTx(record.voidTx)} target="_blank" rel="noreferrer">
                        {record.voidTx}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>

              <div className="card subtle">
                <div className="sectionTitle">Share</div>
                <div className="shareRow">
                  <div className="shareLabel">URL</div>
                  <div className="shareValue monoNoWrap">{origin}/testnet/{serial}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{styles}</style>
      </>
    );
  }

  // No curated record -> on-chain lookup view
  return (
    <>
      <Head>
        <title>{serial} — Checks Explorer (Testnet)</title>
      </Head>
      <OnchainSerialView serial={serial} origin={origin} />
      <style jsx>{styles}</style>
    </>
  );
}

function OnchainSerialView({ serial, origin }: { serial: string; origin: string }) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vm, setVm] = useState<OnchainViewModel | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setNotFound(false);
      setError(null);
      setVm(null);

      try {
        const serialB32 = serialToBytes32(serial);

        const resolved = await resolveDeploymentAndTokenId(serialB32);

        if (!alive) return;

        if (!resolved) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const { deployment, tokenId } = resolved;

        const pc = (await readContractCompat({
          address: deployment.contract,
          abi: PCHK_ABI,
          functionName: "getPaymentCheck",
          args: [tokenId],
        })) as any;

        const tba = (await readContractCompat({
          address: deployment.contract,
          abi: PCHK_ABI,
          functionName: "accountOf",
          args: [tokenId],
        })) as string;

        const holder = (await readContractCompat({
          address: deployment.contract,
          abi: PCHK_ABI,
          functionName: "ownerOf",
          args: [tokenId],
        })) as string;

        const decimals = Number(
          (await readContractCompat({
            address: deployment.token,
            abi: ERC20_ABI,
            functionName: "decimals",
          })) as number
        );

        const symbol = String(
          (await readContractCompat({
            address: deployment.token,
            abi: ERC20_ABI,
            functionName: "symbol",
          })) as string
        );

        const tbaBalance = (await readContractCompat({
          address: deployment.token,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [tba],
        })) as bigint;

        // Events -> tx hashes (optional)
        // Some RPC providers block getLogs in the browser. We treat log lookups as best-effort.
        let mintTx: string | null = null;
        let redeemTx: string | null = null;
        let voidTx: string | null = null;

        try {
          const mintedEvent = parseAbiItem(
            "event PaymentCheckMinted(uint256 indexed checkId, bytes32 indexed serial, address indexed issuer, address initialHolder, address token, uint256 amount, uint64 claimableAt, address account)"
          );
          const redeemedEvent = parseAbiItem(
            "event PaymentCheckRedeemed(uint256 indexed checkId, address indexed redeemer, address token, uint256 amount, address account)"
          );
          const voidedEvent = parseAbiItem(
            "event PaymentCheckVoided(uint256 indexed checkId, address indexed issuer, address token, uint256 amount, address account)"
          );

          const [mints, redeems, voids] = await Promise.all([
            amoyClient.getLogs({
              address: deployment.contract as any,
              event: mintedEvent,
              args: { checkId: tokenId },
              fromBlock: deployment.fromBlock,
              toBlock: "latest",
            }),
            amoyClient.getLogs({
              address: deployment.contract as any,
              event: redeemedEvent,
              args: { checkId: tokenId },
              fromBlock: deployment.fromBlock,
              toBlock: "latest",
            }),
            amoyClient.getLogs({
              address: deployment.contract as any,
              event: voidedEvent,
              args: { checkId: tokenId },
              fromBlock: deployment.fromBlock,
              toBlock: "latest",
            }),
          ]);

          mintTx = mints?.[0]?.transactionHash ?? null;
          redeemTx = redeems?.[0]?.transactionHash ?? null;
          voidTx = voids?.[0]?.transactionHash ?? null;
        } catch {
          mintTx = null;
          redeemTx = null;
          voidTx = null;
        }

        if (!alive) return;

        const status = Number(pc?.status ?? 0);

        setVm({
          deploymentLabel: deployment.label,
          contract: deployment.contract,
          token: deployment.token,

          tokenId,
          issuer: String(pc?.issuer ?? ""),
          holder,
          tba,
          amount: (pc?.amount ?? 0n) as bigint,
          decimals,
          symbol,
          claimableAt: (pc?.claimableAt ?? 0n) as bigint,
          title: bytes32ToTrimmedAscii(pc?.title as Hex),
          memo: String(pc?.memo ?? ""),
          status,
          mintTx,
          redeemTx,
          voidTx,
          tbaBalance,
        });

        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        const msg =
          e?.shortMessage ||
          e?.message ||
          (typeof e === "string" ? e : "On-chain lookup failed.");
        setError(msg);
        setLoading(false);
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [serial]);

  async function copyToClipboard(textToCopy: string, key: string) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      // ignore
    }
  }

  const claimableText = useMemo(() => {
    if (!vm) return "—";
    const t = Number(vm.claimableAt);
    if (!t) return "Instant Claim";
    return new Date(t * 1000).toLocaleString();
  }, [vm]);

  const amountText = useMemo(() => {
    if (!vm) return "—";
    return `${formatUnits(vm.amount, vm.decimals)} ${vm.symbol}`;
  }, [vm]);

  const tbaBalText = useMemo(() => {
    if (!vm) return "—";
    return `${formatUnits(vm.tbaBalance, vm.decimals)} ${vm.symbol}`;
  }, [vm]);

  return (
    <div className="page">
      <div className="header">
        <Link className="back" href="/testnet">
          ← Back
        </Link>

        <div className="titleRow">
          <h1 className="title">{serial}</h1>
          <div className="pillWrap">{vm ? <StatusPill status={vm.status} /> : null}</div>
        </div>

        <div className="sub">
          Testnet serial page. If this serial is not part of the curated demo list, we resolve it on-chain.
        </div>
      </div>

      <div className="grid">
        <div className="left">
          <div className="checkWrap">
            <div className="checkBox">
              {/* If a curated image exists, it will display. Otherwise, fallback check image placeholder. */}
              <img
                src={`/checks/testnet/${serial}.png`}
                alt={`Check ${serial}`}
                className="checkImg"
                draggable={false}
                onError={(e) => {
                  const t = e.currentTarget;
                  if (t && !t.src.includes("/checks/blank.png")) t.src = "/checks/blank.png";
                }}
              />

              {/* QR overlay locked — do not change desktop positioning */}
              <div className="qrOuter">
                <img
                  src={`/qr/testnet/${serial}.png`}
                  alt={`QR for ${serial}`}
                  className="qrImg"
                  draggable={false}
                  onError={(e) => {
                    const t = e.currentTarget;
                    if (t && !t.src.includes("/qr/blank.png")) t.src = "/qr/blank.png";
                  }}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="noteCard">
              <div className="noteTitle">Loading</div>
              <div className="noteText">Resolving serial on-chain…</div>
            </div>
          ) : null}

          {notFound ? (
            <div className="noteCard">
              <div className="noteTitle">Not found</div>
              <div className="noteText">
                This serial is not in the curated list and was not found on-chain on the supported Amoy deployments.
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="noteCard">
              <div className="noteTitle">Error</div>
              <div className="noteText">{error}</div>
            </div>
          ) : null}
        </div>

        <div className="right">
          <div className="card">
            <div className="sectionTitle">On-chain Details</div>

            {vm && !loading && !error && (
              <div className="detailGrid">
                <div className="label">Network</div>
                <div className="valueRight">{AMOY_NAME}</div>

                <div className="label">Contract</div>
                <div className="valueRight">
                  <div className="contractBox monoNoWrap">{vm.contract}</div>
                  <div className="btnRow detailsBtnRow">
                    <button
                      className={`pillBtn ${copiedKey === "contract" ? "copied" : ""}`}
                      onClick={() => copyToClipboard(vm.contract, "contract")}
                      type="button"
                    >
                      {copiedKey === "contract" ? "Copied" : "Copy"}
                    </button>
                    <a className="pillBtnLink" href={scanAddr(vm.contract)} target="_blank" rel="noreferrer">
                      Open in Polygonscan
                    </a>
                  </div>
                </div>

                <div className="label">TokenID</div>
                <div className="valueRight">{vm.tokenId.toString()}</div>

                <div className="label">Issuer</div>
                <div className="valueRight">
                  <a className="hashLink monoNoWrap" href={scanAddr(vm.issuer)} target="_blank" rel="noreferrer">
                    {vm.issuer}
                  </a>
                </div>

                <div className="label">Holder</div>
                <div className="valueRight">
                  <a className="hashLink monoNoWrap" href={scanAddr(vm.holder)} target="_blank" rel="noreferrer">
                    {vm.holder}
                  </a>
                </div>

                <div className="label">TBA</div>
                <div className="valueRight">
                  <a className="hashLink monoNoWrap" href={scanAddr(vm.tba)} target="_blank" rel="noreferrer">
                    {vm.tba}
                  </a>
                </div>

                <div className="label">Amount</div>
                <div className="valueRight">{amountText}</div>

                <div className="label">TBA Balance</div>
                <div className="valueRight">{tbaBalText}</div>

                <div className="label">Claimable At</div>
                <div className="valueRight monoNoWrap">{claimableText}</div>

                {vm.title ? (
                  <>
                    <div className="label">Title</div>
                    <div className="valueRight">{vm.title}</div>
                  </>
                ) : null}

                {vm.memo ? (
                  <>
                    <div className="label">Memo</div>
                    <div className="valueRight">{vm.memo}</div>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <div className="card">
            <div className="sectionTitle">Transactions</div>

            {vm && !loading && !error ? (
              <ul className="ul">
                {vm.mintTx ? (
                  <li className="li">
                    <div className="label">Mint</div>
                    <a className="hashLink monoNoWrap" href={scanTx(vm.mintTx)} target="_blank" rel="noreferrer">
                      {vm.mintTx}
                    </a>
                  </li>
                ) : null}

                {vm.redeemTx ? (
                  <li className="li">
                    <div className="label">Redeem</div>
                    <a className="hashLink monoNoWrap" href={scanTx(vm.redeemTx)} target="_blank" rel="noreferrer">
                      {vm.redeemTx}
                    </a>
                  </li>
                ) : null}

                {vm.voidTx ? (
                  <li className="li">
                    <div className="label">Void</div>
                    <a className="hashLink monoNoWrap" href={scanTx(vm.voidTx)} target="_blank" rel="noreferrer">
                      {vm.voidTx}
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : (
              <div className="noteText">Tx hashes are best-effort (depends on RPC log support).</div>
            )}
          </div>

          <div className="card subtle">
            <div className="sectionTitle">Share</div>
            <div className="shareRow">
              <div className="shareLabel">URL</div>
              <div className="shareValue monoNoWrap">
                {origin}/testnet/{serial}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = `
.page {
  min-height: 100vh;
  padding: 32px 18px 64px;
  background: #070b11;
  color: #e6edf3;
}

.header {
  max-width: 1180px;
  margin: 0 auto 18px;
}

.back {
  display: inline-block;
  color: #8aa4bf;
  text-decoration: none;
  font-weight: 700;
  margin-bottom: 8px;
}

.titleRow {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}

.title {
  font-size: 52px;
  margin: 0;
  letter-spacing: -0.02em;
}

.pillWrap {
  display: flex;
  gap: 10px;
  align-items: center;
}

.pill {
  font-size: 12px;
  font-weight: 800;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.06);
  color: #e6edf3;
}

.pill.active {
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.16);
}

.pill.redeemed {
  border-color: rgba(59, 130, 246, 0.40);
  background: rgba(59, 130, 246, 0.16);
}

.pill.void {
  border-color: rgba(239, 68, 68, 0.40);
  background: rgba(239, 68, 68, 0.16);
}

.pill.unknown {
  border-color: rgba(148, 163, 184, 0.35);
  background: rgba(148, 163, 184, 0.12);
}

.sub {
  color: rgba(230, 237, 243, 0.72);
  font-size: 14px;
  margin-top: 6px;
  max-width: 940px;
}

.grid {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 18px;
}

.left,
.right {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.checkWrap {
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
  padding: 14px;
}

.checkBox {
  position: relative;
  width: 100%;
}

.checkImg {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 12px;
  user-select: none;
  -webkit-user-drag: none;
}

/* ===== QR LOCKED POSITIONS (DO NOT TOUCH DESKTOP) ===== */
.qrOuter {
  position: absolute;
  right: 26px;
  top: 180px;
  width: 112px;
  height: 112px;
  border-radius: 8px;
  background: rgba(255,255,255,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}
.qrImg {
  width: 96px;
  height: 96px;
  border-radius: 0px;
}
/* ===================================================== */

.noteCard {
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
  border-radius: 18px;
  padding: 14px;
}

.noteTitle {
  font-weight: 900;
  margin-bottom: 6px;
}

.noteText {
  color: rgba(230, 237, 243, 0.78);
  font-size: 14px;
  line-height: 1.4;
}

.card {
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
  border-radius: 18px;
  padding: 14px;
}

.card.subtle {
  background: rgba(255,255,255,0.02);
}

.sectionTitle {
  font-weight: 900;
  margin-bottom: 10px;
}

.detailGrid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px 12px;
  align-items: start;
}

.label {
  color: rgba(230, 237, 243, 0.68);
  font-weight: 800;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.valueRight {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-weight: 800;
  font-size: 13px;
  color: rgba(230, 237, 243, 0.92);
}

.monoNoWrap {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  white-space: nowrap;
}

.contractBox {
  border: none;
  border-radius: 0;
  padding: 2px 0;
  background: transparent;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  display: block;
}

.hashLine,
.hashLink {
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  display: block;
  max-width: 100%;
}

.hashLink {
  color: #7dd3fc;
  text-decoration: none;
}
.hashLink:hover {
  text-decoration: underline;
}

.btnRow {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pillBtn,
.pillBtnLink {
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: rgba(230, 237, 243, 0.92);
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  text-decoration: none;
}

.pillBtn.copied {
  border-color: rgba(34, 197, 94, 0.35);
  background: rgba(34, 197, 94, 0.16);
}

.shareRow {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 10px;
  align-items: start;
}

.shareLabel {
  color: rgba(230, 237, 243, 0.68);
  font-weight: 800;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.shareValue {
  color: rgba(230, 237, 243, 0.92);
  font-weight: 800;
  font-size: 13px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* Responsive */
@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .titleRow {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .title {
    font-size: 46px;
  }
}

/* QR shrinks ONLY on true mobile */
@media (max-width: 520px) {
  .title {
    font-size: 42px;
  }
  .detailGrid {
    grid-template-columns: 1fr;
  }
  .valueRight {
    font-weight: 600;
  }

  .qrOuter {
    right: 16px;
    top: 135px;
    width: 102px;
    height: 102px;
    border-radius: 7px;
  }

  .qrImg {
    width: 86px;
    height: 86px;
    border-radius: 0px;
  }
}
`;
