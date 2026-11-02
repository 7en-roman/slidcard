/* SlidCard shared application shell */
(function(){
  'use strict';
  function initMobileNavigation(){
    const sidebar=document.querySelector('.sidebar');
    const topbar=document.querySelector('.topbar');
    if(!sidebar||!topbar)return;
    if(!sidebar.id)sidebar.id='app-sidebar';
    let button=topbar.querySelector('.mobile-nav-toggle');
    if(!button){
      button=document.createElement('button');
      button.className='mobile-nav-toggle';
      button.type='button';
      button.textContent='☰';
      topbar.insertBefore(button,topbar.firstChild);
    }
    button.type='button';
    button.setAttribute('aria-controls',sidebar.id);
    let backdrop=document.querySelector('.mobile-nav-backdrop');
    if(!backdrop){
      backdrop=document.createElement('div');
      backdrop.className='mobile-nav-backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.setAttribute('aria-hidden','true');
    const setOpen=open=>{
      const active=Boolean(open)&&window.innerWidth<=760;
      sidebar.classList.toggle('mobile-open',active);
      backdrop.classList.toggle('open',active);
      document.body.classList.toggle('mobile-nav-open',active);
      button.setAttribute('aria-expanded',String(active));
      button.setAttribute('aria-label',active?'Закрити меню':'Відкрити меню');
      backdrop.setAttribute('aria-hidden',String(!active));
    };
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-label','Відкрити меню');
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setOpen(!sidebar.classList.contains('mobile-open'));});
    backdrop.addEventListener('click',()=>setOpen(false));
    sidebar.querySelectorAll('a[href]').forEach(a=>a.addEventListener('click',()=>setOpen(false)));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});
    window.addEventListener('resize',()=>{if(window.innerWidth>760)setOpen(false);},{passive:true});
    window.addEventListener('pageshow',()=>setOpen(false),{passive:true});
    setOpen(false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initMobileNavigation,{once:true});
  else initMobileNavigation();
})();
