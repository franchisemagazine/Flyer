export function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();const timer=setTimeout(()=>{image.src='';reject(new Error('The image took too long to load. Try a different file.'));},25000);image.onload=()=>{clearTimeout(timer);if(!image.width||!image.height)reject(new Error('Invalid image.'));else resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(new Error('Could not decode the image. Use PNG, JPEG or WebP.'));};image.src=src;});}

export async function prepareImage(source){
  const image=await loadImage(source);
  if(image.width*image.height>60_000_000)throw new Error('Image dimensions are too large. Please upload a smaller version.');
  const scale=Math.min(1,1600/image.width,1600/image.height),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.92);
}
