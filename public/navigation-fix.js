(() => {
  const pages=['landing','buy','status','createAccount','login','dashboard'];
  let current='landing';
  const setPage=id=>{pages.forEach(p=>document.getElementById(p)?.classList.toggle('hidden',p!==id));current=id};
  const push=id=>{if(id===current)return;history.pushState({jisanPage:id},'',`#${id}`)};
  document.addEventListener('click',e=>{
    const back=e.target.closest('[data-back]');
    if(back){e.preventDefault();push('landing');setPage('landing');}
    const login=e.target.closest('#loginBtn');
    if(login){push('login');setPage('login');}
    const buy=e.target.closest('#buyBtn');
    if(buy&&!localStorage.getItem('bjb_pending_payment')){push('buy');setPage('buy');}
    const newPurchase=e.target.closest('#newPurchaseBtn');
    if(newPurchase){push('buy');setPage('buy');}
    const create=e.target.closest('#createAccountBtn');
    if(create){push('createAccount');setPage('createAccount');}
    const dashboard=e.target.closest('#doLogin');
    if(dashboard){setTimeout(()=>{if(document.getElementById('dashboard')&&!document.getElementById('dashboard').classList.contains('hidden'))push('dashboard')},100)}
  },true);
  window.addEventListener('popstate',e=>{
    const id=e.state?.jisanPage;
    if(id&&pages.includes(id)){setPage(id);return;}
    setPage('landing');
  });
  window.addEventListener('load',()=>{
    const hash=location.hash.replace('#','');
    current=pages.includes(hash)?hash:(localStorage.getItem('bjb_pending_payment')?'status':'landing');
    history.replaceState({jisanPage:current},'',`#${current}`);
  });
})();
