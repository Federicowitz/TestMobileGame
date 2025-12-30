import nipplejs from 'https://cdn.skypack.dev/nipplejs@0.9.0';

export class InputManager {
    constructor() {
        this.moveVector = { x: 0, y: 0 };
        this.aimVector = { x: 0, y: 0 };
        this.isFiring = false;
        
        // Rilevamento Mobile vs Desktop
        this.isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1);
        
        if (this.isMobile) {
            this.initTouch();
        } else {
            this.initKeyboard();
        }
    }

    initTouch() {
        console.log("Input: Touch Mode");
        // Joystick Sinistro (Movimento)
        const joyLeft = nipplejs.create({
            zone: document.getElementById('joystick-zone-left'),
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'cyan'
        });
        joyLeft.on('move', (evt, data) => {
            // Forza massima 1 per evitare velocità eccessive
            const force = Math.min(data.force, 1);
            this.moveVector.x = Math.cos(data.angle.radian) * force;
            this.moveVector.y = Math.sin(data.angle.radian) * force;
        }).on('end', () => this.moveVector = { x: 0, y: 0 });

        // Joystick Destro (Mira)
        const joyRight = nipplejs.create({
            zone: document.getElementById('joystick-zone-right'),
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'red'
        });
        joyRight.on('move', (evt, data) => {
            this.aimVector.x = Math.cos(data.angle.radian);
            this.aimVector.y = Math.sin(data.angle.radian);
            this.isFiring = true;
        }).on('end', () => this.isFiring = false);
    }

    initKeyboard() {
        console.log("Input: Keyboard Mode");
        const keys = { w: false, a: false, s: false, d: false };

        window.addEventListener('keydown', (e) => {
            if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
            this.updateWASD(keys);
        });

        window.addEventListener('keyup', (e) => {
            if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
            this.updateWASD(keys);
        });

        // Mouse Aiming
        window.addEventListener('mousemove', (e) => {
            const dx = e.clientX - window.innerWidth / 2;
            const dy = -(e.clientY - window.innerHeight / 2); // Y invertita
            const angle = Math.atan2(dy, dx);
            this.aimVector.x = Math.cos(angle);
            this.aimVector.y = Math.sin(angle);
        });

        window.addEventListener('mousedown', () => this.isFiring = true);
        window.addEventListener('mouseup', () => this.isFiring = false);
    }

    updateWASD(keys) {
        this.moveVector.x = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
        this.moveVector.y = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
        
        // Normalizzazione diagonale
        if (this.moveVector.x !== 0 || this.moveVector.y !== 0) {
            const len = Math.sqrt(this.moveVector.x**2 + this.moveVector.y**2);
            this.moveVector.x /= len;
            this.moveVector.y /= len;
        }
    }
}