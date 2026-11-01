window.SlidCardCard={
  render(card,opts={}){
    if(!card)return '';
    const r=card.rarity||'common', label=(window.RARITY&&RARITY[r]?.label)||r;
    const year=opts.year??2026, qty=opts.qty, price=opts.price, showPrice=opts.showPrice!==false;
    const fmt=window.fmtCoins||((n)=>'$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
    const yearHtml=(typeof window.getYearBadge==='function')?getYearBadge(year,r):`<div class="sc-year">${year}</div>`;
    const html=`<div class="sport-card rarity-${r}"><div class="sc-bg"></div><div class="sc-rarity-glow"></div>${qty!=null?`<div class="sc-cnt">x${qty}</div>`:''}<div class="sc-rarity-badge">${label}</div>${yearHtml}<div class="sc-img">${card.icon||'🏅'}</div><div class="sc-name">${card.name||''}</div><div class="sc-team">${card.country||''} ${card.team||''}</div><div class="sc-pos">${card.pos||''}</div>${showPrice&&price!=null?`<div class="sc-price">${fmt(price)}</div>`:''}<div class="sc-rating">${card.rating??''}</div></div>`;
    const slotClass=opts.slotClass||'';
    const scale=Number(opts.scale||1);
    if(opts.fixedSlot||scale!==1||slotClass){
      const safeScale=Math.max(.5,Math.min(1.5,scale||1));
      return `<div class="sc-card-slot ${slotClass}" style="--sc-scale:${safeScale}">${html}</div>`;
    }
    return html;
  }
};
// Keep cards visually identical in responsive containers: scale whole card, never squash internals.
(function(){
  function fitExistingCards(){
    document.querySelectorAll('.sport-card').forEach(card=>{
      if(card.parentElement?.classList.contains('sc-card-slot')) return;
      const parent=card.parentElement;
      if(!parent) return;
      // If a container is physically narrower than the canonical card, scale the entire card.
      const available=Math.max(0,parent.clientWidth||0);
      if(available && available<140){
        const scale=Math.max(.66,Math.min(1,available/140));
        const slot=document.createElement('div');
        slot.className='sc-card-slot sc-card-auto';
        slot.style.setProperty('--sc-scale',String(scale));
        parent.insertBefore(slot,card);
        slot.appendChild(card);
      }
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fitExistingCards);
  else fitExistingCards();
  window.addEventListener('resize',()=>requestAnimationFrame(fitExistingCards),{passive:true});
})();
