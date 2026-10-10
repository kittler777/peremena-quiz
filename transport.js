export function createTransport(game, assets, publicOrigin) {
 const rates=new Map();
 return async function handle(request,ip='unknown') {
  const url=new URL(request.url), origin=request.headers.get('origin');
  const allowed=!origin||origin===url.origin||origin==='https://kittler777.github.io'||origin===publicOrigin;
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...(allowed&&origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})};
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:{...headers,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Max-Age':'600'}});
  if(url.pathname==='/health')return Response.json({ok:true,game:'caption-memes',images:100,version:2},{headers});
  if(url.pathname.startsWith('/api/')){
   if(!allowed)return Response.json({error:'Источник запроса не разрешён'},{status:403,headers});
   if(request.method!=='POST')return Response.json({error:'Используйте POST'},{status:405,headers});
   const action=url.pathname.slice(5);
   const key=ip+':'+(action==='create'?'create':action==='join'?'join':'play');const max=action==='create'?15:action==='join'?100:5000;const windowMs=action==='create'?3600000:60000;
   const t=Date.now();let rate=rates.get(key);if(!rate||t-rate.start>windowMs){rate={start:t,n:0};rates.set(key,rate)}if(++rate.n>max)return Response.json({error:'Слишком много запросов. Попробуйте позже.'},{status:429,headers});
   if(rates.size>10000)for(const [k,r]of rates)if(t-r.start>3600000)rates.delete(k);
   try{
    if(Number(request.headers.get('content-length'))>8192)return Response.json({error:'Слишком большой запрос'},{status:413,headers});
    let body='';const reader=request.body?.getReader();if(reader){const decoder=new TextDecoder();let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return Response.json({error:'Слишком большой запрос'},{status:413,headers})}body+=decoder.decode(value,{stream:true})}body+=decoder.decode()}
    let payload;try{payload=JSON.parse(body||'{}')}catch{return Response.json({error:'Некорректный JSON'},{status:400,headers})}if(!payload||typeof payload!=='object'||Array.isArray(payload))return Response.json({error:'Некорректный запрос'},{status:400,headers});
    const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');return Response.json(game(action,payload,token),{headers});
   }catch(e){if(!e.status)console.error('Game request failed:',e.message);return Response.json({error:e.status?e.message:'Ошибка сервера. Попробуйте ещё раз.'},{status:e.status||500,headers})}
  }
  const path=url.pathname.endsWith('/')?'index.html':url.pathname.slice(1);const file=assets[path];if(file?.redirect&&request.method==='GET')return Response.redirect(file.redirect,302);if(file&&request.method==='GET')return new Response(file.body,{headers:{'Content-Type':file.type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; connect-src 'self' https://*.up.railway.app; img-src 'self' data: https://kittler777.github.io; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}});
  return new Response('Not found',{status:404});
 };
}
