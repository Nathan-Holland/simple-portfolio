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
  const editorTopbarTitle = document.getElementById("editorTopbarTitle");
  const fieldTitle = document.getElementById("fieldTitle");
  const fieldSize = document.getElementById("fieldSize");
  const fieldClient = document.getElementById("fieldClient");
  const fieldPartner = document.getElementById("fieldPartner");
  const uploadStatus = document.getElementById("uploadStatus");

  const heroBox = document.getElementById("heroBox");
  const editorHeroInput = document.getElementById("editorHeroInput");
  const editorHeroMedia = document.getElementById("editorHeroMedia");

  const clientLogoBox = document.getElementById("clientLogoBox");
  const clientLogoInput = document.getElementById("clientLogoInput");
  const partnerLogoBox = document.getElementById("partnerLogoBox");
  const partnerLogoInput = document.getElementById("partnerLogoInput");

  const editorIntro = document.getElementById("editorIntro");
  const introGreyBtn = document.getElementById("introGreyBtn");
  const introClearBtn = document.getElementById("introClearBtn");

  const editorRowsForm = document.getElementById("editorRowsForm");
  const editorGalleryInput = document.getElementById("editorGalleryInput");
  const addRow1Btn = document.getElementById("addRow1Btn");
  const addRow2Btn = document.getElementById("addRow2Btn");
  const addRow3Btn = document.getElementById("addRow3Btn");

  // Preview pane (read-only mirror of the real case-study markup).
  const previewClient = document.getElementById("previewClient");
  const previewPartner = document.getElementById("previewPartner");
  const previewClientLogo = document.getElementById("previewClientLogo");
  const previewPartnerLogo = document.getElementById("previewPartnerLogo");
  const previewIntro = document.getElementById("previewIntro");
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
  // cards and inside the preview pane, so previews always match what the
  // live site will actually render.
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
      card.className = "u-project-card";
      card.addEventListener("click", () => openEditor(index));

      const thumb = document.createElement("div");
      thumb.className = "u-project-thumb";
      if (media[0]) {
        thumb.appendChild(buildMediaEl(media[0], "u-project-thumb-media"));
      }
      if (media[0] && media[0].type === "video") {
        const badge = document.createElement("span");
        badge.className = "u-project-badge";
        badge.textContent = "Video";
        thumb.appendChild(badge);
      }

      const body = document.createElement("div");
      body.className = "u-project-body";
      const titleEl = document.createElement("p");
      titleEl.className = "u-project-title";
      titleEl.textContent = project.title || "(untitled)";
      const metaEl = document.createElement("p");
      metaEl.className = "u-project-meta";
      const sizeLabel = project.size === "large" ? "Large tile" : "Normal tile";
      const mediaCount = countMedia(project);
      const mediaLabel = mediaCount + (mediaCount === 1 ? " item" : " items");
      metaEl.textContent = (project.client || "") + " · " + sizeLabel + " · " + mediaLabel;
      body.append(titleEl, metaEl);

      const actions = document.createElement("div");
      actions.className = "u-project-actions";
      // The whole card opens the editor (per-click), so the action row
      // stops its clicks from bubbling up to that handler.
      actions.addEventListener("click", (e) => e.stopPropagation());

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "u-btn u-btn-ghost u-btn-icon";
      upBtn.textContent = "↑";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => moveProject(index, -1));

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "u-btn u-btn-ghost u-btn-icon";
      downBtn.textContent = "↓";
      downBtn.disabled = index === projects.length - 1;
      downBtn.addEventListener("click", () => moveProject(index, 1));

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "u-btn u-btn-ghost u-btn-sm push-right";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openEditor(index));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "u-btn u-btn-ghost u-btn-sm u-btn-danger";
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

  // ---- Editor: a plain form on the left drives every field; renderPreview()
  // keeps the right pane (the real case-study markup/classes) in sync with
  // the current form state on every change. ----

  function renderPreview() {
    editorHeroMedia.innerHTML = "";
    if (formHero) editorHeroMedia.appendChild(buildMediaEl(formHero));

    previewClient.textContent = fieldClient.value.trim() || "Client Name";
    previewPartner.textContent = fieldPartner.value.trim() || "Partner Name";
    setLogoPreview(previewClientLogo, formClientLogo);
    setLogoPreview(previewPartnerLogo, formPartnerLogo);
    previewIntro.innerHTML = editorIntro.innerHTML;

    editorGallery.innerHTML = "";
    formGallery.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = rowClass(row.type);
      row.items.forEach((item) => {
        if (!item) return;
        const block = document.createElement("div");
        block.className = "case-block";
        block.appendChild(buildMediaEl(item));
        rowEl.appendChild(block);
      });
      editorGallery.appendChild(rowEl);
    });
  }

  function setLogoPreview(img, url) {
    if (url) {
      img.src = url;
      img.hidden = false;
    } else {
      img.removeAttribute("src");
      img.hidden = true;
    }
  }

  function rowClass(type) {
    return "case-row" + (type === 2 ? " case-row-2" : type === 3 ? " case-row-3" : "");
  }

  // ---- Dropzone helper: shared look/behaviour for the hero box and the
  // two logo boxes — shows a "+" placeholder until a file is set, then the
  // file itself with a "Change" overlay on hover. ----
  function renderDropzone(box, item, placeholderIcon) {
    box.innerHTML = "";
    if (item) {
      box.appendChild(buildMediaEl(item, "u-dropzone-media"));
      const overlay = document.createElement("div");
      overlay.className = "u-dropzone-overlay";
      overlay.textContent = "Change";
      box.appendChild(overlay);
    } else {
      const icon = document.createElement("span");
      icon.className = "u-dropzone-icon";
      icon.textContent = placeholderIcon;
      box.appendChild(icon);
    }
  }

  function renderHeroBox() {
    heroBox.innerHTML = "";
    if (formHero) {
      renderDropzone(heroBox, formHero, "+");
    } else {
      const icon = document.createElement("span");
      icon.className = "u-dropzone-icon";
      icon.textContent = "+";
      const label = document.createElement("span");
      label.textContent = "Click to upload an image or video";
      heroBox.append(icon, label);
    }
  }

  // Shared by the hero/gallery input and the two logo inputs.
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

  heroBox.addEventListener("click", () => editorHeroInput.click());
  editorHeroInput.addEventListener("change", async () => {
    const file = editorHeroInput.files && editorHeroInput.files[0];
    editorHeroInput.value = "";
    if (!file) return;

    uploadStatus.textContent = "Uploading…";
    try {
      formHero = await uploadMedia(file);
      renderHeroBox();
      renderPreview();
      uploadStatus.textContent = "Uploaded.";
    } catch (err) {
      uploadStatus.textContent = "Upload failed: " + (err.message || "try again");
    }
  });

  function setupLogoUpload(kind, box, input) {
    box.addEventListener("click", () => input.click());
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
        renderDropzone(box, item, "+");
        renderPreview();
        uploadStatus.textContent = "Uploaded.";
      } catch (err) {
        uploadStatus.textContent = "Upload failed: " + (err.message || "try again");
      }
    });
  }

  setupLogoUpload("client", clientLogoBox, clientLogoInput);
  setupLogoUpload("partner", partnerLogoBox, partnerLogoInput);

  // ---- Gallery rows (form side): each row is its own card with a fixed
  // number of upload slots — the admin picks the row's shape (1/2/3 images)
  // explicitly rather than sizing images individually. ----

  let pendingGallerySlot = null; // {rowIndex, slotIndex} for the next upload

  function renderRowsForm() {
    editorRowsForm.innerHTML = "";

    formGallery.forEach((row, rowIndex) => {
      const card = document.createElement("div");
      card.className = "u-row-card";

      const header = document.createElement("div");
      header.className = "u-row-card-header";
      const title = document.createElement("span");
      title.className = "u-row-card-title";
      title.textContent = "Row " + (rowIndex + 1) + " · " + row.type + (row.type === 1 ? " image" : " images");
      header.appendChild(title);

      const actions = document.createElement("div");
      actions.className = "u-row-card-actions";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "u-btn u-btn-ghost u-btn-icon";
      upBtn.textContent = "↑";
      upBtn.title = "Move row up";
      upBtn.disabled = rowIndex === 0;
      upBtn.addEventListener("click", () => {
        const [moved] = formGallery.splice(rowIndex, 1);
        formGallery.splice(rowIndex - 1, 0, moved);
        renderRowsForm();
        renderPreview();
      });

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "u-btn u-btn-ghost u-btn-icon";
      downBtn.textContent = "↓";
      downBtn.title = "Move row down";
      downBtn.disabled = rowIndex === formGallery.length - 1;
      downBtn.addEventListener("click", () => {
        const [moved] = formGallery.splice(rowIndex, 1);
        formGallery.splice(rowIndex + 1, 0, moved);
        renderRowsForm();
        renderPreview();
      });

      const removeRowBtn = document.createElement("button");
      removeRowBtn.type = "button";
      removeRowBtn.className = "u-btn u-btn-ghost u-btn-sm u-btn-danger";
      removeRowBtn.textContent = "Remove";
      removeRowBtn.addEventListener("click", () => {
        formGallery.splice(rowIndex, 1);
        renderRowsForm();
        renderPreview();
      });

      actions.append(upBtn, downBtn, removeRowBtn);
      header.appendChild(actions);

      const slots = document.createElement("div");
      slots.className = "u-row-card-slots";
      slots.style.setProperty("--slots", row.type);
      slots.style.gridTemplateColumns = "repeat(" + row.type + ", 1fr)";

      for (let slotIndex = 0; slotIndex < row.type; slotIndex++) {
        const item = row.items[slotIndex];
        const box = document.createElement("div");
        box.className = "u-dropzone u-row-slot";
        box.addEventListener("click", () => {
          pendingGallerySlot = { rowIndex, slotIndex };
          editorGalleryInput.click();
        });

        if (item) {
          box.appendChild(buildMediaEl(item, "u-dropzone-media"));
          const overlay = document.createElement("div");
          overlay.className = "u-dropzone-overlay";
          overlay.textContent = "Change";
          box.appendChild(overlay);

          const removeSlotBtn = document.createElement("button");
          removeSlotBtn.type = "button";
          removeSlotBtn.className = "u-btn u-btn-ghost u-btn-icon";
          removeSlotBtn.textContent = "×";
          removeSlotBtn.title = "Remove image";
          removeSlotBtn.style.position = "absolute";
          removeSlotBtn.style.top = "4px";
          removeSlotBtn.style.right = "4px";
          removeSlotBtn.style.background = "rgba(0,0,0,0.5)";
          removeSlotBtn.style.color = "#fff";
          removeSlotBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            row.items[slotIndex] = null;
            renderRowsForm();
            renderPreview();
          });
          box.appendChild(removeSlotBtn);
        } else {
          const icon = document.createElement("span");
          icon.className = "u-dropzone-icon";
          icon.textContent = "+";
          box.appendChild(icon);
        }

        slots.appendChild(box);
      }

      card.append(header, slots);
      editorRowsForm.appendChild(card);
    });
  }

  editorGalleryInput.addEventListener("change", async () => {
    const file = editorGalleryInput.files && editorGalleryInput.files[0];
    editorGalleryInput.value = "";
    if (!file || !pendingGallerySlot) return;

    uploadStatus.textContent = "Uploading…";
    try {
      const item = await uploadMedia(file);
      const { rowIndex, slotIndex } = pendingGallerySlot;
      formGallery[rowIndex].items[slotIndex] = item;
      renderRowsForm();
      renderPreview();
      uploadStatus.textContent = "Uploaded.";
    } catch (err) {
      uploadStatus.textContent = "Upload failed: " + (err.message || "try again");
    }
  });

  function addRow(type) {
    formGallery.push({ type, items: new Array(type).fill(null) });
    renderRowsForm();
    renderPreview();
  }

  addRow1Btn.addEventListener("click", () => addRow(1));
  addRow2Btn.addEventListener("click", () => addRow(2));
  addRow3Btn.addEventListener("click", () => addRow(3));

  // ---- Text fields drive the preview live. ----
  [fieldClient, fieldPartner].forEach((el) => {
    el.addEventListener("input", renderPreview);
  });
  fieldTitle.addEventListener("input", () => {
    editorTopbarTitle.textContent = fieldTitle.value.trim() || "New project";
  });

  // Intro stays one flowing line, matching how it renders on the real
  // site — a literal newline would break that intent.
  editorIntro.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  editorIntro.addEventListener("input", renderPreview);

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
    renderPreview();
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
    renderPreview();
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
      fieldClient.value = project.client || "";
      fieldPartner.value = project.partner || "";
      editorIntro.innerHTML = project.introHtml || "";
      formHero = (Array.isArray(project.media) && project.media[0]) || null;
      formGallery = Array.isArray(project.gallery)
        ? project.gallery.map((row) => ({ type: row.type, items: row.items.slice() }))
        : [];
      formClientLogo = project.clientLogo || "";
      formPartnerLogo = project.partnerLogo || "";
      editorTopbarTitle.textContent = project.title || "New project";
    } else {
      fieldTitle.value = "";
      fieldSize.value = "normal";
      fieldClient.value = "";
      fieldPartner.value = "";
      editorIntro.innerHTML = "";
      formHero = null;
      formGallery = [];
      formClientLogo = "";
      formPartnerLogo = "";
      editorTopbarTitle.textContent = "New project";
    }

    renderHeroBox();
    renderDropzone(clientLogoBox, formClientLogo ? { type: "image", url: formClientLogo } : null, "+");
    renderDropzone(partnerLogoBox, formPartnerLogo ? { type: "image", url: formPartnerLogo } : null, "+");
    renderRowsForm();
    renderPreview();

    editor.hidden = false;
  }

  // Commits the open editor's fields into projects[] (called by Done —
  // Back discards instead, see below).
  function commitEditor() {
    const title = fieldTitle.value.trim();
    const client = fieldClient.value.trim();
    if (!title || !client) return false;

    const existing = editingIndex >= 0 ? projects[editingIndex] : null;
    const project = {
      id: existing ? existing.id : uniqueId(slugify(title)),
      title,
      client,
      partner: fieldPartner.value.trim() || "Partner Name",
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
