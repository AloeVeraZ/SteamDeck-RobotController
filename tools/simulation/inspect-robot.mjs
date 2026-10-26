import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from '../../.cache/simulation-deps/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../.cache/simulation-deps/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),id=process.argv[2];
const data=fs.readFileSync(path.join(root,'.cache/simulation-cad',id+'-native.glb'));
const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
gltf.scene.updateMatrixWorld(true);const report=[];
gltf.scene.traverse(o=>{if(!o.isMesh)return;const box=new T.Box3().setFromObject(o),names=[];for(let p=o;p;p=p.parent)if(p.name)names.unshift(p.name);report.push({name:o.name,path:names.join('/'),min:box.min.toArray(),max:box.max.toArray(),vertices:o.geometry.attributes.position.count});});
fs.writeFileSync(path.join(root,'.cache/simulation-cad',id+'-native-parts.json'),JSON.stringify(report,null,1));
const box=new T.Box3().setFromObject(gltf.scene);console.log('Bounds',box.min.toArray(),box.max.toArray(),'parts',report.length);
function tree(o,depth=0){if(depth<4){console.log(' '.repeat(depth),o.name||'(root)',o.children.length);if(o.children.length<30)for(const c of o.children)tree(c,depth+1);}}
tree(gltf.scene);
