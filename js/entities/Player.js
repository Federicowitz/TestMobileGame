import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { WORLD_CONFIG } from '../world/WorldManager.js';

export class Player {
    constructor(scene, world, assetManager, type = 'MELEE') {
        this.scene = scene;
        this.world = world;
        this.type = type; // 'MELEE', 'RANGED', 'BUILDER'
        
        this.container = new THREE.Group();
        this.scene.add(this.container);
        
        this.speed = 0.25;
        this.mesh = null;
        
        // Cooldown Attacco
        this.lastAttackTime = 0;
        this.attackCooldown = 500; // ms

        // Visualizzazione Mira
        this.aimGroup = new THREE.Group();
        this.scene.add(this.aimGroup);
        this.aimGroup.visible = false;
        
        this.setupAimIndicator();

        assetManager.loadCharacterMesh(type).then(mesh => {
            this.mesh = mesh;
            this.container.add(this.mesh);
        });
    }

    setupAimIndicator() {
        // Grafica diversa per classe
        let geo, mat;
        if (this.type === 'MELEE') {
            // Semicerchio 180 gradi
            geo = new THREE.RingGeometry(2, 2.5, 32, 1, -Math.PI/2, Math.PI); 
            mat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, opacity: 0.5, transparent: true });
        } else if (this.type === 'RANGED') {
            // Cono stretto 30 gradi (conversione in rad: 30 * PI / 180 = ~0.52)
            geo = new THREE.RingGeometry(2, 8, 32, 1, -0.26, 0.52); 
            mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, opacity: 0.5, transparent: true });
        } else {
            // Builder: Quadrato di selezione
            geo = new THREE.BoxGeometry(2, 0.2, 2);
            mat = new THREE.MeshBasicMaterial({ color: 0x0000ff, opacity: 0.5, transparent: true });
            geo.translate(0, 0, 4); // Sposta in avanti il cursore
        }

        const mesh = new THREE.Mesh(geo, mat);
        if(this.type !== 'BUILDER') mesh.rotation.x = -Math.PI / 2; // Sdraiato
        this.aimGroup.add(mesh);
    }

    update(input) {
        if (!this.mesh) return;

        // 1. MOVIMENTO (Invariato)
        const dx = input.moveVector.x * this.speed;
        const dz = -input.moveVector.y * this.speed;

        if (dx !== 0 || dz !== 0) {
            const nextX = this.container.position.x + dx;
            const nextZ = this.container.position.z + dz;
            
            // Controllo collisione semplificato (centro)
            if (!this.world.isBlocked(nextX, nextZ)) {
                this.container.position.x = nextX;
                this.container.position.z = nextZ;
            } else {
                 // Scivolamento
                 if (!this.world.isBlocked(nextX, this.container.position.z)) this.container.position.x = nextX;
                 else if (!this.world.isBlocked(this.container.position.x, nextZ)) this.container.position.z = nextZ;
            }

            this.container.rotation.y = Math.atan2(dx, dz);
        }

        // 2. MIRA E ATTACCO
        if (input.aimVector.x !== 0 || input.aimVector.y !== 0) {
            this.aimGroup.visible = true;
            this.aimGroup.position.copy(this.container.position);
            this.aimGroup.position.y = 0.2;

            const aimAngle = Math.atan2(input.aimVector.x, -input.aimVector.y);
            this.aimGroup.rotation.y = aimAngle;

            // Logica Attacco con Cooldown
            if (input.isFiring) {
                const now = Date.now();
                if (now - this.lastAttackTime > this.attackCooldown) {
                    this.performAttack(input.aimVector);
                    this.lastAttackTime = now;
                    
                    // Feedback visivo immediato (Pulsazione)
                    this.mesh.scale.setScalar(1.3);
                    setTimeout(() => this.mesh.scale.setScalar(1), 100);
                }
            }
        } else {
            this.aimGroup.visible = false;
        }
    }

    performAttack(aimVec) {
        // Normalizziamo il vettore di mira
        const aimDir = new THREE.Vector3(aimVec.x, 0, -aimVec.y).normalize();
        const pPos = this.container.position;

        if (this.type === 'MELEE') {
            // --- LOGICA MELEE (180 gradi, raggio corto 3) ---
            const range = 3.5;
            // Controlliamo in un'area quadrata attorno al player per efficienza
            for (let x = -range; x <= range; x += WORLD_CONFIG.TILE_SIZE) {
                for (let z = -range; z <= range; z += WORLD_CONFIG.TILE_SIZE) {
                    const checkX = pPos.x + x;
                    const checkZ = pPos.z + z;
                    
                    // Vettore verso il bersaglio
                    const targetDir = new THREE.Vector3(checkX - pPos.x, 0, checkZ - pPos.z);
                    const dist = targetDir.length();

                    if (dist < range && dist > 0.5) { // Dentro il raggio
                        targetDir.normalize();
                        // Prodotto scalare: se > 0 l'angolo è < 90 gradi per lato (quindi 180 totali)
                        const dot = aimDir.dot(targetDir);
                        if (dot > 0) { 
                            this.world.removeObjectAt(checkX, checkZ);
                        }
                    }
                }
            }

        } else if (this.type === 'RANGED') {
            // --- LOGICA RANGED (30 gradi, raggio lungo 8) ---
            const range = 10;
            // 30 gradi totali = 15 per lato. Cos(15) ~= 0.96
            const minDot = Math.cos(15 * Math.PI / 180); 

            for (let x = -range; x <= range; x += WORLD_CONFIG.TILE_SIZE) {
                for (let z = -range; z <= range; z += WORLD_CONFIG.TILE_SIZE) {
                    const checkX = pPos.x + x;
                    const checkZ = pPos.z + z;
                    
                    const targetDir = new THREE.Vector3(checkX - pPos.x, 0, checkZ - pPos.z);
                    const dist = targetDir.length();

                    if (dist < range && dist > 1) {
                        targetDir.normalize();
                        const dot = aimDir.dot(targetDir);
                        if (dot > minDot) { // Cono stretto
                            this.world.removeObjectAt(checkX, checkZ);
                        }
                    }
                }
            }

        } else if (this.type === 'BUILDER') {
            // --- LOGICA BUILDER (Piazza blocco davanti) ---
            const buildDist = 4;
            const targetX = pPos.x + (aimDir.x * buildDist);
            const targetZ = pPos.z + (aimDir.z * buildDist);
            
            this.world.placeObjectAt(targetX, targetZ);
        }
    }
}