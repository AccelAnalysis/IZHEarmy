'use strict';
(async()=>{
  try{
    const endpoint=IZHE_visualFrame?'/.netlify/functions/admin-visual-editor':`/.netlify/functions/public-content${IZHE_contentPreview?'?preview=1':''}`;
    const response=await fetch(endpoint,{headers:(IZHE_contentPreview||IZHE_visualFrame)&&IZHE_contentToken?{authorization:`Bearer ${IZHE_contentToken}`}:{}});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Website content could not be loaded.');
    const records=IZHE_visualFrame?Object.fromEntries((data.records||[]).map((record)=>[record.key,record])):data.records||{};
    window.IZHE_CONTENT_DATA={...data,records};IZHE_applyContent(records,{visualFrame:IZHE_visualFrame});
    if(IZHE_contentPreview&&!IZHE_visualFrame){const badge=document.createElement('div');badge.className='fixed bottom-5 left-5 z-[100] bg-amber-400 text-slate-950 rounded-full px-4 py-2 text-xs font-extrabold shadow-xl';badge.textContent=`CONTENT PREVIEW · REVISION ${data.revision}`;document.body.append(badge);}
    window.dispatchEvent(new CustomEvent('izhe:content-ready',{detail:window.IZHE_CONTENT_DATA}));
  }catch(error){console.error('structured content',error);window.dispatchEvent(new CustomEvent('izhe:content-error',{detail:{message:error.message}}));}
})();
