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
  const editorClient = document.getElementById("editorClient");
  const editorPartner = document.getElementById("editorPartner");
  const editorIntroLead = document.getElementById("editorIntroLead");
  const editorIntroRest = document.getElementById("editorIntroRest");
  const editorGallery = document.getElementById("editorGallery");

  let projects = [];
  let editingIndex = -1; // -1 means "adding a new project"
  let formMedia = []; // the media[] array being edited — [0] is the hero, the rest are gallery
  let dirty = false;

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
    statMedia.textContent = projects.reduce((n, p) => n + (Array.isArray(p.media) ? p.media.length : 0), 0);
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
      const mediaLabel = media.length + (media.length === 1 ? " item" : " items");
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

  let pendingUploadTarget = null; // index into formMedia the next upload replaces, or null for "append new"

  function renderHero() {
    editorHeroMedia.innerHTML = "";
    if (formMedia[0]) {
      editorHeroMedia.appendChild(buildMediaEl(formMedia[0]));
    }
  }

  function renderGallery() {
    editorGallery.innerHTML = "";

    formMedia.slice(1).forEach((item, i) => {
      const index = i + 1; // absolute index into formMedia
      const block = document.createElement("div");
      block.className = "case-block admin-editor-block";
      block.appendChild(buildMediaEl(item));
      block.addEventListener("click", () => startUpload(index));

      const overlay = document.createElement("div");
      overlay.className = "admin-editor-block-overlay";
      overlay.addEventListener("click", (e) => e.stopPropagation());

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "admin-icon-btn";
      upBtn.textContent = "↑";
      upBtn.title = index === 1 ? "Make hero" : "Move up";
      upBtn.addEventListener("click", () => {
        const [moved] = formMedia.splice(index, 1);
        formMedia.splice(index - 1, 0, moved);
        renderHero();
        renderGallery();
      });

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "admin-icon-btn";
      downBtn.textContent = "↓";
      downBtn.disabled = index === formMedia.length - 1;
      downBtn.addEventListener("click", () => {
        const [moved] = formMedia.splice(index, 1);
        formMedia.splice(index + 1, 0, moved);
        renderGallery();
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "admin-text-btn admin-text-btn-danger";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        formMedia.splice(index, 1);
        renderGallery();
      });

      overlay.append(upBtn, downBtn, removeBtn);
      block.appendChild(overlay);
      editorGallery.appendChild(block);
    });

    const addBlock = document.createElement("button");
    addBlock.type = "button";
    addBlock.className = "case-block admin-editor-add-block";
    addBlock.textContent = "+ Add to gallery";
    addBlock.addEventListener("click", () => startUpload(null));
    editorGallery.appendChild(addBlock);
  }

  function startUpload(index) {
    pendingUploadTarget = index;
    editorHeroInput.click();
  }

  editorHeroBtn.addEventListener("click", () => startUpload(0));

  editorHeroInput.addEventListener("change", async () => {
    const file = editorHeroInput.files && editorHeroInput.files[0];
    editorHeroInput.value = "";
    if (!file) return;

    uploadStatus.textContent = "Uploading…";
    try {
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

      const item = { type: data.type, url: data.url };
      if (pendingUploadTarget === null) {
        formMedia.push(item);
      } else {
        formMedia[pendingUploadTarget] = item;
      }
      renderHero();
      renderGallery();
      uploadStatus.textContent = "Uploaded.";
    } catch (err) {
      uploadStatus.textContent = "Upload failed: " + (err.message || "try again");
    }
  });

  // Client name drives both the meta field and the intro's lead word live,
  // matching how the real case-study page derives introLead from client.
  editorClient.addEventListener("input", () => {
    editorIntroLead.textContent = editorClient.textContent;
  });

  // Plain single-line editing — a literal newline would look fine here but
  // break the saved data's intent (these render as flowing inline text on
  // the real site, not multi-line blocks).
  [editorClient, editorPartner, editorIntroRest].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault();
    });
  });

  function openEditor(index) {
    editingIndex = index;
    uploadStatus.textContent = "";
    pendingUploadTarget = null;

    if (index >= 0) {
      const project = projects[index];
      fieldTitle.value = project.title || "";
      fieldSize.value = project.size === "large" ? "large" : "normal";
      editorClient.textContent = project.client || "";
      editorPartner.textContent = project.partner || "";
      editorIntroLead.textContent = project.client || "";
      editorIntroRest.textContent = (project.introRest || "").trim();
      formMedia = Array.isArray(project.media) ? project.media.slice() : [];
    } else {
      fieldTitle.value = "";
      fieldSize.value = "normal";
      editorClient.textContent = "";
      editorPartner.textContent = "";
      editorIntroLead.textContent = "";
      editorIntroRest.textContent = "";
      formMedia = [];
    }
    renderHero();
    renderGallery();

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
      introRest: editorIntroRest.textContent.trim() ? " " + editorIntroRest.textContent.trim() : "",
      size: fieldSize.value === "large" ? "large" : "normal",
      media: formMedia.slice(),
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
    formMedia = [];
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
