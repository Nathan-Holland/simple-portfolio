// Vanilla-JS port of the React Bits "StickerPeel" component: a draggable
// sticker that peels back on hover/press to reveal a matte "flap"
// underneath, lit by an SVG point-light filter that follows the cursor.
// Ported 1:1 from the React version's hooks — see sticker-peel.css for the
// (near-verbatim) styling half.
gsap.registerPlugin(Draggable);

export function createStickerPeel(container, options = {}) {
  const {
    imageSrc,
    rotate = 30,
    peelBackHoverPct = 30,
    peelBackActivePct = 40,
    peelEasing = "power3.out",
    peelHoverEasing = "power2.out",
    width = 200,
    shadowIntensity = 0.6,
    lightingIntensity = 0.1,
    initialPosition = "center",
    peelDirection = 0,
    className = "",
  } = options;

  const defaultPadding = 10;

  const target = document.createElement("div");
  target.className = `draggable sticker-peel-root ${className}`.trim();

  const cssVars = {
    "--sticker-rotate": `${rotate}deg`,
    "--sticker-p": `${defaultPadding}px`,
    "--sticker-peelback-hover": `${peelBackHoverPct}%`,
    "--sticker-peelback-active": `${peelBackActivePct}%`,
    "--sticker-peel-easing": peelEasing,
    "--sticker-peel-hover-easing": peelHoverEasing,
    "--sticker-width": `${width}px`,
    "--sticker-shadow-opacity": shadowIntensity,
    "--sticker-lighting-constant": lightingIntensity,
    "--peel-direction": `${peelDirection}deg`,
  };
  for (const [prop, value] of Object.entries(cssVars)) {
    target.style.setProperty(prop, value);
  }

  target.innerHTML = `
    <svg width="0" height="0">
      <defs>
        <filter id="pointLight">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feSpecularLighting result="spec" in="blur" specularExponent="100" specularConstant="${lightingIntensity}" lighting-color="white">
            <fePointLight x="100" y="100" z="300" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceGraphic" result="lit" />
          <feComposite in="lit" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id="pointLightFlipped">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feSpecularLighting result="spec" in="blur" specularExponent="100" specularConstant="${lightingIntensity * 7}" lighting-color="white">
            <fePointLight x="100" y="100" z="300" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceGraphic" result="lit" />
          <feComposite in="lit" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id="dropShadow">
          <feDropShadow dx="2" dy="4" stdDeviation="${3 * shadowIntensity}" flood-color="black" flood-opacity="${shadowIntensity}" />
        </filter>
        <filter id="expandAndFill">
          <feOffset dx="0" dy="0" in="SourceAlpha" result="shape" />
          <feFlood flood-color="rgb(179,179,179)" result="flood" />
          <feComposite operator="in" in="flood" in2="shape" />
        </filter>
      </defs>
    </svg>
    <div class="sticker-container">
      <div class="sticker-main">
        <div class="sticker-lighting">
          <img src="${imageSrc}" alt="" class="sticker-image" draggable="false" />
        </div>
      </div>
      <div class="flap">
        <div class="flap-lighting">
          <img src="${imageSrc}" alt="" class="flap-image" draggable="false" />
        </div>
      </div>
    </div>
  `;

  target.querySelectorAll("img").forEach((img) => {
    img.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  container.appendChild(target);

  const stickerContainer = target.querySelector(".sticker-container");
  const pointLight = target.querySelector("#pointLight fePointLight");
  const pointLightFlipped = target.querySelector("#pointLightFlipped fePointLight");

  if (initialPosition && typeof initialPosition === "object" &&
      initialPosition.x !== undefined && initialPosition.y !== undefined) {
    gsap.set(target, { x: initialPosition.x, y: initialPosition.y });
  }

  const [draggable] = Draggable.create(target, {
    type: "x,y",
    bounds: container,
    inertia: true,
    onDrag() {
      const rot = gsap.utils.clamp(-24, 24, this.deltaX * 0.4);
      gsap.to(target, { rotation: rot, duration: 0.15, ease: "power1.out" });
    },
    onDragEnd() {
      gsap.to(target, { rotation: 0, duration: 0.8, ease: "power2.out" });
    },
  });

  function handleResize() {
    draggable.update();
    const currentX = gsap.getProperty(target, "x");
    const currentY = gsap.getProperty(target, "y");
    const boundsRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const maxX = boundsRect.width - targetRect.width;
    const maxY = boundsRect.height - targetRect.height;
    const newX = Math.max(0, Math.min(currentX, maxX));
    const newY = Math.max(0, Math.min(currentY, maxY));
    if (newX !== currentX || newY !== currentY) {
      gsap.to(target, { x: newX, y: newY, duration: 0.3, ease: "power2.out" });
    }
  }
  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);

  function updateLight(e) {
    const rect = stickerContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointLight.setAttribute("x", x);
    pointLight.setAttribute("y", y);
    const normalizedAngle = Math.abs(peelDirection % 360);
    if (normalizedAngle !== 180) {
      pointLightFlipped.setAttribute("x", x);
      pointLightFlipped.setAttribute("y", rect.height - y);
    } else {
      pointLightFlipped.setAttribute("x", -1000);
      pointLightFlipped.setAttribute("y", -1000);
    }
  }
  stickerContainer.addEventListener("mousemove", updateLight);

  const addTouchActive = () => stickerContainer.classList.add("touch-active");
  const removeTouchActive = () => stickerContainer.classList.remove("touch-active");
  stickerContainer.addEventListener("touchstart", addTouchActive);
  stickerContainer.addEventListener("touchend", removeTouchActive);
  stickerContainer.addEventListener("touchcancel", removeTouchActive);

  return {
    element: target,
    destroy() {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      stickerContainer.removeEventListener("mousemove", updateLight);
      stickerContainer.removeEventListener("touchstart", addTouchActive);
      stickerContainer.removeEventListener("touchend", removeTouchActive);
      stickerContainer.removeEventListener("touchcancel", removeTouchActive);
      draggable.kill();
      target.remove();
    },
  };
}
