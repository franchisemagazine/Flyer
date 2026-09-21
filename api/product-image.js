import { catalog,json,query } from '../lib/server.js';
import { productIdentity,findExactProductImage,boundedFetch } from '../lib/images.js';
const pages = new Map();
export default async function handler(req,res) {
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
  const model = query(req).get('model');
  if (!catalog.models.some(m=>m.name===model)) return json(res,400,{error:'Choose a valid model first.'});
  const identity=productIdentity(model);
  if(!identity.source) return json(res,404,{error:'No verified automatic image is available for this model. Upload an exact product image.'});
  try {
    let cached=pages.get(identity.source);
    if (!cached || Date.now()-cached.at>3600000) {
      const p=await boundedFetch(identity.source,{maxBytes:2_000_000});
      if(!p.type.includes('text/html')) throw new Error('Image source returned an invalid page.');
      cached={at:Date.now(),html:p.bytes.toString('utf8')};pages.set(identity.source,cached);
    }
    const match=findExactProductImage(cached.html,model);
    if(!match) return json(res,404,{error:'No exact model match was verified. Please upload the correct product image.'});
    const file=await boundedFetch(match.url);
    if(!/^image\/(png|jpeg|webp)(?:;|$)/.test(file.type)) throw new Error('The image format is not supported.');
    json(res,200,{...match,source:identity.source,image:`data:${file.type.split(';')[0]};base64,${file.bytes.toString('base64')}`});
  }catch(error){json(res,502,{error:error.message});}
}
