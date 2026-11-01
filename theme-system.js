(function(){
  // Keep the price ticker on one global 60-second timeline.
  // Because the phase comes from wall-clock time, navigating or refreshing
  // does not restart the marquee from the first item.
  const TICKER_DURATION_MS=60000;
  const tickerPhase=-((Date.now()%TICKER_DURATION_MS)/1000);
  document.documentElement.style.setProperty('--ticker-delay',tickerPhase+'s');
  const tickerStyle=document.createElement('style');
  tickerStyle.textContent='.ticker-track{animation-delay:var(--ticker-delay,0s)!important}';
  document.head.appendChild(tickerStyle);

  const ACC='slidcard_v11_acc';
  function read(){try{return JSON.parse(localStorage.getItem(ACC)||sessionStorage.getItem(ACC)||'null')}catch(e){return null}}
  function apply(theme){const t=['dark','midnight','light'].includes(theme)?theme:'dark';document.documentElement.setAttribute('data-theme',t);return t}
  window.SlidTheme={get(){return read()?.theme||'dark'},apply, set(theme){const a=read()||{};a.theme=apply(theme);try{localStorage.setItem(ACC,JSON.stringify(a))}catch(e){}try{sessionStorage.setItem(ACC,JSON.stringify(a))}catch(e){}window.dispatchEvent(new CustomEvent('slidcard-themechange',{detail:{theme:a.theme}}));return a.theme}};
  apply(window.SlidTheme.get());
  window.addEventListener('storage',e=>{if(e.key===ACC)apply(window.SlidTheme.get())});
})();