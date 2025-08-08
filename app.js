/* =========================
   FROLL Dice – app.js (VIC)
   ========================= */

/** --------- CONFIG --------- **/
const CONFIG = {
  // VIC mainnet (adjust if your endpoint differs)
  chainIdHex: '0x58', // 88
  chainIdDec: 88,
  chainName: 'Viction',
  rpcUrl: 'https://rpc.viction.xyz',
  blockExplorer: 'https://vicscan.xyz',

  // Contracts
  FROLL: '0xB4d562A8f811CE7F134a1982992Bd153902290BC', // FROLL on VIC
  DICE:  '0x85A12591d3BA2A7148d18e9Ca44E0D778e458906', // FrollDice

  // UI / logic
  minMinBet: '0.001', // minimum 0.001 FROLL
  logsLookbackBlocks: 5000, // scan latest N blocks to show last round on load
};

/** ----- Minimal ABIs ----- **/
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)'
];

// FrollDice ABI (from your contract)
const DICE_ABI = [
  'function selectTable(uint256 _minBet) external',
  'function play(uint256 amount, bool guessEven) external',
  'function withdraw(uint256 amount) external',
  'function getBalance() external view returns (uint256)',
  'function playerTable(address) external view returns (uint256 minBet, uint256 maxBet)',

  // event Played(address indexed player, uint256 amount, bool guessEven, bool resultEven, bool win)
  'event Played(address indexed player, uint256 amount, bool guessEven, bool resultEven, bool win)'
];

/** ----- State ----- **/
let providerRW;     // read–write (wallet)
let providerRO;     // read–only RPC
let signer;         // wallet signer
let user;           // user address
let froll;          // ERC20 contract
let dice;           // FrollDice contract
let frollDecimals = 18;

let currentSide = 'even'; // 'even' or 'odd'
let currentTable = { min: null, max: null };
let lastRound = null;     // {side, amount, minBet, txHash}

/** ----- Helpers ----- **/
const $ = (id) => document.getElementById(id);
const format = (v, digits = 4) => Number(v).toLocaleString(undefined, {maximumFractionDigits: digits});

/** Convert FROLL (string/number) <-> wei (BigNumber) */
const toWei = (ethStr, decimals = 18) => {
  return ethers.utils.parseUnits(String(ethStr || '0'), decimals);
};
const fromWei = (wei, decimals = 18, digits = 4) => {
  try { return format(ethers.utils.formatUnits(wei || 0, decimals), digits); }
  catch { return '0'; }
};

/** Seeded variant from txHash (deterministic small int) */
function variantFromHash(txHash, mod) {
  if (!txHash) return 0;
  try {
    // Take last 4 hex chars -> int
    const last = txHash.slice(-4);
    const n = parseInt(last, 16);
    return n % mod;
  } catch { return 0; }
}

/** Render coins for 5 variants (3 even, 2 odd) */
function renderCoins({ parityEven, txHash }) {
  const coinsEl = $('coins');

  // Clear previous
  coinsEl.classList.remove('hidden', 'layout-even-0', 'layout-even-2a', 'layout-even-4', 'layout-odd-1', 'layout-odd-3a');
  coinsEl.innerHTML = '';

  // Choose layout by parity + seed
  if (parityEven) {
    const evenLayouts = ['layout-even-0', 'layout-even-2a', 'layout-even-4'];
    const idx = variantFromHash(txHash, evenLayouts.length);
    coinsEl.classList.add(evenLayouts[idx]);

    // Decide # of red coins: 0, 2, or 4 by layout
    const redsByLayout = { 'layout-even-0': 0, 'layout-even-2a': 2, 'layout-even-4': 4 };
    const reds = redsByLayout[evenLayouts[idx]];
    for (let i = 0; i < 4; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin ' + (i < reds ? 'red' : 'white');
      coinsEl.appendChild(coin);
    }
  } else {
    const oddLayouts = ['layout-odd-1', 'layout-odd-3a'];
    const idx = variantFromHash(txHash, oddLayouts.length);
    coinsEl.classList.add(oddLayouts[idx]);

    // Decide # of red coins: 1 or 3 by layout
    const redsByLayout = { 'layout-odd-1': 1, 'layout-odd-3a': 3 };
    const reds = redsByLayout[oddLayouts[idx]];
    for (let i = 0; i < 4; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin ' + (i < reds ? 'red' : 'white');
      coinsEl.appendChild(coin);
    }
  }
}

/** Bowl animation control */
function startShake() { $('bowl').classList.add('shaking'); }
function stopShake()  { $('bowl').classList.remove('shaking'); }

/** Status message */
function setStatus(msg) { $('tx-status').textContent = msg || ''; }

/** Shorten address or hash */
function short(s) { return s ? s.slice(0, 6) + '…' + s.slice(-4) : '—'; }

/** Save/load last round (for Repeat) */
function saveLastRound(obj) {
  try {
    localStorage.setItem('froll_dice_last_round', JSON.stringify(obj));
  } catch {}
}
function loadLastRound() {
  try {
    const s = localStorage.getItem('froll_dice_last_round');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

/** Save/load last table minBet */
function saveLastTableMin(min) {
  try { localStorage.setItem('froll_dice_last_min', String(min)); } catch {}
}
function loadLastTableMin() {
  try { return localStorage.getItem('froll_dice_last_min'); } catch { return null; }
}

/** Update UI table limits */
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

/** Update balances */
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

/** Read user table from contract */
async function refreshUserTable() {
  if (!user || !dice) return;
  const t = await dice.playerTable(user);
  const [min, max] = t; // struct returns [minBet, maxBet]
  if (min.gt(0)) showTable(min, max);
}

/** Set latest result UI + coins */
function showResult({ resultEven, win, txHash }) {
  $('last-outcome').textContent = resultEven ? 'Even' : 'Odd';
  $('last-payout').textContent  = win == null ? '—' : (win ? 'Win' : 'Lose');
  $('last-tx').textContent      = txHash || '—';
  if (txHash) {
    const el = $('last-tx');
    el.title = txHash;
    el.onclick = () => window.open(`${CONFIG.blockExplorer}/tx/${txHash}`, '_blank');
    el.style.cursor = 'pointer';
  }
  renderCoins({ parityEven: !!resultEven, txHash });
}

/** Query latest Played event (global) to display on load */
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
      topics: [topic0] // no filter by player, global latest
    });

    if (!logs.length) {
      // No recent rounds; show neutral 2-red (even layout) default
      showResult({ resultEven: true, win: null, txHash: null });
      return;
    }

    const last = logs[logs.length - 1];
    const parsed = iface.parseLog(last);

    const resultEven = parsed.args.resultEven;
    const win = null; // global latest; win/lose not meaningful for current user
    const txHash = last.transactionHash;

    showResult({ resultEven, win, txHash });
  } catch (e) {
    console.error('showLatestContractRound error:', e);
    showResult({ resultEven: true, win: null, txHash: null });
  }
}

/** Wallet connect & chain switch */
async function ensureChain() {
  const chainId = await providerRW.send('eth_chainId', []);
  if (chainId !== CONFIG.chainIdHex) {
    try {
      await providerRW.send('wallet_switchEthereumChain', [{ chainId: CONFIG.chainIdHex }]);
    } catch (switchErr) {
      // Add chain if not available
      if (switchErr.code === 4902 || (switchErr.data && switchErr.data.originalError && switchErr.data.originalError.code === 4902)) {
        await providerRW.send('wallet_addEthereumChain', [{
          chainId: CONFIG.chainIdHex,
          chainName: CONFIG.chainName,
          nativeCurrency: { name: 'VIC', symbol: 'VIC', decimals: 18 },
          rpcUrls: [CONFIG.rpcUrl],
          blockExplorerUrls: [CONFIG.blockExplorer]
        }]);
      } else {
        throw switchErr;
      }
    }
  }
}

/** Connect wallet */
async function connectWallet() {
  if (!window.ethereum) {
    alert('No Web3 wallet found. Please install MetaMask or Viction wallet.');
    return;
  }
  providerRW = new ethers.providers.Web3Provider(window.ethereum, 'any');
  await ensureChain();
  await providerRW.send('eth_requestAccounts', []);
  signer = providerRW.getSigner();
  user = await signer.getAddress();

  // Init contracts
  providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
  froll = new ethers.Contract(CONFIG.FROLL, ERC20_ABI, signer);
  dice  = new ethers.Contract(CONFIG.DICE,  DICE_ABI,  signer);
  try {
    frollDecimals = await froll.decimals();
  } catch {} // default 18

  // UI
  $('btn-connect').classList.add('hidden');
  $('wallet-info').classList.remove('hidden');
  $('addr-short').textContent = short(user);

  // Data
  await Promise.all([refreshBalances(), refreshUserTable()]);
  setStatus('Wallet connected.');
}

/** Disconnect (UI only; wallets can’t be programmatically disconnected) */
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

/** Validate number string >= threshold */
function isGTE(numStr, minStr) {
  try {
    return ethers.utils.parseUnits(numStr, frollDecimals).gte(ethers.utils.parseUnits(minStr, frollDecimals));
  } catch { return false; }
}

/** Set Table */
async function onSetTable() {
  if (!signer || !dice) return alert('Please connect wallet.');
  const minStr = $('minBet').value.trim();
  if (!minStr) return setStatus('Enter a min bet.');
  if (!isGTE(minStr, CONFIG.minMinBet)) return setStatus(`Min Bet must be at least ${CONFIG.minMinBet} FROLL.`);

  try {
    setStatus('Sending selectTable transaction...');
    const tx = await dice.selectTable(toWei(minStr, frollDecimals));
    await tx.wait(1);
    saveLastTableMin(minStr);
    await refreshUserTable();
    setStatus('Table set successfully.');
  } catch (e) {
    console.error('selectTable error:', e);
    setStatus(e.data?.message || e.error?.message || e.message || 'selectTable failed.');
  }
}

/** Approve exact amount */
async function onApprove() {
  if (!signer || !froll) return alert('Please connect wallet.');
  const amtStr = $('bet-amount').value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  if (!currentTable.min) return setStatus('Please set a table first.');
  const amountWei = toWei(amtStr, frollDecimals);

  // Bounds
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

/** Play */
async function onPlay() {
  if (!signer || !dice) return alert('Please connect wallet.');
  if (!currentTable.min) return setStatus('Please set a table first.');

  const amtStr = $('bet-amount').value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  const amountWei = toWei(amtStr, frollDecimals);

  // Bounds
  if (amountWei.lt(currentTable.min) || amountWei.gt(currentTable.max)) {
    return setStatus('Bet amount is out of range (min–max).');
  }

  // Pool check: pool >= 2 * amount
  const pool = await froll.balanceOf(CONFIG.DICE);
  if (pool.lt(amountWei.mul(2))) {
    return setStatus('Contract pool is insufficient for 2× payout. Try a smaller amount.');
  }

  // Allowance check
  const allowance = await froll.allowance(user, CONFIG.DICE);
  if (allowance.lt(amountWei)) {
    return setStatus('Insufficient allowance. Please click "Approve FROLL" first.');
  }

  // Start shaking animation
  startShake();
  setStatus('Sending play transaction...');

  try {
    const guessEven = (currentSide === 'even');
    const tx = await dice.play(amountWei, guessEven);
    const receipt = await tx.wait(1);

    // Parse Played event for *this* tx
    const ev = receipt.logs
      .map(log => {
        try {
          return dice.interface.parseLog(log);
        } catch { return null; }
      })
      .filter(Boolean)
      .find(p => p.name === 'Played');

    let resultEven = null, win = null;
    if (ev) {
      resultEven = ev.args.resultEven;
      win = ev.args.win;
    } else {
      // Fallback: query by txHash
      const ro = providerRO || new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
      const recAgain = await ro.getTransactionReceipt(tx.hash);
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

    // Stop shaking & reveal coins
    stopShake();
    showResult({ resultEven, win, txHash: tx.hash });

    // Save last round for "Repeat"
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

/** Convenient buttons */
function onClear() {
  $('bet-amount').value = '';
  setStatus('');
}
function onHalf() {
  const v = parseFloat($('bet-amount').value || '0');
  if (v <= 0) return;
  $('bet-amount').value = Math.max(v / 2, Number(CONFIG.minMinBet)).toString();
}
function onDouble() {
  const v = parseFloat($('bet-amount').value || '0');
  const max = currentTable.max ? parseFloat(fromWei(currentTable.max, frollDecimals, 18)) : Infinity;
  if (v <= 0) {
    // if no amount, suggest min
    if (currentTable.min) $('bet-amount').value = fromWei(currentTable.min, frollDecimals, 18);
    return;
  }
  const doubled = Math.min(v * 2, max);
  $('bet-amount').value = String(doubled);
}
function onRepeat() {
  const saved = loadLastRound();
  if (!saved) return setStatus('No previous round to repeat.');
  // Side
  currentSide = saved.side === 'odd' ? 'odd' : 'even';
  document.querySelectorAll('.btn.toggle').forEach(b => b.classList.remove('active'));
  (currentSide === 'even' ? $('btn-even') : $('btn-odd')).classList.add('active');
  // Amount
  $('bet-amount').value = saved.amount;
  setStatus('Repeated last round settings (side & amount).');
}

/** Toggle side buttons */
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

/** Keyboard shortcuts */
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

/** Init */
async function init() {
  // Read-only provider for logs even before connect
  providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);

  // Latest contract round on load
  await showLatestContractRound();

  // Rehydrate last round
  lastRound = loadLastRound();

  // Bind buttons
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

  // If user had a last minBet, prefill
  const minSaved = loadLastTableMin();
  if (minSaved) $('minBet').value = minSaved;

  setStatus('Ready.');
}

init();
