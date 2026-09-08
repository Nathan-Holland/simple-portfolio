// Fake loading screen: only present in the DOM on the first page of the
// session (the inline script in each HTML file removes it immediately on
// repeat navigations, before this runs). Counts 0-100% over a random
// 2-3s stretch, then fades out and removes itself.
const loader = document.getElementById("loader");
// Resolves once the loader has fully faded out — or immediately, on repeat
// navigations where there's no loader to wait for. The page-reveal timeline
// below waits on this so the work-tile slide-up actually plays where the
// user can see it, instead of finishing invisibly behind the loader.
let loaderDone = Promise.resolve();
if (loader) {
  loaderDone = new Promise((resolve) => {
    const loaderPct = document.getElementById("loaderPct");
    const loaderBarFill = document.getElementById("loaderBarFill");
    const duration = 2000 + Math.random() * 1000;
    const start = performance.now();
    // setTimeout, not requestAnimationFrame — rAF is fully paused by the
    // browser whenever the tab loses focus, which would freeze this
    // indefinitely since nothing would call tickLoader() again to notice
    // time had passed. setTimeout keeps firing (just throttled) even in a
    // backgrounded tab.
    function tickLoader() {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 2);
      loaderPct.textContent = Math.round(eased * 100) + "%";
      loaderBarFill.style.width = (eased * 100) + "%";
      if (t < 1) {
        setTimeout(tickLoader, 16);
      } else {
        const nameEl = document.getElementById("loaderName");
        const navName = document.querySelector(".nav-name");
        // Flies the loader's name up into the nav's own "Nate Holland" link,
        // which is already sitting in place underneath the loader the whole
        // time (just covered by its opaque background). The fly-in stays
        // fully opaque until it lands exactly on top of the real nav text,
        // then is cut instantly — same frame the loader background starts
        // fading — so the two are never visible at once and there's no
        // double-image/handoff moment, just one piece of text arriving.
        if (window.gsap && nameEl && navName) {
          const startRect = nameEl.getBoundingClientRect();
          const endRect = navName.getBoundingClientRect();
          const endFontSize = getComputedStyle(navName).fontSize;
          loader.style.transition = "none";
          const tl = gsap.timeline({
            onComplete: () => { loader.remove(); resolve(); },
          });
          tl.to(".loader-bar-track, #loaderPct", {
            opacity: 0,
            duration: 0.3,
            ease: "power1.out",
          }, 0);
          tl.to(nameEl, {
            x: endRect.left - startRect.left,
            y: endRect.top - startRect.top,
            fontSize: endFontSize,
            duration: 0.6,
            ease: "power3.inOut",
          }, 0);
          tl.set(nameEl, { autoAlpha: 0 }, 0.6);
          tl.to(loader, {
            opacity: 0,
            duration: 0.35,
            ease: "power1.out",
          }, 0.6);
        } else {
          loader.classList.add("loader-done");
          setTimeout(() => { loader.remove(); resolve(); }, 500);
        }
      }
    }
    tickLoader();
  });
}

function updateClock() {
  const time = new Date().toLocaleTimeString("en-GB");
  document.querySelectorAll(".clock-el").forEach((el) => {
    el.textContent = time;
  });
}
updateClock();
setInterval(updateClock, 1000);

// Grid overlay: press "g" to toggle the 14-col grid guide
const gridOverlay = document.createElement("div");
gridOverlay.className = "grid-overlay";
for (let i = 0; i < 14; i++) {
  const col = document.createElement("div");
  col.className = "grid-overlay-col";
  gridOverlay.appendChild(col);
}
document.body.appendChild(gridOverlay);

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "g") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement.isContentEditable) return;
  gridOverlay.classList.toggle("show");
});

// Dark mode: click the nav logo to toggle, persisted across pages. The
// initial class is set synchronously by an inline script at the top of
// <body> (before first paint) to avoid a flash of the wrong theme — this
// just keeps it live for system-preference changes and the toggle click.
const darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

darkMediaQuery.addEventListener("change", (e) => {
  if (localStorage.getItem("dark") !== null) return;
  document.body.classList.toggle("dark", e.matches);
});

const darkToggle = document.getElementById("darkToggle");
if (darkToggle) {
  darkToggle.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem("dark", isDark ? "1" : "0");
  });
}

// ---- GSAP: smooth scroll, text load-in, scroll reveals, page transitions ----
if (window.gsap && window.ScrollSmoother) {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

  ScrollSmoother.create({
    wrapper: "#smooth-wrapper",
    content: "#smooth-content",
    smooth: 1.2,
    smoothTouch: 0.1,
  });

  // Only .page-content (everything below the nav) fades on load/transition —
  // the nav itself is excluded so it reads as persistent across pages
  // instead of flashing out and back in on every navigation.
  gsap.set(".page-content", { opacity: 0 });

  // Waits for the loader (see above) so this plays where it's visible,
  // rather than finishing invisibly behind it.
  loaderDone.then(() => {
    const enter = gsap.timeline({ delay: 0.05 });
    enter.to(".page-content", { opacity: 1, duration: 0.5, ease: "power1.out" });
  });

  // Career / Recognition / Clients rows reveal as they scroll into view
  document.querySelectorAll(".table-group").forEach((group) => {
    const items = group.querySelectorAll(".col-label, .table-row span");
    gsap.from(items, {
      opacity: 0,
      y: 12,
      duration: 0.5,
      stagger: 0.03,
      ease: "power2.out",
      scrollTrigger: { trigger: group, start: "top 85%" },
    });
  });

  // Page transitions: fade out before following internal links. Flags the
  // next page to skip its loader — the fake loading screen is meant for
  // actual page loads (refresh, fresh visit), not for clicking around, and
  // the nav staying in place across the click makes the loader redundant
  // here anyway. See the inline script at the top of each HTML file.
  // Work tiles are excluded: a plain click on one opens the case study as
  // an in-page modal instead (see below) — the href stays only as a
  // fallback for modifier-clicks (open in new tab) and no-JS.
  document.querySelectorAll('a[href$=".html"]:not(.work-tile)').forEach((link) => {
    if (link.target === "_blank") return;
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      e.preventDefault();
      sessionStorage.setItem("skipLoader", "1");
      const tl = gsap.timeline({ onComplete: () => { window.location.href = href; } });
      // The Work/Profile nav link flips its word over as it's clicked — the
      // destination page already shows that same word natively, so the
      // flip just continues straight into the next page's own nav.
      const wordFlip = link.querySelector(".nav-word-flip");
      if (wordFlip) {
        tl.to(wordFlip, { rotateX: -180, duration: 0.5, ease: "power2.inOut" }, 0);
      }
      tl.to(".page-content", { opacity: 0, duration: 0.4, ease: "power1.inOut" }, 0);
    });
  });

  // ---- Case study modal (index.html only) ----
  // Clicking a work tile flies its image from the tile's own position/size
  // into the fullscreen hero spot (a plain FLIP: capture the tile's rect,
  // pin the modal's hero there with position:fixed, then tween it to the
  // fullscreen rect), rather than navigating to a separate page. Closing
  // reverses the exact same tween back to the tile's current rect, so open
  // and close read as one continuous motion instead of two different
  // transitions.
  const caseModal = document.getElementById("caseModal");
  const workGrid = document.querySelector(".work-grid");
  let workGridLoaded = null;
  if (caseModal) {
    const backdrop = document.getElementById("caseModalBackdrop");
    const scrollArea = document.getElementById("caseModalScroll");
    const body = document.getElementById("caseModalBody");
    const hero = document.getElementById("caseModalHero");
    const heroMedia = document.getElementById("caseModalHeroMedia");
    const galleryEl = document.getElementById("caseGallery");
    const closeBtn = document.getElementById("caseModalClose");
    const clientEl = document.getElementById("caseModalClient");
    const partnerEl = document.getElementById("caseModalPartner");
    const clientLogoEl = document.getElementById("caseModalClientLogo");
    const partnerLogoEl = document.getElementById("caseModalPartnerLogo");
    const clientItemEl = document.getElementById("caseModalClientItem");
    const partnerItemEl = document.getElementById("caseModalPartnerItem");
    const metaDividerEl = document.getElementById("caseModalDivider");
    const introEl = document.getElementById("caseModalIntro");

    // Logos are optional per project — hide the <img> entirely rather than
    // showing a broken-image icon when a project has none set.
    function setLogo(img, url) {
      if (url) {
        img.src = url;
        img.hidden = false;
      } else {
        img.removeAttribute("src");
        img.hidden = true;
      }
    }

    // Builds an <img> or <video> for one media item — shared by the hero
    // and the gallery. Video plays like a background/GIF (autoplay, muted,
    // looping, no controls) rather than something the visitor has to
    // start themselves.
    function buildMediaEl(item, alt) {
      if (item.type === "video") {
        const video = document.createElement("video");
        video.src = item.url;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        return video;
      }
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = alt || "";
      return img;
    }

    const navEl = document.querySelector(".nav");
    let activeTile = null;
    let animating = false;
    let navPlaceholder = null;

    function heroHeight() {
      return window.innerWidth * 9 / 16;
    }

    // Reparenting nav out of #smooth-content removes it from normal flow,
    // which would instantly collapse the space it occupied — shifting the
    // work-grid up underneath, then back down when nav returns. A
    // same-height placeholder left in nav's exact spot for as long as it's
    // detached means nothing around it ever reflows at all.
    function detachNavForModal() {
      if (!navEl || navEl.classList.contains("on-modal")) return;
      const height = navEl.getBoundingClientRect().height;
      navPlaceholder = document.createElement("div");
      navPlaceholder.setAttribute("aria-hidden", "true");
      navPlaceholder.style.height = height + "px";
      navEl.parentNode.insertBefore(navPlaceholder, navEl);
      document.body.appendChild(navEl);
      navEl.classList.add("on-modal");
      caseModal.style.setProperty("--case-close-top", height + 16 + "px");
    }

    function restoreNavFromModal() {
      if (!navEl || !navPlaceholder) return;
      navPlaceholder.parentNode.insertBefore(navEl, navPlaceholder);
      navPlaceholder.remove();
      navPlaceholder = null;
      navEl.classList.remove("on-modal");
    }

    function openCase(project, tileMedia) {
      const media = Array.isArray(project && project.media) ? project.media : [];
      if (!project || !media[0] || animating || caseModal.classList.contains("open")) return;
      animating = true;
      activeTile = tileMedia;

      heroMedia.innerHTML = "";
      heroMedia.appendChild(buildMediaEl(media[0], project.title || project.client));

      galleryEl.innerHTML = "";
      const gallery = Array.isArray(project.gallery) ? project.gallery : [];
      // Each row is a fixed 1/2/3-image template chosen in the admin
      // editor — same .case-row/-2/-3 classes the standalone case-study
      // pages use, so CMS and hand-written pages render identically.
      gallery.forEach((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = "case-row" + (row.type === 2 ? " case-row-2" : row.type === 3 ? " case-row-3" : "");
        (row.items || []).forEach((item) => {
          if (!item) return;
          const block = document.createElement("div");
          block.className = "case-block";
          block.appendChild(buildMediaEl(item, project.title || project.client));
          rowEl.appendChild(block);
        });
        galleryEl.appendChild(rowEl);
      });

      clientEl.textContent = project.client;
      partnerEl.textContent = project.partner || "Partner Name";
      setLogo(clientLogoEl, project.clientLogo);
      setLogo(partnerLogoEl, project.partnerLogo);
      // Both default to shown for projects saved before this toggle existed.
      const showClient = project.showClient !== false;
      const showPartner = project.showPartner !== false;
      clientItemEl.hidden = !showClient;
      partnerItemEl.hidden = !showPartner;
      metaDividerEl.hidden = !(showClient && showPartner);
      // introHtml is authored in the admin editor (see admin.js), which
      // sanitizes it down to plain text plus .case-intro-muted spans before
      // saving — trusted content, not visitor input.
      introEl.innerHTML = project.introHtml || "";

      // Move the real nav out to the body level so it can actually paint
      // above .case-modal — #smooth-wrapper is its own stacking context
      // (needed for ScrollSmoother's transform), so nav's z-index could
      // never beat the modal's while trapped inside it. Same element, same
      // listeners (dark toggle, clock) — just relocated and restyled white
      // to sit on the hero image, matching the standalone case-study pages.
      detachNavForModal();

      const startRect = tileMedia.getBoundingClientRect();

      document.body.classList.add("modal-open");
      caseModal.classList.add("open");
      caseModal.setAttribute("aria-hidden", "false");
      scrollArea.scrollTop = 0;

      gsap.set(hero, {
        position: "fixed",
        top: startRect.top,
        left: startRect.left,
        width: startRect.width,
        height: startRect.height,
      });
      gsap.set(backdrop, { opacity: 0 });
      gsap.set(body, { opacity: 0 });
      // While the hero is position:fixed it takes up no space in normal
      // flow, so without this the body content collapses up to the top of
      // the scroll area and sits directly underneath the flying image
      // instead of staying hidden below it. Reserves exactly the space the
      // docked hero will occupy; cleared once it actually docks there.
      body.style.paddingTop = heroHeight() + "px";

      const tl = gsap.timeline({
        onComplete: () => {
          // Docks into normal flow at the top of the scroll area — at
          // scrollTop 0 this matches the fixed rect exactly, so there's no
          // visible jump, and it now scrolls away with the rest of the
          // content like the standalone case-study pages do.
          hero.style.position = "relative";
          hero.style.top = "";
          hero.style.left = "";
          hero.style.width = "100%";
          hero.style.height = heroHeight() + "px";
          body.style.paddingTop = "";
          animating = false;
        },
      });
      tl.to(backdrop, { opacity: 1, duration: 0.5, ease: "power1.out" }, 0);
      tl.to(hero, {
        top: 0,
        left: 0,
        width: window.innerWidth,
        height: heroHeight(),
        duration: 0.9,
        ease: "power3.inOut",
      }, 0);
      // No text at all until the image has fully landed — a clean beat of
      // pause, then the content fades in on its own.
      tl.call(() => body.classList.add("visible"), null, 1);
      tl.to(body, { opacity: 1, duration: 0.5, ease: "power1.out" }, 1);
    }

    function closeCase() {
      if (animating || !caseModal.classList.contains("open")) return;
      animating = true;
      scrollArea.scrollTop = 0;

      const endRect = activeTile ? activeTile.getBoundingClientRect() : null;

      // Mirrors the open sequence in reverse: text goes first, then the
      // image shrinks back — never both moving/visible at once. Re-pin to
      // fixed and restore the spacer before the image starts moving, so
      // losing the hero's in-flow height doesn't jump the (already
      // invisible) content beneath it.
      gsap.set(hero, {
        position: "fixed",
        top: 0,
        left: 0,
        width: window.innerWidth,
        height: heroHeight(),
      });
      body.style.paddingTop = heroHeight() + "px";

      const tl = gsap.timeline({
        onComplete: () => {
          caseModal.classList.remove("open");
          caseModal.setAttribute("aria-hidden", "true");
          document.body.classList.remove("modal-open");
          body.style.paddingTop = "";
          animating = false;
          activeTile = null;
          // Restore nav to its normal spot and styling now that the modal
          // is fully gone — same node, so its listeners are untouched.
          restoreNavFromModal();
        },
      });
      tl.call(() => body.classList.remove("visible"), null, 0);
      tl.to(body, { opacity: 0, duration: 0.35, ease: "power1.in" }, 0);
      if (endRect) {
        tl.to(hero, {
          top: endRect.top,
          left: endRect.left,
          width: endRect.width,
          height: endRect.height,
          duration: 0.8,
          ease: "power3.inOut",
        }, 0.35);
        tl.to(backdrop, { opacity: 0, duration: 0.4, ease: "power1.in" }, 0.75);
      } else {
        tl.to(hero, { opacity: 0, duration: 0.3, ease: "power1.in" }, 0.35);
        tl.to(backdrop, { opacity: 0, duration: 0.3, ease: "power1.in" }, 0.35);
      }
    }

    closeBtn.addEventListener("click", closeCase);
    backdrop.addEventListener("click", closeCase);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeCase();
    });

    // ---- Work grid: built from /api/projects (see admin.html/admin.js) ----
    // Tiles are created fresh each load rather than hand-written in
    // index.html, so adding/editing/removing a project in the CMS shows up
    // on the homepage without ever touching this file's markup again.
    if (workGrid) {
      function buildTile(project) {
        const a = document.createElement("a");
        a.href = "#";
        a.className = "work-tile" + (project.size === "large" ? " size-lg" : "");

        const mediaEl = document.createElement("div");
        mediaEl.className = "work-media";
        const heroItem = Array.isArray(project.media) ? project.media[0] : null;
        if (heroItem) {
          const el = buildMediaEl(heroItem, project.title || project.client);
          if (el.tagName === "IMG") el.loading = "lazy";
          mediaEl.appendChild(el);
          a.addEventListener("click", (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            openCase(project, mediaEl);
          });
        }

        const title = document.createElement("p");
        title.className = "work-title";
        title.textContent = project.title || project.client || "";

        a.append(mediaEl, title);
        return a;
      }

      workGridLoaded = fetch("/api/projects")
        .then((res) => res.json())
        .then((data) => (Array.isArray(data.projects) ? data.projects : []))
        .catch(() => [])
        .then((projects) => {
          workGrid.innerHTML = "";
          projects.forEach((project) => workGrid.appendChild(buildTile(project)));
          return projects;
        });
    }
  }

  // Work grid tiles slide up from below and fade in — waits on the loader
  // (so it plays where visible) and the project fetch (nothing to animate
  // until the tiles actually exist).
  if (workGrid && workGridLoaded) {
    Promise.all([loaderDone, workGridLoaded]).then(() => {
      gsap.from(".work-tile", {
        opacity: 0,
        y: 48,
        duration: 0.7,
        stagger: 0.08,
        ease: "power2.out",
        delay: 0.15,
      });
    });
  }
}
