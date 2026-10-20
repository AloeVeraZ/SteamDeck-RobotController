// three.js (MIT), CAD import and the requested DSIM field rendering for this local build.
// DSIM: PolyForm Noncommercial 1.0.0; see vendor/licenses/DSIM-LICENSE and DSIM-NOTICE.
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
export * from './field-view-entry.ts';
