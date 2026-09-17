import {readFile,writeFile,readdir} from 'node:fs/promises';
const dir='node_modules/@kitlangton/rolling-number/dist';
const before='S={width:M.width/s,height:M.height/o};this.sizes.set(y,S)';
const after='S={width:parseFloat(t.getComputedStyle(y).width),height:parseFloat(t.getComputedStyle(y).height)};this.sizes.set(y,S)';
let found=false;
for(const file of await readdir(dir))if(file.endsWith('.js')){const path=`${dir}/${file}`,source=await readFile(path,'utf8');if(source.includes(after)){found=true;continue}if(source.includes(before)){await writeFile(path,source.replace(before,after));found=true;console.log('Patched rolling-number local glyph measurement for projected HUD.')}}
if(!found)throw Error('Rolling Number measurement patch no longer matches. Review the dependency before upgrading.');

// Perspective labels must lay out glyphs before the outer plane projection.
// Screen-space bounding boxes cannot be divided by one scale under perspective.
const positionBefore='x:(M.left-e.left)/s,y:(M.top-e.top)/o';
const positionAfter='x:this.host.hasAttribute("data-rn-local-layout")?y.offsetLeft:(M.left-e.left)/s,y:this.host.hasAttribute("data-rn-local-layout")?y.offsetTop:(M.top-e.top)/o';
const shiftBefore='let m=this.previousLeft===void 0?0:(this.previousLeft-e.left)/s';
const shiftAfter='let m=this.host.hasAttribute("data-rn-local-layout")||this.previousLeft===void 0?0:(this.previousLeft-e.left)/s';
for(const [before,after] of [[positionBefore,positionAfter],[shiftBefore,shiftAfter]]) {
  let matched=false;
  for(const file of await readdir(dir))if(file.endsWith('.js')) {
    const path=`${dir}/${file}`,source=await readFile(path,'utf8');
    if(source.includes(after)){matched=true;continue;}
    if(source.includes(before)){await writeFile(path,source.replace(before,after));matched=true;}
  }
  if(!matched)throw Error('Rolling Number local layout patch no longer matches. Review the dependency before upgrading.');
}
