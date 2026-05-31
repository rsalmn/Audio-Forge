// Global State
let tracks = [];
let isPlaying = false;
let currentPreset = 'normal';
let isLooping = false;

// Tone.js Master Nodes
let masterEq, masterReverb, masterVol, masterCompressor, masterLimiter;
let masterNoise, masterNoiseVol, masterChorus;
let engineStarted = false;

// DOM Elements
const fileUpload = document.getElementById('file-upload');
const trackList = document.getElementById('track-list');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnStop = document.getElementById('btn-stop');
const btnLoop = document.getElementById('btn-loop');
const playIcon = document.getElementById('play-icon');
const playText = document.getElementById('play-text');
const trackCountEl = document.getElementById('track-count');
const presetNameDisplay = document.getElementById('current-preset-name');
const btnExportWav = document.getElementById('btn-export-wav');
const btnExportMp3 = document.getElementById('btn-export-mp3');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const appContainer = document.querySelector('.app-container');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');

// Global Sliders
const sliderPitch = document.getElementById('slider-pitch');
const sliderSpeed = document.getElementById('slider-speed');
const sliderHigh = document.getElementById('slider-high');
const sliderMid = document.getElementById('slider-mid');
const sliderBass = document.getElementById('slider-bass');
const sliderVolume = document.getElementById('slider-volume');

const valPitch = document.getElementById('val-pitch');
const valSpeed = document.getElementById('val-speed');
const valHigh = document.getElementById('val-high');
const valMid = document.getElementById('val-mid');
const valBass = document.getElementById('val-bass');
const valVolume = document.getElementById('val-volume');

// Presets Config
const presets = {
    normal: { pitch: 0, speed: 1.0, high: 0, mid: 0, bass: 0, reverb: 0, volume: 0, compress: false, noise: false, chorus: false },
    jernih: { pitch: 0, speed: 1.0, high: 3, mid: 1, bass: 0, reverb: 0, volume: 0, compress: true, noise: false, chorus: false },
    anticopyright: { pitch: 1, speed: 1.1, high: 0, mid: 1.5, bass: 0, reverb: 0, volume: 0, compress: false, noise: true, chorus: true },
    nightcore: { pitch: 3, speed: 1.25, high: 2, mid: 0, bass: 2, reverb: 0, volume: 0, compress: true, noise: false, chorus: false },
    slowed: { pitch: -2, speed: 0.8, high: -2, mid: 0, bass: 4, reverb: 0.2, volume: 0, compress: true, noise: false },
    chipmunk: { pitch: 12, speed: 1.1, high: 4, mid: 0, bass: -2, reverb: 0, volume: 0, compress: false, noise: false },
    vaporwave: { pitch: -4, speed: 0.75, high: -4, mid: -2, bass: 5, reverb: 0.8, volume: 0, compress: true, noise: false },
    deep: { pitch: -8, speed: 1.0, high: -2, mid: -1, bass: 6, reverb: 0, volume: 0, compress: true, noise: false }
};

// Worker Code as Blob URL
const workerCode = `
importScripts('https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js');

self.onmessage = function(e) {
    const { left, right, numChannels, sampleRate } = e.data;
    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128);
    const mp3Data = [];
    
    const sampleBlockSize = 1152;
    const totalSamples = left.length;
    let processed = 0;

    for (let i = 0; i < totalSamples; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, Math.min(i + sampleBlockSize, totalSamples));
        const rightChunk = right ? right.subarray(i, Math.min(i + sampleBlockSize, totalSamples)) : leftChunk;
        
        const leftInt16 = new Int16Array(leftChunk.length);
        const rightInt16 = new Int16Array(rightChunk.length);
        
        for(let j=0; j<leftChunk.length; j++){
            leftInt16[j] = leftChunk[j] < 0 ? leftChunk[j] * 32768 : leftChunk[j] * 32767;
            rightInt16[j] = rightChunk[j] < 0 ? rightChunk[j] * 32768 : rightChunk[j] * 32767;
        }
        
        const mp3buf = mp3encoder.encodeBuffer(leftInt16, rightInt16);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
        
        processed += leftChunk.length;
        if (processed % (sampleBlockSize * 40) < sampleBlockSize) {
            self.postMessage({ type: 'progress', progress: processed / totalSamples });
        }
    }
    
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }
    
    self.postMessage({ type: 'done', data: mp3Data });
};
`;
const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);

// Initialize Audio Context and Nodes
async function initAudio() {
    if (engineStarted) return;
    await Tone.start();
    
    masterEq = new Tone.EQ3(0, 0, 0);
    masterChorus = new Tone.Chorus(2, 2.5, 0.4).start(); // Rate: 2Hz, Delay: 2.5ms, Depth: 0.4
    masterChorus.wet.value = 0;
    masterCompressor = new Tone.Compressor({ ratio: 4, threshold: 0, release: 0.25, attack: 0.003, knee: 30 });
    masterReverb = new Tone.Reverb(2.5);
    masterVol = new Tone.Volume(0);
    masterLimiter = new Tone.Limiter(-0.5).toDestination();
    
    masterEq.chain(masterChorus, masterCompressor, masterReverb, masterVol, masterLimiter);
    
    // Subtle Noise Layer for Anti-Copyright
    masterNoise = new Tone.Noise("brown");
    masterNoiseVol = new Tone.Volume(-Infinity).connect(masterLimiter);
    masterNoise.connect(masterNoiseVol);
    masterNoise.start();
    
    await masterReverb.generate();
    masterReverb.wet.value = 0;

    engineStarted = true;
    requestAnimationFrame(updatePlayheads);
}

// Drag & Drop Handlers
appContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    appContainer.classList.add('drag-active');
});
appContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    appContainer.classList.remove('drag-active');
});
appContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    appContainer.classList.remove('drag-active');
    if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
    }
});
fileUpload.addEventListener('change', (e) => handleFiles(e.target.files));

async function handleFiles(files) {
    if (files.length === 0) return;

    await initAudio();
    showLoading("Loading audio...");

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('audio/')) continue;
        const url = URL.createObjectURL(file);
        
        try {
            const player = new Tone.Player(url);
            await Tone.loaded();
            
            const trackPitch = new Tone.PitchShift(parseFloat(sliderPitch.value));
            const trackPanner = new Tone.Panner(0);
            const trackVol = new Tone.Volume(0).connect(masterEq);
            
            player.chain(trackPitch, trackPanner, trackVol);
            player.playbackRate = parseFloat(sliderSpeed.value);
            
            const trackId = Date.now() + i;
            const track = {
                id: trackId,
                name: file.name,
                player: player,
                trackPitch: trackPitch,
                trackPanner: trackPanner,
                trackVol: trackVol,
                buffer: player.buffer,
                url: url,
                offset: 0,
                trimStart: 0,
                trimEnd: player.buffer.duration,
                volume: 0,
                pitch: 0,
                pan: 0,
                muted: false,
                soloed: false
            };
            
            tracks.push(track);
            addTrackToUI(track);
            syncTrackToTransport(track);
            
        } catch (err) {
            console.error("Error loading track:", err);
            alert("Failed to load: " + file.name);
        }
    }
    
    updateControlsState();
    updateLoopDuration();
    updateTotalTime();
    updateTrackCount();
    hideLoading();
}

function syncTrackToTransport(track) {
    track.player.unsync();
    const duration = track.trimEnd - track.trimStart;
    if (duration > 0) {
        track.player.sync().start(track.offset, track.trimStart, duration);
    }
}

function updateMuteSoloState() {
    const isAnySoloed = tracks.some(t => t.soloed);
    tracks.forEach(t => {
        if (isAnySoloed) {
            t.trackVol.mute = !t.soloed;
        } else {
            t.trackVol.mute = t.muted;
        }
    });
}

function addTrackToUI(track) {
    if (tracks.length === 1 && trackList.querySelector('.empty-state')) {
        trackList.innerHTML = '';
    }

    const div = document.createElement('div');
    div.className = 'track-item';
    div.id = `track-${track.id}`;
    
    div.innerHTML = `
        <div class="track-main">
            <div class="settings-gear" onclick="toggleSettings(${track.id})">
                <i data-lucide="settings"></i>
            </div>
            <div class="track-info">
                <div class="track-name">${track.name}</div>
            </div>
            <div class="track-actions">
                <button class="icon-btn btn-mute" id="btn-mute-${track.id}" onclick="toggleMute(${track.id})" title="Mute">M</button>
                <button class="icon-btn btn-solo" id="btn-solo-${track.id}" onclick="toggleSolo(${track.id})" title="Solo">S</button>
                <button class="icon-btn danger" onclick="removeTrack(${track.id})" title="Remove Track">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
        <div class="track-waveform-container" id="wc-${track.id}">
            <canvas id="canvas-${track.id}" class="waveform-canvas"></canvas>
            <div id="playhead-${track.id}" class="playhead"></div>
        </div>
        <div class="track-settings" id="settings-${track.id}" style="display: none;">
            <div class="track-setting-group">
                <label>Vol (dB)</label>
                <input type="number" id="t-vol-${track.id}" value="0" step="1">
            </div>
            <div class="track-setting-group">
                <label>Pan (L/R)</label>
                <input type="range" id="t-pan-${track.id}" value="0" min="-1" max="1" step="0.1">
            </div>
            <div class="track-setting-group">
                <label>Pitch</label>
                <input type="number" id="t-pitch-${track.id}" value="0" step="1">
            </div>
            <div class="track-setting-group">
                <label>Offset (s)</label>
                <input type="number" id="t-off-${track.id}" value="0" min="0" step="0.1">
            </div>
            <div class="track-setting-group">
                <label>Trim Start (s)</label>
                <input type="number" id="t-start-${track.id}" value="0" min="0" step="0.1">
            </div>
            <div class="track-setting-group">
                <label>Trim End (s)</label>
                <input type="number" id="t-end-${track.id}" value="${track.trimEnd.toFixed(2)}" min="0" step="0.1">
            </div>
        </div>
    `;
    trackList.appendChild(div);
    lucide.createIcons({ root: div });
    
    drawWaveform(track);
    
    document.getElementById(`t-vol-${track.id}`).addEventListener('input', (e) => {
        track.volume = parseFloat(e.target.value);
        track.trackVol.volume.value = track.volume;
    });
    document.getElementById(`t-pan-${track.id}`).addEventListener('input', (e) => {
        track.pan = parseFloat(e.target.value);
        track.trackPanner.pan.value = track.pan;
    });
    document.getElementById(`t-pitch-${track.id}`).addEventListener('input', (e) => {
        track.pitch = parseFloat(e.target.value);
        track.trackPitch.pitch = parseFloat(sliderPitch.value) + track.pitch;
    });
    document.getElementById(`t-off-${track.id}`).addEventListener('input', (e) => {
        track.offset = Math.max(0, parseFloat(e.target.value));
        syncTrackToTransport(track);
        updateLoopDuration();
    });
    document.getElementById(`t-start-${track.id}`).addEventListener('input', (e) => {
        track.trimStart = Math.max(0, Math.min(track.trimEnd - 0.1, parseFloat(e.target.value)));
        syncTrackToTransport(track);
        drawWaveform(track);
        updateLoopDuration();
    });
    document.getElementById(`t-end-${track.id}`).addEventListener('input', (e) => {
        track.trimEnd = Math.max(track.trimStart + 0.1, Math.min(track.buffer.duration, parseFloat(e.target.value)));
        syncTrackToTransport(track);
        drawWaveform(track);
        updateLoopDuration();
    });
    
    const wc = document.getElementById(`wc-${track.id}`);
    wc.addEventListener('click', async (e) => {
        await initAudio();
        const rect = wc.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = clickX / rect.width;
        
        const trackDuration = track.trimEnd - track.trimStart;
        const jumpTime = (percent * trackDuration) / track.player.playbackRate;
        const globalTime = track.offset + jumpTime;
        
        Tone.Transport.seconds = globalTime;
    });
}

window.toggleSettings = (id) => {
    const el = document.getElementById(`settings-${id}`);
    if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

window.toggleMute = (id) => {
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    track.muted = !track.muted;
    const btn = document.getElementById(`btn-mute-${id}`);
    if(track.muted) btn.classList.add('active'); else btn.classList.remove('active');
    updateMuteSoloState();
};

window.toggleSolo = (id) => {
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    track.soloed = !track.soloed;
    const btn = document.getElementById(`btn-solo-${id}`);
    if(track.soloed) btn.classList.add('active'); else btn.classList.remove('active');
    updateMuteSoloState();
};

window.removeTrack = (id) => {
    const idx = tracks.findIndex(t => t.id === id);
    if (idx > -1) {
        tracks[idx].player.dispose();
        tracks[idx].trackPitch.dispose();
        tracks[idx].trackPanner.dispose();
        tracks[idx].trackVol.dispose();
        tracks.splice(idx, 1);
        document.getElementById(`track-${id}`).remove();
    }
    
    if (tracks.length === 0) {
        trackList.innerHTML = `
            <div class="empty-state">
                <i data-lucide="music"></i>
                <p>Upload audio to start forging.</p>
            </div>
        `;
        lucide.createIcons({ root: trackList });
        stopAll();
    }
    updateControlsState();
    updateLoopDuration();
    updateTotalTime();
    updateTrackCount();
};

function updateControlsState() {
    const hasTracks = tracks.length > 0;
    btnPlayPause.disabled = !hasTracks;
    btnStop.disabled = !hasTracks;
}

function updateTrackCount() {
    if (trackCountEl) trackCountEl.innerText = tracks.length;
}

function updateLoopDuration() {
    if (tracks.length === 0) return;
    const rate = parseFloat(sliderSpeed.value);
    let maxDur = 0;
    tracks.forEach(t => {
        const dur = t.offset + ((t.trimEnd - t.trimStart) / rate);
        if (dur > maxDur) maxDur = dur;
    });
    Tone.Transport.loopEnd = Math.max(0.1, maxDur);
}

// Waveform Drawing
function drawWaveform(track) {
    const canvas = document.getElementById(`canvas-${track.id}`);
    if (!canvas) return;
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    const ctx = canvas.getContext('2d');
    const buffer = track.buffer;
    const channelData = buffer.getChannelData(0);
    
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const sampleRate = buffer.sampleRate;
    const startSample = Math.floor(track.trimStart * sampleRate);
    const endSample = Math.min(channelData.length, Math.floor(track.trimEnd * sampleRate));
    const samplesToDraw = endSample - startSample;
    
    if (samplesToDraw <= 0) return;

    const step = Math.ceil(samplesToDraw / width);
    const amp = height / 2;
    
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(129, 140, 248, 0.85)');
    gradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.75)');
    gradient.addColorStop(1, 'rgba(168, 85, 247, 0.85)');
    ctx.fillStyle = gradient;
    
    for (let i = 0; i < width; i++) {
        let min = 1.0, max = -1.0;
        for (let j = 0; j < step; j++) {
            const index = startSample + (i * step) + j;
            if (index < endSample) {
                const datum = channelData[index];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
        }
        const yMin = (1 + min) * amp;
        const yMax = (1 + max) * amp;
        ctx.fillRect(i, yMin, 1, Math.max(1, yMax - yMin));
    }
}

// Update Playheads
function updatePlayheads() {
    if (isPlaying || Tone.Transport.state === 'paused') {
        const time = Tone.Transport.seconds;
        timeCurrent.innerText = formatTime(time);
    }
    
    if (isPlaying) {
        const time = Tone.Transport.seconds;
        tracks.forEach(track => {
            const playhead = document.getElementById(`playhead-${track.id}`);
            if (!playhead) return;
            
            const trackDuration = track.trimEnd - track.trimStart;
            const trackTime = (time - track.offset) * track.player.playbackRate;
            
            if (trackTime >= 0 && trackTime <= trackDuration) {
                const percent = (trackTime / trackDuration) * 100;
                playhead.style.left = `${percent}%`;
                playhead.style.display = 'block';
            } else {
                playhead.style.display = 'none';
            }
        });
    } else if (Tone.Transport.state === 'stopped') {
        tracks.forEach(t => {
            const ph = document.getElementById(`playhead-${t.id}`);
            if (ph) ph.style.left = '0%';
        });
        timeCurrent.innerText = formatTime(0);
    }
    
    requestAnimationFrame(updatePlayheads);
}

function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
}

function updateTotalTime() {
    if (tracks.length === 0) {
        timeTotal.innerText = formatTime(0);
        return;
    }
    const rate = parseFloat(sliderSpeed.value);
    let maxDur = 0;
    tracks.forEach(t => {
        const dur = t.offset + ((t.trimEnd - t.trimStart) / rate);
        if (dur > maxDur) maxDur = dur;
    });
    timeTotal.innerText = formatTime(maxDur);
}

// Transport
btnPlayPause.addEventListener('click', async () => {
    await initAudio();
    if (isPlaying) {
        pauseAll();
    } else {
        playAll();
    }
});

btnStop.addEventListener('click', stopAll);

btnLoop.addEventListener('click', async () => {
    await initAudio();
    isLooping = !isLooping;
    Tone.Transport.loop = isLooping;
    updateLoopDuration();
    if (isLooping) btnLoop.classList.add('active');
    else btnLoop.classList.remove('active');
});

function playAll() {
    Tone.Transport.start();
    isPlaying = true;
    playIcon.setAttribute('data-lucide', 'pause');
    playText.innerText = 'Playing';
    lucide.createIcons();
}

function pauseAll() {
    Tone.Transport.pause();
    isPlaying = false;
    playIcon.setAttribute('data-lucide', 'play');
    playText.innerText = 'Paused';
    lucide.createIcons();
}

function stopAll() {
    Tone.Transport.stop();
    isPlaying = false;
    playIcon.setAttribute('data-lucide', 'play');
    playText.innerText = 'Stopped';
    lucide.createIcons();
}

// FX and Sliders
function applySettings(settings) {
    if (!engineStarted) return;
    
    sliderPitch.value = settings.pitch;
    sliderSpeed.value = settings.speed;
    sliderHigh.value = settings.high;
    sliderMid.value = settings.mid;
    sliderBass.value = settings.bass;
    sliderVolume.value = settings.volume;
    
    updateSliderDisplays();
    
    masterEq.high.value = settings.high;
    masterEq.mid.value = settings.mid;
    masterEq.low.value = settings.bass;
    masterVol.volume.value = settings.volume;
    masterReverb.wet.value = settings.reverb || 0;
    
    // Compressor Threshold (-24dB active, 0dB inactive)
    masterCompressor.threshold.value = settings.compress ? -24 : 0;
    
    // Subtle Noise Layer (-45dB active, -Infinity inactive)
    if (masterNoiseVol) {
        masterNoiseVol.volume.value = settings.noise ? -45 : -Infinity;
    }
    
    // Chorus Effect for Anti-Copyright
    if (masterChorus) {
        masterChorus.wet.value = settings.chorus ? 0.35 : 0;
    }
    
    tracks.forEach(t => {
        t.player.playbackRate = settings.speed;
        t.trackPitch.pitch = parseFloat(settings.pitch) + t.pitch;
    });
    updateLoopDuration();
}

function updateSliderDisplays() {
    valPitch.innerText = sliderPitch.value + ' st';
    valSpeed.innerText = parseFloat(sliderSpeed.value).toFixed(2) + 'x';
    valHigh.innerText = sliderHigh.value + ' dB';
    valMid.innerText = sliderMid.value + ' dB';
    valBass.innerText = sliderBass.value + ' dB';
    valVolume.innerText = sliderVolume.value + ' dB';
}

sliderPitch.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if(engineStarted) {
        tracks.forEach(t => { t.trackPitch.pitch = val + t.pitch; });
    }
    updateSliderDisplays();
    updatePresetUI('custom');
});

sliderSpeed.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if(engineStarted) {
        tracks.forEach(t => t.player.playbackRate = val);
        updateLoopDuration();
        updateTotalTime();
    }
    updateSliderDisplays();
    updatePresetUI('custom');
});

sliderHigh.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if(engineStarted) masterEq.high.value = val;
    updateSliderDisplays();
    updatePresetUI('custom');
});

sliderMid.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if(engineStarted) masterEq.mid.value = val;
    updateSliderDisplays();
    updatePresetUI('custom');
});

sliderBass.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if(engineStarted) masterEq.low.value = val;
    updateSliderDisplays();
    updatePresetUI('custom');
});

sliderVolume.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if(engineStarted) masterVol.volume.value = val;
    updateSliderDisplays();
    updatePresetUI('custom');
});

document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        await initAudio();
        const p = e.target.getAttribute('data-preset');
        if (presets[p]) {
            applySettings(presets[p]);
            updatePresetUI(p);
        }
    });
});

function updatePresetUI(presetName) {
    currentPreset = presetName;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    if (presetName !== 'custom') {
        const activeBtn = document.querySelector(`.preset-btn[data-preset="${presetName}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        if (presetNameDisplay) presetNameDisplay.innerText = presetName.charAt(0).toUpperCase() + presetName.slice(1);
    } else {
        if (presetNameDisplay) presetNameDisplay.innerText = 'Custom';
    }
}

// Exporting Logic
async function renderOffline() {
    if (tracks.length === 0) return null;
    
    const rate = parseFloat(sliderSpeed.value);
    let maxDur = 0;
    
    tracks.forEach(t => {
        const trackLen = (t.trimEnd - t.trimStart) / rate;
        const totalLen = t.offset + trackLen;
        if (totalLen > maxDur) maxDur = totalLen;
    });
    
    const reverbTail = masterReverb.wet.value > 0 ? 3 : 0;
    const renderDuration = maxDur + reverbTail;
    if (renderDuration <= 0) return null;
    
    return await Tone.Offline(async ({ context, transport }) => {
        
        const offEq = new Tone.EQ3(parseFloat(sliderBass.value), parseFloat(sliderMid.value), parseFloat(sliderHigh.value));
        const offChorus = new Tone.Chorus(2, 2.5, 0.4).start();
        offChorus.wet.value = (presets[currentPreset] && presets[currentPreset].chorus) ? 0.35 : 0;
        const offComp = new Tone.Compressor({ ratio: 4, threshold: (presets[currentPreset] && presets[currentPreset].compress) ? -24 : 0, release: 0.25, attack: 0.003, knee: 30 });
        const offReverb = new Tone.Reverb(2.5);
        const offVol = new Tone.Volume(parseFloat(sliderVolume.value));
        const offLimiter = new Tone.Limiter(-0.5).toDestination();
        
        offEq.chain(offChorus, offComp, offReverb, offVol, offLimiter);
        
        // Anti-Copyright Noise Layer for Render
        const isNoiseActive = presets[currentPreset] && presets[currentPreset].noise;
        if (isNoiseActive) {
            const offNoise = new Tone.Noise("brown");
            const offNoiseVol = new Tone.Volume(-45).connect(offLimiter);
            offNoise.connect(offNoiseVol);
            offNoise.start(0);
        }
        
        await offReverb.generate();
        offReverb.wet.value = masterReverb.wet.value;
        
        for (let t of tracks) {
            const offPlayer = new Tone.Player(t.buffer);
            offPlayer.playbackRate = t.player.playbackRate;
            
            const offPitch = new Tone.PitchShift(t.trackPitch.pitch);
            const offPanner = new Tone.Panner(t.pan);
            const offTrackVol = new Tone.Volume(t.trackVol.mute ? -100 : t.volume).connect(offEq);
            
            offPlayer.connect(offPitch);
            offPitch.connect(offPanner);
            offPanner.connect(offTrackVol);
            
            const duration = t.trimEnd - t.trimStart;
            offPlayer.sync().start(t.offset, t.trimStart, duration);
        }
        
        transport.start();
    }, renderDuration);
}

btnExportWav.addEventListener('click', async () => {
    if (tracks.length === 0) return alert("Add a track first!");
    showLoading("Rendering WAV...");
    progressContainer.classList.add('hidden');
    
    try {
        const buffer = await renderOffline();
        const wavBlob = audioBufferToWav(buffer);
        downloadBlob(wavBlob, `AudioForge_${currentPreset}.wav`);
    } catch(e) {
        console.error(e);
        alert("Export failed.");
    }
    hideLoading();
});

btnExportMp3.addEventListener('click', async () => {
    if (tracks.length === 0) return alert("Add a track first!");
    showLoading("Rendering Mix...");
    progressContainer.classList.add('hidden');
    
    try {
        const buffer = await renderOffline();
        
        loadingText.innerText = "Encoding MP3...";
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        
        const numChannels = buffer.numberOfChannels;
        const left = buffer.getChannelData(0);
        const right = numChannels === 2 ? buffer.getChannelData(1) : null;
        
        const worker = new Worker(workerUrl);
        
        worker.onmessage = function(e) {
            if (e.data.type === 'progress') {
                progressBar.style.width = (e.data.progress * 100) + '%';
            } else if (e.data.type === 'done') {
                const mp3Blob = new Blob(e.data.data, { type: 'audio/mp3' });
                downloadBlob(mp3Blob, `AudioForge_${currentPreset}.mp3`);
                worker.terminate();
                hideLoading();
            }
        };
        
        worker.postMessage({ left, right, numChannels, sampleRate: buffer.sampleRate });
        
    } catch(e) {
        console.error(e);
        alert("Export failed.");
        hideLoading();
    }
});

// Utils
function showLoading(text) { loadingText.innerText = text; loadingOverlay.classList.remove('hidden'); }
function hideLoading() { loadingOverlay.classList.add('hidden'); }

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// WAV Encoding
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    let result = numChannels === 2 ? interleave(buffer.getChannelData(0), buffer.getChannelData(1)) : buffer.getChannelData(0);
    const view = encodeWAV(result, 1, sampleRate, numChannels, 16);
    return new Blob([view], { type: 'audio/wav' });
}

function interleave(inputL, inputR) {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0, inputIndex = 0;
    while (index < length) {
        result[index++] = inputL[inputIndex];
        result[index++] = inputR[inputIndex++];
    }
    return result;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
}

function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * bytesPerSample, true);
    
    for (let i = 0, offset = 44; i < samples.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return view;
}

updatePresetUI('normal');

// ========================================
// ROBLOX UPLOAD (with auto-fill & history)
// ========================================
const btnUploadRoblox = document.getElementById('btn-upload-roblox');
const robloxModal = document.getElementById('roblox-modal');
const modalClose = document.getElementById('modal-close');
const btnRbxSubmit = document.getElementById('btn-rbx-submit');
const rbxStatus = document.getElementById('rbx-status');

// Auto-fill Roblox fields from saved data
function loadSavedRobloxSettings() {
    const savedKey = localStorage.getItem('af_roblox_api_key');
    const savedType = localStorage.getItem('af_creator_type');
    const savedId = localStorage.getItem('af_creator_id');
    if (savedKey) document.getElementById('rbx-api-key').value = savedKey;
    if (savedType) document.getElementById('rbx-creator-type').value = savedType;
    if (savedId) document.getElementById('rbx-creator-id').value = savedId;
}

function saveRobloxSettings(apiKey, creatorType, creatorId) {
    localStorage.setItem('af_roblox_api_key', apiKey);
    localStorage.setItem('af_creator_type', creatorType);
    localStorage.setItem('af_creator_id', creatorId);
}

btnUploadRoblox.addEventListener('click', () => {
    if (tracks.length === 0) return alert("Tambahkan track terlebih dahulu!");
    rbxStatus.classList.add('hidden');
    rbxStatus.className = 'rbx-status hidden';
    loadSavedRobloxSettings();
    robloxModal.classList.remove('hidden');
    lucide.createIcons();
});

modalClose.addEventListener('click', () => {
    robloxModal.classList.add('hidden');
});

robloxModal.addEventListener('click', (e) => {
    if (e.target === robloxModal) robloxModal.classList.add('hidden');
});

btnRbxSubmit.addEventListener('click', async () => {
    const displayName = document.getElementById('rbx-name').value.trim();
    const apiKey = document.getElementById('rbx-api-key').value.trim();
    const format = document.getElementById('rbx-format').value;
    const creatorType = document.getElementById('rbx-creator-type').value;
    const creatorId = document.getElementById('rbx-creator-id').value.trim();

    if (!apiKey) return showRbxStatus('error', 'Masukkan Roblox API Key!');
    if (!displayName) return showRbxStatus('error', 'Masukkan Display Name!');
    if (!creatorId) return showRbxStatus('error', 'Masukkan Creator ID!');

    showRbxStatus('loading', '⏳ Rendering audio...');
    btnRbxSubmit.disabled = true;

    let uploadSuccess = false;
    let operationPath = '';

    try {
        await initAudio();
        const buffer = await renderOffline();
        if (!buffer) throw new Error('Render gagal');

        showRbxStatus('loading', '⏳ Meng-encode audio...');

        let audioBlob;
        let filename;
        if (format === 'wav') {
            audioBlob = audioBufferToWav(buffer);
            filename = displayName.replace(/\s+/g, '_') + '.wav';
        } else {
            audioBlob = await encodeMp3Async(buffer);
            filename = displayName.replace(/\s+/g, '_') + '.mp3';
        }

        showRbxStatus('loading', '⏳ Uploading ke Roblox...');

        const formData = new FormData();
        formData.append('audioFile', audioBlob, filename);
        formData.append('apiKey', apiKey);
        formData.append('displayName', displayName);
        formData.append('creatorType', creatorType);
        formData.append('creatorId', creatorId);

        const token = localStorage.getItem('af_token');
        const response = await fetch('/api/upload-roblox', {
            method: 'POST',
            headers: token ? { 'Authorization': 'Bearer ' + token } : {},
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            operationPath = result.operation?.path || '';
            showRbxStatus('success', `✅ Upload berhasil! Operation: ${operationPath}`);
            uploadSuccess = true;
            // Save settings for next time
            saveRobloxSettings(apiKey, creatorType, creatorId);
        } else {
            showRbxStatus('error', `❌ Gagal: ${result.error || 'Unknown error'}`);
        }

    } catch (err) {
        console.error(err);
        showRbxStatus('error', `❌ Error: ${err.message}`);
    }

    // Save to upload history
    addUploadHistory({
        name: document.getElementById('rbx-name').value.trim() || 'Untitled',
        format: document.getElementById('rbx-format').value,
        date: new Date().toISOString(),
        status: uploadSuccess ? 'success' : 'error',
        operation: operationPath
    });

    btnRbxSubmit.disabled = false;
});

function showRbxStatus(type, message) {
    rbxStatus.className = `rbx-status ${type}`;
    rbxStatus.classList.remove('hidden');
    rbxStatus.innerText = message;
}

// Async MP3 encode using the existing Web Worker (returns a Promise<Blob>)
function encodeMp3Async(buffer) {
    return new Promise((resolve, reject) => {
        const numChannels = buffer.numberOfChannels;
        const left = buffer.getChannelData(0);
        const right = numChannels === 2 ? buffer.getChannelData(1) : null;

        const worker = new Worker(workerUrl);
        worker.onmessage = function(e) {
            if (e.data.type === 'done') {
                const mp3Blob = new Blob(e.data.data, { type: 'audio/mp3' });
                worker.terminate();
                resolve(mp3Blob);
            }
        };
        worker.onerror = reject;
        worker.postMessage({ left, right, numChannels, sampleRate: buffer.sampleRate });
    });
}

// ========================================
// UPLOAD HISTORY
// ========================================
const btnHistory = document.getElementById('btn-history');
const historyModal = document.getElementById('history-modal');
const historyClose = document.getElementById('history-close');
const historyList = document.getElementById('history-list');
const btnClearHistory = document.getElementById('btn-clear-history');

function getUploadHistory() {
    try { return JSON.parse(localStorage.getItem('af_upload_history') || '[]'); }
    catch { return []; }
}

function addUploadHistory(record) {
    const history = getUploadHistory();
    history.unshift(record); // newest first
    if (history.length > 50) history.pop(); // max 50 records
    localStorage.setItem('af_upload_history', JSON.stringify(history));
}

function renderHistory() {
    const history = getUploadHistory();
    if (history.length === 0) {
        historyList.innerHTML = '<p class="history-empty">No uploads yet.</p>';
        return;
    }

    historyList.innerHTML = history.map(h => {
        const date = new Date(h.date);
        const dateStr = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
            + ' ' + date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const icon = h.status === 'success' ? 'check-circle' : 'x-circle';

        return `
            <div class="history-item">
                <div class="history-icon ${h.status}">
                    <i data-lucide="${icon}"></i>
                </div>
                <div class="history-info">
                    <div class="history-name">${h.name}</div>
                    <div class="history-meta">${dateStr}</div>
                </div>
                <span class="history-badge ${h.format}">${h.format.toUpperCase()}</span>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

btnHistory.addEventListener('click', () => {
    renderHistory();
    historyModal.classList.remove('hidden');
    lucide.createIcons();
});

historyClose.addEventListener('click', () => {
    historyModal.classList.add('hidden');
});

historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) historyModal.classList.add('hidden');
});

btnClearHistory.addEventListener('click', () => {
    if (confirm('Clear all upload history?')) {
        localStorage.removeItem('af_upload_history');
        renderHistory();
    }
});

// ========================================
// LOGOUT
// ========================================
document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm('Logout from Audio Forge?')) {
        localStorage.removeItem('af_token');
        localStorage.removeItem('af_user');
        if (window.location.protocol !== 'file:') {
            window.location.href = 'login.html';
        }
    }
});

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener('keydown', async (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
        e.preventDefault();
        if (tracks.length === 0) return;
        await initAudio();
        if (isPlaying) pauseAll();
        else playAll();
    }

    if (e.code === 'KeyS' && !e.ctrlKey) {
        e.preventDefault();
        if (tracks.length > 0) { await initAudio(); stopAll(); }
    }

    if (e.code === 'KeyL') {
        e.preventDefault();
        btnLoop.click();
    }
});
