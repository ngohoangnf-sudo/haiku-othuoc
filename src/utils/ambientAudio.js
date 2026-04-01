function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createNoiseBuffer(context, duration = 4, channels = 2) {
  const buffer = context.createBuffer(channels, Math.floor(context.sampleRate * duration), context.sampleRate);

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      // Soft-clipped white noise works well enough for subtle surf and insect ambience.
      data[index] = Math.tanh((Math.random() * 2 - 1) * 1.35);
    }
  }

  return buffer;
}

function createLoopingNoiseSource(context, buffer, playbackRate = 1) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = playbackRate;
  return source;
}

function rampGain(param, value, now, duration = 1.4) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(value, now, duration);
}

export function createAmbientAudio({ initialTheme = "dark" } = {}) {
  if (typeof window === "undefined") {
    return {
      setTheme() {},
      destroy() {},
    };
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return {
      setTheme() {},
      destroy() {},
    };
  }

  let context = null;
  let noiseBuffer = null;
  let masterGain = null;
  let oceanBus = null;
  let cricketBus = null;
  let currentTheme = initialTheme;
  let hasUnlocked = false;
  let isDestroyed = false;
  let chirpTimer = 0;
  const cleanupFns = [];
  const unlockHandlers = [];

  const clearChirpTimer = () => {
    if (!chirpTimer) {
      return;
    }

    window.clearTimeout(chirpTimer);
    chirpTimer = 0;
  };

  const buildOceanLayer = () => {
    const surfNoise = createLoopingNoiseSource(context, noiseBuffer, 0.32);
    const surfLowpass = context.createBiquadFilter();
    surfLowpass.type = "lowpass";
    surfLowpass.frequency.value = 420;
    surfLowpass.Q.value = 0.22;

    const surfHighpass = context.createBiquadFilter();
    surfHighpass.type = "highpass";
    surfHighpass.frequency.value = 38;
    surfHighpass.Q.value = 0.15;

    const surfGain = context.createGain();
    surfGain.gain.value = 0.18;

    const waveNoise = createLoopingNoiseSource(context, noiseBuffer, 0.7);
    const waveBandpass = context.createBiquadFilter();
    waveBandpass.type = "bandpass";
    waveBandpass.frequency.value = 185;
    waveBandpass.Q.value = 0.82;

    const waveGain = context.createGain();
    waveGain.gain.value = 0.045;

    const waveLfo = context.createOscillator();
    waveLfo.type = "sine";
    waveLfo.frequency.value = 0.072;
    const waveLfoGain = context.createGain();
    waveLfoGain.gain.value = 0.035;

    const surfLfo = context.createOscillator();
    surfLfo.type = "sine";
    surfLfo.frequency.value = 0.043;
    const surfLfoGain = context.createGain();
    surfLfoGain.gain.value = 130;

    const hissNoise = createLoopingNoiseSource(context, noiseBuffer, 1.05);
    const hissHighpass = context.createBiquadFilter();
    hissHighpass.type = "highpass";
    hissHighpass.frequency.value = 1150;
    hissHighpass.Q.value = 0.25;
    const hissLowpass = context.createBiquadFilter();
    hissLowpass.type = "lowpass";
    hissLowpass.frequency.value = 2600;
    hissLowpass.Q.value = 0.2;
    const hissGain = context.createGain();
    hissGain.gain.value = 0.012;

    surfNoise.connect(surfLowpass);
    surfLowpass.connect(surfHighpass);
    surfHighpass.connect(surfGain);
    surfGain.connect(oceanBus);

    waveNoise.connect(waveBandpass);
    waveBandpass.connect(waveGain);
    waveGain.connect(oceanBus);
    waveLfo.connect(waveLfoGain);
    waveLfoGain.connect(waveGain.gain);

    surfLfo.connect(surfLfoGain);
    surfLfoGain.connect(surfLowpass.frequency);

    hissNoise.connect(hissHighpass);
    hissHighpass.connect(hissLowpass);
    hissLowpass.connect(hissGain);
    hissGain.connect(oceanBus);

    surfNoise.start();
    waveNoise.start();
    hissNoise.start();
    waveLfo.start();
    surfLfo.start();

    cleanupFns.push(() => {
      surfNoise.stop();
      waveNoise.stop();
      hissNoise.stop();
      waveLfo.stop();
      surfLfo.stop();
      [
        surfNoise,
        surfLowpass,
        surfHighpass,
        surfGain,
        waveNoise,
        waveBandpass,
        waveGain,
        waveLfo,
        waveLfoGain,
        surfLfo,
        surfLfoGain,
        hissNoise,
        hissHighpass,
        hissLowpass,
        hissGain,
      ].forEach((node) => node.disconnect?.());
    });
  };

  const scheduleSingleCricketChirp = (startAt) => {
    if (!context || isDestroyed) {
      return;
    }

    const chirpFilter = context.createBiquadFilter();
    chirpFilter.type = "bandpass";
    chirpFilter.frequency.value = randomBetween(3400, 4600);
    chirpFilter.Q.value = 5.5;

    const chirpGain = context.createGain();
    chirpGain.gain.value = 0.00001;

    const chirp = context.createOscillator();
    chirp.type = "triangle";
    chirp.frequency.setValueAtTime(randomBetween(3600, 4700), startAt);
    chirp.frequency.exponentialRampToValueAtTime(randomBetween(4200, 5600), startAt + 0.05);

    const upperPartial = context.createOscillator();
    upperPartial.type = "sine";
    upperPartial.frequency.setValueAtTime(chirp.frequency.value * randomBetween(1.8, 2.15), startAt);

    const upperGain = context.createGain();
    upperGain.gain.value = 0.00001;

    chirp.connect(chirpFilter);
    chirpFilter.connect(chirpGain);
    chirpGain.connect(cricketBus);

    upperPartial.connect(upperGain);
    upperGain.connect(chirpFilter);

    chirpGain.gain.setValueAtTime(0.00001, startAt);
    chirpGain.gain.linearRampToValueAtTime(randomBetween(0.018, 0.026), startAt + 0.012);
    chirpGain.gain.exponentialRampToValueAtTime(0.00001, startAt + randomBetween(0.07, 0.1));

    upperGain.gain.setValueAtTime(0.00001, startAt);
    upperGain.gain.linearRampToValueAtTime(randomBetween(0.005, 0.008), startAt + 0.014);
    upperGain.gain.exponentialRampToValueAtTime(0.00001, startAt + randomBetween(0.055, 0.085));

    chirp.start(startAt);
    upperPartial.start(startAt);
    chirp.stop(startAt + 0.14);
    upperPartial.stop(startAt + 0.14);

    const cleanup = () => {
      [chirp, upperPartial, chirpFilter, chirpGain, upperGain].forEach((node) => node.disconnect?.());
    };

    chirp.onended = cleanup;
    upperPartial.onended = cleanup;
  };

  const scheduleCricketCluster = () => {
    clearChirpTimer();

    if (!hasUnlocked || currentTheme !== "dark" || !context || context.state !== "running") {
      return;
    }

    const startAt = context.currentTime + randomBetween(0.28, 1.1);
    const chirpCount = Math.round(randomBetween(2, 4));

    for (let index = 0; index < chirpCount; index += 1) {
      scheduleSingleCricketChirp(startAt + index * randomBetween(0.09, 0.16));
    }

    chirpTimer = window.setTimeout(
      scheduleCricketCluster,
      randomBetween(2400, 5200)
    );
  };

  const buildCricketLayer = () => {
    const airNoise = createLoopingNoiseSource(context, noiseBuffer, 0.52);
    const airHighpass = context.createBiquadFilter();
    airHighpass.type = "highpass";
    airHighpass.frequency.value = 120;
    airHighpass.Q.value = 0.12;

    const airLowpass = context.createBiquadFilter();
    airLowpass.type = "lowpass";
    airLowpass.frequency.value = 1180;
    airLowpass.Q.value = 0.18;

    const airGain = context.createGain();
    airGain.gain.value = 0.0058;

    const airMotion = context.createOscillator();
    airMotion.type = "sine";
    airMotion.frequency.value = 0.031;
    const airMotionGain = context.createGain();
    airMotionGain.gain.value = 180;

    const airBreath = context.createOscillator();
    airBreath.type = "sine";
    airBreath.frequency.value = 0.06;
    const airBreathGain = context.createGain();
    airBreathGain.gain.value = 0.0019;

    const nightHum = context.createOscillator();
    nightHum.type = "triangle";
    nightHum.frequency.value = 342;
    const nightHumDetune = context.createOscillator();
    nightHumDetune.type = "sine";
    nightHumDetune.frequency.value = 357;

    const nightHumMix = context.createGain();
    nightHumMix.gain.value = 0.00001;
    const nightHumFilter = context.createBiquadFilter();
    nightHumFilter.type = "bandpass";
    nightHumFilter.frequency.value = 470;
    nightHumFilter.Q.value = 1.2;
    const nightHumGain = context.createGain();
    nightHumGain.gain.value = 0.0016;

    const nightHumLfo = context.createOscillator();
    nightHumLfo.type = "sine";
    nightHumLfo.frequency.value = 0.085;
    const nightHumLfoGain = context.createGain();
    nightHumLfoGain.gain.value = 0.00075;

    const nightHumToneLfo = context.createOscillator();
    nightHumToneLfo.type = "sine";
    nightHumToneLfo.frequency.value = 0.048;
    const nightHumToneLfoGain = context.createGain();
    nightHumToneLfoGain.gain.value = 42;

    airNoise.connect(airHighpass);
    airHighpass.connect(airLowpass);
    airLowpass.connect(airGain);
    airGain.connect(cricketBus);

    airMotion.connect(airMotionGain);
    airMotionGain.connect(airLowpass.frequency);

    airBreath.connect(airBreathGain);
    airBreathGain.connect(airGain.gain);

    nightHum.connect(nightHumMix);
    nightHumDetune.connect(nightHumMix);
    nightHumMix.connect(nightHumFilter);
    nightHumFilter.connect(nightHumGain);
    nightHumGain.connect(cricketBus);

    nightHumLfo.connect(nightHumLfoGain);
    nightHumLfoGain.connect(nightHumGain.gain);

    nightHumToneLfo.connect(nightHumToneLfoGain);
    nightHumToneLfoGain.connect(nightHumFilter.frequency);

    airNoise.start();
    airMotion.start();
    airBreath.start();
    nightHum.start();
    nightHumDetune.start();
    nightHumLfo.start();
    nightHumToneLfo.start();

    cleanupFns.push(() => {
      airNoise.stop();
      airMotion.stop();
      airBreath.stop();
      nightHum.stop();
      nightHumDetune.stop();
      nightHumLfo.stop();
      nightHumToneLfo.stop();
      [
        airNoise,
        airHighpass,
        airLowpass,
        airGain,
        airMotion,
        airMotionGain,
        airBreath,
        airBreathGain,
        nightHum,
        nightHumDetune,
        nightHumMix,
        nightHumFilter,
        nightHumGain,
        nightHumLfo,
        nightHumLfoGain,
        nightHumToneLfo,
        nightHumToneLfoGain,
      ].forEach((node) => node.disconnect?.());
    });
  };

  const ensureGraph = () => {
    if (context || isDestroyed) {
      return;
    }

    context = new AudioContextCtor({ latencyHint: "playback" });
    noiseBuffer = createNoiseBuffer(context);

    masterGain = context.createGain();
    masterGain.gain.value = 0.07;
    masterGain.connect(context.destination);

    oceanBus = context.createGain();
    oceanBus.gain.value = 0.00001;
    oceanBus.connect(masterGain);

    cricketBus = context.createGain();
    cricketBus.gain.value = 0.00001;
    cricketBus.connect(masterGain);

    buildOceanLayer();
    buildCricketLayer();
  };

  const applyTheme = ({ immediate = false } = {}) => {
    if (!context || !oceanBus || !cricketBus) {
      return;
    }

    const now = context.currentTime;
    const oceanTarget = currentTheme === "light" ? 1 : 0.00001;
    const cricketTarget = currentTheme === "dark" ? 1 : 0.00001;

    if (immediate) {
      oceanBus.gain.setValueAtTime(oceanTarget, now);
      cricketBus.gain.setValueAtTime(cricketTarget, now);
    } else {
      rampGain(oceanBus.gain, oceanTarget, now, 1.8);
      rampGain(cricketBus.gain, cricketTarget, now, 1.8);
    }

    if (currentTheme === "dark") {
      scheduleCricketCluster();
    } else {
      clearChirpTimer();
    }
  };

  const unlock = async () => {
    if (isDestroyed || hasUnlocked) {
      return;
    }

    ensureGraph();

    try {
      await context.resume();
    } catch (_error) {
      return;
    }

    if (isDestroyed) {
      return;
    }

    hasUnlocked = true;
    applyTheme({ immediate: true });
    unlockHandlers.splice(0).forEach((cleanup) => cleanup());
  };

  const handleVisibilityChange = () => {
    if (!context || isDestroyed || !hasUnlocked) {
      return;
    }

    if (document.hidden) {
      clearChirpTimer();
      context.suspend().catch(() => {});
      return;
    }

    context.resume()
      .then(() => {
        applyTheme({ immediate: false });
      })
      .catch(() => {});
  };

  const registerUnlockListeners = () => {
    const onInteract = () => {
      unlock();
    };

    const options = { passive: true };
    ["pointerdown", "touchstart", "keydown"].forEach((eventName) => {
      window.addEventListener(eventName, onInteract, options);
      unlockHandlers.push(() => {
        window.removeEventListener(eventName, onInteract, options);
      });
    });
  };

  registerUnlockListeners();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  cleanupFns.push(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  return {
    setTheme(theme) {
      currentTheme = theme === "light" ? "light" : "dark";
      if (!hasUnlocked) {
        return;
      }

      applyTheme({ immediate: false });
    },

    destroy() {
      if (isDestroyed) {
        return;
      }

      isDestroyed = true;
      clearChirpTimer();
      unlockHandlers.splice(0).forEach((cleanup) => cleanup());
      cleanupFns.splice(0).reverse().forEach((cleanup) => cleanup());

      if (context) {
        context.close().catch(() => {});
      }

      context = null;
      noiseBuffer = null;
      masterGain = null;
      oceanBus = null;
      cricketBus = null;
    },
  };
}
