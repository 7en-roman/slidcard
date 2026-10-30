(function(){
  const ACC='slidcard_v11_acc';
  function read(){try{return JSON.parse(localStorage.getItem(ACC)||sessionStorage.getItem(ACC)||'null')}catch(e){return null}}
  function apply(theme){const t=['dark','midnight','light'].includes(theme)?theme:'dark';document.documentElement.setAttribute('data-theme',t);return t}
  window.SlidTheme={get(){return read()?.theme||'dark'},apply, set(theme){const a=read()||{};a.theme=apply(theme);try{localStorage.setItem(ACC,JSON.stringify(a))}catch(e){}try{sessionStorage.setItem(ACC,JSON.stringify(a))}catch(e){}window.dispatchEvent(new CustomEvent('slidcard-themechange',{detail:{theme:a.theme}}));return a.theme}};
  apply(window.SlidTheme.get());
  window.addEventListener('storage',e=>{if(e.key===ACC)apply(window.SlidTheme.get())});
})();