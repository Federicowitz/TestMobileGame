import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';

export class AssetManager {
    constructor() {
        this.loader = new GLTFLoader();
    }

    loadCharacterMesh(type) {
        return new Promise((resolve) => {
            let mesh;
            const mat = new THREE.MeshStandardMaterial();
            
            switch(type) {
                case 'MELEE': // Cubo Rosso
                    mat.color.setHex(0xd32f2f);
                    mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 1.5), mat);
                    break;
                case 'RANGED': // Triangolo Verde
                    mat.color.setHex(0x388e3c);
                    mesh = new THREE.Mesh(new THREE.ConeGeometry(1, 3.5, 8), mat);
                    break;
                case 'BUILDER': // Quadrato Giallo
                    mat.color.setHex(0xfbc02d);
                    mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
                    break;
            }
            
            mesh.castShadow = true;
            // Spostiamo la geometria in modo che l'origine sia alla base (piedi)
            mesh.geometry.translate(0, mesh.geometry.parameters.height / 2, 0); 
            resolve(mesh);
        });
    }
}