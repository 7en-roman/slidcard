/* SlidCard v3.0 client integration */
(function(){
'use strict';

const API_URL='https://script.google.com/macros/s/AKfycby25K1rtKsIwnYNBuaFK4svjG5RQTXa8Q7uNiMvS4VR0r7kJn-qBks4wKHWGuyoahsD/exec';
const PAGE=(location.pathname.split('/').pop()||'index.html').toLowerCase();
const V3={prices:new Map(),previous:new Map(),priceRows:[],notifications:[],priceBusy:false,notifBusy:false};
const AccountRef=(typeof Account!=='undefined')?Account:null;
const CatalogCards=(typeof CARDS!=='undefined'&&Array.isArray(CARDS))?CARDS:null;
const CardMap=(typeof CARD_BY_ID!=='undefined')?CARD_BY_ID:null;
const YearMult=(typeof YEAR_PRICE_MULT!=='undefined')?YEAR_PRICE_MULT:{2026:1};
window.SlidV3=V3;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function round(v){const n=Number(v||0);return Number.isFinite(n)?Math.round(n*100)/100:0;}
function marketMoney(v){let n=round(v);if(n>0&&Math.round(n*100)%100===0)n=round(n+.17);return n;}
function fmt(v){const n=Number(v||0);if(Math.abs(n)>=1000000)return 'S$'+(n/1000000).toFixed(2)+'M';return 'S$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
window.fmtCoins=fmt;

async function api(action,data={}){
  let r;
  try{r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,data}),redirect:'follow'});}catch(e){throw new Error('Немає зв’язку з сервером');}
  let j;try{j=await r.json();}catch(e){throw new Error('Сервер повернув неправильну відповідь');}
  if(!j.success)throw new Error(j.error||'Операцію не виконано');
  return j;
}
V3.api=api;V3.fmt=fmt;

function toastV3(msg,type='info'){
  if(typeof window.toast==='function'){try{return window.toast(msg,type);}catch(_){}}
  alert(msg);
}

function account(){try{return AccountRef?.get?.()||null;}catch(_){return null;}}
function save(){try{return window.loadSave?.()||null;}catch(_){return null;}}
function write(s){try{window.writeSave?.(s);}catch(_){}}

function baseCardForKey(key){
  try{const p=window.parseCardKey?parseCardKey(key):{id:key,year:2026};return CardMap?.[p.id]||CardMap?.[key]||null;}catch(_){return null;}
}
function cardPayload(key){
  const p=window.parseCardKey?parseCardKey(key):{id:key,year:2026};
  const c=baseCardForKey(key);if(!c)return null;
  return {...c,id:key,key,baseId:p.id,year:p.year,season:p.year,marketPriceSnapshot:priceOf(key),transferVersion:3};
}
function cardKey(c){return String(c?.key||c?.id||'').trim();}
function addCardLocal(s,c){const k=cardKey(c);if(!k)throw new Error('Картка не має ключа');s.owned=s.owned||{};s.owned[k]=(s.owned[k]||0)+1;return k;}
function removeCardLocal(s,key){if(!key||(s.owned?.[key]||0)<1)throw new Error('Картки більше немає в інвентарі');s.owned[key]-=1;if(s.owned[key]<=0)delete s.owned[key];}
function markMap(s,key){s[key]=s[key]||{};return s[key];}
function logLocal(s,type,text){
  if(typeof window.addLog==='function'){addLog(s,type,text);return;}
  s.log=s.log||[];s.log.unshift({type,text,time:new Date().toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}),date:new Date().toISOString(),balanceAfter:round(s.coins)});
}

/* ---------- currency + log balance snapshots ---------- */
const oldAddLog=window.addLog;
if(typeof oldAddLog==='function'){
  window.addLog=function(s,type,text){oldAddLog(s,type,text);if(s?.log?.[0])s.log[0].balanceAfter=round(s.coins);};
}

document.querySelectorAll('.balance-icon').forEach(x=>x.textContent='S$');

/* ---------- global prices ---------- */
let oldGetCardPrice=window.getCardPrice;
function priceOf(key){
  const k=String(key||'');
  if(V3.prices.has(k))return marketMoney(V3.prices.get(k));
  // CardPrices stores one global base (2026) row per card. Older-year variants
  // are derived from that same shared base price so every player sees identical values.
  try{
    const p=window.parseCardKey?parseCardKey(k):{id:k,year:2026};
    if(p?.id&&V3.prices.has(String(p.id))){
      const mult=Number(YearMult?.[p.year]??1);
      return marketMoney(V3.prices.get(String(p.id))*mult);
    }
  }catch(_){}
  if(oldGetCardPrice){try{return round(oldGetCardPrice(save()||{},k));}catch(_){}}
  const c=baseCardForKey(k);return c?round(c.basePrice||0):0;
}
window.getCardPrice=function(_s,key){return priceOf(key);};
window.tickMarket=function(s){return s;};
V3.priceOf=priceOf;

function buildCatalog(){
  if(!CatalogCards)return [];
  // Only one server row per base card: this keeps the 2-second global tick practical
  // for Google Sheets. Year variants are derived client-side via YEAR_PRICE_MULT.
  return CatalogCards.map(c=>{
    const rawBase=typeof cardPrice==='function'?cardPrice(c):Number(c.basePrice||0);
    return {key:c.id,cardId:c.id,year:2026,name:c.name,rarity:c.rarity,sport:c.sport,team:c.team,country:c.country,rating:c.rating,pos:c.pos,icon:c.icon,basePrice:round(rawBase)};
  });
}

function renderTicker(){
  const t=document.getElementById('ticker-track');if(!t||!CatalogCards)return;
  const html=CatalogCards.slice(0,30).map(c=>{
    const p=priceOf(c.id),old=V3.previous.get(c.id)??p,up=p>=old;
    return `<span class="ticker-item"><span class="nm">${esc(c.name)}</span><span class="${up?'up':'dn'}">${up?'▲':'▼'} ${fmt(p)}</span></span>`;
  }).join('');
  t.innerHTML=html+html;
}

function refreshKnownView(){
  try{
    if(PAGE==='index_app.html'&&typeof window.render==='function')render();
    else if(PAGE==='packs.html'&&typeof window.renderAll==='function')renderAll();
    else if(PAGE==='inventory.html'&&typeof window.render==='function')render();
    else if(PAGE==='market.html'){
      if(typeof window.renderTable==='function')renderTable();
      if(typeof window.renderPublicMarket==='function')renderPublicMarket();
      if(typeof window.renderMyMarket==='function'&&Array.isArray(window.myMarketTransactions))renderMyMarket();
    }
    else if(PAGE==='trades.html'){
      if(typeof window.renderPicker==='function')renderPicker();
      if(typeof window.renderLog==='function')renderLog();
    }
    else if(PAGE==='wallet.html'&&typeof window.render==='function')render();
    else if(PAGE==='account.html'&&typeof window.render==='function')render();
    else if(PAGE==='news.html'&&typeof window.renderNews==='function')renderNews();
  }catch(e){console.debug('v3 view refresh',e);}
}

async function syncPrices(){
  if(V3.priceBusy||!CatalogCards)return;V3.priceBusy=true;
  try{
    const r=await api('getPrices',{catalog:V3.priceRows.length?[]:buildCatalog()});
    V3.priceRows=r.prices||[];V3.prices.clear();V3.previous.clear();
    V3.priceRows.forEach(x=>{V3.prices.set(String(x.key),round(x.price));V3.previous.set(String(x.key),round(x.previousPrice));});
    renderTicker();refreshKnownView();window.dispatchEvent(new CustomEvent('slidcard-prices',{detail:r}));
  }catch(e){console.debug('Price sync:',e.message);}finally{V3.priceBusy=false;}
}

/* ---------- bell notifications ---------- */
function ensureBell(){
  if(PAGE==='index.html'||PAGE==='admin.html')return;
  const row=document.querySelector('.topbar .row');if(!row||document.getElementById('v3-bell'))return;
  const bell=document.createElement('button');bell.id='v3-bell';bell.className='v3-bell';bell.type='button';bell.innerHTML='🔔<span class="v3-bell-dot" id="v3-bell-dot" style="display:none">0</span>';
  row.insertBefore(bell,row.firstChild);bell.onclick=()=>openNotifModal();
  const modal=document.createElement('div');modal.id='v3-notif-modal';modal.className='v3-modal-backdrop';modal.innerHTML=`<div class="v3-modal"><div class="v3-modal-head"><div class="v3-modal-title">🔔 Сповіщення</div><button class="v3-modal-close" type="button">✕</button></div><div class="v3-modal-body" id="v3-notif-body"><div class="v3-empty">Завантаження…</div></div></div>`;
  document.body.appendChild(modal);modal.querySelector('.v3-modal-close').onclick=()=>modal.classList.remove('open');modal.onclick=e=>{if(e.target===modal)modal.classList.remove('open');};
}
function notifIcon(type){return type==='reward'?'🎁':type==='market'?'🏷️':'📰';}
function renderNotifications(){
  const dot=document.getElementById('v3-bell-dot');const unclaimed=V3.notifications.filter(n=>n.rewardType&&!n.claimed).length;
  if(dot){dot.style.display=unclaimed?'block':'none';dot.textContent=String(Math.min(99,unclaimed));}
  const body=document.getElementById('v3-notif-body');if(!body)return;
  body.innerHTML=V3.notifications.length?V3.notifications.map(n=>`<div class="v3-notif ${!n.claimed?'new':''}"><div class="v3-notif-title">${notifIcon(n.type)} ${esc(n.title)}</div><div class="v3-notif-msg">${esc(n.message)}</div><div class="v3-notif-meta">${n.createdAt?new Date(n.createdAt).toLocaleString('uk-UA'):''}</div>${n.rewardType?`<button class="v3-reward-btn" data-claim="${esc(n.id)}" ${n.claimed?'disabled':''}>${n.claimed?'✓ Отримано':n.rewardType==='money'?`Забрати ${fmt(n.rewardAmount)}`:'Забрати нагороду'}</button>`:''}</div>`).join(''):'<div class="v3-empty">Нових сповіщень немає</div>';
  body.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>claimNotification(b.dataset.claim));
}
async function loadNotifications(){
  const a=account();if(!a?.username||V3.notifBusy)return;V3.notifBusy=true;
  try{const r=await api('listNotifications',{username:a.username});V3.notifications=r.notifications||[];renderNotifications();}catch(e){console.debug('Notifications:',e.message);}finally{V3.notifBusy=false;}
}
function openNotifModal(){document.getElementById('v3-notif-modal')?.classList.add('open');loadNotifications();renderNotifications();}
async function claimNotification(id){
  const a=account();if(!a)return;
  try{
    const r=await api('claimNotification',{username:a.username,notificationId:id});const reward=r.reward||{},s=save();if(!s)throw new Error('Локальний прогрес не знайдено');
    if(reward.type==='money'){s.coins=round(Number(s.coins||0)+Number(reward.amount||0));s.totalEarned=round(Number(s.totalEarned||0)+Number(reward.amount||0));logLocal(s,'loan',`Адмін-нагорода +${fmt(reward.amount)}`);}
    else if(reward.type==='card'&&reward.card){addCardLocal(s,reward.card);logLocal(s,'buy',`Отримано подарункову картку ${reward.card.name||cardKey(reward.card)}`);}
    write(s);updateBalanceUI();toastV3('Нагороду отримано','win');await loadNotifications();refreshKnownView();
  }catch(e){toastV3(e.message,'lose');}
}

function updateBalanceUI(){const s=save();document.querySelectorAll('#tb-coins,.balance-amount').forEach(el=>{if(el&&s)el.textContent=fmt(s.coins)});}

/* ---------- auth / account ---------- */
function bytesToB64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);}
function b64ToBytes(v){const s=atob(v),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
async function keyForFile(password,salt,iterations){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function importV3File(file,username,password){
  if(!file)throw new Error('Оберіть файл акаунта .slidcard');
  let env;try{env=JSON.parse(await file.text());}catch(_){throw new Error('Файл акаунта пошкоджений');}
  if(env?.format!=='SlidCardAccountFile'||![2,3].includes(Number(env.version)))throw new Error('Це не файл акаунта SlidCard');
  const key=await keyForFile(password,b64ToBytes(env.salt),Number(env.iterations)||150000);
  let payload;try{const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(env.iv)},key,b64ToBytes(env.data));payload=JSON.parse(new TextDecoder().decode(plain));}catch(_){throw new Error('Невірний пароль або пошкоджений файл');}
  if(payload?.format!=='SlidCardAccountPayload'||!payload?.account||!payload?.save)throw new Error('Файл акаунта не містить потрібних даних');
  if(String(payload.account.username||'').trim().toLowerCase()!==String(username).trim().toLowerCase())throw new Error('Username не відповідає файлу акаунта');
  return payload;
}
async function exportV3File(){
  const a=account(),s=save();if(!a||!s)return toastV3('Акаунт не знайдено','lose');
  const password=prompt('Введіть пароль акаунта для експорту:');if(password===null)return;
  try{
    await api('loginAccount',{username:a.username,password});
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=180000,key=await keyForFile(password,salt,iterations);
    const payload={format:'SlidCardAccountPayload',version:3,appVersion:'3.0',exportedAt:new Date().toISOString(),login:{username:a.username,password},account:a,save:s};
    const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(payload))));
    const env={format:'SlidCardAccountFile',version:3,cipher:'AES-GCM-256',kdf:'PBKDF2-SHA256',iterations,salt:bytesToB64(salt),iv:bytesToB64(iv),data:bytesToB64(encrypted)};
    const blob=new Blob([JSON.stringify(env,null,2)],{type:'application/x-slidcard+json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`SlidCard_${a.username}.slidcard`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toastV3('Файл акаунта експортовано','win');
  }catch(e){toastV3(e.message,'lose');}
}

function patchLoginPage(){
  const sub=document.querySelector('.logo-sub');if(sub)sub.textContent='SPORTS CARD PLATFORM v3.0';
  const footer=document.querySelector('.auth-card > div:last-child');if(footer)footer.textContent='Акаунт перевіряється через SlidCard DB · прогрес зберігається у файлі';
  window.doRegister=async function(){
    const err=document.getElementById('r-err'),username=document.getElementById('r-user').value.trim(),password=document.getElementById('r-pass').value,firstName=document.getElementById('r-first').value.trim(),lastName=document.getElementById('r-last').value.trim(),email=document.getElementById('r-email').value.trim();err.textContent='';
    try{
      const r=await api('registerAccount',{username,password,firstName,lastName,email});const server=r.account;
      const oldAcc=AccountRef?.get?.()||null,oldSave=Store.get(CX.SAVE_KEY);
      const migrating=oldAcc&&String(oldAcc.username||'').trim().toLowerCase()===username.toLowerCase()&&oldSave;
      const acc={...(migrating?oldAcc:{}),...server,passHash:btoa(unescape(encodeURIComponent(password))),theme:(oldAcc?.theme||'dark')};
      Store.set(CX.ACC_KEY,acc);writeSave(migrating?oldSave:defaultSave());sessionStorage.setItem('slidcard_v3_authenticated','1');
      if(migrating)alert('Акаунт додано до SlidCard DB. Твій локальний баланс і колекцію збережено. Після входу експортуй новий .slidcard v3 файл.');
      location.href='index_app.html';
    }catch(e){err.textContent=e.message;}
  };
  window.doLogin=async function(){
    const err=document.getElementById('l-err'),username=document.getElementById('l-user').value.trim(),password=document.getElementById('l-pass').value,file=document.getElementById('l-file').files?.[0];err.textContent='';
    try{
      if(username.toLowerCase()==='admin'){
        const r=await api('adminLogin',{username,password});sessionStorage.setItem('slidcard_admin_token',r.token);location.href='admin.html';return;
      }
      if(!file)throw new Error('Оберіть файл акаунта .slidcard');
      const server=await api('loginAccount',{username,password});
      const payload=await importV3File(file,username,password);const local=payload.account||{},merged={...local,...server.account,passHash:local.passHash||btoa(unescape(encodeURIComponent(password)))};
      Store.set(CX.ACC_KEY,merged);Store.set(CX.SAVE_KEY,payload.save||defaultSave());sessionStorage.setItem('slidcard_v3_authenticated','1');location.href='index_app.html';
    }catch(e){err.textContent=e.message;}
  };
}

function patchAccountPage(){
  window.exportAccountFile=exportV3File;
  const settings=document.querySelector('#modal-settings .modal-body');
  if(settings&&!document.getElementById('v3-logout-btn')){
    const box=document.createElement('div');box.style.cssText='border-top:1px solid var(--border);padding-top:12px';box.innerHTML=`<button id="v3-logout-btn" class="btn btn-block" style="background:rgba(255,77,106,.08);color:var(--down);border:1px solid rgba(255,77,106,.2)">↪ Вийти з акаунта</button><div style="font-size:9px;color:var(--text3);margin-top:6px">Перед виходом експортуй файл, якщо хочеш перенести локальні картки й баланс на інший пристрій.</div>`;settings.appendChild(box);
    box.querySelector('button').onclick=()=>{if(!confirm('Вийти з акаунта? Локальну сесію буде очищено. Переконайся, що маєш актуальний файл експорту.'))return;Store.remove(CX.ACC_KEY);Store.remove(CX.SAVE_KEY);sessionStorage.removeItem('slidcard_v3_authenticated');location.href='index.html';};
  }
  const originalSaveSettings=window.saveSettings;
  window.saveSettings=async function(){
    const a=account();if(!a)return;
    const current=prompt('Для синхронізації змін із базою введіть поточний пароль:');if(current===null)return;
    const fn=document.getElementById('set-first').value.trim(),ln=document.getElementById('set-last').value.trim(),email=document.getElementById('set-email').value.trim(),newPassword=document.getElementById('set-pass').value;
    try{
      const r=await api('updateAccount',{username:a.username,password:current,firstName:fn,lastName:ln,email,newPassword});
      const updated={...a,...r.account};if(newPassword)updated.passHash=btoa(unescape(encodeURIComponent(newPassword)));Account.update(updated);
      if(originalSaveSettings){document.getElementById('set-pass').value='';try{originalSaveSettings();}catch(_){}}
      const msg=document.getElementById('set-msg');if(msg){msg.textContent='✅ Збережено в базі';msg.style.color='var(--up)';}refreshKnownView();
    }catch(e){const msg=document.getElementById('set-msg');if(msg){msg.textContent=e.message;msg.style.color='var(--down)';}else toastV3(e.message,'lose');}
  };
}

/* ---------- UI helpers ---------- */
function ownedOptions(includeNone=true){
  const s=save(),arr=Object.entries(s?.owned||{}).filter(([,q])=>q>0).map(([k,q])=>{const c=baseCardForKey(k),p=window.parseCardKey?parseCardKey(k):{year:2026};return c?{k,q,c,year:p.year}:null;}).filter(Boolean).sort((a,b)=>a.c.name.localeCompare(b.c.name));
  return (includeNone?'<option value="">— Без картки —</option>':'<option value="">— Обери картку —</option>')+arr.map(x=>`<option value="${esc(x.k)}">${esc(x.c.name)} · ${x.year} · x${x.q} · ${fmt(priceOf(x.k))}</option>`).join('');
}
function catalogOptions(includeNone=true){
  if(!CatalogCards)return includeNone?'<option value="">— Без конкретної картки —</option>':'';
  const years=Object.keys(YearMult).map(Number).sort((a,b)=>b-a),arr=[];
  CatalogCards.forEach(c=>years.forEach(year=>{const k=year===2026?c.id:c.id+'_'+year;arr.push({k,c,year});}));
  arr.sort((a,b)=>a.c.name.localeCompare(b.c.name)||b.year-a.year);
  return (includeNone?'<option value="">— Без конкретної картки —</option>':'')+arr.map(x=>`<option value="${esc(x.k)}">${esc(x.c.name)} · ${x.year} · ${fmt(priceOf(x.k))}</option>`).join('');
}
function cardLabelFromKey(key){if(!key)return 'Без конкретної картки';const p=window.parseCardKey?parseCardKey(key):{id:key,year:2026},c=baseCardForKey(key);return c?`${c.name} · ${p.year}`:String(key);}
function miniCard(c){
  if(!c)return '<div class="v3-card-mini" style="align-items:center;color:var(--text3);font-size:10px">Без картки</div>';
  const k=cardKey(c),p=window.parseCardKey?parseCardKey(k):{id:c.baseId||k,year:c.year||2026},b=CardMap?.[c.baseId||p.id]||CardMap?.[p.id]||c,year=c.year||c.season||p.year||2026;
  const html=window.SlidCardCard?.render?SlidCardCard.render(b,{year,showPrice:false,scale:.56,fixedSlot:true}):`<div>${esc(b.name||c.name)}</div>`;
  return `<div class="v3-card-mini">${html}</div>`;
}
function statusLabel(s){return {pending:'Очікує',pending_response:'Очікує відповіді',awaiting_sender_confirm:'Потрібне підтвердження',completed:'Завершено',canceled:'Скасовано'}[s]||s;}

/* ---------- private sales by username ---------- */
let privateSales=[];
function patchPrivateSales(){
  const root=document.querySelector('.main-content');if(!root)return;
  root.innerHTML=`<div class="v3-page"><div class="v3-page-head"><div><div class="v3-page-title">🤝 Приватні продажі</div><div class="v3-page-sub">Без ручних Transaction ID. Вкажи username — пропозиція автоматично з’явиться в акаунті потрібного користувача. Комісія приватного продажу: 2%.</div></div><button class="v3-btn" id="v3-sale-refresh">↻ Оновити</button></div><div class="v3-grid-2"><section class="v3-panel"><div class="v3-panel-head"><div class="v3-panel-title">Створити пропозицію</div></div><div class="v3-panel-body"><div class="v3-field"><label>Username покупця</label><input id="v3-sale-user" class="v3-input" placeholder="username"></div><div id="v3-sale-user-result" class="v3-user-result"></div><div class="v3-field"><label>Твоя картка</label><select id="v3-sale-card" class="v3-input">${ownedOptions(false)}</select></div><div class="v3-field"><label>Ціна</label><input id="v3-sale-price" class="v3-input" type="number" min="0" step="0.01" placeholder="0.00"></div><div id="v3-sale-net" style="font-size:10px;color:var(--text3);margin:-4px 0 10px">Після 2% комісії: —</div><div class="v3-field"><label>Опис</label><textarea id="v3-sale-desc" class="v3-input" rows="3" placeholder="Необов’язково"></textarea></div><button id="v3-sale-create" class="v3-btn primary" style="width:100%">Створити приватний продаж</button></div></section><section class="v3-panel"><div class="v3-panel-head"><div class="v3-panel-title">Мої приватні заявки</div><span style="font-size:9px;color:var(--text3)">пошук за username автоматичний</span></div><div class="v3-panel-body"><div class="v3-list" id="v3-sale-list"><div class="v3-empty">Завантаження…</div></div></div></section></div></div>`;
  const salePanels=root.querySelectorAll('section.v3-panel');if(salePanels[1])salePanels[1].remove();
  const saleHead=root.querySelector('.v3-page-head');const saleOpen=document.createElement('button');saleOpen.id='v3-sale-open-list';saleOpen.className='v3-btn primary';saleOpen.textContent='📋 Мої приватні продажі';saleHead.appendChild(saleOpen);
  const saleModal=document.createElement('div');saleModal.id='v3-sale-list-modal';saleModal.className='v3-modal-backdrop';saleModal.innerHTML='<div class="v3-modal"><div class="v3-modal-head"><div class="v3-modal-title">📋 Мої приватні продажі</div><button class="v3-modal-close">✕</button></div><div class="v3-modal-body"><div class="v3-list" id="v3-sale-list"><div class="v3-empty">Завантаження…</div></div></div></div>';document.body.appendChild(saleModal);saleOpen.onclick=()=>{saleModal.classList.add('open');loadPrivateSales();};saleModal.querySelector('.v3-modal-close').onclick=()=>saleModal.classList.remove('open');saleModal.onclick=e=>{if(e.target===saleModal)saleModal.classList.remove('open');};
  document.getElementById('v3-sale-refresh').onclick=loadPrivateSales;
  document.getElementById('v3-sale-price').oninput=e=>{const p=Math.max(0,Number(e.target.value||0));document.getElementById('v3-sale-net').textContent='Після 2% комісії: '+fmt(p*.98);};
  let userTimer;document.getElementById('v3-sale-user').oninput=e=>{clearTimeout(userTimer);const u=e.target.value.trim(),out=document.getElementById('v3-sale-user-result');out.textContent='';if(u.length<3)return;userTimer=setTimeout(async()=>{try{const r=await api('lookupAccount',{username:u});out.textContent=r.exists?'✓ '+r.account.username:'Користувача не знайдено';out.style.color=r.exists?'var(--up)':'var(--down)';}catch(_){out.textContent='';}},350);};
  document.getElementById('v3-sale-create').onclick=createPrivateSale;loadPrivateSales();setInterval(loadPrivateSales,6000);
}
async function createPrivateSale(){
  const a=account(),s=save(),target=document.getElementById('v3-sale-user').value.trim(),key=document.getElementById('v3-sale-card').value,price=round(document.getElementById('v3-sale-price').value),description=document.getElementById('v3-sale-desc').value.trim();
  if(!target||!key)return toastV3('Вкажи username і картку','warn');if(price<0)return toastV3('Невірна ціна','warn');
  const card=cardPayload(key);try{
    const r=await api('privateSaleCreate',{sellerId:a.id,sellerUsername:a.username,targetUsername:target,card,price,description});const latest=save();removeCardLocal(latest,key);markMap(latest,'v3PrivateSaleEscrow')[r.transaction.id]={cardKey:key,at:new Date().toISOString()};logLocal(latest,'sell',`Приватний продаж для @${target}: ${card.name} за ${fmt(price)}`);write(latest);updateBalanceUI();document.getElementById('v3-sale-card').innerHTML=ownedOptions(false);toastV3('Пропозицію створено','win');loadPrivateSales();
  }catch(e){toastV3(e.message,'lose');}
}
async function loadPrivateSales(){
  const a=account();if(!a?.username)return;try{const r=await api('privateSalesList',{username:a.username});privateSales=r.transactions||[];reconcilePrivateSales();renderPrivateSales();}catch(e){const el=document.getElementById('v3-sale-list');if(el)el.innerHTML=`<div class="v3-empty">${esc(e.message)}</div>`;}
}
function reconcilePrivateSales(){
  const a=account(),s=save();if(!s)return;let changed=false;const restored=markMap(s,'v3PrivateSaleRestored');
  privateSales.forEach(t=>{if(t.status==='canceled'&&String(t.sellerId)===String(a.id)&&!restored[t.id]){const escrow=s.v3PrivateSaleEscrow?.[t.id];if(escrow||t.card){addCardLocal(s,t.card);restored[t.id]=true;if(s.v3PrivateSaleEscrow)delete s.v3PrivateSaleEscrow[t.id];changed=true;}}});if(changed){write(s);document.getElementById('v3-sale-card')&&(document.getElementById('v3-sale-card').innerHTML=ownedOptions(false));}
}
function renderPrivateSales(){
  const el=document.getElementById('v3-sale-list');if(!el)return;const a=account(),s=save();
  el.innerHTML=privateSales.length?privateSales.map(t=>{
    const seller=String(t.sellerId)===String(a.id),buyer=String(t.targetUsername||'').toLowerCase()===String(a.username||'').toLowerCase();let actions='';
    if(seller&&t.status==='pending')actions=`<button class="v3-btn bad" data-sale-cancel="${esc(t.id)}">Скасувати</button>`;
    if(buyer&&t.status==='pending')actions+=`<button class="v3-btn primary" data-sale-buy="${esc(t.id)}">Купити за ${fmt(t.price)}</button>`;
    if(seller&&t.status==='completed'&&!t.sellerClaimed)actions=`<button class="v3-btn good" data-sale-claim="${esc(t.id)}">💰 Отримати ${fmt(t.sellerAmount)}</button>`;
    return `<div class="v3-offer"><div class="v3-offer-card">${miniCard(t.card)}</div><div class="v3-offer-main"><div class="v3-offer-top"><div class="v3-offer-title">${esc(t.card?.name||'Картка')} <span style="color:var(--text3);font-weight:500">${seller?'→ @'+t.targetUsername:'від @'+t.sellerUsername}</span></div><span class="v3-status ${esc(t.status)}">${esc(statusLabel(t.status))}</span></div><div class="v3-kv"><div><small>Ціна</small><strong>${fmt(t.price)}</strong></div><div><small>Комісія</small><strong>${t.feePercent}% · ${fmt(t.feeAmount)}</strong></div><div><small>Ринкова ціна</small><strong>${fmt(t.card?.marketPriceSnapshot||priceOf(cardKey(t.card)))}</strong></div><div><small>Продавцю</small><strong>${fmt(t.sellerAmount)}</strong></div></div>${t.description?`<div style="font-size:10px;color:var(--text3)">${esc(t.description)}</div>`:''}<div class="v3-actions">${actions}</div></div></div>`;
  }).join(''):'<div class="v3-empty">Приватних заявок поки немає</div>';
  el.querySelectorAll('[data-sale-buy]').forEach(b=>b.onclick=()=>acceptPrivateSale(b.dataset.saleBuy));el.querySelectorAll('[data-sale-cancel]').forEach(b=>b.onclick=()=>cancelPrivateSale(b.dataset.saleCancel));el.querySelectorAll('[data-sale-claim]').forEach(b=>b.onclick=()=>claimPrivateSale(b.dataset.saleClaim));
}
async function acceptPrivateSale(id){
  const t=privateSales.find(x=>x.id===id),a=account(),s=save();if(!t)return;if(Number(s.coins||0)<Number(t.price||0))return toastV3('Недостатньо S$','lose');
  try{const r=await api('privateSaleAccept',{transactionId:id,buyerId:a.id,buyerUsername:a.username});const latest=save(),applied=markMap(latest,'v3PrivateSaleApplied');if(!applied[id]){latest.coins=round(latest.coins-Number(t.price||0));addCardLocal(latest,r.card||t.card);latest.totalSpent=round(Number(latest.totalSpent||0)+Number(t.price||0));latest.cardsBought=(latest.cardsBought||0)+1;applied[id]=true;logLocal(latest,'buy',`Приватна купівля ${t.card?.name||'картки'} за ${fmt(t.price)}`);write(latest);}updateBalanceUI();toastV3('Картку отримано','win');loadPrivateSales();}catch(e){toastV3(e.message,'lose');}
}
async function cancelPrivateSale(id){const a=account();try{await api('cancel',{transactionId:id,sellerId:a.id});toastV3('Продаж скасовано','win');loadPrivateSales();}catch(e){toastV3(e.message,'lose');}}
async function claimPrivateSale(id){const a=account(),s=save();try{const r=await api('claim',{transactionId:id,sellerId:a.id}),claimed=markMap(s,'v3PrivateSaleClaims');if(!claimed[id]){s.coins=round(Number(s.coins||0)+Number(r.amount||0));s.totalEarned=round(Number(s.totalEarned||0)+Number(r.amount||0));s.cardsSold=(s.cardsSold||0)+1;claimed[id]=true;if(s.v3PrivateSaleEscrow)delete s.v3PrivateSaleEscrow[id];logLocal(s,'sell',`Отримано ${fmt(r.amount)} за приватний продаж`);write(s);}updateBalanceUI();toastV3('Гроші отримано','win');loadPrivateSales();}catch(e){toastV3(e.message,'lose');}}

/* ---------- negotiated private exchanges ---------- */
let exchanges=[];
function patchPrivateExchanges(){
  const root=document.querySelector('.main-content');if(!root)return;
  root.innerHTML=`<div class="v3-page"><div class="v3-page-head"><div><div class="v3-page-title">🔐 Приватні обміни v3</div><div class="v3-page-sub">Обмін прив’язаний до username. Отримувач формує відповідь або контрпропозицію, після чого автор обміну ще раз підтверджує фінальні умови. Комісії між користувачами немає.</div></div><button class="v3-btn" id="v3-ex-refresh">↻ Оновити</button></div><div class="v3-grid-2"><section class="v3-panel"><div class="v3-panel-head"><div class="v3-panel-title">Нова пропозиція</div></div><div class="v3-panel-body"><div class="v3-field"><label>Username</label><input id="v3-ex-user" class="v3-input" placeholder="username"></div><div id="v3-ex-user-result" class="v3-user-result"></div><div class="v3-field"><label>Картка, яку віддаєш</label><select id="v3-ex-card" class="v3-input">${ownedOptions(true)}</select></div><div class="v3-field"><label>S$, які віддаєш</label><input id="v3-ex-coins" class="v3-input" type="number" min="0" step="0.01" value="0"></div><div class="v3-field"><label>Картка, яку хочеш отримати</label><select id="v3-ex-request-card" class="v3-input">${catalogOptions(true)}</select></div><div class="v3-field"><label>Скільки S$ хочеш отримати</label><input id="v3-ex-request" class="v3-input" type="number" min="0" step="0.01" value="0"></div><div class="v3-field"><label>Що хочеш отримати / коментар</label><textarea id="v3-ex-desc" class="v3-input" rows="3" placeholder="Наприклад: хочу Epic F1 2024 або запропонуй свою картку"></textarea></div><button id="v3-ex-create" class="v3-btn primary" style="width:100%">Надіслати пропозицію</button></div></section><section class="v3-panel"><div class="v3-panel-head"><div class="v3-panel-title">Мої обміни</div><span style="font-size:9px;color:var(--text3)">ID прихований — усе через username</span></div><div class="v3-panel-body"><div id="v3-ex-list" class="v3-list"><div class="v3-empty">Завантаження…</div></div></div></section></div></div>`;
  const exPanels=root.querySelectorAll('section.v3-panel');if(exPanels[1])exPanels[1].remove();
  const exHead=root.querySelector('.v3-page-head');const exOpen=document.createElement('button');exOpen.id='v3-ex-open-list';exOpen.className='v3-btn primary';exOpen.textContent='📋 Мої приватні обміни';exHead.appendChild(exOpen);
  const exModal=document.createElement('div');exModal.id='v3-ex-list-modal';exModal.className='v3-modal-backdrop';exModal.innerHTML='<div class="v3-modal"><div class="v3-modal-head"><div class="v3-modal-title">📋 Мої приватні обміни</div><button class="v3-modal-close">✕</button></div><div class="v3-modal-body"><div id="v3-ex-list" class="v3-list"><div class="v3-empty">Завантаження…</div></div></div></div>';document.body.appendChild(exModal);exOpen.onclick=()=>{exModal.classList.add('open');loadExchanges();};exModal.querySelector('.v3-modal-close').onclick=()=>exModal.classList.remove('open');exModal.onclick=e=>{if(e.target===exModal)exModal.classList.remove('open');};
  document.getElementById('v3-ex-refresh').onclick=loadExchanges;document.getElementById('v3-ex-create').onclick=createExchangeV3;
  let timer;document.getElementById('v3-ex-user').oninput=e=>{clearTimeout(timer);const u=e.target.value.trim(),out=document.getElementById('v3-ex-user-result');out.textContent='';if(u.length<3)return;timer=setTimeout(async()=>{try{const r=await api('lookupAccount',{username:u});out.textContent=r.exists?'✓ '+r.account.username:'Користувача не знайдено';out.style.color=r.exists?'var(--up)':'var(--down)';}catch(_){}},350);};
  loadExchanges();setInterval(loadExchanges,6000);
}
async function createExchangeV3(){
  const a=account(),s=save(),target=document.getElementById('v3-ex-user').value.trim(),key=document.getElementById('v3-ex-card').value,offerCoins=round(document.getElementById('v3-ex-coins').value),requestCardKey=document.getElementById('v3-ex-request-card').value,requestCoins=round(document.getElementById('v3-ex-request').value),description=document.getElementById('v3-ex-desc').value.trim();
  if(!target)return toastV3('Вкажи username','warn');if(!key&&offerCoins<=0)return toastV3('Додай картку або S$','warn');if(s.coins<offerCoins)return toastV3('Недостатньо S$','lose');
  try{const r=await api('exchangeCreate',{senderId:a.id,senderUsername:a.username,targetUsername:target,offerCard:key?cardPayload(key):null,offerCoins,requestCardKey,requestCoins,description});const latest=save();if(key)removeCardLocal(latest,key);latest.coins=round(latest.coins-offerCoins);markMap(latest,'v3ExchangeEscrow')[r.exchange.id]={cardKey:key||'',coins:offerCoins};logLocal(latest,'trade',`Пропозиція обміну → @${target}`);write(latest);updateBalanceUI();document.getElementById('v3-ex-card').innerHTML=ownedOptions(true);toastV3('Пропозицію надіслано','win');loadExchanges();}catch(e){toastV3(e.message,'lose');}
}
async function loadExchanges(){const a=account();if(!a?.username)return;try{const r=await api('exchangeListByUsername',{username:a.username});exchanges=r.exchanges||[];reconcileExchanges();renderExchanges();}catch(e){const el=document.getElementById('v3-ex-list');if(el)el.innerHTML=`<div class="v3-empty">${esc(e.message)}</div>`;}}
function reconcileExchanges(){
  const a=account(),s=save();if(!s)return;let changed=false;const done=markMap(s,'v3ExchangeCancelRestored');
  exchanges.forEach(x=>{if(x.status!=='canceled'||done[x.id])return;const sender=String(x.senderId)===String(a.id),receiver=String(x.targetUsername||'').toLowerCase()===String(a.username||'').toLowerCase();if(sender&&s.v3ExchangeEscrow?.[x.id]){const e=s.v3ExchangeEscrow[x.id];if(e.cardKey)addCardLocal(s,x.offerCard);s.coins=round(Number(s.coins||0)+Number(e.coins||0));delete s.v3ExchangeEscrow[x.id];changed=true;}if(receiver&&s.v3ExchangeResponseEscrow?.[x.id]){const e=s.v3ExchangeResponseEscrow[x.id];if(e.cardKey)addCardLocal(s,x.responseCard);s.coins=round(Number(s.coins||0)+Number(e.coins||0));delete s.v3ExchangeResponseEscrow[x.id];changed=true;}done[x.id]=true;});if(changed){write(s);updateBalanceUI();document.getElementById('v3-ex-card')&&(document.getElementById('v3-ex-card').innerHTML=ownedOptions(true));}
}
function exchangeCardsHtml(x){const requested=[x.requestCardKey?esc(cardLabelFromKey(x.requestCardKey)):'',x.requestCoins?fmt(x.requestCoins):''].filter(Boolean).join(' + ')||'Будь-яка контрпропозиція';return `<div class="v3-kv"><div><small>@${esc(x.senderUsername)} віддає</small><strong>${esc(x.offerCard?.name||'Без картки')} ${x.offerCoins?'+ '+fmt(x.offerCoins):''}</strong></div><div><small>Початково просить</small><strong>${requested}</strong></div><div><small>@${esc(x.targetUsername)} відповідь</small><strong>${x.responseCard||x.responseCoins?`${esc(x.responseCard?.name||'Без картки')} ${x.responseCoins?'+ '+fmt(x.responseCoins):''}`:'Ще немає'}</strong></div></div>`;}
function renderExchanges(){
  const el=document.getElementById('v3-ex-list');if(!el)return;const a=account();el.innerHTML=exchanges.length?exchanges.map(x=>{
    const sender=String(x.senderId)===String(a.id),receiver=String(x.targetUsername||'').toLowerCase()===String(a.username||'').toLowerCase();let act='';
    if(receiver&&x.status==='pending_response')act=`<button class="v3-btn good" data-ex-accept="${esc(x.id)}">✓ Прийняти умови</button><button class="v3-btn primary" data-ex-respond="${esc(x.id)}">Запропонувати зміни</button><button class="v3-btn bad" data-ex-cancel="${esc(x.id)}">Відхилити</button>`;
    if(sender&&x.status==='pending_response')act=`<button class="v3-btn bad" data-ex-cancel="${esc(x.id)}">Скасувати</button>`;
    if(sender&&x.status==='awaiting_sender_confirm')act=`<button class="v3-btn good" data-ex-confirm="${esc(x.id)}">✓ Підтвердити фінальні умови</button><button class="v3-btn bad" data-ex-cancel="${esc(x.id)}">Відхилити</button>`;
    if(receiver&&x.status==='awaiting_sender_confirm')act=`<span style="font-size:10px;color:var(--gold)">Очікуємо фінального підтвердження @${esc(x.senderUsername)}</span><button class="v3-btn bad" data-ex-cancel="${esc(x.id)}">Скасувати</button>`;
    if(sender&&x.status==='completed'&&!x.senderClaimed)act=`<button class="v3-btn good" data-ex-claim-s="${esc(x.id)}">Отримати відповідь</button>`;
    if(receiver&&x.status==='completed'&&!x.receiverClaimed)act+=`<button class="v3-btn good" data-ex-claim-r="${esc(x.id)}">Отримати пропозицію</button>`;
    return `<div class="v3-offer"><div class="v3-offer-card">${miniCard(x.offerCard)}</div><div class="v3-offer-main"><div class="v3-offer-top"><div class="v3-offer-title">${sender?'Для @'+esc(x.targetUsername):'Від @'+esc(x.senderUsername)}</div><span class="v3-status ${esc(x.status)}">${esc(statusLabel(x.status))}</span></div>${exchangeCardsHtml(x)}${x.requestCoins?`<div style="font-size:10px;color:var(--text3)">Запитано: ${fmt(x.requestCoins)}</div>`:''}${x.description?`<div style="font-size:10px;color:var(--text3);margin-top:4px">${esc(x.description)}</div>`:''}<div class="v3-actions">${act}</div></div></div>`;
  }).join(''):'<div class="v3-empty">Активних приватних обмінів немає</div>';
  el.querySelectorAll('[data-ex-accept]').forEach(b=>b.onclick=()=>acceptExchangeOriginal(b.dataset.exAccept));el.querySelectorAll('[data-ex-respond]').forEach(b=>b.onclick=()=>openExchangeResponse(b.dataset.exRespond));el.querySelectorAll('[data-ex-confirm]').forEach(b=>b.onclick=()=>confirmExchange(b.dataset.exConfirm));el.querySelectorAll('[data-ex-cancel]').forEach(b=>b.onclick=()=>cancelExchange(b.dataset.exCancel));el.querySelectorAll('[data-ex-claim-s]').forEach(b=>b.onclick=()=>claimExchangeSender(b.dataset.exClaimS));el.querySelectorAll('[data-ex-claim-r]').forEach(b=>b.onclick=()=>claimExchangeReceiver(b.dataset.exClaimR));
}
function openExchangeResponse(id){
  const x=exchanges.find(v=>v.id===id);if(!x)return;let modal=document.getElementById('v3-ex-response-modal');if(!modal){modal=document.createElement('div');modal.id='v3-ex-response-modal';modal.className='v3-modal-backdrop';document.body.appendChild(modal);}modal.innerHTML=`<div class="v3-modal" style="max-width:560px"><div class="v3-modal-head"><div class="v3-modal-title">Контрпропозиція для @${esc(x.senderUsername)}</div><button class="v3-modal-close">✕</button></div><div class="v3-modal-body">${exchangeCardsHtml(x)}<div class="v3-field"><label>Твоя картка у відповідь</label><select id="v3-ex-response-card" class="v3-input">${ownedOptions(true)}</select></div><div class="v3-field"><label>S$ у відповідь</label><input id="v3-ex-response-coins" class="v3-input" type="number" min="0" step="0.01" value="${esc(x.requestCoins||0)}"></div><div style="font-size:10px;color:var(--text3);margin-bottom:12px">Після відправлення автор побачить твої умови й повинен підтвердити їх ще раз.</div><button class="v3-btn primary" id="v3-ex-response-send" style="width:100%">Надіслати умови</button></div></div>`;modal.classList.add('open');modal.querySelector('.v3-modal-close').onclick=()=>modal.classList.remove('open');modal.onclick=e=>{if(e.target===modal)modal.classList.remove('open');};const responseSelect=modal.querySelector('#v3-ex-response-card');if(x.requestCardKey&&responseSelect&&Array.from(responseSelect.options).some(o=>o.value===x.requestCardKey))responseSelect.value=x.requestCardKey;modal.querySelector('#v3-ex-response-send').onclick=()=>respondExchange(id,modal);
}
async function acceptExchangeOriginal(id){
  const x=exchanges.find(v=>v.id===id),a=account(),s=save();if(!x||!a||!s)return;
  const key=String(x.requestCardKey||''),coins=round(x.requestCoins||0);
  if(key&&(s.owned?.[key]||0)<1)return toastV3('У тебе немає запитаної картки: '+cardLabelFromKey(key),'lose');
  if(Number(s.coins||0)<coins)return toastV3('Недостатньо S$ для прийняття умов','lose');
  try{
    await api('exchangeAccept',{exchangeId:id,receiverId:a.id,receiverUsername:a.username,responseCard:key?cardPayload(key):null,responseCardKey:key,responseCoins:coins});
    const latest=save();if(key)removeCardLocal(latest,key);latest.coins=round(Number(latest.coins||0)-coins);markMap(latest,'v3ExchangeResponseEscrow')[id]={cardKey:key,coins};logLocal(latest,'trade','Прийнято початкові умови приватного обміну');write(latest);updateBalanceUI();toastV3('Умови прийнято — обмін завершено','win');await claimExchangeReceiver(id);loadExchanges();
  }catch(e){toastV3(e.message,'lose');}
}
async function respondExchange(id,modal){
  const a=account(),s=save(),key=document.getElementById('v3-ex-response-card').value,coins=round(document.getElementById('v3-ex-response-coins').value);if(s.coins<coins)return toastV3('Недостатньо S$','lose');
  try{const r=await api('exchangeRespond',{exchangeId:id,receiverId:a.id,receiverUsername:a.username,responseCard:key?cardPayload(key):null,responseCardKey:key,responseCoins:coins});const latest=save();if(key)removeCardLocal(latest,key);latest.coins=round(latest.coins-coins);markMap(latest,'v3ExchangeResponseEscrow')[id]={cardKey:key||'',coins};logLocal(latest,'trade','Надіслано відповідь на приватний обмін');write(latest);updateBalanceUI();modal.classList.remove('open');toastV3('Умови надіслано автору','win');loadExchanges();}catch(e){toastV3(e.message,'lose');}
}
async function confirmExchange(id){const a=account();try{await api('exchangeConfirm',{exchangeId:id,senderId:a.id});toastV3('Фінальні умови підтверджено','win');await claimExchangeSender(id);loadExchanges();}catch(e){toastV3(e.message,'lose');}}
async function claimExchangeSender(id){const a=account(),s=save();try{const r=await api('exchangeClaimSender',{exchangeId:id,senderId:a.id}),done=markMap(s,'v3ExchangeSenderApplied');if(!done[id]){if(r.responseCard)addCardLocal(s,r.responseCard);s.coins=round(Number(s.coins||0)+Number(r.responseCoins||0));done[id]=true;if(s.v3ExchangeEscrow)delete s.v3ExchangeEscrow[id];logLocal(s,'trade','Приватний обмін завершено — отримано відповідь');write(s);}updateBalanceUI();toastV3('Обмін завершено','win');loadExchanges();}catch(e){toastV3(e.message,'lose');}}
async function claimExchangeReceiver(id){const a=account(),s=save();try{const r=await api('exchangeClaimReceiver',{exchangeId:id,receiverId:a.id,receiverUsername:a.username}),done=markMap(s,'v3ExchangeReceiverApplied');if(!done[id]){if(r.offerCard)addCardLocal(s,r.offerCard);s.coins=round(Number(s.coins||0)+Number(r.offerCoins||0));done[id]=true;if(s.v3ExchangeResponseEscrow)delete s.v3ExchangeResponseEscrow[id];logLocal(s,'trade','Приватний обмін завершено — отримано пропозицію');write(s);}updateBalanceUI();toastV3('Пропозицію отримано','win');loadExchanges();}catch(e){toastV3(e.message,'lose');}}
async function cancelExchange(id){const a=account();try{await api('exchangeCancel',{exchangeId:id,userId:a.id,username:a.username});toastV3('Обмін скасовано','win');loadExchanges();}catch(e){toastV3(e.message,'lose');}}

/* ---------- 2% bot trade fee ---------- */
function patchBotTradeFee(){
  if(PAGE!=='trades.html'||typeof window.tradeCards!=='function')return;const original=window.tradeCards;
  window.tradeCards=function(s,myKey,botKey){const fee=round(priceOf(botKey)*.02);if(Number(s.coins||0)<fee)return{success:false,reason:`Потрібно ${fmt(fee)} для 2% податку`};const r=original(s,myKey,botKey);if(r?.success){s.coins=round(Number(s.coins||0)-fee);s.totalSpent=round(Number(s.totalSpent||0)+fee);logLocal(s,'trade',`Податок за обмін із ботом: ${fmt(fee)} (2%)`);write(s);updateBalanceUI();}return r;};
}

/* ---------- hourly prepared news + redesigned price window ---------- */
const EXTRA_NEWS=[
 ['🏎️ Команда Sterling GP представила новий аеропакет перед наступним етапом.','f1'],['⚽ Madrid Royale оголосив про оновлення молодіжної академії.','soccer'],['🏀 Denver Peaks завершує серію домашніх матчів із позитивним балансом.','basketball'],['🎾 Турнірний тиждень переходить у вирішальну стадію.','tennis'],['🏈 Kansas Monarchs тестує нову атакувальну схему.','football'],['⚾ Los Angeles Stars готує ротацію перед важливою серією.','baseball'],['🥊 Global Combat League анонсував новий головний бій.','mma'],['🏁 Пелотон Stock Car готується до нічного етапу.','nascar'],['🚗 Endurance-команди завершили передгоночні тести.','imsa'],['🏆 GT Racing опублікував оновлений календар наступного раунду.','sro'],['🏐 Kyiv Volley продовжує переможну домашню серію.','volleyball'],['📊 Аналітики SlidCard відзначили підвищену активність ринку рідкісних карток.','all'],['🔥 Колекціонери активніше полюють на сезони 2020–2022.','all'],['📦 Сьогодні користувачі частіше відкривають паки з автоспорту.','all'],['💹 Ринок карток увійшов у фазу підвищеної короткострокової волатильності.','all'],['🌟 Epic-картки цього циклу привертають найбільше уваги трейдерів.','all'],['🧊 Частина Legendary-карток стабілізується після ранкового руху.','all'],['🎯 Попит на конкретні роки випуску зростає нерівномірно.','all'],['📰 SlidCard News підготував нову годинну добірку подій.','all'],['🔔 Стеж за дзвіночком — адміністративні акції з’являються там першими.','all'],['💰 У User Market зросла кількість приватних пропозицій.','all'],['🔄 Користувачі активніше використовують нову систему контрпропозицій.','all'],['🏅 Колекції командних карток набирають популярності.','all'],['📈 Частина Ultimate-карток показує різкі 2-секундні коливання.','all']
];
function patchNews(){
  if(PAGE!=='news.html')return;
  window.renderNews=function(){
    const pb=document.getElementById('prices-bar');if(pb){pb.className='v3-price-strip';const rows=(V3.priceRows||[]).filter(x=>x.year===2026).sort((a,b)=>b.price-a.price).slice(0,12);pb.innerHTML=rows.map(x=>{const ch=x.previousPrice?((x.price-x.previousPrice)/x.previousPrice*100):0,up=ch>=0;return `<div class="v3-price-tile"><div class="v3-price-name">${esc(x.name)}</div><div class="v3-price-value">${fmt(x.price)}</div><div class="v3-price-change" style="color:${up?'var(--up)':'var(--down)'}">${up?'▲':'▼'} ${Math.abs(ch).toFixed(2)}%</div></div>`;}).join('');}
    const grid=document.getElementById('news-grid');if(!grid)return;grid.className='v3-news-grid';const hour=Math.floor(Date.now()/3600000),base=(typeof SPORT_NEWS!=='undefined'&&Array.isArray(SPORT_NEWS)?SPORT_NEWS:[]).map(n=>[n.text,n.sport]),pool=[...base,...EXTRA_NEWS],filter=typeof nF!=='undefined'?nF:'all';const ordered=pool.map((n,i)=>pool[(i+hour)%pool.length]).filter(n=>filter==='all'||n[1]===filter||n[1]==='all').slice(0,16);grid.innerHTML=ordered.map((n,i)=>`<div class="v3-news-card"><div class="v3-news-icon">${n[0].match(/^\S+/)?.[0]||'📰'}</div><div><div class="v3-news-title">${esc(n[0])}</div><div class="v3-news-time">Добірка #${(hour%24)+1} · оновлюється щогодини</div></div></div>`).join('');
  };
  renderNews();setInterval(renderNews,60000);
}

/* ---------- wallet transaction balance column ---------- */
function patchWallet(){
  if(PAGE!=='wallet.html')return;const table=document.getElementById('hist-tbody')?.closest('table');if(!table)return;const head=table.querySelector('thead tr');if(head&&!Array.from(head.children).some(x=>x.textContent.includes('Баланс')))head.children[2]?.insertAdjacentHTML('afterend','<th>Баланс після</th>');
  const oldRender=window.render;if(typeof oldRender!=='function')return;
  window.render=function(){oldRender();const tbody=document.getElementById('hist-tbody'),logs=(save()?.log||[]).slice(0,80);if(!tbody)return;const rows=tbody.querySelectorAll('tr');rows.forEach((tr,i)=>{if(!logs[i]||tr.children.length<4)return;if(tr.children.length===4)tr.children[2].insertAdjacentHTML('afterend',`<td class="v3-balance-after">${logs[i].balanceAfter!=null?fmt(logs[i].balanceAfter):'—'}</td>`);});};render();
}

/* ---------- init ---------- */
function updateVersion(){document.querySelectorAll('.brand-ver').forEach(x=>x.textContent='v3.0');document.title=document.title.replace(/v2\.1\.1/gi,'v3.0');}
function init(){
  updateVersion();document.querySelectorAll('.balance-icon').forEach(x=>x.textContent='S$');
  if(PAGE==='index.html'){patchLoginPage();return;}
  if(PAGE!=='admin.html'&&account()&&sessionStorage.getItem('slidcard_v3_authenticated')!=='1'){location.href='index.html';return;}
  ensureBell();loadNotifications();setInterval(loadNotifications,15000);
  if(CatalogCards){syncPrices();setInterval(syncPrices,2000);}renderTicker();
  if(PAGE==='account.html')patchAccountPage();
  if(PAGE==='transactions.html')patchPrivateSales();
  if(PAGE==='user_exchanges.html')patchPrivateExchanges();
  patchBotTradeFee();patchNews();patchWallet();updateBalanceUI();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})();
