import { Combobox } from './combobox.js';
import { validateFields } from './lib/catalog.js';
import { prepareImage,renderFlyer } from './renderer.js';
const $=id=>document.getElementById(id);
let catalog,boxes={},reference=null,generated=null,busy=false,revision=0,imageJob=0,imageController=null,aiEnabled=false;
function status(id,text,tone=''){$(id).textContent=text;$(id).className='status '+tone;}
function fields(){return {category:boxes.category?.value||'',model:boxes.model?.value||'',condition:boxes.condition?.value||'',location:boxes.location?.value||'',whatsapp:$('whatsapp').value.trim(),email:$('email').value.trim(),additional:$('additional').value.trim()};}
function markChanged(){revision++;$('downloadFlyer').disabled=true;$('outputReviewRow').hidden=true;$('outputConfirmed').checked=false;if(generated){$('previewBadge').textContent='UPDATE REQUIRED';$('previewBadge').className='badge stale';$('previewImage').classList.add('stale');}status('formStatus','');update();}
function clearReference(){imageJob++;imageController?.abort();imageController=null;reference=null;$('upload').value='';$('referenceImage').removeAttribute('src');$('imageReview').hidden=true;$('confirmRow').hidden=true;$('imageConfirmed').checked=false;status('imageStatus',boxes.model?.value?'Find or upload an exact image for this model.':'Choose a model to add its image.');markChanged();}
function update(){if(!catalog)return;const valid=Object.keys(validateFields(fields(),catalog)).length===0;const hasModel=Boolean(boxes.model?.value);$('findImage').disabled=busy||!hasModel;$('upload').disabled=busy||!hasModel;$('createFlyer').disabled=busy||!valid||!reference||reference.model!==boxes.model.value||!$('imageConfirmed').checked||($('finishMode').value==='ai'&&(!aiEnabled||!$('teamKey').value));}
function showErrors(){const errors=validateFields(fields(),catalog);for(const id of ['category','model','condition','location','whatsapp','email','additional']){$(id+'Error').textContent=errors[id]||'';$(id).setAttribute('aria-invalid',String(Boolean(errors[id])));}return errors;}
async function api(url,options={}){const response=await fetch(url,options);let data;try{data=await response.json();}catch{throw new Error('The server returned an invalid response. Please try again.');}if(!response.ok)throw new Error(data.error||'The request failed. Please try again.');return data;}
async function acceptReference(image,name,source,job){
  const prepared=await prepareImage(image);if(job!==imageJob)return;
  reference={image:prepared,model:boxes.model.value};$('referenceImage').src=prepared;$('referenceName').textContent=name;$('sourceText').textContent=source?'Matched to the exact model section. Check the colors and variant.':'Uploaded image. Check the product and generation.';
  $('sourceLink').hidden=!source;if(source)$('sourceLink').href=source;
  $('imageReview').hidden=false;$('confirmRow').hidden=false;$('imageConfirmed').checked=false;status('imageStatus','Review the reference image, then confirm it below.','success');markChanged();
}
async function findImage(){
  clearReference();const job=imageJob,model=boxes.model.value;imageController=new AbortController();$('findImage').disabled=true;status('imageStatus','Checking the exact model against the official source…');
  try{const result=await api('/api/product-image?model='+encodeURIComponent(model),{signal:imageController.signal});if(job!==imageJob)return;await acceptReference(result.image,result.matchedModel,result.source,job);}catch(error){if(job===imageJob&&error.name!=='AbortError')status('imageStatus',error.message,'error');}finally{if(job===imageJob){imageController=null;update();}}
}
async function uploadImage(){
  const file=$('upload').files?.[0];if(!file)return;
  imageJob++;imageController?.abort();const job=imageJob;reference=null;$('imageConfirmed').checked=false;$('imageReview').hidden=true;$('confirmRow').hidden=true;markChanged();
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status('imageStatus','Choose a PNG, JPEG or WebP file.','error');return;}
  if(file.size>10*1024*1024){status('imageStatus','The file is too large. Please use an image under 10 MB.','error');return;}
  const url=URL.createObjectURL(file);status('imageStatus','Preparing your image…');
  try{await acceptReference(url,file.name,null,job);}catch(error){if(job===imageJob)status('imageStatus',error.message,'error');}finally{URL.revokeObjectURL(url);update();}
}
async function create(e){
  e.preventDefault();if(busy)return;
  if(Object.keys(showErrors()).length){status('formStatus','Please check the highlighted fields.','error');return;}
  if(!reference||reference.model!==boxes.model.value||!$('imageConfirmed').checked){status('formStatus','Add and confirm the exact product image first.','error');return;}
  busy=true;$('editorFields').disabled=true;$('downloadFlyer').disabled=true;update();
  const snapshot=fields(),version=revision,ai=$('finishMode').value==='ai';$('createFlyer').firstElementChild.textContent=ai?'Generating scene…':'Creating flyer…';status('formStatus',ai?'Regenerating the product scene. This may take a few minutes.':'Rendering your full-resolution flyer…');
  try{
    let source=reference.image;
    if(ai){
      const productFields={category:snapshot.category,model:snapshot.model,condition:snapshot.condition,location:snapshot.location};
      const result=await api('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','x-flyers-key':$('teamKey').value},body:JSON.stringify({fields:productFields,image:source,confirmed:true}),signal:AbortSignal.timeout(260000)});source=result.image;
    }
    const output=await renderFlyer(snapshot,source,ai);
    if(version!==revision){URL.revokeObjectURL(output.url);return;}
    if(generated)URL.revokeObjectURL(generated.url);generated={...output,revision:version,name:snapshot.model,ai};$('previewImage').src=output.url;$('previewImage').classList.remove('stale');$('previewImage').hidden=false;$('emptyPreview').hidden=true;$('previewBadge').textContent=ai?'REVIEW IMAGE':'READY';$('previewBadge').className='badge ready';$('outputReviewRow').hidden=!ai;$('outputConfirmed').checked=false;$('downloadFlyer').disabled=ai;status('formStatus',ai?'Review the AI-rendered product before enabling download.':'Your flyer is ready to download.','success');
  }catch(error){status('formStatus',error.name==='TimeoutError'?'Generation timed out. Your details are preserved; please try again.':error.message,'error');if(generated&&generated.revision===revision&&!generated.ai)$('downloadFlyer').disabled=false;}
  finally{busy=false;$('editorFields').disabled=false;$('createFlyer').firstElementChild.textContent='Create flyer';update();}
}
async function boot(){
  try{
    catalog=await api('/catalog.json');
    boxes.model=new Combobox($('model'),[],()=>clearReference());boxes.model.setDisabled(true);
    boxes.category=new Combobox($('category'),catalog.categories,value=>{boxes.model.setOptions(catalog.models.filter(m=>m.category===value).map(m=>m.name));$('model').placeholder=value?'Search '+value.toLowerCase()+' models':'Choose a category first';$('modelHelp').textContent=value==='Electronics'?'General electronics and model codes without a verified category.':value?`${boxes.model.options.length} models in ${value}. Type to filter, or scroll the list.`:'Choose a category to see its models.';clearReference();});
    boxes.condition=new Combobox($('condition'),catalog.conditions,markChanged);boxes.location=new Combobox($('location'),catalog.locations,markChanged);
    $('findImage').addEventListener('click',findImage);$('upload').addEventListener('change',uploadImage);$('removeImage').addEventListener('click',clearReference);$('flyerForm').addEventListener('submit',create);
    for(const id of ['whatsapp','email','additional','imageConfirmed','teamKey'])$(id).addEventListener('input',()=>{if(id==='additional')$('characterCount').textContent=`${$('additional').value.length} / 240`;if(['email','whatsapp'].includes(id))showErrors();markChanged();});
    $('finishMode').addEventListener('change',()=>{$('aiAccess').hidden=$('finishMode').value!=='ai';markChanged();});
    $('outputConfirmed').addEventListener('change',()=>{$('downloadFlyer').disabled=!$('outputConfirmed').checked||!generated||generated.revision!==revision;});
    $('downloadFlyer').addEventListener('click',()=>{if(!generated||generated.revision!==revision||(generated.ai&&!$('outputConfirmed').checked))return;const a=document.createElement('a');a.href=generated.url;a.download=generated.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'-pcs.png';a.click();});
    update();
  }catch(error){$('bootError').hidden=false;$('bootError').textContent='The product catalog could not load. Reload the page. If this continues, contact the app administrator.';return;}
  try{const health=await api('/api/health');aiEnabled=health.aiEnabled;$('aiOption').disabled=!aiEnabled;$('aiOption').textContent=aiEnabled?'AI-integrated product scene':'AI-integrated scene — setup required';$('aiStatus').textContent=aiEnabled?'AI mode regenerates the scene around your verified product reference.':'Original-photo flyers work now. AI scene regeneration needs a server API key and team access code.';}catch{$('aiStatus').textContent='AI connection could not be checked. Original-photo flyers are available.';}
}
boot();
