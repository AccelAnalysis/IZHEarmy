'use strict';
const IZHE_installLogoSubtexts=()=>{
  const targets=[
    {element:document.querySelector('#navbar a[aria-label="IZHE home"]'),variant:'nav'},
    {element:document.querySelector('#top h1.izhe-logo'),variant:'hero'},
    {element:document.querySelector('footer a[href="#top"].izhe-logo'),variant:'footer'}
  ];
  if(!targets.some(({element})=>element))return;
  if(!document.getElementById('izhe-logo-subtext-styles')){
    const style=document.createElement('style');
    style.id='izhe-logo-subtext-styles';
    style.textContent='.izhe-logo-with-subtext{position:relative}.izhe-logo-subtext{position:absolute;left:50%;max-width:none;height:auto;transform:translateX(-50%);filter:brightness(0) invert(1);pointer-events:none;user-select:none;z-index:1}.izhe-logo-subtext--nav{top:calc(100% - .1rem);width:8.25rem}.izhe-logo-subtext--hero{top:calc(100% + .2rem);width:112%}.izhe-logo-subtext--footer{top:calc(100% + .1rem);width:9.5rem}#top h1.izhe-logo.izhe-logo-with-subtext{display:inline-block;margin-bottom:clamp(4rem,7vw,6.5rem)}footer a.izhe-logo.izhe-logo-with-subtext{display:inline-block;margin-bottom:2.75rem}@media(min-width:640px){.izhe-logo-subtext--nav{width:9.5rem;top:calc(100% - .15rem)}.izhe-logo-subtext--footer{width:10.5rem}}';
    document.head.append(style);
  }
  targets.forEach(({element,variant})=>{
    if(!element||element.querySelector(`.izhe-logo-subtext--${variant}`))return;
    element.classList.add('izhe-logo-with-subtext');
    const subtext=document.createElement('img');
    subtext.src='/assets/izhe-logo-subtext.png';
    subtext.alt='';
    subtext.setAttribute('aria-hidden','true');
    subtext.className=`izhe-logo-subtext izhe-logo-subtext--${variant}`;
    subtext.width=521;
    subtext.height=84;
    subtext.decoding='async';
    subtext.draggable=false;
    element.append(subtext);
  });
};
IZHE_installLogoSubtexts();
const IZHE_releasePendingContentMedia=()=>{document.querySelectorAll('.izhe-media-pending').forEach((element)=>element.classList.remove('izhe-media-pending'));};
function IZHE_revealForegroundWhenReady(image,fallbackSrc=''){
  if(!image)return;
  const reveal=()=>image.classList.remove('izhe-media-pending');
  const useFallback=()=>{
    if(fallbackSrc&&image.getAttribute('src')!==fallbackSrc){
      image.addEventListener('load',reveal,{once:true});image.addEventListener('error',reveal,{once:true});image.src=fallbackSrc;
      if(image.complete)reveal();
    }else reveal();
  };
  if(image.complete){if(image.naturalWidth>0)reveal();else useFallback();return;}
  image.addEventListener('load',reveal,{once:true});image.addEventListener('error',useFallback,{once:true});
}
function IZHE_revealBackgroundWhenReady(element,url){
  if(!element)return;
  const reveal=()=>element.classList.remove('izhe-media-pending');
  if(!url){reveal();return;}
  const image=new Image();
  image.onload=reveal;
  image.onerror=()=>{element.style.backgroundImage='';reveal();};
  image.src=url;
  if(image.complete&&image.naturalWidth>0)reveal();
}
(async()=>{
  const foregroundFallbacks=[
    {image:document.querySelector('#story img'),src:document.querySelector('#story img')?.getAttribute('src')||''},
    {image:document.querySelector('#give-one img'),src:document.querySelector('#give-one img')?.getAttribute('src')||''}
  ];
  try{
    const endpoint=IZHE_visualFrame?'/.netlify/functions/admin-visual-editor':`/.netlify/functions/public-content${IZHE_contentPreview?'?preview=1':''}`;
    const response=await fetch(endpoint,{headers:(IZHE_contentPreview||IZHE_visualFrame)&&IZHE_contentToken?{authorization:`Bearer ${IZHE_contentToken}`}:{}});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Website content could not be loaded.');
    const records=IZHE_visualFrame?Object.fromEntries((data.records||[]).map((record)=>[record.key,record])):data.records||{};
    window.IZHE_CONTENT_DATA={...data,records};
    const applyPublishedContent=()=>IZHE_applyContent(records,{visualFrame:IZHE_visualFrame});
    window.addEventListener('izhe:catalog-ready',applyPublishedContent,{once:true});
    applyPublishedContent();
    foregroundFallbacks.forEach(({image,src})=>IZHE_revealForegroundWhenReady(image,src));
    [
      [document.getElementById('top'),IZHE_fieldsFor(records,'home-hero').backgroundImage],
      [document.getElementById('book'),IZHE_fieldsFor(records,'home-book').backgroundImage],
      [document.getElementById('church'),IZHE_fieldsFor(records,'home-church').backgroundImage]
    ].forEach(([element,url])=>IZHE_revealBackgroundWhenReady(element,url));
    if(IZHE_contentPreview&&!IZHE_visualFrame){const badge=document.createElement('div');badge.className='fixed bottom-5 left-5 z-[100] bg-amber-400 text-slate-950 rounded-full px-4 py-2 text-xs font-extrabold shadow-xl';badge.textContent=`CONTENT PREVIEW · REVISION ${data.revision}`;document.body.append(badge);}
    window.dispatchEvent(new CustomEvent('izhe:content-ready',{detail:window.IZHE_CONTENT_DATA}));
  }catch(error){IZHE_releasePendingContentMedia();console.error('structured content',error);window.dispatchEvent(new CustomEvent('izhe:content-error',{detail:{message:error.message}}));}
})();
