// Decorative 0-100% fill (same feel as the site's own loader), then morphs
// into a password field. The password itself is never checked here — it's
// POSTed to /api/login, which is the only place the real value lives.
(function () {
  const loader = document.getElementById("loader");
  const loaderBarRow = document.getElementById("loaderBarRow");
  const loaderPct = document.getElementById("loaderPct");
  const loaderBarFill = document.getElementById("loaderBarFill");
  const loaderBarTrack = document.getElementById("loaderBarTrack");
  const loaderIntro = document.getElementById("loaderIntro");
  const introLines = loaderIntro.querySelectorAll(".loader-intro-line");
  const loaderSocials = document.getElementById("loaderSocials");

  const duration = 2000 + Math.random() * 1000;
  const start = performance.now();

  // setTimeout, not requestAnimationFrame — rAF is fully paused by the
  // browser whenever the tab loses focus (switching tabs/apps, sometimes
  // even opening DevTools), which would freeze this indefinitely since
  // nothing would ever call tick() again to notice time had passed.
  // setTimeout keeps firing (just throttled) even in a backgrounded tab.
  function tick() {
    const t = Math.min(1, (performance.now() - start) / duration);
    const eased = 1 - Math.pow(1 - t, 2);
    loaderPct.textContent = Math.round(eased * 100) + "%";
    loaderBarFill.style.width = eased * 100 + "%";
    if (t < 1) {
      setTimeout(tick, 16);
    } else {
      showPasswordForm();
    }
  }
  tick();

  function showPasswordForm() {
    // Fade the fill and percentage out slowly first, then swap in the
    // password field and let it fade/slide in on its own — a soft crossfade
    // rather than an instant DOM swap.
    loaderBarFill.style.opacity = "0";
    loaderPct.style.transition = "opacity 0.5s ease";
    loaderPct.style.opacity = "0";

    setTimeout(() => {
      const form = document.createElement("form");
      form.className = "loader-password-form";
      form.autocomplete = "off";

      const input = document.createElement("input");
      input.type = "password";
      input.className = "loader-password-input";
      input.placeholder = "Password";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Password");

      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "loader-password-submit";
      submit.setAttribute("aria-label", "Submit");
      submit.textContent = "→";

      form.append(input, submit);
      loaderBarTrack.replaceWith(form);
      loaderPct.remove();

      // Intro text, the password field, then the social links — a short
      // cascade rather than everything landing at once. The intro's two
      // lines rotate up into place one after another (GSAP rotateX), rather
      // than fading in as a single block.
      requestAnimationFrame(() => {
        if (window.gsap) {
          gsap.fromTo(introLines,
            { opacity: 0, rotateX: 80 },
            { opacity: 1, rotateX: 0, duration: 0.7, ease: "power3.out", stagger: 0.12 }
          );
        } else {
          introLines.forEach((line) => { line.style.opacity = "1"; });
        }
      });
      setTimeout(() => { form.classList.add("visible"); }, 150);
      setTimeout(() => { loaderSocials.classList.add("visible"); }, 300);

      input.focus();

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (form.classList.contains("checking")) return;
        submitPassword(form, input);
      });
    }, 500);
  }

  async function submitPassword(form, input) {
    form.classList.add("checking");
    input.disabled = true;
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: input.value }),
      });
      if (res.ok) {
        succeed();
        return;
      }
    } catch (err) {
      // network error — falls through to the same "wrong password" feedback
    }
    fail(form, input);
  }

  function succeed() {
    loaderBarRow.classList.add("success");
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "/";
    setTimeout(() => { window.location.href = next; }, 300);
  }

  function fail(form, input) {
    form.classList.remove("checking");
    input.disabled = false;
    input.value = "";
    input.classList.add("error");
    form.classList.add("shake");
    setTimeout(() => {
      form.classList.remove("shake");
      input.classList.remove("error");
    }, 400);
    input.focus();
  }
})();
