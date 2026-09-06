(function () {
  const listEl = document.getElementById("adminList");
  const addBtn = document.getElementById("addProjectBtn");
  const saveBtn = document.getElementById("saveChangesBtn");
  const statusEl = document.getElementById("adminStatus");
  const statCount = document.getElementById("statCount");
  const statMedia = document.getElementById("statMedia");

  const formModal = document.getElementById("projectForm");
  const formBackdrop = document.getElementById("projectFormBackdrop");
  const formEl = document.getElementById("projectFormEl");
  const formTitle = document.getElementById("formTitle");
  const cancelBtn = document.getElementById("cancelFormBtn");

  const fieldTitle = document.getElementById("fieldTitle");
  const fieldClient = document.getElementById("fieldClient");
  const fieldPartner = document.getElementById("fieldPartner");
  const fieldIntro = document.getElementById("fieldIntro");
  const fieldSize = document.getElementById("fieldSize");
  const fieldMediaInput = document.getElementById("fieldMediaInput");
  const mediaListEl = document.getElementById("mediaList");
  const uploadStatus = document.getElementById("uploadStatus");

  let projects = [];
  let editingIndex = -1; // -1 means "adding a new project"
  let formMedia = []; // the media[] array being edited in the open form
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
      video.className = className;
      video.src = item.url;
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      return video;
    }
    const img = document.createElement("img");
    img.className = className;
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
      editBtn.addEventListener("click", () => openForm(index));

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

  // ---- Media list inside the add/edit form ----

  function renderMediaList() {
    mediaListEl.innerHTML = "";
    formMedia.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "admin-media-item";

      const thumb = document.createElement("div");
      thumb.className = "admin-media-item-thumb";
      thumb.appendChild(buildMediaEl(item, "admin-media-item-media"));

      const label = document.createElement("span");
      label.className = "admin-media-item-label";
      label.textContent = index === 0 ? "Hero / Tile" : "Gallery " + index;

      const actions = document.createElement("div");
      actions.className = "admin-media-item-actions";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "admin-icon-btn";
      upBtn.textContent = "↑";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => {
        const [moved] = formMedia.splice(index, 1);
        formMedia.splice(index - 1, 0, moved);
        renderMediaList();
      });

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "admin-icon-btn";
      downBtn.textContent = "↓";
      downBtn.disabled = index === formMedia.length - 1;
      downBtn.addEventListener("click", () => {
        const [moved] = formMedia.splice(index, 1);
        formMedia.splice(index + 1, 0, moved);
        renderMediaList();
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "admin-text-btn admin-text-btn-danger";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        formMedia.splice(index, 1);
        renderMediaList();
      });

      actions.append(upBtn, downBtn, removeBtn);
      row.append(thumb, label, actions);
      mediaListEl.appendChild(row);
    });
  }

  async function uploadMedia(file) {
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
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "upload failed");
      }
      formMedia.push({ type: data.type, url: data.url });
      renderMediaList();
      uploadStatus.textContent = "Uploaded.";
    } catch (err) {
      uploadStatus.textContent = "Upload failed: " + (err.message || "try again");
    }
  }

  fieldMediaInput.addEventListener("change", () => {
    const file = fieldMediaInput.files && fieldMediaInput.files[0];
    if (file) uploadMedia(file);
    fieldMediaInput.value = "";
  });

  function openForm(index) {
    editingIndex = index;
    fieldMediaInput.value = "";
    uploadStatus.textContent = "";

    if (index >= 0) {
      const project = projects[index];
      formTitle.textContent = "Edit project";
      fieldTitle.value = project.title || "";
      fieldClient.value = project.client || "";
      fieldPartner.value = project.partner || "";
      fieldIntro.value = (project.introRest || "").trim();
      fieldSize.value = project.size === "large" ? "large" : "normal";
      formMedia = Array.isArray(project.media) ? project.media.slice() : [];
    } else {
      formTitle.textContent = "Add project";
      formEl.reset();
      formMedia = [];
    }
    renderMediaList();

    formModal.hidden = false;
  }

  function closeForm() {
    formModal.hidden = true;
    editingIndex = -1;
    formMedia = [];
  }

  addBtn.addEventListener("click", () => openForm(-1));
  cancelBtn.addEventListener("click", closeForm);
  formBackdrop.addEventListener("click", closeForm);

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = fieldTitle.value.trim();
    const client = fieldClient.value.trim();
    if (!title || !client) return;

    const existing = editingIndex >= 0 ? projects[editingIndex] : null;
    const project = {
      id: existing ? existing.id : uniqueId(slugify(title)),
      title,
      client,
      partner: fieldPartner.value.trim() || "Partner Name",
      introRest: fieldIntro.value.trim() ? " " + fieldIntro.value.trim() : "",
      size: fieldSize.value === "large" ? "large" : "normal",
      media: formMedia.slice(),
    };

    if (editingIndex >= 0) {
      projects[editingIndex] = project;
    } else {
      projects.push(project);
    }

    markDirty();
    render();
    closeForm();
  });

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
