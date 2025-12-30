import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { InputManager } from './core/InputManager.js';
import { AssetManager } from './core/AssetManager.js';
import { WorldManager, WORLD_CONFIG } from './world/WorldManager.js'; // Importiamo anche la config
import { Player } from './entities/Player.js';

class Game {
    constructor() {
        this.initThree();
        
        // Cache elemento UI per non cercarlo ogni frame (ottimizzazione)
        this.debugUI = document.getElementById('debug-info');
        
        // Variabili FPS
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;

        this.inputs = new InputManager();
        this.assets = new AssetManager();
        this.world = new WorldManager(this.scene);
        
        // Puoi cambiare 'MELEE' in 'RANGED' o 'BUILDER'
        this.player = new Player(this.scene, this.world, this.assets, 'BUILDER');

        this.animate();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);

        // Camera Isometrica
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        // Posizioniamo la camera
        this.camOffset = new THREE.Vector3(0, 25, 20); 

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Luci
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 50, 50);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        // Area ombre
        const d = 50;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        this.scene.add(dirLight);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    updateUI() {
        // 1. Calcolo FPS (Frames Per Second)
        const now = performance.now();
        this.frameCount++;
        
        if (now >= this.lastTime + 1000) { // Ogni secondo
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = now;
        }

        // 2. Calcolo Coordinate Chunk
        // Usiamo le costanti importate da WorldManager per coerenza
        let cx = 0, cz = 0;
        if (this.player && this.player.container) {
            const px = this.player.container.position.x;
            const pz = this.player.container.position.z;
            
            cx = Math.floor(px / (WORLD_CONFIG.CHUNK_SIZE * WORLD_CONFIG.TILE_SIZE));
            cz = Math.floor(pz / (WORLD_CONFIG.CHUNK_SIZE * WORLD_CONFIG.TILE_SIZE));
        }

        // 3. Stampa a video
        if (this.debugUI) {
            this.debugUI.innerText = `Chunk: ${cx},${cz} | FPS: ${this.fps}`;
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Logica di gioco
        this.player.update(this.inputs);
        this.world.update(this.player.container.position);

        // Aggiornamento UI
        this.updateUI();

        // Camera Follow (Lerp per fluidità)
        if (this.player.container) {
            const targetPos = this.player.container.position.clone().add(this.camOffset);
            this.camera.position.lerp(targetPos, 0.1);
            this.camera.lookAt(this.player.container.position);
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Avvio
new Game();