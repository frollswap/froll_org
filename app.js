/* ============================================================
   FROLL Dice – app.js (VIC) — FINAL SMOOTH BUILD (Patched)
   UI: English • Chú thích code: Tiếng Việt
   - Patch:
     • [P1] formatUnitsPlain + updateSwapBalances (swap) dùng số "thô" -> hết NaN trên mobile
     • [P2] uiSoftReset + global error traps + thêm uiSoftReset() trong catch -> không cần F5 sau lỗi
   ============================================================ */

/** [0] Ethers fallback (phòng CDN chính lỗi) */
(function ensureEthers() {
  if (typeof window === 'undefined') return;
  if (typeof window.ethers !== 'undefined') return;
  const s = document.createElement('script');
  s.src = 'https://unpkg.com/ethers@5.7.2/dist/ethers.umd.min.js';
  s.onload = () => console.log('[LOAD] ethers fallback loaded.');
  s.onerror = () => console.error('[LOAD] failed to load ethers fallback.');
  document.head.appendChild(s);
})();

/** [1] Cấu hình */
const CONFIG = {
  chainIdHex: '0x58', // VIC mainnet 88
  chainIdDec: 88,
  chainName: 'Viction',
  rpcUrl: 'https://rpc.viction.xyz',
  blockExplorer: 'https://vicscan.xyz',

  FROLL: '0xB4d562A8f811CE7F134a1982992Bd153902290BC', // token
  DICE:  '0x85A12591d3BA2A7148d18e9Ca44E0D778e458906', // FrollDice

  minMinBet: '0.001',
  logsLookbackBlocks: 5000,

  autoReconnectOnLoad: true,
  connectPopupWaitMs: 12000
};

/** [2] ABI */
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)'
];
const DICE_ABI = [
  'function selectTable(uint256 _minBet) external',
  'function play(uint256 amount, bool guessEven) external',
  'function withdraw(uint256 amount) external',
  'function getBalance() external view returns (uint256)',
  'function playerTable(address) external view returns (uint256 minBet, uint256 maxBet)',
  'event Played(address indexed player, uint256 amount, bool guessEven, bool resultEven, bool win)'
];

/** [3] Trạng thái */
let providerRW, providerRO, injected, signer, user, froll, dice;
let frollDecimals = 18;
let currentSide = 'even';
let currentTable = { min: null, max: null };
let lastRound = null;
let isConnecting = false;

/** [4] Tiện ích */
const $ = (id) => document.getElementById(id);
const format = (v, d=4) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
const toWei = (n, dec=18) => ethers.utils.parseUnits(String(n||'0'), dec);
const fromWei = (w, dec=18, d=4) => { try { return format(ethers.utils.formatUnits(w||0, dec), d); } catch { return '0'; } };

// [P1] Helper cho số “thô” (không locale) — dùng riêng cho phần Swap
const formatUnitsPlain = (w, dec = 18) => {
  try { return ethers.utils.formatUnits(w || 0, dec); }
  catch { return '0'; }
};

function setStatus(msg){ const el=$('tx-status'); if (el) el.textContent = msg || ''; }
function short(s){ return s ? s.slice(0,6)+'…'+s.slice(-4) : '—'; }
function saveLastRound(o){ try{ localStorage.setItem('froll_dice_last_round', JSON.stringify(o)); }catch{} }
function loadLastRound(){ try{ const s=localStorage.getItem('froll_dice_last_round'); return s?JSON.parse(s):null; }catch{ return null; } }
function saveLastTableMin(m){ try{ localStorage.setItem('froll_dice_last_min', String(m)); }catch{} }
function loadLastTableMin(){ try{ return localStorage.getItem('froll_dice_last_min'); }catch{ return null; } }

// ===== Khóa/mở nút để tránh double-click / race =====
function setBusy(b) {
  const ids = ['btn-approve','btn-play','btn-set-table','btn-clear','btn-half','btn-double','btn-repeat','btn-even','btn-odd'];
  ids.forEach(id => { const el = $(id); if (el) el.disabled = !!b; });
}

// [P2] CẦU CHÌ Toàn cục: luôn phục hồi UI sau lỗi (khỏi cần F5)
function uiSoftReset(msg){
  try{ $('bowl')?.classList.remove('shaking'); }catch{}
  try{ setBusy(false); }catch{}
  if (msg) setStatus(msg);
  Promise.all([
    (typeof refreshBalances === 'function' ? refreshBalances().catch(()=>{}) : Promise.resolve()),
    (typeof refreshUserTable === 'function' ? refreshUserTable().catch(()=>{}) : Promise.resolve())
  ]).then(() => {
    setTimeout(() => { try{ setStatus(''); }catch{} }, 6000);
  });
}
window.addEventListener('unhandledrejection', (evt) => {
  console.warn('[Global] Unhandled rejection:', evt.reason);
  uiSoftReset(evt?.reason?.message || 'Something went wrong. UI recovered.');
});
window.addEventListener('error', (evt) => {
  console.warn('[Global] Window error:', evt.error || evt.message);
  uiSoftReset('Unexpected error. UI recovered.');
});

/** [5] Provider & events */
function getInjectedProvider(){
  const eth = window.ethereum;
  if (!eth) return null;
  if (eth.providers && Array.isArray(eth.providers)){
    const metamask = eth.providers.find(p => p.isMetaMask);
    if (metamask) return metamask;
    return eth.providers[0];
  }
  return eth;
}
function bindWalletEvents(p){
  p?.on?.('accountsChanged', async (accs) => {
    if (!accs || !accs.length){ disconnectWallet(); return; }
    user = accs[0];
    signer = providerRW.getSigner();
    $('addr-short').textContent = short(user);
    await Promise.all([refreshBalances(), refreshUserTable()]);
    setStatus('Account changed.');
    setTimeout(()=>{ try{ setStatus(''); }catch{} }, 4000); // dọn status
  });
  p?.on?.('chainChanged', async (cid) => {
    if (cid !== CONFIG.chainIdHex){ setStatus('Wrong network. Please switch to VIC.'); }
    else { setStatus('Network OK (VIC).'); await Promise.all([refreshBalances(), refreshUserTable()]); }
    setTimeout(()=>{ try{ setStatus(''); }catch{} }, 4000); // dọn status
  });
}

/** [6] Sân khấu */
function startShake(){ $('bowl')?.classList.add('shaking'); }
function stopShake(){ $('bowl')?.classList.remove('shaking'); }
function variantFromHash(txHash, mod){ if(!txHash) return 0; try{ return parseInt(txHash.slice(-4),16)%mod; }catch{ return 0; } }
function renderCoins({ parityEven, txHash }){
  const coinsEl = $('coins'); if (!coinsEl) return;
  coinsEl.className = 'coins'; coinsEl.innerHTML = '';
  if (parityEven){
    const layouts=['layout-even-0','layout-even-2a','layout-even-4'];
    const cls = layouts[variantFromHash(txHash, layouts.length)];
    coinsEl.classList.add(cls);
    const reds = ({'layout-even-0':0,'layout-even-2a':2,'layout-even-4':4})[cls];
    for(let i=0;i<4;i++){ const c=document.createElement('div'); c.className='coin '+(i<reds?'red':'white'); coinsEl.appendChild(c); }
  }else{
    const layouts=['layout-odd-1','layout-odd-3a'];
    const cls = layouts[variantFromHash(txHash, layouts.length)];
    coinsEl.classList.add(cls);
    const reds = ({'layout-odd-1':1,'layout-odd-3a':3})[cls];
    for(let i=0;i<4;i++){ const c=document.createElement('div'); c.className='coin '+(i<reds?'red':'white'); coinsEl.appendChild(c); }
  }
}

/** [7] Hiển thị UI */
function showResult({ resultEven, win, txHash }){
  $('last-outcome').textContent = (resultEven==null)?'—':(resultEven?'Even':'Odd');
  $('last-payout').textContent  = (win==null)?'—':(win?'Win':'Lose');
  $('last-tx').textContent      = txHash || '—';
  if (txHash){ const el=$('last-tx'); el.title=txHash; el.onclick=()=>window.open(`${CONFIG.blockExplorer}/tx/${txHash}`, '_blank'); el.style.cursor='pointer'; }
  renderCoins({ parityEven: !!resultEven, txHash });
}
function showTable(minWei, maxWei){
  if (!minWei || !maxWei){
    $('current-table').textContent='Not set';
    $('limit-min').textContent='—';
    $('limit-max').textContent='—';
    currentTable={min:null,max:null};
    return;
  }
  const minF=fromWei(minWei, frollDecimals);
  const maxF=fromWei(maxWei, frollDecimals);
  $('current-table').textContent = `${minF} – ${maxF} FROLL`;
  $('limit-min').textContent = minF;
  $('limit-max').textContent = maxF;
  currentTable = { min:minWei, max:maxWei };
}

/** [8] Đọc dữ liệu */
async function refreshBalances(){
  if (!user || !froll || !providerRW) return;
  const [vic, fr, pool] = await Promise.all([
    providerRW.getBalance(user),
    froll.balanceOf(user),
    froll.balanceOf(CONFIG.DICE)
  ]);
  $('vic-balance').textContent   = fromWei(vic, 18);
  $('froll-balance').textContent = fromWei(fr, frollDecimals);
  $('pool-balance').textContent  = fromWei(pool, frollDecimals);
}
async function refreshUserTable(){
  if (!user || !dice) return;
  const t = await dice.playerTable(user);
  const [min,max] = t;
  if (min.gt(0)) showTable(min, max);
}
async function showLatestContractRound(){
  try{
    const ro = providerRO || new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
    const current = await ro.getBlockNumber();
    const from = Math.max(current - CONFIG.logsLookbackBlocks, 0);
    const iface = new ethers.utils.Interface(DICE_ABI);
    const topic0 = iface.getEventTopic('Played');
    const logs = await ro.getLogs({ address:CONFIG.DICE, fromBlock:from, toBlock:current, topics:[topic0] });
    if (!logs.length){ showResult({ resultEven:true, win:null, txHash:null }); return; }
    const last = logs[logs.length-1];
    const parsed = iface.parseLog(last);
    showResult({ resultEven: parsed.args.resultEven, win:null, txHash:last.transactionHash });
  } catch(e){
    console.error('showLatestContractRound error:', e);
    showResult({ resultEven:true, win:null, txHash:null });
  }
}

/** [9] Kết nối ví & reconnect */
async function ensureChain(){
  const currentChainId = await providerRW.send('eth_chainId', []);
  if (currentChainId !== CONFIG.chainIdHex){
    try {
      await providerRW.send('wallet_switchEthereumChain', [{ chainId: CONFIG.chainIdHex }]);
    } catch (switchErr){
      if (switchErr.code === 4902){
        await providerRW.send('wallet_addEthereumChain', [{
          chainId: CONFIG.chainIdHex,
          chainName: CONFIG.chainName,
          nativeCurrency:{ name:'VIC', symbol:'VIC', decimals:18 },
          rpcUrls:[CONFIG.rpcUrl],
          blockExplorerUrls:[CONFIG.blockExplorer]
        }]);
      } else {
        throw switchErr;
      }
    }
  }
}
async function requestAccountsWithTimeout(){
  const req = providerRW.send('eth_requestAccounts', []);
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Wallet request timed out')), CONFIG.connectPopupWaitMs));
  return Promise.race([req, timeout]);
}
async function connectWallet(){
  if (isConnecting) return;
  isConnecting = true;
  try{
    setStatus('Connecting wallet…');
    if (location.protocol !== 'https:'){ console.warn('Non-HTTPS origin; wallets may block.'); }

    injected = getInjectedProvider();
    if (!injected){
      setStatus('No Web3 wallet detected. Please install MetaMask or Viction.');
      alert('No Web3 wallet detected. Please install MetaMask or Viction wallet.');
      return;
    }

    providerRW = new ethers.providers.Web3Provider(injected, 'any');
    providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);

    try { await requestAccountsWithTimeout(); }
    catch (e){ if (e?.code === 4001){ setStatus('You rejected the connection request.'); return; } throw e; }

    await ensureChain();

    signer = providerRW.getSigner();
    user   = await signer.getAddress();

    froll = new ethers.Contract(CONFIG.FROLL, ERC20_ABI, signer);
    dice  = new ethers.Contract(CONFIG.DICE,  DICE_ABI,  signer);
    try { frollDecimals = await froll.decimals(); } catch {}

    $('btn-connect').classList.add('hidden');
    $('wallet-info').classList.remove('hidden');
    $('addr-short').textContent = short(user);

    await Promise.all([refreshBalances(), refreshUserTable()]);
    setStatus('Wallet connected.');
    bindWalletEvents(injected);
  } catch(err){
    console.error('connectWallet error:', err);
    setStatus('Wallet connection failed. Please open your wallet and try again.');
    uiSoftReset(); // đảm bảo UI hồi phục
  } finally {
    isConnecting = false;
  }
}
async function trySilentReconnectOnLoad(){
  if (!CONFIG.autoReconnectOnLoad) return;
  injected = getInjectedProvider();
  if (!injected) return;

  providerRW = new ethers.providers.Web3Provider(injected, 'any');
  providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);

  try{
    const accounts = await injected.request?.({ method:'eth_accounts' });
    if (!accounts || !accounts.length) { setStatus('Ready. Click “Connect Wallet”.'); return; }

    await ensureChain();

    signer = providerRW.getSigner();
    user   = accounts[0];

    froll = new ethers.Contract(CONFIG.FROLL, ERC20_ABI, signer);
    dice  = new ethers.Contract(CONFIG.DICE,  DICE_ABI,  signer);
    try { frollDecimals = await froll.decimals(); } catch {}

    $('btn-connect').classList.add('hidden');
    $('wallet-info').classList.remove('hidden');
    $('addr-short').textContent = short(user);

    await Promise.all([refreshBalances(), refreshUserTable()]);
    setStatus('Wallet reconnected.');
    bindWalletEvents(injected);
  } catch (e){
    console.warn('Silent reconnect failed:', e);
    setStatus('Ready. Click “Connect Wallet”.');
    uiSoftReset();
  }
}
function disconnectWallet(){
  user=null; signer=null; providerRW=null;
  $('btn-connect').classList.remove('hidden');
  $('wallet-info').classList.add('hidden');
  $('addr-short').textContent='—';
  showTable(null,null);
  setStatus('Disconnected.');
}

/** [10] Chọn bàn */
function isGTE(numStr, minStr){
  try{ return ethers.utils.parseUnits(numStr, frollDecimals).gte(ethers.utils.parseUnits(minStr, frollDecimals)); }catch{ return false; }
}
async function onSetTable(){
  if (!signer || !dice) return alert('Please connect wallet.');
  const minStr = $('minBet').value.trim();
  if (!minStr) return setStatus('Enter a min bet.');
  if (!isGTE(minStr, CONFIG.minMinBet)) return setStatus(`Min Bet must be at least ${CONFIG.minMinBet} FROLL.`);
  try{
    setBusy(true);
    setStatus('Sending selectTable transaction…');
    const tx = await dice.selectTable(toWei(minStr, frollDecimals));
    await tx.wait(1);
    saveLastTableMin(minStr);
    await refreshUserTable();
    setStatus('Table set successfully.');
  }catch(e){
    console.error('selectTable error:', e);
    setStatus(e.data?.message || e.error?.message || e.message || 'selectTable failed.');
    uiSoftReset();
  } finally {
    setBusy(false);
  }
}

/** [11] Approve (đơn giản: người dùng gõ số, phải ≤ FROLL balance) */
async function onApprove(){
  if (!signer || !froll) return alert('Please connect wallet.');

  let apStr = ($('approve-amount')?.value || '').trim();
  if (!apStr) apStr = ($('bet-amount')?.value || '').trim();
  if (!apStr) return setStatus('Enter approve amount (FROLL).');

  const balance = await froll.balanceOf(user);
  const apWei = toWei(apStr, frollDecimals);
  if (apWei.lte(ethers.constants.Zero)) return setStatus('Approve amount must be greater than 0.');

  if (apWei.gt(balance)) {
    const bal = fromWei(balance, frollDecimals, 6);
    return setStatus(`Approve amount exceeds your wallet balance (${bal} FROLL).`);
  }

  try {
    setBusy(true);
    setStatus('Checking current allowance…');
    const cur = await froll.allowance(user, CONFIG.DICE);
    if (cur.gte(apWei)) { setStatus('Allowance already sufficient for that amount.'); return; }

    if (!cur.isZero()) {
      setStatus('Resetting allowance to 0…');
      const tx0 = await froll.approve(CONFIG.DICE, ethers.constants.Zero);
      await tx0.wait(1);
    }

    setStatus('Approving…');
    const tx = await froll.approve(CONFIG.DICE, apWei);
    await tx.wait(1);
    await new Promise(r => setTimeout(r, 1200)); // cho RPC bắt kịp

    const after = await froll.allowance(user, CONFIG.DICE);
    if (after.gte(apWei)) setStatus('Approve successful.');
    else setStatus('Approve seems incomplete. Please try again.');
    await refreshBalances();
  } catch (e) {
    console.error('approve error:', e);
    setStatus(e.data?.message || e.error?.message || e.message || 'Approve failed.');
    uiSoftReset();
  } finally {
    setBusy(false);
  }
}

/** [12] Play (preflight callStatic để tránh CALL_EXCEPTION) */
async function onPlay(){
  if (!signer || !dice) return alert('Please connect wallet.');
  if (!currentTable.min) return setStatus('Please set a table first.');

  const amtStr = $('bet-amount').value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  const amountWei = toWei(amtStr, frollDecimals);

  if (amountWei.lt(currentTable.min) || amountWei.gt(currentTable.max)) {
    return setStatus('Bet amount is out of range (min–max).');
  }

  const [balance, allowance, pool] = await Promise.all([
    froll.balanceOf(user),
    froll.allowance(user, CONFIG.DICE),
    froll.balanceOf(CONFIG.DICE),
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

  // ===== PRE-FLIGHT: mô phỏng play trên-chain, nếu fail thì KHÔNG gửi tx thật =====
  try {
    setStatus('Preflight check…');
    await dice.callStatic.play(amountWei, (currentSide === 'even'));
  } catch (preErr) {
    console.error('preflight callStatic failed:', preErr);
    const m = (preErr?.error?.message || preErr?.data?.message || preErr?.reason || preErr?.message || '').toUpperCase();
    if (m.includes('BET') && m.includes('MIN')) {
      setStatus('Bet is below table minimum. Increase amount.');
    } else if (m.includes('ALLOW')) {
      setStatus('Allowance too low. Please click “Approve FROLL”.');
    } else if (m.includes('BAL') || m.includes('INSUFFICIENT')) {
      setStatus('Balance or pool insufficient. Check wallet & contract pool.');
    } else {
      setStatus('Preflight failed. Please adjust bet/allowance then try again.');
    }
    uiSoftReset(); // ✅ tự phục hồi, không cần F5
    return;
  }

  // Gửi play
  startShake();
  setBusy(true);
  setStatus('Sending play transaction…');
  try{
    const guessEven = (currentSide === 'even');
    const tx = await dice.play(amountWei, guessEven);
    const receipt = await tx.wait(1);

    let resultEven=null, win=null;
    for (const log of receipt.logs){
      try{
        const parsed = dice.interface.parseLog(log);
        if (parsed.name==='Played'){ resultEven=parsed.args.resultEven; win=parsed.args.win; break; }
      }catch{}
    }
    stopShake();
    showResult({ resultEven, win, txHash: tx.hash });

    lastRound = { side: currentSide, amount: amtStr, minBet: fromWei(currentTable.min, frollDecimals), txHash: tx.hash };
    saveLastRound(lastRound);
    await refreshBalances();
    setStatus('Round completed.');
  }catch(e){
    console.error('play error:', e);
    stopShake();
    setStatus(e.data?.message || e.error?.message || e.message || 'Play failed.');
    uiSoftReset();
  } finally {
    setBusy(false);
  }
}

/** [13] Nút tiện ích & chẵn/lẻ */
function onClear(){ $('bet-amount').value=''; setStatus(''); }
function onHalf(){ const v=parseFloat($('bet-amount').value||'0'); if(v<=0)return; $('bet-amount').value=String(Math.max(v/2, Number(CONFIG.minMinBet))); }
function onDouble(){ const v=parseFloat($('bet-amount').value||'0'); const max=currentTable.max?parseFloat(fromWei(currentTable.max, frollDecimals, 18)):Infinity; if(v<=0){ if(currentTable.min)$('bet-amount').value=fromWei(currentTable.min, frollDecimals, 18); return; } $('bet-amount').value=String(Math.min(v*2, max)); }
function onRepeat(){ const saved=loadLastRound(); if(!saved) return setStatus('No previous round to repeat.'); currentSide=saved.side==='odd'?'odd':'even'; document.querySelectorAll('.btn.toggle').forEach(b=>b.classList.remove('active')); (currentSide==='even'?$('btn-even'):$('btn-odd')).classList.add('active'); $('bet-amount').value=saved.amount; setStatus('Repeated last round settings (side & amount).'); }
function bindSideButtons(){ $('btn-even').addEventListener('click',()=>{ currentSide='even'; $('btn-even').classList.add('active'); $('btn-odd').classList.remove('active'); }); $('btn-odd').addEventListener('click',()=>{ currentSide='odd'; $('btn-odd').classList.add('active'); $('btn-even').classList.remove('active'); }); }

/** [14] Khởi tạo */
async function init(){
  // chờ ethers nếu đang nạp fallback
  let tries=0; while (typeof window.ethers==='undefined' && tries<20){ await new Promise(r=>setTimeout(r,150)); tries++; }
  if (typeof window.ethers==='undefined'){ setStatus('ethers.js failed to load. Check CDN/AdBlock.'); console.error('ethers not loaded'); return; }

  providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
  await showLatestContractRound();
  lastRound = loadLastRound();

  $('btn-connect')?.addEventListener('click', connectWallet);
  $('btn-disconnect')?.addEventListener('click', disconnectWallet);
  $('btn-set-table')?.addEventListener('click', onSetTable);
  $('btn-approve')?.addEventListener('click', onApprove);
  $('btn-play')?.addEventListener('click', onPlay);
  $('btn-clear')?.addEventListener('click', onClear);
  $('btn-half')?.addEventListener('click', onHalf);
  $('btn-double')?.addEventListener('click', onDouble);
  $('btn-repeat')?.addEventListener('click', onRepeat);
  bindSideButtons();

  const minSaved = loadLastTableMin();
  if (minSaved) $('minBet').value = minSaved;

  await trySilentReconnectOnLoad();
  setStatus('Ready.');
}

// Expose để onclick HTML gọi được
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;

// Chạy sau DOM ready
if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }


/* ============================================================
   APPEND-ONLY — Swap FROLL/VIC + View toggling for froll.org
   - Giữ nguyên toàn bộ logic Xóc Đĩa ở trên
   - Chỉ thêm cấu hình, UI toggle và swap như froll.net
   ============================================================ */

/** [S0] Bổ sung địa chỉ & ABI của Swap */
if (typeof CONFIG !== 'undefined') {
  CONFIG.SWAP = CONFIG.SWAP || '0x9197BF0813e0727df4555E8cb43a0977F4a3A068';
}
const SWAP_ABI = [
  { "inputs": [], "name": "swapVicToFroll", "outputs": [], "stateMutability": "payable", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "frollAmount", "type": "uint256" }], "name": "swapFrollToVic", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
];

/** [S1] Tham chiếu DOM (swap + toggle) */
const elHome          = document.getElementById('home-interface');
const elSwap          = document.getElementById('swap-interface');
const btnOpenSwap     = document.getElementById('btn-open-swap');
const btnBackToGame   = document.getElementById('btn-back-to-game');
const btnDisconnectSw = document.getElementById('disconnect-wallet');

const fromAmountInput   = document.getElementById('from-amount');
const toAmountInput     = document.getElementById('to-amount');
const fromTokenInfo     = document.getElementById('from-token-info');
const toTokenInfo       = document.getElementById('to-token-info');
const fromTokenLogo     = document.getElementById('from-token-logo');
const toTokenLogo       = document.getElementById('to-token-logo');
const swapDirectionBtn  = document.getElementById('swap-direction');
const maxBtn            = document.getElementById('max-button');
const swapNowBtn        = document.getElementById('swap-now');
const walletAddrLabel   = document.getElementById('wallet-address');

/** [S2] Trạng thái Swap */
let frollSwapContract = null;    // Contract swap
let swapFrom = 'VIC';            // 'VIC' | 'FROLL'
let swapTo   = 'FROLL';
const RATE = 100;                // 1 FROLL = 100 VIC (tức 1 VIC = 0.01 FROLL)
const FEE_VIC = 0.01;            // Phí tính theo VIC (cứng)
const GAS_FEE_ESTIMATE = 0.000029;
const MIN_SWAP_AMOUNT_VIC = 0.011;
const MIN_SWAP_AMOUNT_FROLL = 0.00011;

/** [S3] Helper cho ẩn/hiện view */
function showHomeInterface(){
  if (elSwap) elSwap.style.display = 'none';
  if (elHome) elHome.style.display = '';
}
function showSwapInterface(){
  if (elHome) elHome.style.display = 'none';
  if (elSwap) elSwap.style.display = '';
  if (walletAddrLabel) walletAddrLabel.textContent = user ? short(user) : '—';
}

/** [S4] Cập nhật số dư hiển thị trong giao diện swap (Patched: số thô, không locale) */
async function updateSwapBalances(){
  try{
    if (!providerRW || !user) return;
    const [vicBn, frollBn] = await Promise.all([
      providerRW.getBalance(user),
      froll ? froll.balanceOf(user) : ethers.constants.Zero
    ]);
    const vicPlain = formatUnitsPlain(vicBn, 18);
    const frPlain  = formatUnitsPlain(frollBn, frollDecimals);
    if (fromTokenInfo && toTokenInfo){
      const map = { VIC: vicPlain, FROLL: frPlain };
      fromTokenInfo.textContent = `${swapFrom}: ${map[swapFrom]}`;
      toTokenInfo.textContent   = `${swapTo}: ${map[swapTo]}`;
    }
  }catch(e){ console.warn('updateSwapBalances:', e); }
}

/** [S5] Tính toán output dựa trên input & chiều swap */
function clearSwapInputs(){
  if (fromAmountInput) fromAmountInput.value = '';
  if (toAmountInput)   toAmountInput.value   = '';
}
function calcToAmount(){
  if (!fromAmountInput || !toAmountInput) return;
  const v = parseFloat(fromAmountInput.value);
  if (isNaN(v) || v <= 0){ toAmountInput.value=''; return; }
  let out = 0;
  if (swapFrom === 'VIC'){
    if (v < MIN_SWAP_AMOUNT_VIC){ toAmountInput.value=''; return; }
    const net = v - FEE_VIC;
    out = net > 0 ? (net / RATE) : 0;      // VIC -> FROLL
  } else {
    if (v < MIN_SWAP_AMOUNT_FROLL){ toAmountInput.value=''; return; }
    const grossVic = v * RATE;             // FROLL -> VIC
    out = Math.max(0, grossVic - FEE_VIC);
  }
  toAmountInput.value = out.toFixed(18);
}

/** [S6] Đảo chiều token hiển thị */
function flipDirection(){
  [swapFrom, swapTo] = [swapTo, swapFrom];
  if (fromTokenLogo && toTokenLogo){
    const tmp = fromTokenLogo.src;
    fromTokenLogo.src = toTokenLogo.src;
    toTokenLogo.src = tmp;
  }
  updateSwapBalances();
  clearSwapInputs();
}

/** [S7] Đảm bảo ví đã connect và chuẩn bị contracts cho Swap */
async function ensureSwapReady(){
  if (!user || !signer || !providerRW){
    await connectWallet(); // tận dụng hàm sẵn có của game
  }
  if (!user || !signer || !providerRW) throw new Error('Wallet not connected.');
  if (!froll) froll = new ethers.Contract(CONFIG.FROLL, ERC20_ABI, signer);
  if (!frollSwapContract) frollSwapContract = new ethers.Contract(CONFIG.SWAP, SWAP_ABI, signer);
}

/** [S8] Thao tác Max */
async function onSwapMax(){
  try{
    await ensureSwapReady();
    await updateSwapBalances();
    // Đọc lại số đã render (đã là chuỗi thô) để điền vào input
    const text = fromTokenInfo?.textContent || '';
    const vStr = text.split(':')[1]?.trim() || '';
    if (fromAmountInput) {
      fromAmountInput.value = vStr || '';
      calcToAmount();
    }
  }catch(e){
    alert(e.message || 'Failed to set Max.');
    uiSoftReset();
  }
}

/** [S9] Gửi swap */
async function onSwapNow(){
  try{
    await ensureSwapReady();
    const amount = parseFloat(fromAmountInput?.value || '0');
    if (isNaN(amount) || amount <= 0) return alert('Please enter amount.');

    if (swapFrom === 'VIC'){
      if (amount < MIN_SWAP_AMOUNT_VIC) return alert(`Minimum swap is ${MIN_SWAP_AMOUNT_VIC} VIC.`);
      const value = ethers.utils.parseEther(String(amount));
      const tx = await frollSwapContract.swapVicToFroll({ value });
      await tx.wait(1);
      alert('Swap VIC → FROLL successful.');
    } else {
      if (amount < MIN_SWAP_AMOUNT_FROLL) return alert(`Minimum swap is ${MIN_SWAP_AMOUNT_FROLL} FROLL.`);
      const amountWei = ethers.utils.parseUnits(String(amount), frollDecimals);
      // Approve rồi swap
      const curAllo = await froll.allowance(user, CONFIG.SWAP);
      if (curAllo.lt(amountWei)){
        if (!curAllo.isZero()){
          const tx0 = await froll.approve(CONFIG.SWAP, ethers.constants.Zero);
          await tx0.wait(1);
        }
        const tx1 = await froll.approve(CONFIG.SWAP, amountWei);
        await tx1.wait(1);
      }
      const tx = await frollSwapContract.swapFrollToVic(amountWei);
      await tx.wait(1);
      alert('Swap FROLL → VIC successful.');
    }

    await Promise.all([refreshBalances(), updateSwapBalances()]);
    clearSwapInputs();
  }catch(e){
    console.error('Swap failed:', e);
    alert(e?.reason || e?.data?.message || e?.message || 'Swap failed.');
    uiSoftReset();
  }
}

/** [S10] Gắn sự kiện UI khi DOM sẵn sàng */
(function bindSwapUI(){
  if (btnOpenSwap){
    btnOpenSwap.addEventListener('click', async () => {
      try{
        await ensureSwapReady();
        await updateSwapBalances();
        showSwapInterface();
      }catch(e){
        alert(e.message || 'Please connect wallet to use Swap.');
      }
    });
  }
  if (btnBackToGame){
    btnBackToGame.addEventListener('click', () => {
      showHomeInterface();
    });
  }
  if (btnDisconnectSw){
    btnDisconnectSw.addEventListener('click', () => {
      try { window.disconnectWallet && window.disconnectWallet(); } catch {}
      showHomeInterface();
    });
  }

  if (fromAmountInput) fromAmountInput.addEventListener('input', calcToAmount);
  if (swapDirectionBtn) swapDirectionBtn.addEventListener('click', flipDirection);
  if (maxBtn)           maxBtn.addEventListener('click', onSwapMax);
  if (swapNowBtn)       swapNowBtn.addEventListener('click', onSwapNow);

  // Khởi tạo mặc định: Home hiển thị, Swap ẩn
  showHomeInterface();
})();

/** [S11] (Tuỳ chọn) Khi quay lại tab, nếu đang ở swap thì refresh số dư */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && elSwap && elSwap.style.display !== 'none'){
    updateSwapBalances();
  }
});
