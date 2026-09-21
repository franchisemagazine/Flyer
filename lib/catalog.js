export const normalize = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();

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

export function filterOptions(options, query) {
  const q = normalize(query);
  if (!q) return options;
  const tokens = q.split(' ');
  return options.filter(option => tokens.every(token => normalize(option).includes(token)))
    .sort((a,b) => Number(normalize(b).startsWith(q)) - Number(normalize(a).startsWith(q)));
}

export function validateFields(fields, catalog) {
  const errors = {};
  if(!fields || typeof fields!=='object' || Array.isArray(fields))fields={};
  for(const key of ['category','model','condition','location','whatsapp','email','additional']){
    if(fields[key]!==undefined && typeof fields[key]!=='string')errors[key]='Enter a text value.';
  }
  if(Object.keys(errors).length)return errors;
  if (!catalog.categories.includes(fields.category)) errors.category = 'Choose a category from the list.';
  const model = catalog.models.find(m => m.name === fields.model);
  if (!model || model.category !== fields.category) errors.model = 'Choose a model in the selected category.';
  if (!catalog.conditions.includes(fields.condition)) errors.condition = 'Choose a condition from the list.';
  if (!catalog.locations.includes(fields.location)) errors.location = 'Choose a location from the list.';
  if (fields.whatsapp && !/^\+?[\d\s().-]{7,40}$/.test(fields.whatsapp)) errors.whatsapp = 'Enter a valid phone number, including country code.';
  if (fields.whatsapp && (fields.whatsapp.replace(/\D/g,'').length < 7 || fields.whatsapp.replace(/\D/g,'').length > 15)) errors.whatsapp = 'Use 7–15 digits, including country code.';
  if (fields.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) || fields.email.length > 100)) errors.email = 'Enter a valid email address (up to 100 characters).';
  if ((fields.additional || '').length > 240) errors.additional = 'Keep additional information to 240 characters.';
  return errors;
}
