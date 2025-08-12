import "dotenv/config";
import { registerDomain } from "../app/register_pharos_domain"; // Nếu file này là TS thì sửa thành .ts khi build

async function main(): Promise<void> {
  const privKeys = process.env.PRIVATE_KEYS;

  if (!privKeys) {
    throw new Error("PRIVATE_KEYS is not set in environment variables");
  }

  console.log(` ${privKeys.split(",").length} wallets found in PRIVATE_KEYS`);

  // Chia chuỗi PRIVATE_KEYS thành mảng (cắt bỏ khoảng trắng 2 bên)
  const userWallets: string[] = privKeys.split(",").map((key) => key.trim());

  const promises: Promise<unknown>[] = [];

  for (const wallet of userWallets) {
    promises.push(registerDomain(wallet));
  }

  await Promise.allSettled(promises);
}

main().catch((err) => {
  console.error("Error in main:", err);
  process.exit(1);
});
