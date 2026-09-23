export function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();const timer=setTimeout(()=>{image.src='';reject(new Error('The image took too long to load. Try a different file.'));},25000);image.onload=()=>{clearTimeout(timer);if(!image.width||!image.height)reject(new Error('Invalid image.'));else resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(new Error('Could not decode the image. Use PNG, JPEG or WebP.'));};image.src=src;});}

export async function prepareImage(source,{maxDimension=1600,quality=.92,maxDataLength=3_000_000}={}){
  const image=await loadImage(source);
  if(image.width*image.height>60_000_000)throw new Error('Image dimensions are too large. Please upload a smaller version.');
  let scale=Math.min(1,maxDimension/image.width,maxDimension/image.height);
  let width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
  let q=quality;
  for(let attempt=0;attempt<6;attempt++){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
    const data=canvas.toDataURL('image/jpeg',q);
    if(data.length<=maxDataLength)return data;
    q=Math.max(.62,q-.07);width=Math.max(1,Math.round(width*.86));height=Math.max(1,Math.round(height*.86));
  }
  throw new Error('This image could not be compressed enough for upload. Please use a smaller image.');
}
