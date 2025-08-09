/* ============================================
   FROLL.org – Dice Game (Even/Odd)
   Safe frontend with preflight checks
   Chain: Viction (chainId = 88)
   Last update: 2025-08-09
============================================ */

const CONFIG = {
  CHAIN_ID: 88,
  RPC_RO: 'https://rpc.viction.xyz',
  FROLL:  '0xB4d562A8f811CE7F134a1982992Bd153902290BC', // FROLL on VIC
  DICE:   '0x85A12591d3BA2A7148d18e9Ca44E0D778e458906', // FrollDice
  // Ngưỡng min nhập bàn (để tránh nhập 0): 1 wei ~ 0.000000000000000001
  minMinBet: '0.000000000000000001',
  // Gas VIC tối thiểu (ước lượng rất thấp cho ví có gas): 0.00002 VIC
  minVicGas: '0.00002',
};

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const DICE_ABI = [
  'function selectTable(uint256 minBet) external',
  'function play(uint256 amount, bool guessEven) external',
  'function playerTable(address) view returns (uint256 minBet, uint256 maxBet)',
  'event Played(address indexed player, uint256 amount, bool guessEven, bool resultEven, bool win, uint256 payout)',
];

// Web3 vars
let providerRO, providerRW, signer, user;
let froll, dice;
let frollDecimals = 18;

// UI state
let currentTable = { min: null, max: null };
let currentSide = 'even'; // 'even' | 'odd'
let busy = false;

/* ---------------- DOM helpers ---------------- */
const $ = (id) => document.getElementById(id);

function setBusy(v) {
  busy = !!v;
  const btns = document.querySelectorAll('button');
  btns.forEach(b => {
    if (v) {
      b.disabled = true;
      b.classList.add('btn-disabled');
    } else {
      if (b.dataset.alwaysdisabled === 'true') return;
      b.disabled = false;
      b.classList.remove('btn-disabled');
    }
  });
}

function setStatus(msg) {
  const el = $('status');
  if (el) el.textContent = msg || '';
  console.log('[status]', msg);
}

/* ---------------- Number helpers ---------------- */
function safeNumberInput(str) {
  // Chỉ cho số và dấu chấm
  return typeof str === 'string' && /^[0-9]*[.]?[0-9]*$/.test(str);
}

function toWei(str, decimals = 18) {
  return ethers.utils.parseUnits(str, decimals);
}

function fromWei(bn, decimals = 18, precision = 6) {
  try {
    const s = ethers.utils.formatUnits(bn, decimals);
    const [i, d = ''] = s.split('.');
    if (precision <= 0) return i;
    return d.length ? `${i}.${d.slice(0, precision)}` : i;
  } catch {
    return '0';
  }
}

function isGTE(aStr, bStr) {
  try {
    const a = ethers.utils.parseUnits(aStr, frollDecimals);
    const b = ethers.utils.parseUnits(bStr, frollDecimals);
    return a.gte(b);
  } catch {
    return false;
  }
}

/* ---------------- Error explain ---------------- */
function explainRevert(err) {
  const raw =
    err?.data?.message ||
    err?.error?.message ||
    err?.reason ||
    err?.message ||
    '';

  if (/insufficient funds for gas/i.test(raw)) return 'Not enough VIC for gas.';
  if (/reverted with reason string/i.test(raw)) {
    const m = raw.match(/reverted with reason string ['"]([^'"]+)['"]/i);
    if (m && m[1]) return m[1];
  }
  if (/execution reverted/i.test(raw)) {
    return 'Transaction would revert on-chain (check min/max, allowance, pool).';
  }
  if (/user rejected/i.test(raw) || /4001/.test(raw)) return 'You rejected the request.';
  if (/nonce too low/i.test(raw)) return 'Nonce too low. Please try again.';
  if (/replacement transaction underpriced/i.test(raw)) return 'Gas price too low to replace pending tx.';
  return raw || 'Transaction failed.';
}

/* ---------------- Storage helpers ---------------- */
function saveLastTableMin(minStr) {
  try { localStorage.setItem('froll_last_table_min', String(minStr)); } catch {}
}
function loadLastTableMin() {
  try { return localStorage.getItem('froll_last_table_min'); } catch { return null; }
}
let lastRound = null;
function saveLastRound(obj) {
  try { localStorage.setItem('froll_last_round', JSON.stringify(obj)); } catch {}
}

/* ---------------- Visual helpers ---------------- */
function startShake() {
  const cup = $('dice-cup');
  if (cup) cup.classList.add('shaking');
}
function stopShake() {
  const cup = $('dice-cup');
  if (cup) cup.classList.remove('shaking');
}
function showResult({ resultEven, win, txHash }) {
  const res = $('result');
  if (!res) return;
  let text = '';
  if (resultEven === null) {
    text = 'Result: pending…';
  } else {
    text = `Result: ${resultEven ? 'Even' : 'Odd'} • ${win ? 'YOU WIN 🎉' : 'You lost'}`;
  }
  if (txHash) text += ` • Tx: ${txHash.slice(0, 10)}…${txHash.slice(-6)}`;
  res.textContent = text;
}

/* ---------------- Web3: network & contracts ---------------- */
async function ensureNetwork() {
  const net = await providerRW.getNetwork();
  if (net.chainId === CONFIG.CHAIN_ID) return;

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ethers.utils.hexValue(CONFIG.CHAIN_ID) }],
    });
  } catch (e) {
    // Nếu chưa có mạng, thêm vào
    if (e.code === 4902 || /Unrecognized chain ID/i.test(e.message)) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: ethers.utils.hexValue(CONFIG.CAIN_ID || CONFIG.CHAIN_ID), // fallback
          chainName: 'Viction',
          rpcUrls: [CONFIG.RPC_RO],
          nativeCurrency: { name: 'VIC', symbol: 'VIC', decimals: 18 },
          blockExplorerUrls: ['https://vicscan.xyz'],
        }],
      });
    } else {
      throw e;
    }
  }
}

async function initContracts() {
  froll = new ethers.Contract(CONFIG.FROLL, ERC20_ABI, signer);
  dice  = new ethers.Contract(CONFIG.DICE,  DICE_ABI,  signer);
  frollDecimals = await froll.decimals().catch(() => 18);
}

/* ---------------- Connect wallet ---------------- */
async function connectWallet() {
  if (!window.ethereum) {
    alert('Please install MetaMask or use Viction Wallet.');
    return;
  }
  try {
    setBusy(true);
    setStatus('Connecting wallet…');

    providerRW = new ethers.providers.Web3Provider(window.ethereum);
    providerRO = new ethers.providers.JsonRpcProvider(CONFIG.RPC_RO);

    const accounts = await providerRW.send('eth_requestAccounts', []);
    user = ethers.utils.getAddress(accounts[0]);

    await ensureNetwork();
    signer = providerRW.getSigner();

    await initContracts();
    await Promise.all([refreshBalances(), refreshUserTable()]);

    if ($('connected-address')) $('connected-address').textContent = `${user.slice(0, 6)}…${user.slice(-4)}`;
    setStatus('Wallet connected.');
  } catch (e) {
    console.error('connectWallet:', e);
    setStatus(explainRevert(e));
  } finally {
    setBusy(false);
  }
}

/* ---------------- Refreshers ---------------- */
async function refreshBalances() {
  if (!froll || !user) return;
  const [balFroll, balVic] = await Promise.all([
    froll.balanceOf(user),
    providerRW.getBalance(user),
  ]);
  if ($('balance-froll')) $('balance-froll').textContent = fromWei(balFroll, frollDecimals, 6) + ' FROLL';
  if ($('balance-vic'))   $('balance-vic').textContent   = fromWei(balVic, 18, 6) + ' VIC';
}

async function refreshUserTable() {
  if (!dice || !user) return;
  try {
    const { minBet, maxBet } = await dice.playerTable(user);
    currentTable.min = minBet;
    currentTable.max = maxBet;
    if ($('current-min')) $('current-min').textContent = fromWei(minBet, frollDecimals, 6);
    if ($('current-max')) $('current-max').textContent = fromWei(maxBet, frollDecimals, 6);
  } catch (e) {
    console.warn('refreshUserTable:', e);
  }
}

/* ---------------- Approve ---------------- */
async function onApprove() {
  if (!signer || !froll) return alert('Please connect wallet.');
  const inp = $('approve-amount');
  const amtStr = inp ? inp.value.trim() : '';
  let toApprove = '1000000'; // mặc định cho rộng (1,000,000 FROLL) để ít phải approve
  if (amtStr && safeNumberInput(amtStr)) toApprove = amtStr;

  try {
    setBusy(true);
    setStatus('Sending approve…');
    const tx = await froll.approve(CONFIG.DICE, toWei(toApprove, frollDecimals));
    await tx.wait(1);
    setStatus('Approved successfully.');
  } catch (e) {
    console.error('approve:', e);
    setStatus(explainRevert(e));
  } finally {
    setBusy(false);
  }
}

/* ---------------- Select Table (with preflight) ---------------- */
async function onSetTable() {
  if (!signer || !dice) return alert('Please connect wallet.');
  const minInput = $('minBet');
  if (!minInput) return setStatus('Missing minBet input.');
  const minStr = minInput.value.trim();

  if (!minStr) return setStatus('Enter a min bet.');
  if (!safeNumberInput(minStr)) return setStatus('Invalid number.');
  if (!isGTE(minStr, CONFIG.minMinBet)) {
    return setStatus(`Min Bet must be at least ${CONFIG.minMinBet} FROLL.`);
  }

  try {
    setBusy(true);
    const minWei = toWei(minStr, frollDecimals);

    setStatus('Preflight (selectTable)…');
    await dice.callStatic.selectTable(minWei);
    await dice.estimateGas.selectTable(minWei);

    setStatus('Sending selectTable transaction…');
    const tx = await dice.selectTable(minWei);
    await tx.wait(1);

    saveLastTableMin(minStr);
    await refreshUserTable();
    setStatus('Table set successfully.');
  } catch (e) {
    console.error('selectTable error:', e);
    setStatus(explainRevert(e));
  } finally {
    setBusy(false);
  }
}

/* ---------------- Play (with preflight + estimateGas) ---------------- */
async function onPlay() {
  if (!signer || !dice) return alert('Please connect wallet.');
  if (!currentTable.min) return setStatus('Please set a table first.');

  const amtInput = $('bet-amount');
  if (!amtInput) return setStatus('Missing bet amount input.');
  const amtStr = amtInput.value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  if (!safeNumberInput(amtStr)) return setStatus('Invalid number.');

  const amountWei = toWei(amtStr, frollDecimals);

  // Range check
  if (amountWei.lt(currentTable.min) || amountWei.gt(currentTable.max)) {
    return setStatus('Bet amount is out of range (min–max).');
  }

  // Balances & allowance & pool & gas VIC
  const [balance, allowance, pool, vicBal] = await Promise.all([
    froll.balanceOf(user),
    froll.allowance(user, CONFIG.DICE),
    froll.balanceOf(CONFIG.DICE),
    providerRW.getBalance(user),
  ]);

  if (balance.lt(amountWei)) {
    const bal = fromWei(balance, frollDecimals, 6);
    return setStatus(`Not enough FROLL balance (need ${fromWei(amountWei, frollDecimals, 6)}, have ${bal}).`);
  }
  if (pool.lt(amountWei.mul(2))) {
    return setStatus('Contract pool is insufficient for 2× payout. Try a smaller amount.');
  }
  if (allowance.lt(amountWei)) {
    const allo = fromWei(allowance, frollDecimals, 6);
    return setStatus(`Allowance insufficient (${allo}). Please use “Approve FROLL” first.`);
  }
  if (vicBal.lt(ethers.utils.parseEther(CONFIG.minVicGas))) {
    return setStatus('Not enough VIC for gas. Please top up a little VIC.');
  }

  // Preflight & estimateGas
  try {
    setStatus('Preflight check…');
    await dice.callStatic.play(amountWei, (currentSide === 'even'));
    await dice.estimateGas.play(amountWei, (currentSide === 'even'));
  } catch (preErr) {
    console.error('preflight/estimateGas failed:', preErr);
    setStatus(explainRevert(preErr));
    return;
  }

  // Send tx
  startShake();
  setBusy(true);
  setStatus('Sending play transaction…');
  try {
    const guessEven = (currentSide === 'even');
    const tx = await dice.play(amountWei, guessEven);
    const receipt = await tx.wait(1);

    let resultEven = null, win = null;
    for (const log of receipt.logs) {
      try {
        const parsed = dice.interface.parseLog(log);
        if (parsed.name === 'Played') {
          resultEven = parsed.args.resultEven;
          win = parsed.args.win;
          break;
        }
      } catch {}
    }
    stopShake();
    showResult({ resultEven, win, txHash: tx.hash });

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
    setStatus(explainRevert(e));
  } finally {
    setBusy(false);
  }
}

/* ---------------- Side toggle ---------------- */
function onToggleSide() {
  currentSide = currentSide === 'even' ? 'odd' : 'even';
  if ($('current-side')) $('current-side').textContent = currentSide.toUpperCase();
}

/* ---------------- Boot ---------------- */
async function boot() {
  providerRO = new ethers.providers.JsonRpcProvider(CONFIG.RPC_RO);

  // Bind buttons if present
  $('btn-connect')     && $('btn-connect').addEventListener('click', connectWallet);
  $('btn-approve')     && $('btn-approve').addEventListener('click', onApprove);
  $('btn-set-table')   && $('btn-set-table').addEventListener('click', onSetTable);
  $('btn-play')        && $('btn-play').addEventListener('click', onPlay);
  $('btn-toggle-side') && $('btn-toggle-side').addEventListener('click', onToggleSide);

  // Restore last minBet input
  const lastMin = loadLastTableMin();
  if (lastMin && $('minBet')) $('minBet').value = lastMin;

  // Default side label
  if ($('current-side')) $('current-side').textContent = currentSide.toUpperCase();

  // MetaMask listeners
  if (window.ethereum) {
    window.ethereum.on?.('accountsChanged', () => window.location.reload());
    window.ethereum.on?.('chainChanged',   () => window.location.reload());
  }
}

document.addEventListener('DOMContentLoaded', boot);
