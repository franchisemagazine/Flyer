import { body,catalog,json } from '../lib/server.js';
import { loadCustomOptions,saveCustomOption,sanitizeCustomOption } from '../lib/custom-options.js';

const writes=new Map();

function sameOrigin(req){
  const origin=req.headers.origin;
  if(!origin)return true;
  try{return new URL(origin).host===req.headers.host;}catch{return false;}
}

function allowWrite(req){
  const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
  const now=Date.now(),recent=(writes.get(ip)||[]).filter(t=>now-t<3600000);
  if(recent.length>=20)return false;
  recent.push(now);writes.set(ip,recent);
  if(writes.size>2000)writes.clear();
  return true;
}

export default async function handler(req,res){
  if(req.method==='GET'){
    const options=await loadCustomOptions();
    return json(res,200,{options});
  }
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
  if(!sameOrigin(req))return json(res,403,{error:'Invalid request origin.'});
  if(!allowWrite(req))return json(res,429,{error:'Too many new catalog values were added from this connection. Please try again later.'});

  let input;
  try{input=await body(req,20_000);}catch{return json(res,400,{error:'Invalid request.'});}
  try{
    const option=sanitizeCustomOption(input?.kind,input?.category,input?.value,catalog.categories);
    await saveCustomOption(option);
    return json(res,200,{saved:true,option});
  }catch(error){
    return json(res,400,{error:error.message||'Could not save this catalog value.'});
  }
}
