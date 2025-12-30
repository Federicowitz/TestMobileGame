import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { createNoise2D } from 'https://cdn.skypack.dev/simplex-noise@4.0.0';

export const WORLD_CONFIG = {
    CHUNK_SIZE: 16,
    TILE_SIZE: 2,
    RENDER_DISTANCE: 2
};

export class WorldManager {
    constructor(scene) {
        this.scene = scene;
        this.chunks = {};
        this.collisionMap = new Map(); // "gridX,gridZ" -> true
        this.noise = createNoise2D();
        
        this.materials = {
            grass: new THREE.MeshStandardMaterial({ color: 0x5da65d }),
            dirt: new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
            rock: new THREE.MeshStandardMaterial({ color: 0x808080 }),
            tree: new THREE.MeshStandardMaterial({ color: 0x228b22 }),
            build: new THREE.MeshStandardMaterial({ color: 0xffaa00 }) // Materiale blocchi costruiti
        };
    }

    // Restituisce coordinate griglia
    toGrid(val) { return Math.round(val / WORLD_CONFIG.TILE_SIZE); }

    isBlocked(x, z, radius = 0.5) {
        const gx = this.toGrid(x);
        const gz = this.toGrid(z);
        return this.collisionMap.has(`${gx},${gz}`);
    }

    // --- NUOVO: RIMOZIONE OGGETTI (Distruzione) ---
    removeObjectAt(worldX, worldZ) {
        const gx = this.toGrid(worldX);
        const gz = this.toGrid(worldZ);
        const key = `${gx},${gz}`;

        if (this.collisionMap.has(key)) {
            // Rimuovi dalla mappa logica
            this.collisionMap.delete(key);

            // Trova il chunk
            const cx = Math.floor(gx / WORLD_CONFIG.CHUNK_SIZE);
            const cz = Math.floor(gz / WORLD_CONFIG.CHUNK_SIZE);
            const chunkKey = `${cx},${cz}`;
            const chunk = this.chunks[chunkKey];

            if (chunk) {
                // Cerca l'oggetto nel chunk col nome "GX_GZ"
                const objectToRemove = chunk.getObjectByName(key);
                if (objectToRemove) {
                    // Animazione distruzione (opzionale: sca rimpicciolisce)
                    objectToRemove.scale.set(0.1, 0.1, 0.1); 
                    setTimeout(() => {
                        chunk.remove(objectToRemove);
                        objectToRemove.geometry.dispose(); // Pulisci memoria
                    }, 50);
                    return true; // Distruzione avvenuta
                }
            }
        }
        return false;
    }

    // --- NUOVO: COSTRUZIONE OGGETTI ---
    placeObjectAt(worldX, worldZ) {
        const gx = this.toGrid(worldX);
        const gz = this.toGrid(worldZ);
        const key = `${gx},${gz}`;

        // Non costruire se c'è già qualcosa
        if (this.collisionMap.has(key)) return false;

        // Trova il chunk
        const cx = Math.floor(gx / WORLD_CONFIG.CHUNK_SIZE);
        const cz = Math.floor(gz / WORLD_CONFIG.CHUNK_SIZE);
        const chunkKey = `${cx},${cz}`;
        const chunk = this.chunks[chunkKey];

        if (chunk) {
            // Crea il blocco
            const geo = new THREE.BoxGeometry(WORLD_CONFIG.TILE_SIZE, WORLD_CONFIG.TILE_SIZE, WORLD_CONFIG.TILE_SIZE);
            const mesh = new THREE.Mesh(geo, this.materials.build);
            
            // Posiziona
            mesh.position.set(
                gx * WORLD_CONFIG.TILE_SIZE, 
                WORLD_CONFIG.TILE_SIZE / 2, // Sopra il terreno base (che è a 0 o -1)
                gz * WORLD_CONFIG.TILE_SIZE
            );
            
            mesh.name = key; // IMPORTANTE: Diamogli un nome per trovarlo dopo
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            chunk.add(mesh);
            this.collisionMap.set(key, true);
            return true;
        }
        return false;
    }

    update(playerPos) {
        const cx = Math.floor(playerPos.x / (WORLD_CONFIG.CHUNK_SIZE * WORLD_CONFIG.TILE_SIZE));
        const cz = Math.floor(playerPos.z / (WORLD_CONFIG.CHUNK_SIZE * WORLD_CONFIG.TILE_SIZE));

        const activeKeys = new Set();
        for (let x = -WORLD_CONFIG.RENDER_DISTANCE; x <= WORLD_CONFIG.RENDER_DISTANCE; x++) {
            for (let z = -WORLD_CONFIG.RENDER_DISTANCE; z <= WORLD_CONFIG.RENDER_DISTANCE; z++) {
                const key = `${cx + x},${cz + z}`;
                activeKeys.add(key);
                if (!this.chunks[key]) this.generateChunk(cx + x, cz + z, key);
            }
        }

        for (const key in this.chunks) {
            if (!activeKeys.has(key)) {
                // Garbage collection semplificata per brevità
                // (In produzione dovresti rimuovere anche le chiavi collisionMap relative a questo chunk)
                this.scene.remove(this.chunks[key]);
                delete this.chunks[key];
            }
        }
    }

    generateChunk(cx, cz, key) {
        const group = new THREE.Group();
        group.position.set(0,0,0); // Usiamo coordinate globali nei figli per facilità
        
        // Salviamo le chiavi di collisione per pulizia futura
        group.userData.collisionKeys = []; 

        for (let x = 0; x < WORLD_CONFIG.CHUNK_SIZE; x++) {
            for (let z = 0; z < WORLD_CONFIG.CHUNK_SIZE; z++) {
                const gx = (cx * WORLD_CONFIG.CHUNK_SIZE) + x;
                const gz = (cz * WORLD_CONFIG.CHUNK_SIZE) + z;
                const n = this.noise(gx * 0.1, gz * 0.1);
                
                let h = 0.2, mat = this.materials.grass, solid = false, prop = false;
                
                if (n < -0.3) { mat = this.materials.dirt; h = 0.2; }
                else if (n > 0.6) { mat = this.materials.rock; h = 2.5; solid = true; } 
                else if (n > 0.3 && Math.random() > 0.9) { prop = true; solid = true; }

                // Pavimento (Non collidibile, decorativo)
                // Nota: Per le coordinate usiamo gx * TILE_SIZE direttamente
                const floor = new THREE.Mesh(
                    new THREE.BoxGeometry(WORLD_CONFIG.TILE_SIZE, h * WORLD_CONFIG.TILE_SIZE, WORLD_CONFIG.TILE_SIZE), 
                    mat
                );
                floor.position.set(gx * WORLD_CONFIG.TILE_SIZE, (h * WORLD_CONFIG.TILE_SIZE)/2 - 2, gz * WORLD_CONFIG.TILE_SIZE);
                floor.receiveShadow = true;
                group.add(floor);

                const objName = `${gx},${gz}`; // NOME UTILE PER TROVARLO

                // Roccia (Collidibile)
                if (solid && !prop) {
                    // Diamo alla roccia lo stesso mesh del pavimento ma più alto, già fatto sopra
                    // Ma per logicamente separarle, in realtà nel codice sopra ho alzato il floor.
                    // Facciamo che se è solid, è un blocco distruttibile
                    floor.name = objName; 
                    this.collisionMap.set(objName, true);
                    group.userData.collisionKeys.push(objName);
                }

                // Albero (Prop)
                if (prop) {
                    const tree = new THREE.Mesh(new THREE.ConeGeometry(1, 4, 8), this.materials.tree);
                    tree.position.set(gx * WORLD_CONFIG.TILE_SIZE, 2, gz * WORLD_CONFIG.TILE_SIZE);
                    tree.castShadow = true;
                    tree.name = objName; // Diamo il nome all'albero
                    group.add(tree);
                    this.collisionMap.set(objName, true);
                    group.userData.collisionKeys.push(objName);
                }
            }
        }
        this.chunks[key] = group;
        this.scene.add(group);
    }
}