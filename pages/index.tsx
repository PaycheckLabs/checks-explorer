import Link from "next/link";

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, lineHeight: 1.4 }}>
      <h1 style={{ margin: 0 }}>Checks Explorer</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Testnet serial routes will live under <code>/testnet/&lt;serial&gt;</code>.
      </p>

      <p style={{ marginTop: 16 }}>
        Example:{" "}
        <Link href="/testnet/SMJ-4656RY-MA73">
          /testnet/SMJ-4656RY-MA73
        </Link>
      </p>
    </main>
  );
}
