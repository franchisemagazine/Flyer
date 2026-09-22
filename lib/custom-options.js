import { normalize } from './catalog.js';

const SUPABASE_URL=process.env.FLYERS_CATALOG_URL || 'https://bgzydmahuluxyirbetqf.supabase.co';
const SUPABASE_KEY=process.env.FLYERS_CATALOG_KEY || 'sb_publishable_WpzX6OJ2fvg73nc2ZVB8mw_OL1T3t1E';
const TABLE='pcs_flyer_custom_options';

function headers(extra={}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

export function sanitizeCustomOption(kind,category,value,categories=[]) {
  if(!['model','condition'].includes(kind))throw new Error('Unsupported option type.');
  const normalized=normalize(value);
  if(!normalized || normalized.length>80)throw new Error('Keep custom values between 1 and 80 characters.');
  if(/https?:\/\//i.test(normalized) || /[\u0000-\u001f\u007f]/.test(normalized))throw new Error('Enter a plain model or condition name.');
  if(kind==='model'){
    if(!categories.includes(category))throw new Error('Choose a valid category before adding a model.');
    return {kind,category_key:category,value:normalized,active:true};
  }
  return {kind,category_key:'',value:normalized,active:true};
}

export async function loadCustomOptions() {
  if(process.env.NODE_ENV==='test')return [];
  try{
    const url=`${SUPABASE_URL}/rest/v1/${TABLE}?select=kind,category_key,value&active=eq.true&order=created_at.asc`;
    const response=await fetch(url,{headers:headers(),signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error(`catalog read failed ${response.status}`);
    const rows=await response.json();
    return Array.isArray(rows)?rows:[];
  }catch(error){
    console.warn('Shared catalog unavailable',{message:error.message});
    return [];
  }
}

export async function saveCustomOption(option) {
  const url=`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=kind,category_key,value`;
  const response=await fetch(url,{
    method:'POST',
    headers:headers({'Content-Type':'application/json','Prefer':'resolution=ignore-duplicates,return=minimal'}),
    body:JSON.stringify(option),
    signal:AbortSignal.timeout(8000),
  });
  if(!response.ok){
    const detail=await response.text().catch(()=> '');
    console.error('Shared catalog save failed',{status:response.status,detail:detail.slice(0,200)});
    throw new Error('This value could not be saved for future visitors.');
  }
}
