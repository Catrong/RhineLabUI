import { performance } from "node:perf_hooks";
import * as THREE from "three";
import { ArchiveVisibility } from "../src/archive-visibility.ts";
import { ArchiveWindow } from "../src/archive-arrival.ts";
import { visibleCell } from "../src/archive-loop.ts";

// CPU helpers only: no browser, GPU, postprocessing, or end-to-end FPS claim.
const camera=new THREE.PerspectiveCamera(6,16/9,5,300);
camera.position.set(-62,36,43);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const frames=3000;
const measure=fn=>{
  fn();
  const samples=[];
  for(let run=0;run<5;run++){const start=performance.now();fn();samples.push(performance.now()-start);}
  return Number(samples.sort((a,b)=>a-b)[2].toFixed(2));
};
const oldPreparation=()=>{
  const visibility=new ArchiveVisibility();
  for(let i=0;i<frames;i++){
    visibility.update(camera,100,i*.01,-i*.003,false);
    Array.from({length:288},(_,slot)=>visibleCell(slot,{lane:2+i*.002,row:12+i*.005}));
  }
};
const newPreparation=()=>{
  const visibility=new ArchiveVisibility(),pool=new ArchiveWindow();
  for(let i=0;i<frames;i++){
    visibility.update(camera,100,i*.01,-i*.003,false,true);
    pool.update({lane:2+i*.002,row:12+i*.005});
  }
};
console.log(JSON.stringify({frames,medianOf:5,scope:"visibility preparation and pool topology only",oldMs:measure(oldPreparation),newMs:measure(newPreparation)},null,2));
