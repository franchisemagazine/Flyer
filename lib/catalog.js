export const normalize = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
export const modelDisplayName = value => String(value || '').replace(/^(?:MBPRO|MACBOOK PRO)\b/i,'MacBook Pro');

// The recovered catalog has model names but no category IDs. Recognizable
// families are classified conservatively; ambiguous codes remain Electronics.
// Overrides are explicit and version-controlled rather than guessed at runtime.
export function categoryFor(model, overrides = {}) {
  const m = normalize(model);
  if (overrides[m]) return overrides[m];
  if (/GEFORCE|RADEON|^RTX |UPGRADE KIT|\bGPU\b|\bRAM\b/.test(m)) return 'Components';
  if (/AIRPORT|\bROUTER\b|\bMODEM\b|\bHOTSPOT\b|\bMIFI\b/.test(m)) return 'Data Devices';
  if (/BAND|CABLE|CHARGER|CHARGING|ADAPTER|BUCKLE|BRACELET|\bLOOP\b|\bLP\b|\bLINK\b|\bCASE\b|\bCLIP\b|^AIRPODS|^PENCIL|^MAGIC |^USB|^LIGHTNING|^THUNDERBOLT|^MAGSAFE|^DISPLAYPORT|^MINI DISPLAYPORT|^LINKS KIT|^TV REMOTE|^EXTENSION|^NIKE SPORT|^SPORT \d|^APPLE WATCH \d+\/|^POWERBEATS|^FIT PRO$|^SOLO 3$|^STUDIO (3|BUDS)|BUDS$|POWER ADAPTER|^\d+W |^EP-TA|^ETA-|^MCS-|^PW-|^KA\d|^TPA-|^PA-\d/.test(m)) return 'Accessories';
  if (/^IPAD|^SURFACE PRO|^GALAXY TAB|^T\d{3}[A-Z0-9]*$|^X[1256789]\d{2}[A-Z0-9]*$/.test(m)) return 'Tablets';
  if (/^IMAC|^MAC |^MACBOOK|^MBAIR|^MBPRO|^MB |CHROMEBOOK|^STUDIO DISPLAY|^SURFACE (LAPTOP|BOOK)/.test(m)) return 'Computers';
  if (/^SERIES |^SE[23]? (AL|SS)|^ULTRA\d? TITANIUM|^GEN 1 AL|^FB\d{3}$|^R\d{3}(?:[A-Z0-9]*)(?: \d+MM)?$|^L3\d{2}(?:F)?(?: \d+MM)?$|^010-|^XMSH|^XMWT|^REDMIWT|^PIXEL WATCH|^M\d{4}[WB]\d$|-(?:B[0-9]{2}[A-Z]?|BX9|B09S)$|^CHARGE [3456]$|^OPWWE|^OWWE/.test(m)) return 'Wearables';
  if (/^IPHONE |^PIXEL \d|^GALAXY (S|A|Z|NOTE)|^XT\d{4}|^CPH\d{4}|^RMX\d{4}|^TA-\d|^LM[-A-Z]|^XQ-|^SO-|^SOG|^SOV|^SC-|^SCG|^SH-|^VFD\d|^VF\d|^DE211[78]$|^TMAFO|^\d{9,12}[A-Z]{1,3}$|^M(?:18|19|20)\d{2}[A-Z0-9]+$|^[AFGJNS]\d{3}(?:[A-Z][A-Z0-9]*|[0-9]+)?$|-(?:LX\d[A-Z]?|L\d\d[A-Z]?|NX\d|AL\d\d)$/.test(m)) return 'Phones';
  return 'Electronics';
}

export function createCatalog(raw, overrides = {}) {
  return {
    categories: raw.categories,
    models: [...new Set(raw.models.map(normalize))].map(name => ({name, category: categoryFor(name, overrides)})),
    conditions: [...new Set(raw.conditions.map(normalize))],
    locations: [...new Set(raw.locations.map(x => ({NJ:'New Jersey', AU:'Australia', Netherland:'Netherlands',UnitedKingdom:'United Kingdom',UK:'United Kingdom',HongKong:'Hong Kong',DR:'Dominican Republic',SG:'Singapore'}[x] || x)))],
  };
}

export function mergeCustomOptions(base, rows = []) {
  const next={
    categories:[...base.categories],
    models:base.models.map(item=>({...item})),
    conditions:[...base.conditions],
    locations:[...base.locations],
  };
  for(const row of rows){
    const value=normalize(row?.value);
    if(!value)continue;
    if(row.kind==='model' && next.categories.includes(row.category_key)){
      if(!next.models.some(item=>item.name===value&&item.category===row.category_key))next.models.push({name:value,category:row.category_key});
    }else if(row.kind==='condition'){
      if(!next.conditions.includes(value))next.conditions.push(value);
    }
  }
  return next;
}

export function filterOptions(options, query) {
  const q = normalize(query);
  if (!q) return options;
  const tokens = q.split(' ');
  return options.filter(option => tokens.every(token => normalize(option).includes(token)))
    .sort((a,b) => Number(normalize(b).startsWith(q)) - Number(normalize(a).startsWith(q)));
}

function validSelectionArray(value, allowed) {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && allowed.includes(item)) && new Set(value).size === value.length;
}
function validCustomSelectionArray(value) {
  return Array.isArray(value) && value.length > 0 && new Set(value).size === value.length && value.every(item => {
    if(typeof item!=='string')return false;
    const normalized=normalize(item);
    return normalized===item && normalized.length>=1 && normalized.length<=80 &&
      !/https?:\/\//i.test(normalized) && !/[\u0000-\u001f\u007f]/.test(normalized);
  });
}

export function validateFields(fields, catalog, {allowCustom=false}={}) {
  const errors = {};
  if(!fields || typeof fields!=='object' || Array.isArray(fields))fields={};
  for(const key of ['category','whatsapp','email','additional']){
    if(fields[key]!==undefined && typeof fields[key]!=='string')errors[key]='Enter a text value.';
  }
  for(const key of ['model','condition','location']){
    if(fields[key]!==undefined && !Array.isArray(fields[key]))errors[key]='Choose one or more values from the list.';
    if(Array.isArray(fields[key]) && fields[key].some(value=>typeof value!=='string'))errors[key]='Choose one or more values from the list.';
  }
  if(Object.keys(errors).length)return errors;
  if (!catalog.categories.includes(fields.category)) errors.category = 'Choose a category from the list.';
  const allowedModels=catalog.models.filter(m=>m.category===fields.category).map(m=>m.name);
  if (!(allowCustom?validCustomSelectionArray(fields.model):validSelectionArray(fields.model,allowedModels))) errors.model = 'Choose one or more models in the selected category.';
  if (!(allowCustom?validCustomSelectionArray(fields.condition):validSelectionArray(fields.condition,catalog.conditions))) errors.condition = 'Choose one or more conditions from the list.';
  if (!validSelectionArray(fields.location,catalog.locations)) errors.location = 'Choose one or more locations from the list.';
  if (fields.whatsapp && !/^\+?[\d\s().-]{7,40}$/.test(fields.whatsapp)) errors.whatsapp = 'Enter a valid phone number, including country code.';
  if (fields.whatsapp && (fields.whatsapp.replace(/\D/g,'').length < 7 || fields.whatsapp.replace(/\D/g,'').length > 15)) errors.whatsapp = 'Use 7–15 digits, including country code.';
  if (fields.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) || fields.email.length > 100)) errors.email = 'Enter a valid email address (up to 100 characters).';
  if ((fields.additional || '').length > 240) errors.additional = 'Keep creative vision / requirements to 240 characters.';
  return errors;
}
