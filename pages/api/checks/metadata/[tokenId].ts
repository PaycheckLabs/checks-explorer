import type { NextApiRequest, NextApiResponse } from "next";
import serials from "../../../../data/testnet-serials.json";

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

function baseUrl(req: NextApiRequest): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers.host || "explorer.checks.xyz";
  return `${proto}://${host}`;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = Array.isArray(req.query.tokenId)
    ? req.query.tokenId[0]
    : req.query.tokenId;

  const tokenId = Number(raw);

  if (!Number.isFinite(tokenId) || tokenId <= 0) {
    return res.status(400).json({ error: "Invalid tokenId" });
  }

  const entries = Object.entries(
    serials as Record<string, SerialRecord>
  ) as Array<[string, SerialRecord]>;

  const hit = entries.find(([, r]) => r.tokenId === tokenId) || null;
  const serial = hit ? hit[0] : null;
  const record = hit ? hit[1] : null;

  const origin = baseUrl(req);
  const image = serial
    ? `${origin}/api/checks/image/${encodeURIComponent(serial)}`
    : `${origin}/api/checks/image/SMJ-4656RY-MA73`; // fallback to a valid example

  const external_url = serial
    ? `${origin}/testnet/${encodeURIComponent(serial)}`
    : `${origin}/`;

  res.setHeader("cache-control", "public, max-age=300");

  return res.status(200).json({
    name: `Checks Testnet #${tokenId}`,
    description:
      "Checks Protocol testnet metadata for Payment Checks v1 on Polygon Amoy (80002).",
    image,
    external_url,
    attributes: [
      { trait_type: "Network", value: record?.network ?? "Polygon Amoy" },
      { trait_type: "ChainId", value: record?.chainId ?? 80002 },
      { trait_type: "Serial", value: serial ?? "UNKNOWN" },
      ...(record?.contract
        ? [{ trait_type: "Contract", value: record.contract }]
        : []),
    ],
    properties: {
      serial,
      chainId: record?.chainId ?? 80002,
      contract: record?.contract ?? null,
      tokenId,
      mintTx: record?.mintTx ?? null,
      transferTx: record?.transferTx ?? null,
      redeemTx: record?.redeemTx ?? null,
      voidTx: record?.voidTx ?? null,
      claimableAt: record?.claimableAt ?? null,
    },
  });
}
