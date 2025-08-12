import 'dotenv/config';
import { Contract, JsonRpcProvider, Wallet, ZeroAddress, ethers } from 'ethers';

// ==== ENV ====
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEYS = process.env.PRIVATE_KEYS;
const CONTROLLER = process.env.CONTROLLER;

if (!RPC_URL || !PRIVATE_KEYS || !CONTROLLER) {
  throw new Error('Missing env: RPC_URL / PRIVATE_KEYS / CONTROLLER');
}

// ==== ABI (kiểu ENS controller) ====
const ABI = [
  // view helpers
  'function available(string name) view returns (bool)',
  'function rentPrice(string name,uint256 duration) view returns (uint256)',

  // commit & register (anh cung cấp)
  'function makeCommitment(string name,address owner,uint256 duration,bytes32 secret,address resolver,bytes[] data,bool reverseRecord,uint16 ownerControlledFuses) view returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register(string name,address owner,uint256 duration,bytes32 secret,address resolver,bytes[] data,bool reverseRecord,uint16 ownerControlledFuses) payable'
] as const;

// ==== utils ====
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function randomLabel(len = 10, charset = 'abcdefghijklmnopqrstuvwxyz0123456789'): string {
  let s = '';
  for (let i = 0; i < len; i++) s += charset[Math.floor(Math.random() * charset.length)];
  return s;
}

// ==== main ====
export async function registerDomain(userWallet: string) {
  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(userWallet, provider);
  const ctl = new Contract(CONTROLLER as string, ABI, wallet);

  // --- cấu hình chạy ---
  const HOW_MANY: number = parseInt(process.argv[2] || '100', 10); // số lượng tên miền cần đăng ký
  const DURATION: bigint = 30n * 24n * 60n * 60n; // 1 tháng
  const RESOLVER: string = ZeroAddress;            // thay nếu có resolver của Pharos
  const DATA: readonly string[] = [];              // bytes[] record, để trống
  const REVERSE_RECORD = false;
  const FUSES: number = 0;                         // uint16
  const COMMIT_WAIT_MS = 65_000;                   // đợi >60s
  const LABEL_MIN = 6, LABEL_MAX = 10;

  // fallback giá nếu rentPrice() không khả dụng
  let PRICE_WEI_FALLBACK: bigint = ethers.parseEther('0.001');

  console.log('Owner:', wallet.address);

  for (let i = 0; i < HOW_MANY; i++) {
    const L = Math.floor(Math.random() * (LABEL_MAX - LABEL_MIN + 1)) + LABEL_MIN;
    const name = randomLabel(L);
    const secret = ethers.keccak256(ethers.randomBytes(32));

    try {
      // 1) optional check available()
      let isAvailable = true;
      try {
        if (typeof ctl.available === 'function') {
          isAvailable = await ctl.available(name);
        }
      } catch {
        // nếu controller không có available(), bỏ qua
      }
      if (!isAvailable) {
        console.log(`⏭️ ${i} - ${name} đã bị lấy, skip`);
        continue;
      }

      // 2) makeCommitment (call)
      if (typeof ctl.makeCommitment !== 'function') {
        console.error(`❌ Controller does not support makeCommitment, skipping ${name}`);
        continue;
      }
      const commitment: string = await ctl.makeCommitment(
        name,
        wallet.address,
        DURATION,
        secret,
        RESOLVER,
        DATA,
        REVERSE_RECORD,
        FUSES
      );

      // 3) commit(tx)
      if (typeof ctl.commit !== 'function') {
        console.error(`❌ Controller does not support commit, skipping ${name}`);
        continue;
      }
      const txc = await ctl.commit(commitment);
      console.log(`📝  ${i} - Commit ${name} -> ${txc.hash}`);
      await txc.wait();

      // 4) đợi >= 60s
      console.log(`⏳ chờ ${COMMIT_WAIT_MS / 1000}s...`);
      await sleep(COMMIT_WAIT_MS);

      // 5) giá thuê
      let priceWei: bigint = PRICE_WEI_FALLBACK;
      try {
        // một số controller trả về uint256 thẳng; một số trả struct {base,premium}
        let p: unknown;
        if (typeof ctl.rentPrice === 'function') {
          p = await ctl.rentPrice(name, DURATION);
          if (typeof p === 'bigint') {
            priceWei = p;
          } else if (Array.isArray(p) && p.length >= 2) {
            const base = p[0] as bigint;
            const prem = p[1] as bigint;
            priceWei = base + prem;
          }
        }
      } catch {
        // không có rentPrice -> dùng fallback
      }

      // 6) register(tx)
      if (typeof ctl.register === 'function') {
        const txr = await ctl.register(
          name,
          wallet.address,
          DURATION,
          secret,
          RESOLVER,
          DATA,
          REVERSE_RECORD,
          FUSES,
          { value: priceWei }
        );
        console.log(`🚀  ${i} -  Register ${name} -> ${txr.hash}`);
        const rc = await txr.wait();
        console.log(`✅ Done ${name} in ${rc!.transactionHash}`);
      } else {
        console.error(`❌ Controller does not support register, skipping ${name}`);
        continue;
      }

      // throttle nhẹ
      await sleep(800);
    } catch (e: any) {
      const reason = e?.reason || e?.shortMessage || e?.message || String(e);
      console.error(`❌ ${name} failed:`, reason);
    }
  }
}

