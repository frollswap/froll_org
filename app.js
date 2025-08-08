/* ============================================================
   FROLL Dice – app.js (VIC)
   Giao diện web: tiếng Anh (như yêu cầu)
   Chú thích code: tiếng Việt (để dễ bảo trì)
   ============================================================ */

/** ===================== [MỤC 1] CẤU HÌNH CHUNG ===================== **/
const CONFIG = {
  // --- Thông số mạng VIC ---
  chainIdHex: '0x58',                 // 88 (hex)
  chainIdDec: 88,
  chainName: 'Viction',
  rpcUrl: 'https://rpc.viction.xyz',
  blockExplorer: 'https://vicscan.xyz',

  // --- Địa chỉ hợp đồng ---
  FROLL: '0xB4d562A8f811CE7F134a1982992Bd153902290BC', // Token FROLL (VIC)
  DICE:  '0x85A12591d3BA2A7148d18e9Ca44E0D778e458906', // Hợp đồng FrollDice

  // --- Tham số DApp ---
  minMinBet: '0.001',      // Min Bet tối thiểu 0.001 FROLL (phù hợp require trong contract)
  logsLookbackBlocks: 5000 // Quét log event gần đây để lấy "ván gần nhất" khi vào trang
};

/** ===================== [MỤC 2] ABI TỐI THIỂU ===================== **/
// ERC20
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)'
];

// FrollDice (theo hợp đồng bạn gửi)
const DICE_ABI = [
  'function selectTable(uint256 _minBet) external',
  'function play(uint256 amount, bool guessEven) external',
  'function withdraw(uint256 amount) external',
  'function getBalance() external view returns (uint256)',
  'function playerTable(address) external view returns (uint256 minBet, uint256 maxBet)',
  'event Played(address indexed player, uint256 amount, bool guessEven, bool resultEven, bool win)'
];

/** ===================== [MỤC 3] BIẾN TRẠNG THÁI ===================== **/
let providerRW;     // Provider read-write (ví người dùng)
let providerRO;     // Provider read-only (RPC)
let signer;         // Ký giao dịch
let user;           // Địa chỉ ví
let froll;          // Contract ERC20 FROLL
let dice;           // Contract FrollDice
let frollDecimals = 18;

let currentSide = 'even'; // 'even' hoặc 'odd'
let currentTable = { min: null, max: null }; // Wei
let lastRound = null; // Lưu ván gần nhất của người dùng (side/amount/minBet/txHash)

/** ===================== [MỤC 4] TIỆN ÍCH CHUNG ===================== **/
const $ = (id) => document.getElementById(id);
const format = (v, digits = 4) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });

const toWei = (numStr, decimals = 18) =>
  ethers.utils.parseUnits(String(numStr || '0'), decimals);

const fromWei = (wei, decimals = 18, digits = 4) => {
  try { return format(ethers.utils.formatUnits(wei || 0, decimals), digits); }
  catch { return '0'; }
};

function setStatus(msg) { $('tx-status').textContent = msg || ''; }
function short(s) { return s ? s.slice(0, 6) + '…' + s.slice(-4) : '—'; }

/** ---- Lưu/phục hồi ván gần nhất & minBet người dùng ---- **/
function saveLastRound(obj) { try { localStorage.setItem('froll_dice_last_round', JSON.stringify(obj)); } catch {} }
function loadLastRound() { try { const s = localStorage.getItem('froll_dice_last_round'); return s ? JSON.parse(s) : null; } catch { return null; } }

function saveLastTableMin(min) { try { localStorage.setItem('froll_dice_last_min', String(min)); } catch {} }
function loadLastTableMin() { try { return localStorage.getItem('froll_dice_last_min'); } catch { return null; } }

/** ===================== [MỤC 5] HIỆU ỨNG BÁT XÓC & 5 KIỂU MỞ BÁT ===================== **/
// --- Điều khiển hiệu ứng xóc bát (CSS) ---
function startShake() { $('bowl').classList.add('shaking'); }
function stopShake()  { $('bowl').classList.remove('shaking'); }

// --- Chọn biến thể hiển thị dựa vào txHash (ổn định giữa các máy) ---
function variantFromHash(txHash, mod) {
  if (!txHash) return 0;
  try {
    const last = txHash.slice(-4);
    const n = parseInt(last, 16);
    return n % mod;
  } catch { return 0; }
}

// --- Vẽ 4 đồng theo 5 biến thể (3 chẵn: 0/2/4 đỏ; 2 lẻ: 1/3 đỏ) ---
function renderCoins({ parityEven, txHash }) {
  const coinsEl = $('coins');
  // Xóa lớp/layout cũ
  coinsEl.classList.remove('hidden', 'layout-even-0', 'layout-even-2a', 'layout-even-4', 'layout-odd-1', 'layout-odd-3a');
  coinsEl.innerHTML = '';

  if (parityEven) {
    const layouts = ['layout-even-0', 'layout-even-2a', 'layout-even-4'];
    const idx = variantFromHash(txHash, layouts.length);
    const cls = layouts[idx];
    coinsEl.classList.add(cls);

    const redsMap = { 'layout-even-0': 0, 'layout-even-2a': 2, 'layout-even-4': 4 };
    const reds = redsMap[cls];
    for (let i = 0; i < 4; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin ' + (i < reds ? 'red' : 'white');
      coinsEl.appendChild(coin);
    }
  } else {
    const layouts = ['layout-odd-1', 'layout-3a' /* alias */, 'layout-odd-3a'];
    // Đảm bảo dùng đúng class tồn tại: 'layout-odd-1', 'layout-odd-3a'
    const fixed = ['layout-odd-1', 'layout-odd-3a'];
    const idx = variantFromHash(txHash, fixed.length);
    const cls = fixed[idx];
    coinsEl.classList.add(cls);

    const redsMap = { 'layout-odd-1': 1, 'layout-odd-3a': 3 };
    const reds = redsMap[cls];
    for (let i = 0; i < 4; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin ' + (i < reds ? 'red' : 'white');
      coinsEl.appendChild(coin);
    }
  }
}

/** ===================== [MỤC 6] HIỂN THỊ KẾT QUẢ & GIỚI HẠN BÀN ===================== **/
function showResult({ resultEven, win, txHash }) {
  $('last-outcome').textContent = (resultEven === null || resultEven === undefined) ? '—' : (resultEven ? 'Even' : 'Odd');
  $('last-payout').textContent  = (win === null || win === undefined) ? '—' : (win ? 'Win' : 'Lose');
  $('last-tx').textContent      = txHash || '—';
  if (txHash) {
    const el = $('last-tx');
    el.title = txHash;
    el.onclick = () => window.open(`${CONFIG.blockExplorer}/tx/${txHash}`, '_blank');
    el.style.cursor = 'pointer';
  }
  renderCoins({ parityEven: !!resultEven, txHash });
}

function showTable(minWei, maxWei) {
  if (!minWei || !maxWei) {
    $('current-table').textContent = 'Not set';
    $('limit-min').textContent = '—';
    $('limit-max').textContent = '—';
    currentTable = { min: null, max: null };
    return;
  }
  const minF = fromWei(minWei, frollDecimals);
  const maxF = fromWei(maxWei, frollDecimals);
  $('current-table').textContent = `${minF} – ${maxF} FROLL`;
  $('limit-min').textContent = minF;
  $('limit-max').textContent = maxF;
  currentTable = { min: minWei, max: maxWei };
}

/** ===================== [MỤC 7] ĐỌC DỮ LIỆU CHUẨN BỊ UI ===================== **/
async function refreshBalances() {
  if (!user || !froll || !providerRW) return;
  const [vic, fr, pool] = await Promise.all([
    providerRW.getBalance(user),
    froll.balanceOf(user),
    froll.balanceOf(CONFIG.DICE),
  ]);
  $('vic-balance').textContent   = fromWei(vic, 18);
  $('froll-balance').textContent = fromWei(fr, frollDecimals);
  $('pool-balance').textContent  = fromWei(pool, frollDecimals);
}

async function refreshUserTable() {
  if (!user || !dice) return;
  const t = await dice.playerTable(user);
  const [min, max] = t;
  if (min.gt(0)) showTable(min, max);
}

/** --- Lấy ván gần nhất toàn hợp đồng để “mở bát” khi vào trang --- **/
async function showLatestContractRound() {
  try {
    const ro = providerRO || new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
    const current = await ro.getBlockNumber();
    const from = Math.max(current - CONFIG.logsLookbackBlocks, 0);

    const iface = new ethers.utils.Interface(DICE_ABI);
    const topic0 = iface.getEventTopic('Played');
    const logs = await ro.getLogs({
      address: CONFIG.DICE,
      fromBlock: from,
      toBlock: current,
      topics: [topic0]
    });

    if (!logs.length) {
      // Không có ván nào gần đây: mặc định hiện chẵn (để bát mở)
      showResult({ resultEven: true, win: null, txHash: null });
      return;
    }

    const last = logs[logs.length - 1];
    const parsed = iface.parseLog(last);
    const resultEven = parsed.args.resultEven;
    showResult({ resultEven, win: null, txHash: last.transactionHash });
  } catch (e) {
    console.error('showLatestContractRound error:', e);
    showResult({ resultEven: true, win: null, txHash: null });
  }
}

/** ===================== [MỤC 8] KẾT NỐI VÍ & SỰ KIỆN MẠNG ===================== **/
async function connectWallet() {
  if (!window.ethereum) {
    alert('No Web3 wallet detected. Please install MetaMask or Viction wallet.');
    return;
  }

  providerRW = new ethers.providers.Web3Provider(window.ethereum, 'any');
  providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);

  try {
    // 1) Yêu cầu quyền truy cập tài khoản
    await providerRW.send('eth_requestAccounts', []);

    // 2) Kiểm tra/Chuyển mạng VIC (nếu chưa)
    const currentChainId = await providerRW.send('eth_chainId', []);
    if (currentChainId !== CONFIG.chainIdHex) {
      try {
        await providerRW.send('wallet_switchEthereumChain', [{ chainId: CONFIG.chainIdHex }]);
      } catch (switchError) {
        if (switchError.code === 4902) {
          // 2a) Chưa có mạng -> Add chain
          await providerRW.send('wallet_addEthereumChain', [{
            chainId: CONFIG.chainIdHex,
            chainName: CONFIG.chainName,
            nativeCurrency: { name: 'VIC', symbol: 'VIC', decimals: 18 },
            rpcUrls: [CONFIG.rpcUrl],
            blockExplorerUrls: [CONFIG.blockExplorer]
          }]);
        } else {
          throw switchError;
        }
      }
    }

    // 3) Lấy signer & địa chỉ
    signer = providerRW.getSigner();
    user = await signer.getAddress();

    // 4) Khởi tạo contracts
    froll = new ethers.Contract(CONFIG.FROLL, ERC20_ABI, signer);
    dice  = new ethers.Contract(CONFIG.DICE,  DICE_ABI,  signer);
    try { frollDecimals = await froll.decimals(); } catch {}

    // 5) Cập nhật UI
    $('btn-connect').classList.add('hidden');
    $('wallet-info').classList.remove('hidden');
    $('addr-short').textContent = short(user);

    // 6) Nạp dữ liệu
    await Promise.all([refreshBalances(), refreshUserTable()]);
    setStatus('Wallet connected.');

    // 7) Lắng nghe thay đổi tài khoản/mạng để cập nhật UI kịp thời
    window.ethereum.on?.('accountsChanged', async (accs) => {
      if (!accs || !accs.length) { disconnectWallet(); return; }
      // Tải lại nhanh theo tài khoản mới
      user = accs[0];
      signer = providerRW.getSigner();
      $('addr-short').textContent = short(user);
      await Promise.all([refreshBalances(), refreshUserTable()]);
      setStatus('Account changed.');
    });

    window.ethereum.on?.('chainChanged', async (chainId) => {
      if (chainId !== CONFIG.chainIdHex) {
        setStatus('Wrong network. Please switch to VIC.');
      } else {
        setStatus('Network OK (VIC).');
        await Promise.all([refreshBalances(), refreshUserTable()]);
      }
    });
  } catch (err) {
    console.error('connectWallet error:', err);
    alert('Wallet connection failed. Please try again.');
  }
}

// Ngắt ví (UI). Lưu ý: không thể “ngắt” MetaMask bằng code, chỉ reset UI.
function disconnectWallet() {
  user = null;
  signer = null;
  providerRW = null;

  $('btn-connect').classList.remove('hidden');
  $('wallet-info').classList.add('hidden');
  $('addr-short').textContent = '—';
  showTable(null, null);
  setStatus('Disconnected.');
}

/** ===================== [MỤC 9] TÁC VỤ BÀN: CHỌN BÀN (selectTable) ===================== **/
function isGTE(numStr, minStr) {
  try {
    return ethers.utils.parseUnits(numStr, frollDecimals).gte(
      ethers.utils.parseUnits(minStr, frollDecimals)
    );
  } catch { return false; }
}

async function onSetTable() {
  if (!signer || !dice) return alert('Please connect wallet.');
  const minStr = $('minBet').value.trim();
  if (!minStr) return setStatus('Enter a min bet.');
  if (!isGTE(minStr, CONFIG.minMinBet)) {
    return setStatus(`Min Bet must be at least ${CONFIG.minMinBet} FROLL.`);
  }

  try {
    setStatus('Sending selectTable transaction...');
    const tx = await dice.selectTable(toWei(minStr, frollDecimals));
    await tx.wait(1);
    saveLastTableMin(minStr);
    await refreshUserTable(); // đọc lại min/max từ on-chain
    setStatus('Table set successfully.');
  } catch (e) {
    console.error('selectTable error:', e);
    setStatus(e.data?.message || e.error?.message || e.message || 'selectTable failed.');
  }
}

/** ===================== [MỤC 10] APPROVE SỐ TIỀN CƯỢC ===================== **/
async function onApprove() {
  if (!signer || !froll) return alert('Please connect wallet.');
  const amtStr = $('bet-amount').value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  if (!currentTable.min) return setStatus('Please set a table first.');
  const amountWei = toWei(amtStr, frollDecimals);

  // Kiểm tra trong khoảng min–max
  if (amountWei.lt(currentTable.min) || amountWei.gt(currentTable.max)) {
    return setStatus('Bet amount is out of range (min–max).');
  }

  try {
    setStatus('Sending approve...');
    const tx = await froll.approve(CONFIG.DICE, amountWei);
    await tx.wait(1);
    setStatus('Approve successful.');
    await refreshBalances();
  } catch (e) {
    console.error('approve error:', e);
    setStatus(e.data?.message || e.error?.message || e.message || 'Approve failed.');
  }
}

/** ===================== [MỤC 11] PLAY: GỬI CƯỢC, XÓC & MỞ BÁT THEO EVENT ===================== **/
async function onPlay() {
  if (!signer || !dice) return alert('Please connect wallet.');
  if (!currentTable.min) return setStatus('Please set a table first.');

  const amtStr = $('bet-amount').value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  const amountWei = toWei(amtStr, frollDecimals);

  // Kiểm tra min–max
  if (amountWei.lt(currentTable.min) || amountWei.gt(currentTable.max)) {
    return setStatus('Bet amount is out of range (min–max).');
  }

  // Kiểm tra pool >= 2x amount
  const pool = await froll.balanceOf(CONFIG.DICE);
  if (pool.lt(amountWei.mul(2))) {
    return setStatus('Contract pool is insufficient for 2× payout. Try a smaller amount.');
  }

  // Kiểm tra allowance
  const allowance = await froll.allowance(user, CONFIG.DICE);
  if (allowance.lt(amountWei)) {
    return setStatus('Insufficient allowance. Please click "Approve FROLL" first.');
  }

  // Bắt đầu xóc
  startShake();
  setStatus('Sending play transaction...');

  try {
    const guessEven = (currentSide === 'even');
    const tx = await dice.play(amountWei, guessEven);
    const receipt = await tx.wait(1);

    // Parse event Played trong receipt của chính giao dịch này
    const ev = receipt.logs
      .map(log => { try { return dice.interface.parseLog(log); } catch { return null; } })
      .filter(Boolean)
      .find(p => p.name === 'Played');

    let resultEven = null, win = null;
    if (ev) {
      resultEven = ev.args.resultEven;
      win = ev.args.win;
    } else {
      // Fallback: lấy lại receipt từ RPC (hiếm khi cần)
      const recAgain = await (providerRO || new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl)).getTransactionReceipt(tx.hash);
      if (recAgain) {
        for (const log of recAgain.logs) {
          try {
            const parsed = dice.interface.parseLog(log);
            if (parsed.name === 'Played') {
              resultEven = parsed.args.resultEven;
              win = parsed.args.win;
              break;
            }
          } catch {}
        }
      }
    }

    // Dừng xóc & mở bát đúng parity
    stopShake();
    showResult({ resultEven, win, txHash: tx.hash });

    // Lưu ván gần nhất để "Repeat"
    lastRound = {
      side: currentSide,
      amount: amtStr,
      minBet: fromWei(currentTable.min, frollDecimals),
      txHash: tx.hash
    };
    saveLastRound(lastRound);

    await refreshBalances();
    setStatus('Round completed.');
  } catch (e) {
    console.error('play error:', e);
    stopShake();
    setStatus(e.data?.message || e.error?.message || e.message || 'Play failed.');
  }
}

/** ===================== [MỤC 12] NÚT TIỆN ÍCH (CLEAR / HALF / DOUBLE / REPEAT) ===================== **/
function onClear() {
  $('bet-amount').value = '';
  setStatus('');
}
function onHalf() {
  const v = parseFloat($('bet-amount').value || '0');
  if (v <= 0) return;
  const half = Math.max(v / 2, Number(CONFIG.minMinBet));
  $('bet-amount').value = String(half);
}
function onDouble() {
  const v = parseFloat($('bet-amount').value || '0');
  const max = currentTable.max ? parseFloat(fromWei(currentTable.max, frollDecimals, 18)) : Infinity;
  if (v <= 0) {
    if (currentTable.min) $('bet-amount').value = fromWei(currentTable.min, frollDecimals, 18);
    return;
  }
  const doubled = Math.min(v * 2, max);
  $('bet-amount').value = String(doubled);
}
function onRepeat() {
  const saved = loadLastRound();
  if (!saved) return setStatus('No previous round to repeat.');
  currentSide = saved.side === 'odd' ? 'odd' : 'even';
  document.querySelectorAll('.btn.toggle').forEach(b => b.classList.remove('active'));
  (currentSide === 'even' ? $('btn-even') : $('btn-odd')).classList.add('active');
  $('bet-amount').value = saved.amount;
  setStatus('Repeated last round settings (side & amount).');
}

/** ===================== [MỤC 13] NÚT CHỌN CHẴN/LẺ & PHÍM TẮT ===================== **/
function bindSideButtons() {
  $('btn-even').addEventListener('click', () => {
    currentSide = 'even';
    $('btn-even').classList.add('active');
    $('btn-odd').classList.remove('active');
  });
  $('btn-odd').addEventListener('click', () => {
    currentSide = 'odd';
    $('btn-odd').classList.add('active');
    $('btn-even').classList.remove('active');
  });
}

function bindHotkeys() {
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'r' || e.key === 'R') onRepeat();
    if (e.key === 'c' || e.key === 'C') onClear();
    if (e.key === 'd' || e.key === 'D') onDouble();
    if (e.key === 'e' || e.key === 'E') { $('btn-even').click(); }
    if (e.key === 'o' || e.key === 'O') { $('btn-odd').click(); }
  });
}

/** ===================== [MỤC 14] KHỞI TẠO ỨNG DỤNG ===================== **/
async function init() {
  // Provider RO để đọc log khi chưa kết nối ví
  providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);

  // Hiển thị "ván gần nhất" khi vào trang (mở bát ngay)
  await showLatestContractRound();

  // Phục hồi ván trước
  lastRound = loadLastRound();

  // Gán sự kiện nút
  $('btn-connect').addEventListener('click', connectWallet);
  $('btn-disconnect').addEventListener('click', disconnectWallet);
  $('btn-set-table').addEventListener('click', onSetTable);
  $('btn-approve').addEventListener('click', onApprove);
  $('btn-play').addEventListener('click', onPlay);
  $('btn-clear').addEventListener('click', onClear);
  $('btn-half').addEventListener('click', onHalf);
  $('btn-double').addEventListener('click', onDouble);
  $('btn-repeat').addEventListener('click', onRepeat);

  bindSideButtons();
  bindHotkeys();

  // Tự điền lại minBet lần trước (nếu có)
  const minSaved = loadLastTableMin();
  if (minSaved) $('minBet').value = minSaved;

  setStatus('Ready.');
}

init();
