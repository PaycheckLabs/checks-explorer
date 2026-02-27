import type { GetServerSideProps } from "next";
import { normalizeSerial, isValidSerialFormat } from "../lib/serial";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const raw = String(ctx.params?.serial || "");
  const normalized = normalizeSerial(raw);

  if (!isValidSerialFormat(normalized)) return { notFound: true };

  return {
    redirect: { destination: `/testnet/${normalized}`, permanent: false },
  };
};

export default function SerialRedirect() {
  return null;
}
