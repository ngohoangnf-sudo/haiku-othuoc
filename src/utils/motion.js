import { gsap } from "gsap";

export const MOTION_PRESETS = {
  editorial: {
    enter: {
      duration: 0.32,
      fromY: 14,
      blur: 0,
    },
    exit: {
      duration: 0.24,
      y: 12,
      blur: 0,
    },
    panelIn: {
      duration: 0.28,
      fromY: 7,
      blur: 1.5,
    },
    panelOut: {
      duration: 0.24,
      y: 7,
      blur: 1.5,
    },
  },
  list: {
    enter: {
      duration: 0.42,
      rowStagger: 0.18,
      fromY: 12,
    },
    exit: {
      duration: 0.32,
      y: 12,
    },
    fastExit: {
      duration: 0.22,
      y: 12,
    },
  },
};

function asArray(elements) {
  return Array.from(elements || []).filter(Boolean);
}

function makePromise(tween) {
  return new Promise((resolve) => {
    tween.eventCallback("onComplete", resolve);
  });
}

export function killMotion(targets) {
  gsap.killTweensOf(targets);
}

export async function animateGridExit(items, options = {}) {
  const nodes = asArray(items);
  if (!nodes.length) {
    return;
  }

  const { duration = MOTION_PRESETS.list.exit.duration, y = MOTION_PRESETS.list.exit.y } = options;
  killMotion(nodes);
  await makePromise(
    gsap.to(nodes, {
      opacity: 0,
      y,
      duration,
      ease: "power2.out",
      stagger: 0,
    })
  );
}

export async function animateGridEnterByRows(
  items,
  options = {}
) {
  const nodes = asArray(items);
  if (!nodes.length) {
    return;
  }

  const {
    columns = 1,
    duration = MOTION_PRESETS.list.enter.duration,
    rowStagger = MOTION_PRESETS.list.enter.rowStagger,
    fromY = MOTION_PRESETS.list.enter.fromY,
  } = options;
  const safeColumns = Math.max(1, columns);
  killMotion(nodes);

  gsap.set(nodes, {
    opacity: 0,
    y: fromY,
  });

  await makePromise(
    gsap.to(nodes, {
      opacity: 1,
      y: 0,
      duration,
      ease: "power3.out",
      stagger: (index) => Math.min(Math.floor(index / safeColumns), 3) * rowStagger,
    })
  );
}

export async function animatePanelOut(
  target,
  options = {}
) {
  if (!target) {
    return;
  }

  const {
    duration = MOTION_PRESETS.editorial.panelOut.duration,
    y = MOTION_PRESETS.editorial.panelOut.y,
    blur = MOTION_PRESETS.editorial.panelOut.blur,
  } = options;
  killMotion(target);
  await makePromise(
    gsap.to(target, {
      opacity: 0,
      y,
      filter: `blur(${blur}px)`,
      duration,
      ease: "power2.out",
    })
  );
}

export async function animatePanelIn(
  target,
  options = {}
) {
  if (!target) {
    return;
  }

  const {
    duration = MOTION_PRESETS.editorial.panelIn.duration,
    fromY = MOTION_PRESETS.editorial.panelIn.fromY,
    blur = MOTION_PRESETS.editorial.panelIn.blur,
  } = options;
  killMotion(target);
  gsap.set(target, {
    opacity: 0,
    y: fromY,
    filter: `blur(${blur}px)`,
  });

  await makePromise(
    gsap.to(target, {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      duration,
      ease: "power3.out",
      clearProps: "opacity,transform,filter",
    })
  );
}

export async function animateBlockHeight(
  target,
  fromHeight,
  toHeight,
  options = {}
) {
  if (!target || !Number.isFinite(fromHeight) || !Number.isFinite(toHeight)) {
    return;
  }

  const { duration = 0.34 } = options;
  killMotion(target);
  gsap.set(target, {
    height: fromHeight,
    overflow: "hidden",
  });

  await makePromise(
    gsap.to(target, {
      height: toHeight,
      duration,
      ease: "power3.inOut",
      clearProps: "height,overflow",
    })
  );
}
