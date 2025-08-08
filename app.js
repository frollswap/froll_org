/* ============================================================
   FROLL Dice – app.js (VIC) — FINAL “SMOOTH CONNECT” BUILD
   UI: English • Chú thích code: Tiếng Việt
   Mục tiêu: Kết nối ví mượt, tự reconnect sau refresh, chống bấm đúp
   ============================================================ */

/** ===================== [MỤC 0] NẠP Ethers FALLBACK (phòng CDN lỗi) ===================== **/
(function ensureEthers() {
  if (typeof window === 'undefined') return;
  if (typeof window.ethers !== 'undefined') return;
  const s = document.createElement('script');
  s.src = 'https://unpkg.com/ethers@5.7.2/dist/ethers.umd.min.js';
  s.onload = () => console.log('[LOAD] ethers fallback loaded.');
  s.onerror = () => console.error('[LOAD] failed to load ethers fallback.');
  document.head.appendChild(s);
})();

/** ===================== [MỤC 1] CẤU HÌNH ===================== **/
const CONFIG = {
  chainIdHex: '0x58', // VIC mainnet (88)
  chainIdDec: 88,
  chainName: 'Viction',
  rpcUrl: 'https://rpc.viction.xyz',
  blockExplorer: 'https://vicscan.xyz',

  FROLL: '0xB4d562A8f811CE7F134a1982992Bd153902290BC', // token
  DICE:  '0x85A12591d3BA2A7148d18e9Ca44E0D778e458906', // FrollDice

  minMinBet: '0.001',
  logsLookbackBlocks: 5000,

  // Kết nối mượt: auto reconnect, chống bấm đúp, chờ pop-up
  autoReconnectOnLoad: true,
  connectPopupWaitMs: 12000
};

/** ===================== [MỤC 2] ABI ===================== **/
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

/** ===================== [MỤC 3] TRẠNG THÁI ===================== **/
let providerRW, providerRO, injected, signer, user, froll, dice;
let frollDecimals = 18;
let currentSide = 'even';
let currentTable = { min: null, max: null };
let lastRound = null;
let isConnecting = false; // chặn bấm đúp Connect

/** ===================== [MỤC 4] TIỆN ÍCH ===================== **/
const $ = (id) => document.getElementById(id);
const format = (v, d=4) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
const toWei = (n, dec=18) => ethers.utils.parseUnits(String(n||'0'), dec);
const fromWei = (w, dec=18, d=4) => { try { return format(ethers.utils.formatUnits(w||0, dec), d); } catch { return '0'; } };
function setStatus(msg){ const el=$('tx-status'); if (el) el.textContent = msg || ''; console.log('[STATUS]', msg); }
function short(s){ return s ? s.slice(0,6)+'…'+s.slice(-4) : '—'; }
function saveLastRound(o){ try{ localStorage.setItem('froll_dice_last_round', JSON.stringify(o)); }catch{} }
function loadLastRound(){ try{ const s=localStorage.getItem('froll_dice_last_round'); return s?JSON.parse(s):null; }catch{ return null; } }
function saveLastTableMin(m){ try{ localStorage.setItem('froll_dice_last_min', String(m)); }catch{} }
function loadLastTableMin(){ try{ return localStorage.getItem('froll_dice_last_min'); }catch{ return null; } }

/** ===================== [MỤC 5] PHÁT HIỆN PROVIDER & SỰ KIỆN WALLET ===================== **/
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
  // Gán lắng nghe thay đổi account / chain
  p?.on?.('accountsChanged', async (accs) => {
    console.log('[EVENT] accountsChanged', accs);
    if (!accs || !accs.length){ disconnectWallet(); return; }
    user = accs[0];
    signer = providerRW.getSigner();
    $('addr-short').textContent = short(user);
    await Promise.all([refreshBalances(), refreshUserTable()]);
    setStatus('Account changed.');
  });
  p?.on?.('chainChanged', async (cid) => {
    console.log('[EVENT] chainChanged', cid);
    if (cid !== CONFIG.chainIdHex){ setStatus('Wrong network. Please switch to VIC.'); }
    else { setStatus('Network OK (VIC).'); await Promise.all([refreshBalances(), refreshUserTable()]); }
  });
}

/** ===================== [MỤC 6] SÂN KHẤU (BÁT XÓC & COIN) ===================== **/
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

/** ===================== [MỤC 7] HIỂN THỊ KẾT QUẢ & BÀN ===================== **/
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

/** ===================== [MỤC 8] ĐỌC DỮ LIỆU ===================== **/
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

/** ===================== [MỤC 9] KẾT NỐI VÍ & TỰ RECONNECT ===================== **/
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

// gọi yêu cầu account (hiện pop-up). Có timeout để không kẹt UI nếu user đóng pop-up
async function requestAccountsWithTimeout(){
  const req = providerRW.send('eth_requestAccounts', []);
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Wallet request timed out')), CONFIG.connectPopupWaitMs));
  return Promise.race([req, timeout]);
}

// Kết nối “một phát ăn ngay” (gọi khi bấm nút)
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

    // Yêu cầu quyền tài khoản (sẽ bật pop-up). Bắt lỗi user từ chối (4001).
    try {
      await requestAccountsWithTimeout();
    } catch (e) {
      if (e?.code === 4001) { setStatus('You rejected the connection request.'); return; }
      throw e;
    }

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
  } finally {
    isConnecting = false;
  }
}

// Reconnect “im lặng” sau refresh: không bật pop-up, chỉ kết nối nếu đã từng cấp quyền
async function trySilentReconnectOnLoad(){
  if (!CONFIG.autoReconnectOnLoad) return;
  injected = getInjectedProvider();
  if (!injected) return;

  providerRW = new ethers.providers.Web3Provider(injected, 'any');
  providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);

  try{
    // eth_accounts trả về danh sách account đã authorized (không bật pop-up)
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

/** ===================== [MỤC 10] BÀN (selectTable) ===================== **/
function isGTE(numStr, minStr){
  try{ return ethers.utils.parseUnits(numStr, frollDecimals).gte(ethers.utils.parseUnits(minStr, frollDecimals)); }catch{ return false; }
}
async function onSetTable(){
  if (!signer || !dice) return alert('Please connect wallet.');
  const minStr = $('minBet').value.trim();
  if (!minStr) return setStatus('Enter a min bet.');
  if (!isGTE(minStr, CONFIG.minMinBet)) return setStatus(`Min Bet must be at least ${CONFIG.minMinBet} FROLL.`);
  try{
    setStatus('Sending selectTable transaction…');
    const tx = await dice.selectTable(toWei(minStr, frollDecimals));
    await tx.wait(1);
    saveLastTableMin(minStr);
    await refreshUserTable();
    setStatus('Table set successfully.');
  }catch(e){
    console.error('selectTable error:', e);
    setStatus(e.data?.message || e.error?.message || e.message || 'selectTable failed.');
  }
}

/** ===================== [MỤC 11] APPROVE (có reset-to-zero nếu cần) ===================== **/
async function onApprove(){
  if (!signer || !froll) return alert('Please connect wallet.');
  const amtStr = $('bet-amount').value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  if (!currentTable.min) return setStatus('Please set a table first.');
  const amountWei = toWei(amtStr, frollDecimals);

  if (amountWei.lt(currentTable.min) || amountWei.gt(currentTable.max)) {
    return setStatus('Bet amount is out of range (min–max).');
  }

  try {
    setStatus('Checking allowance…');
    const cur = await froll.allowance(user, CONFIG.DICE);
    if (cur.gte(amountWei)) {
      setStatus('Allowance already sufficient.');
      return;
    }

    if (!cur.isZero()) {
      setStatus('Resetting allowance to 0…');
      const tx0 = await froll.approve(CONFIG.DICE, ethers.constants.Zero);
      await tx0.wait(1);
    }

    setStatus('Approving exact bet amount…');
    const tx = await froll.approve(CONFIG.DICE, amountWei);
    await tx.wait(1);

    const after = await froll.allowance(user, CONFIG.DICE);
    if (after.gte(amountWei)) setStatus('Approve successful.');
    else setStatus('Approve seems incomplete. Please try Approve again.');
    await refreshBalances();
  } catch (e) {
    console.error('approve error:', e);
    setStatus(e.data?.message || e.error?.message || e.message || 'Approve failed.');
  }
}

/** ===================== [MỤC 12] PLAY (auto top-up allowance nếu thiếu) ===================== **/
async function onPlay(){
  if (!signer || !dice) return alert('Please connect wallet.');
  if (!currentTable.min) return setStatus('Please set a table first.');

  const amtStr = $('bet-amount').value.trim();
  if (!amtStr) return setStatus('Enter bet amount.');
  const amountWei = toWei(amtStr, frollDecimals);

  if (amountWei.lt(currentTable.min) || amountWei.gt(currentTable.max)) {
    return setStatus(`Bet amount is out of range (min–max).`);
  }

  const pool = await froll.balanceOf(CONFIG.DICE);
  if (pool.lt(amountWei.mul(2))) {
    return setStatus('Contract pool is insufficient for 2× payout. Try a smaller amount.');
  }

  // Auto top-up allowance nếu thiếu (kể cả reset 0)
  let allow = await froll.allowance(user, CONFIG.DICE);
  if (allow.lt(amountWei)) {
    try {
      setStatus('Allowance insufficient. Auto-approving…');
      if (!allow.isZero()) {
        const tx0 = await froll.approve(CONFIG.DICE, ethers.constants.Zero);
        await tx0.wait(1);
      }
      const txA = await froll.approve(CONFIG.DICE, amountWei);
      await txA.wait(1);
      allow = await froll.allowance(user, CONFIG.DICE);
      if (allow.lt(amountWei)) return setStatus('Allowance still insufficient. Please press Approve again.');
      setStatus('Allowance updated. Sending play transaction…');
    } catch (e) {
      console.error('auto-approve before play error:', e);
      return setStatus(e.data?.message || e.error?.message || e.message || 'Approve before play failed.');
    }
  } else {
    setStatus('Sending play transaction…');
  }

  startShake();
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
  }
}

/** ===================== [MỤC 13] NÚT TIỆN ÍCH & CHẴN/LẺ ===================== **/
function onClear(){ $('bet-amount').value=''; setStatus(''); }
function onHalf(){ const v=parseFloat($('bet-amount').value||'0'); if(v<=0)return; $('bet-amount').value=String(Math.max(v/2, Number(CONFIG.minMinBet))); }
function onDouble(){ const v=parseFloat($('bet-amount').value||'0'); const max=currentTable.max?parseFloat(fromWei(currentTable.max, frollDecimals, 18)):Infinity; if(v<=0){ if(currentTable.min)$('bet-amount').value=fromWei(currentTable.min, frollDecimals, 18); return; } $('bet-amount').value=String(Math.min(v*2, max)); }
function onRepeat(){ const saved=loadLastRound(); if(!saved) return setStatus('No previous round to repeat.'); currentSide=saved.side==='odd'?'odd':'even'; document.querySelectorAll('.btn.toggle').forEach(b=>b.classList.remove('active')); (currentSide==='even'?$('btn-even'):$('btn-odd')).classList.add('active'); $('bet-amount').value=saved.amount; setStatus('Repeated last round settings (side & amount).'); }
function bindSideButtons(){ $('btn-even').addEventListener('click',()=>{ currentSide='even'; $('btn-even').classList.add('active'); $('btn-odd').classList.remove('active'); }); $('btn-odd').addEventListener('click',()=>{ currentSide='odd'; $('btn-odd').classList.add('active'); $('btn-even').classList.remove('active'); }); }

/** ===================== [MỤC 14] KHỞI TẠO (tự reconnect sau refresh) ===================== **/
async function init(){
  // chờ ethers nếu đang nạp fallback
  let tries=0; while (typeof window.ethers==='undefined' && tries<20){ await new Promise(r=>setTimeout(r,150)); tries++; }
  if (typeof window.ethers==='undefined'){ setStatus('ethers.js failed to load. Check CDN/AdBlock.'); console.error('ethers not loaded'); return; }

  providerRO = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
  await showLatestContractRound();
  lastRound = loadLastRound();

  // Bind nút
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

  // Tự reconnect sau refresh (nếu user đã cấp quyền)
  await trySilentReconnectOnLoad();

  setStatus('Ready.');
}

// Gắn hàm ra window (phòng trường hợp onclick trong HTML muốn gọi thẳng)
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;

// Chạy sau DOM ready
if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
