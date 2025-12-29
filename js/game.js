import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';
import nipplejs from 'https://cdn.skypack.dev/nipplejs@0.9.0';
import { createNoise2D } from 'https://cdn.skypack.dev/simplex-noise@4.0.0';

// CONFIGURAZIONE GLOBALE
const CONFIG = {
    CHUNK_SIZE: 16,     // Dimensione di un blocco di mondo (unità)
    RENDER_DISTANCE: 2, // Quanti chunk vedere attorno al player (raggio)
    TILE_SIZE: 2,       // Dimensione di ogni "quadrato" del terreno
    CAM_HEIGHT: 20,     // Altezza telecamera
    CAM_ANGLE: 0.8,     // Angolazione (rad)
    PLAYER_SPEED: 0.15
};

// --- 1. GESTIONE INPUT (PC & MOBILE) ---
class InputManager {
    constructor() {
        this.moveVector = { x: 0, y: 0 }; // x, y (joystick sinistro o WASD)
        this.aimVector = { x: 0, y: 0 };  // x, y (joystick destro o Mouse)
        this.isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        this.isFiring = false;

        if (this.isMobile) {
            this.initTouchControls();
        } else {
            this.initKeyboardMouseControls();
        }
    }

    initTouchControls() {
        console.log("Modalità Mobile Attiva");
        // Joystick Sinistro (Movimento)
        const joyLeft = nipplejs.create({
            zone: document.getElementById('joystick-zone-left'),
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'cyan'
        });

        joyLeft.on('move', (evt, data) => {
            const angle = data.angle.radian;
            const force = Math.min(data.force, 1); // Clamp forza a 1
            this.moveVector.x = Math.cos(angle) * force;
            this.moveVector.y = Math.sin(angle) * force;
        }).on('end', () => {
            this.moveVector = { x: 0, y: 0 };
        });

        // Joystick Destro (Mira/Attacco)
        const joyRight = nipplejs.create({
            zone: document.getElementById('joystick-zone-right'),
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'red'
        });

        joyRight.on('move', (evt, data) => {
            const angle = data.angle.radian;
            this.aimVector.x = Math.cos(angle);
            this.aimVector.y = Math.sin(angle);
            this.isFiring = true;
        }).on('end', () => {
            this.isFiring = false;
        });
    }

    initKeyboardMouseControls() {
        console.log("Modalità PC Attiva");
        const keys = { w: false, a: false, s: false, d: false };

        window.addEventListener('keydown', (e) => {
            if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
            this.updateWASD();
        });

        window.addEventListener('keyup', (e) => {
            if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
            this.updateWASD();
        });

        window.addEventListener('mousemove', (e) => {
            // Calcola vettore mira dal centro schermo al mouse
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const dx = e.clientX - centerX;
            const dy = -(e.clientY - centerY); // Inverti Y perché screen Y va giù
            const angle = Math.atan2(dy, dx);
            this.aimVector.x = Math.cos(angle);
            this.aimVector.y = Math.sin(angle);
        });

        window.addEventListener('mousedown', () => this.isFiring = true);
        window.addEventListener('mouseup', () => this.isFiring = false);

        this.keys = keys;
    }

    updateWASD() {
        this.moveVector.x = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
        this.moveVector.y = (this.keys.w ? 1 : 0) - (this.keys.s ? 1 : 0);
        // Normalizza se diagonale
        if (this.moveVector.x !== 0 || this.moveVector.y !== 0) {
            const len = Math.sqrt(this.moveVector.x ** 2 + this.moveVector.y ** 2);
            this.moveVector.x /= len;
            this.moveVector.y /= len;
        }
    }
}

// --- 2. MONDO PROCEDURALE ---
class WorldManager {
    constructor(scene) {
        this.scene = scene;
        this.chunks = {}; // Mappa dei chunk caricati 'x,z' -> Mesh
        this.noise2D = createNoise2D(); // Inizializza Perlin Noise
        this.loader = new GLTFLoader(); // Per caricare modelli futuri

        // Materiali base (Placeholder per gli asset)
        this.materials = {
            grass: new THREE.MeshStandardMaterial({ color: 0x5da65d }), // Verde erba
            dirt: new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),  // Marrone terra
            rock: new THREE.MeshStandardMaterial({ color: 0x808080 }),  // Grigio roccia
            tree: new THREE.MeshStandardMaterial({ color: 0x228b22 })   // Albero
        };
    }

    // Coordinate mondo -> Chiave Chunk "X,Z"
    getChunkKey(x, z) {
        const chunkX = Math.floor(x / (CONFIG.CHUNK_SIZE * CONFIG.TILE_SIZE));
        const chunkZ = Math.floor(z / (CONFIG.CHUNK_SIZE * CONFIG.TILE_SIZE));
        return `${chunkX},${chunkZ}`;
    }

    updateChunks(playerPos) {
        const pCx = Math.floor(playerPos.x / (CONFIG.CHUNK_SIZE * CONFIG.TILE_SIZE));
        const pCz = Math.floor(playerPos.z / (CONFIG.CHUNK_SIZE * CONFIG.TILE_SIZE));

        const activeKeys = new Set();

        // Carica chunk attorno al player
        for (let x = -CONFIG.RENDER_DISTANCE; x <= CONFIG.RENDER_DISTANCE; x++) {
            for (let z = -CONFIG.RENDER_DISTANCE; z <= CONFIG.RENDER_DISTANCE; z++) {
                const key = `${pCx + x},${pCz + z}`;
                activeKeys.add(key);

                if (!this.chunks[key]) {
                    this.generateChunk(pCx + x, pCz + z, key);
                }
            }
        }

        // Scarica chunk lontani (garbage collection)
        for (const key in this.chunks) {
            if (!activeKeys.has(key)) {
                this.scene.remove(this.chunks[key]);
                // Importante: Dispose geometry/material per evitare memory leak
                this.chunks[key].traverse((obj) => {
                    if (obj.geometry) obj.geometry.dispose();
                });
                delete this.chunks[key];
            }
        }

        // Debug info
        document.getElementById('debug-info').innerText = `Chunk: ${pCx},${pCz}`;
    }

    generateChunk(cx, cz, key) {
        const chunkGroup = new THREE.Group();
        // Spostiamo il gruppo nella posizione corretta del mondo
        chunkGroup.position.set(
            cx * CONFIG.CHUNK_SIZE * CONFIG.TILE_SIZE,
            0,
            cz * CONFIG.CHUNK_SIZE * CONFIG.TILE_SIZE
        );

        // Geometria unica per il terreno del chunk (ottimizzazione)
        // Per ora usiamo cubi singoli per semplicità, in futuro merged geometries

        for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
            for (let z = 0; z < CONFIG.CHUNK_SIZE; z++) {
                // Calcola coordinate globali per il noise
                const globalX = (cx * CONFIG.CHUNK_SIZE) + x;
                const globalZ = (cz * CONFIG.CHUNK_SIZE) + z;

                // Valore Noise: da -1 a 1. Lo usiamo per altezza e bioma.
                // Scala 0.1 per colline dolci
                const noiseVal = this.noise2D(globalX * 0.1, globalZ * 0.1);

                let mat = this.materials.grass;
                let height = 1;
                let addProp = null;

                if (noiseVal < -0.3) {
                    mat = this.materials.dirt; // Fossato/Sentiero
                    height = 0.8;
                } else if (noiseVal > 0.6) {
                    mat = this.materials.rock; // Montagna/Ostacolo
                    height = 2; // Muro alto
                } else if (noiseVal > 0.3 && Math.random() > 0.8) {
                    // Albero casuale su erba alta
                    addProp = 'tree';
                }

                const geometry = new THREE.BoxGeometry(CONFIG.TILE_SIZE, height * CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                const mesh = new THREE.Mesh(geometry, mat);

                mesh.position.set(
                    x * CONFIG.TILE_SIZE,
                    (height * CONFIG.TILE_SIZE) / 2 - 1, // Allinea base
                    z * CONFIG.TILE_SIZE
                );

                mesh.receiveShadow = true;
                if (height > 1.5) mesh.castShadow = true; // Solo oggetti alti proiettano ombra

                chunkGroup.add(mesh);

                // Aggiunta Props (Alberi, Casse)
                if (addProp === 'tree') {
                    const treeGeo = new THREE.ConeGeometry(1, 4, 8);
                    const tree = new THREE.Mesh(treeGeo, this.materials.tree);
                    tree.position.set(
                        x * CONFIG.TILE_SIZE,
                        height * CONFIG.TILE_SIZE + 2,
                        z * CONFIG.TILE_SIZE
                    );
                    tree.castShadow = true;
                    chunkGroup.add(tree);
                }
            }
        }

        this.chunks[key] = chunkGroup;
        this.scene.add(chunkGroup);
    }
}

// --- 3. LOGICA PRINCIPALE (MAIN) ---
class Game {
    constructor() {
        this.container = document.getElementById('game-container');

        // 1. Setup Scena
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Cielo azzurro

        // 2. Camera Isometrica
        const aspect = window.innerWidth / window.innerHeight;
        // Uso PerspectiveCamera per 3D moderno, posizionata in alto
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.cameraOffset = new THREE.Vector3(0, CONFIG.CAM_HEIGHT, CONFIG.CAM_HEIGHT);
        this.camera.lookAt(0, 0, 0);

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true; // Abilita ombre
        this.container.appendChild(this.renderer.domElement);

        // 4. Luci
        const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 50, 50);
        dirLight.castShadow = true;
        // Configura qualità ombre
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 500;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        this.scene.add(dirLight);

        // 5. Player (Un semplice cubo per ora, sostituibile con Modello GLB)
        const playerGeo = new THREE.BoxGeometry(1.5, 3, 1.5);
        const playerMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        this.player = new THREE.Mesh(playerGeo, playerMat);
        this.player.position.y = 1.5;
        this.player.castShadow = true;
        this.scene.add(this.player);

        // Indicatore di mira (una piccola sfera che ruota attorno al player)
        const aimGeo = new THREE.SphereGeometry(0.5, 8, 8);
        const aimMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.aimIndicator = new THREE.Mesh(aimGeo, aimMat);
        this.scene.add(this.aimIndicator);

        // 6. Sistemi
        this.input = new InputManager();
        this.world = new WorldManager(this.scene);

        // Evento Resize
        window.addEventListener('resize', () => this.onWindowResize(), false);

        // Avvio Loop
        this.animate();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    update() {
        // 1. Movimento Player
        // Nota: In Three.js X è destra/sinistra, Z è avanti/indietro (depth), Y è altezza
        // L'input.y è +1 (su), ma in 3D "avanti" è solitamente -Z.
        const moveX = this.input.moveVector.x * CONFIG.PLAYER_SPEED;
        const moveZ = -this.input.moveVector.y * CONFIG.PLAYER_SPEED; // Inverti Y input per Z 3D

        this.player.position.x += moveX;
        this.player.position.z += moveZ;

        // 2. Rotazione Player (verso la mira)
        if (this.input.aimVector.x !== 0 || this.input.aimVector.y !== 0) {
            // Calcola angolo mira
            // Input Y è su (+), Z 3D è giù (-).
            const angle = Math.atan2(-this.input.aimVector.y, this.input.aimVector.x);
            // -angle perché Three.js ruota in senso antiorario ma atan2 standard è diverso asse Y
            this.player.rotation.y = angle + Math.PI / 2; // Correzione orientamento

            // Aggiorna indicatore mira
            this.aimIndicator.position.set(
                this.player.position.x + this.input.aimVector.x * 3,
                this.player.position.y,
                this.player.position.z - this.input.aimVector.y * 3
            );
            this.aimIndicator.visible = true;
        } else {
            // Se non mira, nascondi pallino o fallo guardare avanti
            if (moveX !== 0 || moveZ !== 0) {
                const moveAngle = Math.atan2(moveX, moveZ);
                this.player.rotation.y = moveAngle;
            }
            this.aimIndicator.visible = false;
        }

        // 3. Camera Follow
        // La telecamera segue il player con un offset liscio (Lerp)
        const targetPos = new THREE.Vector3(
            this.player.position.x + this.cameraOffset.x,
            this.player.position.y + this.cameraOffset.y,
            this.player.position.z + this.cameraOffset.z
        );
        this.camera.position.lerp(targetPos, 0.1); // 0.1 = 10% di avvicinamento per frame (smusso)
        this.camera.lookAt(this.player.position);

        // 4. Gestione Mondo (Chunk)
        this.world.updateChunks(this.player.position);

        // 5. Attacco (Placeholder)
        if (this.input.isFiring) {
            this.player.material.color.setHex(0xffffff); // Flash bianco
        } else {
            this.player.material.color.setHex(0xff0000); // Rosso normale
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Avvio Gioco
new Game();