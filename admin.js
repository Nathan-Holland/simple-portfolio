(function () {
  const listEl = document.getElementById("adminList");
  const addBtn = document.getElementById("addProjectBtn");
  const saveBtn = document.getElementById("saveChangesBtn");
  const statusEl = document.getElementById("adminStatus");
  const statCount = document.getElementById("statCount");
  const statMedia = document.getElementById("statMedia");

  const editor = document.getElementById("projectEditor");
  const editorBackBtn = document.getElementById("editorBackBtn");
  const editorDoneBtn = document.getElementById("editorDoneBtn");
  const fieldTitle = document.getElementById("fieldTitle");
  const fieldSize = document.getElementById("fieldSize");
  const uploadStatus = document.getElementById("uploadStatus");

  const editorHeroMedia = document.getElementById("editorHeroMedia");
  const editorHeroBtn = document.getElementById("editorHeroBtn");
  const editorHeroInput = document.getElementById("editorHeroInput");
  const editorGalleryInput = document.getElementById("editorGalleryInput");
  const addRow1Btn = document.getElementById("addRow1Btn");
  const addRow2Btn = document.getElementById("addRow2Btn");
  const addRow3Btn = document.getElementById("addRow3Btn");
  const editorClient = document.getElementById("editorClient");
  const editorPartner = document.getElementById("editorPartner");
  const editorClientLogoBtn = document.getElementById("editorClientLogoBtn");
  const editorClientLogo = document.getElementById("editorClientLogo");
  const editorClientLogoInput = document.getElementById("editorClientLogoInput");
  const editorPartnerLogoBtn = document.getElementById("editorPartnerLogoBtn");
  const editorPartnerLogo = document.getElementById("editorPartnerLogo");
  const editorPartnerLogoInput = document.getElementById("editorPartnerLogoInput");
  const editorIntro = document.getElementById("editorIntro");
  const introGreyBtn = document.getElementById("introGreyBtn");
  const introClearBtn = document.getElementById("introClearBtn");
  const editorGallery = document.getElementById("editorGallery");

  let projects = [];
  let editingIndex = -1; // -1 means "adding a new project"
  let formHero = null; // single {type,url} for the homepage tile / case-study hero, or null
  let formGallery = []; // rows below the hero: [{type: 1|2|3, items: [{type,url}|null, ...]}]
  let formClientLogo = "";
  let formPartnerLogo = "";
  let dirty = false;

  // Total media count for a project — hero (if any) plus every filled
  // gallery slot — used for the dashboard stats and each card's caption.
  function countMedia(project) {
    const hero = Array.isArray(project.media) && project.media[0] ? 1 : 0;
    const gallery = Array.isArray(project.gallery)
      ? project.gallery.reduce((n, row) => n + (Array.isArray(row.items) ? row.items.filter(Boolean).length : 0), 0)
      : 0;
    return hero + gallery;
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "project";
  }

  function uniqueId(base) {
    let id = base;
    let n = 2;
    const taken = new Set(projects.map((p) => p.id));
    while (taken.has(id)) {
      id = base + "-" + n;
      n++;
    }
    return id;
  }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", !!isError);
  }

  function markDirty() {
    dirty = true;
    setStatus("Unsaved changes");
  }

  function updateStats() {
    statCount.textContent = projects.length;
    statMedia.textContent = projects.reduce((n, p) => n + countMedia(p), 0);
  }

  // Builds an <img> or <video> for a media item — used both in project
  // cards and inside the form's media list, so previews always match what
  // the live site will actually render.
  function buildMediaEl(item, className) {
    if (item.type === "video") {
      const video = document.createElement("video");
      if (className) video.className = className;
      video.src = item.url;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      return video;
    }
    const img = document.createElement("img");
    if (className) img.className = className;
    img.src = item.url;
    img.alt = "";
    return img;
  }

  async function loadProjects() {
    setStatus("Loading…");
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      projects = Array.isArray(data.projects) ? data.projects : [];
      setStatus("");
    } catch (err) {
      projects = [];
      setStatus("Couldn't load projects.", true);
    }
    render();
  }

  function render() {
    listEl.innerHTML = "";
    updateStats();

    projects.forEach((project, index) => {
      const media = Array.isArray(project.media) ? project.media : [];

      const card = document.createElement("div");
      card.className = "admin-card";
      card.addEventListener("click", () => openEditor(index));

      const thumb = document.createElement("div");
      thumb.className = "admin-card-thumb";
      if (media[0]) {
        thumb.appendChild(buildMediaEl(media[0], "admin-card-thumb-media"));
      }
      if (media[0] && media[0].type === "video") {
        const badge = document.createElement("span");
        badge.className = "admin-media-badge";
        badge.textContent = "Video";
        thumb.appendChild(badge);
      }

      const body = document.createElement("div");
      body.className = "admin-card-body";
      const titleEl = document.createElement("p");
      titleEl.className = "admin-card-title";
      titleEl.textContent = project.title || "(untitled)";
      const metaEl = document.createElement("p");
      metaEl.className = "admin-card-meta";
      const sizeLabel = project.size === "large" ? "Large tile" : "Normal tile";
      const mediaCount = countMedia(project);
      const mediaLabel = mediaCount + (mediaCount === 1 ? " item" : " items");
      metaEl.textContent = (project.client || "") + " · " + sizeLabel + " · " + mediaLabel;
      body.append(titleEl, metaEl);

      const actions = document.createElement("div");
      actions.className = "admin-card-actions";
      // The whole card opens the editor (per-click), so the action row
      // stops its clicks from bubbling up to that handler.
      actions.addEventListener("click", (e) => e.stopPropagation());

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "admin-icon-btn";
      upBtn.textContent = "↑";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => moveProject(index, -1));

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "admin-icon-btn";
      downBtn.textContent = "↓";
      downBtn.disabled = index === projects.length - 1;
      downBtn.addEventListener("click", () => moveProject(index, 1));

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "admin-text-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openEditor(index));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "admin-text-btn admin-text-btn-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => deleteProject(index));

      actions.append(upBtn, downBtn, editBtn, deleteBtn);
      card.append(thumb, body, actions);
      listEl.appendChild(card);
    });
  }

  function moveProject(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= projects.length) return;
    const [item] = projects.splice(index, 1);
    projects.splice(target, 0, item);
    markDirty();
    render();
  }

  function deleteProject(index) {
    const project = projects[index];
    if (!confirm('Delete "' + (project.title || "this project") + '"? This only takes effect once you Save changes.')) return;
    projects.splice(index, 1);
    markDirty();
    render();
  }

  // ---- Editor: reuses the real case-study markup/CSS (case-modal-hero,
  // case-meta, case-intro, case-gallery), so what's shown while editing is
  // pixel-for-pixel what the live site renders. Text is edited directly on
  // the real elements via contenteditable; hero/gallery media are edited by
  // clicking the media itself (an upload input opens) rather than through
  // a separate plain form. ----

  function renderHero() {
    editorHeroMedia.innerHTML = "";
    if (formHero) {
      editorHeroMedia.appendChild(buildMediaEl(formHero));
    }
  }

  // pendingGallerySlot targets exactly one slot ({rowIndex, slotIndex}) for
  // the next upload through editorGalleryInput.
  let pendingGallerySlot = null;

  function rowClass(type) {
    return "case-row" + (type === 2 ? " case-row-2" : type === 3 ? " case-row-3" : "");
  }

  function renderGallery() {
    editorGallery.innerHTML = "";

    formGallery.forEach((row, rowIndex) => {
      const wrap = document.createElement("div");
      wrap.className = "admin-editor-row";

      const rowEl = document.createElement("div");
      rowEl.className = rowClass(row.type);

      for (let slotIndex = 0; slotIndex < row.type; slotIndex++) {
        const item = row.items[slotIndex];
        const block = document.createElement("div");
        block.className = "case-block admin-editor-block";
        block.addEventListener("click", () => startGalleryUpload(rowIndex, slotIndex));

        if (item) {
          block.appendChild(buildMediaEl(item));

          const overlay = document.createElement("div");
          overlay.className = "admin-editor-block-overlay";
          overlay.addEventListener("click", (e) => e.stopPropagation());

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "admin-text-btn admin-text-btn-danger";
          removeBtn.textContent = "Remove";
          removeBtn.addEventListener("click", () => {
            row.items[slotIndex] = null;
            renderGallery();
          });

          overlay.appendChild(removeBtn);
          block.appendChild(overlay);
        } else {
          block.classList.add("admin-editor-block-empty");
          block.textContent = "+ Add image";
        }

        rowEl.appendChild(block);
      }

      const toolbar = document.createElement("div");
      toolbar.className = "admin-editor-row-toolbar";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "admin-icon-btn";
      upBtn.textContent = "↑";
      upBtn.title = "Move row up";
      upBtn.disabled = rowIndex === 0;
      upBtn.addEventListener("click", () => {
        const [moved] = formGallery.splice(rowIndex, 1);
        formGallery.splice(rowIndex - 1, 0, moved);
        renderGallery();
      });

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "admin-icon-btn";
      downBtn.textContent = "↓";
      downBtn.title = "Move row down";
      downBtn.disabled = rowIndex === formGallery.length - 1;
      downBtn.addEventListener("click", () => {
        const [moved] = formGallery.splice(rowIndex, 1);
        formGallery.splice(rowIndex + 1, 0, moved);
        renderGallery();
      });

      const removeRowBtn = document.createElement("button");
      removeRowBtn.type = "button";
      removeRowBtn.className = "admin-text-btn admin-text-btn-danger";
      removeRowBtn.textContent = "Remove row";
      removeRowBtn.addEventListener("click", () => {
        formGallery.splice(rowIndex, 1);
        renderGallery();
      });

      toolbar.append(upBtn, downBtn, removeRowBtn);
      wrap.append(rowEl, toolbar);
      editorGallery.appendChild(wrap);
    });
  }

  function startGalleryUpload(rowIndex, slotIndex) {
    pendingGallerySlot = { rowIndex, slotIndex };
    editorGalleryInput.click();
  }

  function addRow(type) {
    formGallery.push({ type, items: new Array(type).fill(null) });
    renderGallery();
  }

  addRow1Btn.addEventListener("click", () => addRow(1));
  addRow2Btn.addEventListener("click", () => addRow(2));
  addRow3Btn.addEventListener("click", () => addRow(3));

  // Shared by the hero/gallery input and the two logo inputs below.
  async function uploadMedia(file) {
    const res = await fetch("/api/upload-media", {
      method: "POST",
      headers: {
        "content-type": file.type,
        "x-filename": encodeURIComponent(file.name),
      },
      body: file,
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "upload failed");
    return { type: data.type, url: data.url };
  }

  editorHeroBtn.addEventListener("click", () => editorHeroInput.click());

  editorHeroInput.addEventListener("change", async () => {
    const file = editorHeroInput.files && editorHeroInput.files[0];
    editorHeroInput.value = "";
    if (!file) return;

    uploadStatus.textContent = "Uploading…";
    try {
      formHero = await uploadMedia(file);
      renderHero();
      uploadStatus.textContent = "Uploaded.";
    } catch (err) {
      uploadStatus.textContent = "Upload failed: " + (err.message || "try again");
    }
  });

  editorGalleryInput.addEventListener("change", async () => {
    const file = editorGalleryInput.files && editorGalleryInput.files[0];
    editorGalleryInput.value = "";
    if (!file || !pendingGallerySlot) return;

    uploadStatus.textContent = "Uploading…";
    try {
      const item = await uploadMedia(file);
      const { rowIndex, slotIndex } = pendingGallerySlot;
      formGallery[rowIndex].items[slotIndex] = item;
      renderGallery();
      uploadStatus.textContent = "Uploaded.";
    } catch (err) {
      uploadStatus.textContent = "Upload failed: " + (err.message || "try again");
    }
  });

  // ---- Client/partner logos: small 24x24 images shown next to each name,
  // uploaded the same way as hero/gallery media. ----

  function renderLogo(kind) {
    const btn = kind === "client" ? editorClientLogoBtn : editorPartnerLogoBtn;
    const img = kind === "client" ? editorClientLogo : editorPartnerLogo;
    const url = kind === "client" ? formClientLogo : formPartnerLogo;
    if (url) {
      img.src = url;
      img.hidden = false;
      btn.classList.add("has-logo");
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      btn.classList.remove("has-logo");
    }
  }

  function setupLogoUpload(kind, btn, input) {
    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;

      uploadStatus.textContent = "Uploading…";
      try {
        const item = await uploadMedia(file);
        if (kind === "client") {
          formClientLogo = item.url;
        } else {
          formPartnerLogo = item.url;
        }
        renderLogo(kind);
        uploadStatus.textContent = "Uploaded.";
      } catch (err) {
        uploadStatus.textContent = "Upload failed: " + (err.message || "try again");
      }
    });
  }

  setupLogoUpload("client", editorClientLogoBtn, editorClientLogoInput);
  setupLogoUpload("partner", editorPartnerLogoBtn, editorPartnerLogoInput);

  // Plain single-line editing for client/partner — a literal newline would
  // look fine here but break the saved data's intent (these render as
  // flowing inline text on the real site, not multi-line blocks). The
  // intro is allowed one soft flow of text too — same reasoning — so it
  // also blocks Enter, just not single-line-only in spirit, only in that
  // it stays one paragraph.
  [editorClient, editorPartner, editorIntro].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault();
    });
  });

  // ---- Intro grey-out: select any word(s) in the intro, then mark them
  // .case-intro-muted — replaces the old "client name is always the grey
  // lead word" behaviour with a manual choice of what to grey. ----

  function currentIntroSelectionRange() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!editorIntro.contains(range.commonAncestorContainer)) return null;
    return { sel, range };
  }

  introGreyBtn.addEventListener("click", () => {
    const found = currentIntroSelectionRange();
    if (!found) return;
    const { sel, range } = found;
    const span = document.createElement("span");
    span.className = "case-intro-muted";
    try {
      range.surroundContents(span);
    } catch {
      // Selection crosses an existing span's boundary — surroundContents
      // can't wrap that in one piece, so move the selected nodes into the
      // new span instead.
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
    sel.removeAllRanges();
  });

  introClearBtn.addEventListener("click", () => {
    const found = currentIntroSelectionRange();
    if (!found) return;
    const { sel, range } = found;
    // Unwrap every .case-intro-muted span the selection touches — including
    // one the selection sits entirely inside, where the span itself isn't
    // "in" the selection, only its text is.
    editorIntro.querySelectorAll(".case-intro-muted").forEach((span) => {
      if (!range.intersectsNode(span)) return;
      const parent = span.parentNode;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
    sel.removeAllRanges();
  });

  // Strips everything from a pasted/typed intro except plain text and
  // .case-intro-muted spans — contenteditable can otherwise leave behind
  // stray <div>/<b>/<br> etc. from normal typing or paste.
  function sanitizeIntroHtml(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    (function clean(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) return;
        if (child.nodeType === Node.ELEMENT_NODE && child.tagName === "SPAN" && child.classList.contains("case-intro-muted")) {
          clean(child);
          return;
        }
        if (child.nodeType === Node.ELEMENT_NODE) {
          clean(child);
          const text = document.createTextNode(child.textContent);
          node.replaceChild(text, child);
        } else {
          node.removeChild(child);
        }
      });
    })(temp);
    return temp.innerHTML;
  }

  function openEditor(index) {
    editingIndex = index;
    uploadStatus.textContent = "";
    pendingGallerySlot = null;

    if (index >= 0) {
      const project = projects[index];
      fieldTitle.value = project.title || "";
      fieldSize.value = project.size === "large" ? "large" : "normal";
      editorClient.textContent = project.client || "";
      editorPartner.textContent = project.partner || "";
      editorIntro.innerHTML = project.introHtml || "";
      formHero = (Array.isArray(project.media) && project.media[0]) || null;
      formGallery = Array.isArray(project.gallery)
        ? project.gallery.map((row) => ({ type: row.type, items: row.items.slice() }))
        : [];
      formClientLogo = project.clientLogo || "";
      formPartnerLogo = project.partnerLogo || "";
    } else {
      fieldTitle.value = "";
      fieldSize.value = "normal";
      editorClient.textContent = "";
      editorPartner.textContent = "";
      editorIntro.innerHTML = "";
      formHero = null;
      formGallery = [];
      formClientLogo = "";
      formPartnerLogo = "";
    }
    renderHero();
    renderGallery();
    renderLogo("client");
    renderLogo("partner");

    editor.hidden = false;
  }

  // Commits the open editor's fields into projects[] (called by Done —
  // Back discards instead, see below).
  function commitEditor() {
    const title = fieldTitle.value.trim();
    const client = editorClient.textContent.trim();
    if (!title || !client) return false;

    const existing = editingIndex >= 0 ? projects[editingIndex] : null;
    const project = {
      id: existing ? existing.id : uniqueId(slugify(title)),
      title,
      client,
      partner: editorPartner.textContent.trim() || "Partner Name",
      clientLogo: formClientLogo,
      partnerLogo: formPartnerLogo,
      introHtml: sanitizeIntroHtml(editorIntro.innerHTML),
      size: fieldSize.value === "large" ? "large" : "normal",
      media: formHero ? [formHero] : [],
      // Rows left fully empty (no image ever uploaded into any slot) are
      // dropped rather than saved as empty gaps on the live page.
      gallery: formGallery
        .filter((row) => row.items.some(Boolean))
        .map((row) => ({ type: row.type, items: row.items.slice() })),
    };

    if (editingIndex >= 0) {
      projects[editingIndex] = project;
    } else {
      projects.push(project);
    }
    markDirty();
    return true;
  }

  function closeEditor() {
    editor.hidden = true;
    editingIndex = -1;
    formHero = null;
    formGallery = [];
    formClientLogo = "";
    formPartnerLogo = "";
  }

  addBtn.addEventListener("click", () => openEditor(-1));

  // Done saves the project's edits into projects[]; Back discards them —
  // distinct actions, matching what each button says.
  editorDoneBtn.addEventListener("click", () => {
    commitEditor();
    render();
    closeEditor();
  });
  editorBackBtn.addEventListener("click", closeEditor);

  saveBtn.addEventListener("click", async () => {
    setStatus("Saving…");
    saveBtn.disabled = true;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projects }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "save failed");
      dirty = false;
      setStatus("Saved — live on the site.");
    } catch (err) {
      setStatus("Save failed: " + (err.message || "unknown error"), true);
    }
    saveBtn.disabled = false;
  });

  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  loadProjects();
})();
