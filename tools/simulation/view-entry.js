// three.js (MIT) for the simulator's own 3D view and robot-model import. No DSIM code is drawn
// in the window: DSIM provides physics only, in the simulation process.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export { THREE, GLTFLoader, GLTFExporter, STLLoader, OBJLoader, OrbitControls, MeshoptDecoder, ConvexGeometry, mergeGeometries, mergeVertices };
