'use strict';
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
    const response=await fetch(endpoint,{credentials:'same-origin',cache:(IZHE_contentPreview||IZHE_visualFrame)?'no-store':'default'});
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
