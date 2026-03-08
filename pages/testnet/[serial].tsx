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
  contract: string;
  token: string;
  fromBlock: bigint;
};

const DEPLOYMENTS: DeploymentConfig[] = [
  {
    label: "Payment Checks",
    contract: "0x9ED92dd2626E372DB3FD71Fe300f76d90aF2d589",
    token: "0x0D085A1EBb74f050cE3A8ed18E3f998F04A23268",
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

async function readContractCompat(args: any) {
  return amoyClient.readContract(args as any) as any;
}

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
  return stringToHex(serial, { size: 32 });
}

function shortAddress(value?: string) {
  if (!value) return "Not available";
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

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
  const label = status === 1 ? "ACTIVE" : status === 2 ? "REDEEMED" : status === 3 ? "VOID" : "UNKNOWN";
  const cls = status === 1 ? "active" : status === 2 ? "redeemed" : status === 3 ? "void" : "unknown";
  return <span className={`pill ${cls}`}>{label}</span>;
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="field">
      <div className="fieldLabel">{label}</div>
      <div className={`fieldValue ${mono ? "mono" : ""}`}>{value}</div>
    </div>
  );
}

function TxRow({
  label,
  hash,
}: {
  label: string;
  hash: string;
}) {
  return (
    <div className="txRow">
      <div className="txLabel">{label}</div>
      <a className="hashLink mono" href={scanTx(hash)} target="_blank" rel="noreferrer">
        {hash}
      </a>
    </div>
  );
}

export default function TestnetSerialPage(props: PageProps) {
  const { serial, record, origin } = props;
  const isValid = useMemo(() => isValidSerialFormat(serial), [serial]);

  if (!isValid) {
    return (
      <>
        <Head>
          <title>Invalid Serial - Checks Explorer</title>
        </Head>

        <div className="page">
          <div className="shell">
            <div className="header">
              <Link className="back" href="/testnet">
                ← Back
              </Link>

              <div className="headerRow">
                <div>
                  <h1 className="title">Invalid serial</h1>
                  <div className="sub">This serial does not match the Checks format.</div>
                </div>
              </div>
            </div>

            <div className="supportGrid single">
              <div className="infoCard">
                <div className="cardTitle">Serial Review</div>
                <Field label="Serial" value={serial} mono />
                <div className="noteBox">
                  Please verify the URL or QR source and try again.
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{styles}</style>
      </>
    );
  }

  if (record) {
    return (
      <>
        <Head>
          <title>{serial} - Checks Explorer (Testnet)</title>
        </Head>

        <div className="page">
          <div className="shell">
            <div className="header">
              <Link className="back" href="/testnet">
                ← Back
              </Link>

              <div className="headerRow">
                <div className="headerCopy">
                  <h1 className="title">{serial}</h1>
                  <div className="subTitle">Testnet Payment Check on Polygon Amoy</div>
                  <div className="sub">
                    Curated explorer view for specific demo checks. This page is serving as the visual anchor for the Checks explorer.
                  </div>
                </div>

                <div className="headerBadges">
                  <span className="metaBadge">TESTNET</span>
                  <span className="pill active">ACTIVE</span>
                </div>
              </div>
            </div>

            <div className="heroGrid">
              <div className="visualCard">
                <div className="visualCardInner">
                  <div className="visualLabel">Check Preview</div>

                  <div className="checkWrap">
                    <div className="checkBox">
                      <img
                        src={`/checks/testnet/${serial}.png`}
                        alt={`Check ${serial}`}
                        className="checkImg"
                        draggable={false}
                      />

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
                </div>
              </div>

              <div className="detailsCard">
                <div className="cardTitle">Check Details</div>

                <div className="fieldStack">
                  <Field label="Status" value="Active" />
                  <Field label="Type" value="Payment Check" />
                  <Field label="Serial" value={serial} mono />
                  <Field label="Network" value={record.network} />
                  <Field label="Token ID" value={String(record.tokenId)} />
                  <Field label="Contract" value={shortAddress(record.contract)} mono />
                  {record.claimableAt ? (
                    <Field
                      label="Claimable At"
                      value={new Date(record.claimableAt * 1000).toLocaleString()}
                    />
                  ) : (
                    <Field label="Conditions" value="Instant Claim" />
                  )}
                  {record.memo ? <Field label="Memo" value={record.memo} /> : null}
                </div>

                <div className="actionRow">
                  <a className="actionBtn" href={scanAddr(record.contract)} target="_blank" rel="noreferrer">
                    View Contract
                  </a>
                  <a className="actionBtn subtleBtn" href={`${origin}/testnet/${serial}`} target="_blank" rel="noreferrer">
                    Open Share URL
                  </a>
                </div>
              </div>
            </div>

            <div className="supportGrid">
              <div className="infoCard">
                <div className="cardTitle">Transactions</div>
                <div className="txStack">
                  {record.mintTx ? <TxRow label="Mint" hash={record.mintTx} /> : null}
                  {record.redeemTx ? <TxRow label="Redeem" hash={record.redeemTx} /> : null}
                  {record.voidTx ? <TxRow label="Void" hash={record.voidTx} /> : null}
                  {!record.mintTx && !record.redeemTx && !record.voidTx ? (
                    <div className="emptyState">No transaction references have been added for this curated record yet.</div>
                  ) : null}
                </div>
              </div>

              <div className="infoCard">
                <div className="cardTitle">Share</div>
                <Field label="URL" value={`${origin}/testnet/${serial}`} mono />
              </div>

              <div className="infoCard">
                <div className="cardTitle">Notes</div>
                <div className="noteBox">
                  This page is under active development. Temporary formatting issues or QR placement inconsistencies may appear while we refine the layout.
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{styles}</style>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{serial} - Checks Explorer (Testnet)</title>
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
    if (!vm) return "Not available";
    const t = Number(vm.claimableAt);
    if (!t) return "Instant Claim";
    return new Date(t * 1000).toLocaleString();
  }, [vm]);

  const amountText = useMemo(() => {
    if (!vm) return "Not available";
    return `${formatUnits(vm.amount, vm.decimals)} ${vm.symbol}`;
  }, [vm]);

  const tbaBalText = useMemo(() => {
    if (!vm) return "Not available";
    return `${formatUnits(vm.tbaBalance, vm.decimals)} ${vm.symbol}`;
  }, [vm]);

  return (
    <div className="page">
      <div className="shell">
        <div className="header">
          <Link className="back" href="/testnet">
            ← Back
          </Link>

          <div className="headerRow">
            <div className="headerCopy">
              <h1 className="title">{serial}</h1>
              <div className="subTitle">Testnet Payment Check on Polygon Amoy</div>
              <div className="sub">
                If this serial is not part of the curated demo list, we resolve it live from supported Amoy deployments.
              </div>
            </div>

            <div className="headerBadges">
              <span className="metaBadge">ON-CHAIN</span>
              <div>{vm ? <StatusPill status={vm.status} /> : null}</div>
            </div>
          </div>
        </div>

        <div className="heroGrid">
          <div className="visualCard">
            <div className="visualCardInner">
              <div className="visualLabel">Check Preview</div>

              <div className="checkWrap">
                <div className="checkBox">
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
            </div>
          </div>

          <div className="detailsCard">
            <div className="cardTitle">On-chain Details</div>

            {vm && !loading && !error ? (
              <>
                <div className="fieldStack">
                  <Field label="Deployment" value={vm.deploymentLabel} />
                  <Field label="Network" value={AMOY_NAME} />
                  <Field label="Token ID" value={vm.tokenId.toString()} />
                  <Field label="Issuer" value={shortAddress(vm.issuer)} mono />
                  <Field label="Holder" value={shortAddress(vm.holder)} mono />
                  <Field label="TBA" value={shortAddress(vm.tba)} mono />
                  <Field label="Amount" value={amountText} />
                  <Field label="TBA Balance" value={tbaBalText} />
                  <Field label="Claimable At" value={claimableText} />
                  <Field label="Contract" value={shortAddress(vm.contract)} mono />
                  {vm.title ? <Field label="Title" value={vm.title} /> : null}
                  {vm.memo ? <Field label="Memo" value={vm.memo} /> : null}
                </div>

                <div className="actionRow">
                  <button
                    className={`actionBtn ${copiedKey === "share" ? "copiedBtn" : ""}`}
                    onClick={() => copyToClipboard(`${origin}/testnet/${serial}`, "share")}
                    type="button"
                  >
                    {copiedKey === "share" ? "Copied URL" : "Copy Share URL"}
                  </button>

                  <a className="actionBtn subtleBtn" href={scanAddr(vm.contract)} target="_blank" rel="noreferrer">
                    View Contract
                  </a>
                </div>
              </>
            ) : (
              <div className="stateStack">
                {loading ? <div className="noteBox">Resolving serial on-chain...</div> : null}
                {notFound ? (
                  <div className="noteBox">
                    This serial is not in the curated list and was not found on-chain on the supported Amoy deployments.
                  </div>
                ) : null}
                {error ? <div className="noteBox">{error}</div> : null}
              </div>
            )}
          </div>
        </div>

        <div className="supportGrid">
          <div className="infoCard">
            <div className="cardTitle">Transactions</div>
            {vm && !loading && !error ? (
              <div className="txStack">
                {vm.mintTx ? <TxRow label="Mint" hash={vm.mintTx} /> : null}
                {vm.redeemTx ? <TxRow label="Redeem" hash={vm.redeemTx} /> : null}
                {vm.voidTx ? <TxRow label="Void" hash={vm.voidTx} /> : null}
                {!vm.mintTx && !vm.redeemTx && !vm.voidTx ? (
                  <div className="emptyState">Transaction hashes are best-effort and may depend on RPC log support.</div>
                ) : null}
              </div>
            ) : (
              <div className="emptyState">Transaction data will appear after the serial is resolved.</div>
            )}
          </div>

          <div className="infoCard">
            <div className="cardTitle">Share</div>
            <Field label="URL" value={`${origin}/testnet/${serial}`} mono />
          </div>

          <div className="infoCard">
            <div className="cardTitle">Notes</div>
            <div className="noteBox">
              Live on-chain lookup is enabled for supported Payment Checks deployments on Polygon Amoy. Layout polish is still in progress on this explorer page.
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
  padding: 34px 18px 72px;
  background:
    radial-gradient(900px 480px at 12% 0%, rgba(255,255,255,0.92), rgba(255,255,255,0) 58%),
    radial-gradient(700px 420px at 100% 8%, rgba(228,233,240,0.72), rgba(255,255,255,0) 55%),
    linear-gradient(180deg, #f7f5ef 0%, #f3f1eb 100%);
  color: #1f2a37;
  font-family: "Kanit", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  position: relative;
}

.page:before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.045;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(0,0,0,0.07) 0.6px, transparent 0.8px),
    radial-gradient(circle at 80% 30%, rgba(0,0,0,0.05) 0.6px, transparent 0.8px),
    radial-gradient(circle at 40% 80%, rgba(0,0,0,0.05) 0.6px, transparent 0.8px);
  background-size: 18px 18px, 22px 22px, 20px 20px;
}

.shell {
  max-width: 1240px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

.header {
  margin-bottom: 24px;
}

.back {
  display: inline-block;
  color: #4c6a8b;
  text-decoration: none;
  font-weight: 500;
  font-size: 15px;
  margin-bottom: 14px;
}

.back:hover {
  color: #244b76;
}

.headerRow {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
}

.headerCopy {
  max-width: 860px;
}

.title {
  margin: 0;
  font-size: 54px;
  line-height: 0.98;
  letter-spacing: -0.03em;
  font-weight: 500;
  color: #182432;
}

.subTitle {
  margin-top: 12px;
  font-size: 18px;
  line-height: 1.25;
  color: #314459;
  font-weight: 500;
}

.sub {
  margin-top: 8px;
  max-width: 760px;
  color: rgba(49, 68, 89, 0.78);
  font-size: 15px;
  line-height: 1.5;
  font-weight: 400;
}

.headerBadges {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.metaBadge,
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.08em;
  font-weight: 500;
  text-transform: uppercase;
}

.metaBadge {
  border: 1px solid rgba(105, 128, 153, 0.18);
  background: rgba(255,255,255,0.56);
  color: #4f667f;
  box-shadow: 0 10px 28px rgba(70, 86, 110, 0.06);
}

.pill {
  border: 1px solid rgba(33, 40, 48, 0.08);
  background: rgba(255,255,255,0.72);
  color: #324152;
  box-shadow: 0 10px 28px rgba(70, 86, 110, 0.06);
}

.pill.active {
  border-color: rgba(40, 158, 94, 0.22);
  background: rgba(231, 247, 238, 0.92);
  color: #137546;
}

.pill.redeemed {
  border-color: rgba(70, 122, 215, 0.20);
  background: rgba(233, 240, 255, 0.92);
  color: #2958b9;
}

.pill.void {
  border-color: rgba(214, 90, 90, 0.20);
  background: rgba(255, 237, 237, 0.92);
  color: #b03838;
}

.pill.unknown {
  border-color: rgba(120, 134, 156, 0.18);
  background: rgba(241, 244, 247, 0.92);
  color: #5b6c7f;
}

.heroGrid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 420px);
  gap: 22px;
  align-items: start;
}

.visualCard,
.detailsCard,
.infoCard {
  border-radius: 24px;
  border: 1px solid rgba(120, 130, 146, 0.12);
  background: rgba(255,255,255,0.72);
  box-shadow:
    0 16px 40px rgba(54, 66, 83, 0.06),
    inset 0 1px 0 rgba(255,255,255,0.65);
  backdrop-filter: blur(10px);
}

.visualCardInner {
  padding: 20px;
}

.visualLabel {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #688099;
  font-weight: 500;
  margin-bottom: 14px;
}

.checkWrap {
  border-radius: 20px;
  padding: 18px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.9), rgba(248,246,241,0.9)),
    rgba(255,255,255,0.9);
  border: 1px solid rgba(122, 136, 153, 0.10);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.75),
    0 8px 22px rgba(78, 91, 110, 0.06);
}

.checkBox {
  position: relative;
  width: 100%;
}

.checkImg {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 16px;
  user-select: none;
  -webkit-user-drag: none;
}

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

.detailsCard,
.infoCard {
  padding: 20px;
}

.cardTitle {
  font-size: 18px;
  line-height: 1.2;
  color: #1f2a37;
  font-weight: 500;
  margin-bottom: 16px;
}

.fieldStack {
  display: grid;
  gap: 12px;
}

.field {
  border-radius: 16px;
  padding: 13px 14px;
  background: rgba(247, 245, 240, 0.84);
  border: 1px solid rgba(117, 129, 146, 0.10);
}

.fieldLabel {
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6f849a;
  font-weight: 500;
  margin-bottom: 7px;
}

.fieldValue {
  color: #203041;
  font-size: 15px;
  line-height: 1.45;
  font-weight: 400;
  word-break: break-word;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.actionRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.actionBtn {
  appearance: none;
  border: 1px solid rgba(55, 101, 164, 0.14);
  background: rgba(52, 112, 191, 0.08);
  color: #1d5a97;
  border-radius: 999px;
  min-height: 40px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  font-family: inherit;
}

.actionBtn:hover {
  background: rgba(52, 112, 191, 0.12);
}

.subtleBtn {
  background: rgba(255,255,255,0.78);
  color: #364a5f;
  border-color: rgba(110, 127, 146, 0.12);
}

.copiedBtn {
  border-color: rgba(40, 158, 94, 0.20);
  background: rgba(231, 247, 238, 0.92);
  color: #137546;
}

.supportGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 20px;
}

.supportGrid.single {
  grid-template-columns: minmax(0, 480px);
}

.txStack,
.stateStack {
  display: grid;
  gap: 12px;
}

.txRow {
  border-radius: 16px;
  padding: 13px 14px;
  background: rgba(247, 245, 240, 0.84);
  border: 1px solid rgba(117, 129, 146, 0.10);
}

.txLabel {
  font-size: 11px;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6f849a;
  font-weight: 500;
  margin-bottom: 7px;
}

.hashLink {
  color: #1d5a97;
  text-decoration: none;
  font-size: 13px;
  line-height: 1.5;
  display: block;
  word-break: break-all;
}

.hashLink:hover {
  text-decoration: underline;
}

.noteBox,
.emptyState {
  border-radius: 16px;
  padding: 14px;
  background: rgba(247, 245, 240, 0.84);
  border: 1px solid rgba(117, 129, 146, 0.10);
  color: #314459;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
}

@media (max-width: 1100px) {
  .heroGrid {
    grid-template-columns: 1fr;
  }

  .supportGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page {
    padding: 24px 14px 52px;
  }

  .headerRow {
    flex-direction: column;
    align-items: flex-start;
  }

  .title {
    font-size: 42px;
  }

  .subTitle {
    font-size: 17px;
  }

  .visualCardInner,
  .detailsCard,
  .infoCard {
    padding: 16px;
  }

  .checkWrap {
    padding: 12px;
  }
}

@media (max-width: 520px) {
  .title {
    font-size: 36px;
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
