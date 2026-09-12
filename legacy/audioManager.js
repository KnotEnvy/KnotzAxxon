// Audio Manager Instance
class AudioManager {
    constructor() {
        this.ctx = null;
        this.shootBuffer = null;
        this.explosionBuffer = null;
        this.fuelBuffer = null;
        this.bgmId = null;
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.shootBuffer = this.generateBuffer(440, 0.1, 'triangle');
            this.explosionBuffer = this.generateBuffer(110, 0.4, 'square');
            this.fuelBuffer = this.generateBuffer(880, 0.1, 'sine');
        } catch (e) {
            console.warn("Audio Context failed", e);
        }
    }

    generateBuffer(freq, dur, type) {
        if (!this.ctx) return null;
        const count = Math.floor(this.ctx.sampleRate * dur);
        const buffer = this.ctx.createBuffer(1, count, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < count; i++) {
            const t = i / this.ctx.sampleRate;
            let v = 0;
            if (type === 'triangle') v = 2 * Math.abs(2 * (t * freq - Math.floor(0.5 + t * freq))) - 1;
            else if (type === 'square') v = Math.sign(Math.sin(2 * Math.PI * freq * t));
            else if (type === 'sine') v = Math.sin(2 * Math.PI * freq * t);
            data[i] = v * 0.15 * (1 - i / count);
        }
        return buffer;
    }

    play(buffer) {
        if (!buffer || !this.ctx || this.ctx.state !== 'running') return;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.ctx.destination);
        src.start();
    }

    startBGM() {
        if (!this.ctx || this.ctx.state !== 'running' || this.bgmId) return;
        this.bgmDelay = 500;
        const notes = [196, 220, 246, 220]; // G3, A3, B3, A3
        let idx = 0;
        const play = () => {
            if (this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.03, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
            osc.frequency.setValueAtTime(notes[idx % notes.length], this.ctx.currentTime);
            osc.type = 'sawtooth';
            osc.connect(gain).connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.6);
            idx++;
            this.bgmId = setTimeout(play, this.bgmDelay);
        };
        play();
    }

    setBGMDelay(delay) {
        this.bgmDelay = delay;
    }

    playAlarm() {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(880, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    stopBGM() {
        if (this.bgmId) {
            clearTimeout(this.bgmId);
            this.bgmId = null;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => this.startBGM());
        }
    }
}

const audio = new AudioManager();
