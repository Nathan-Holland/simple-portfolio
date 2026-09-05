(function () {
  const listEl = document.getElementById("adminList");
  const addBtn = document.getElementById("addProjectBtn");
  const saveBtn = document.getElementById("saveChangesBtn");
  const statusEl = document.getElementById("adminStatus");

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
  const fieldImage = document.getElementById("fieldImage");
  const fieldImagePreview = document.getElementById("fieldImagePreview");
  const uploadStatus = document.getElementById("uploadStatus");

  let projects = [];
  let editingIndex = -1; // -1 means "adding a new project"
  let pendingImageUrl = null;
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
    projects.forEach((project, index) => {
      const row = document.createElement("div");
      row.className = "admin-row";

      const thumb = document.createElement("div");
      thumb.className = "admin-row-thumb";
      if (project.image) {
        const img = document.createElement("img");
        img.src = project.image;
        img.alt = "";
        thumb.appendChild(img);
      }

      const info = document.createElement("div");
      info.className = "admin-row-info";
      const titleEl = document.createElement("p");
      titleEl.className = "admin-row-title";
      titleEl.textContent = project.title || "(untitled)";
      const metaEl = document.createElement("p");
      metaEl.className = "admin-row-meta";
      metaEl.textContent = (project.client || "") + " · " + (project.size === "large" ? "Large tile" : "Normal tile");
      info.append(titleEl, metaEl);

      const actions = document.createElement("div");
      actions.className = "admin-row-actions";

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
      row.append(thumb, info, actions);
      listEl.appendChild(row);
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

  function openForm(index) {
    editingIndex = index;
    pendingImageUrl = null;
    fieldImage.value = "";
    uploadStatus.textContent = "";

    if (index >= 0) {
      const project = projects[index];
      formTitle.textContent = "Edit project";
      fieldTitle.value = project.title || "";
      fieldClient.value = project.client || "";
      fieldPartner.value = project.partner || "";
      fieldIntro.value = (project.introRest || "").trim();
      fieldSize.value = project.size === "large" ? "large" : "normal";
      if (project.image) {
        fieldImagePreview.src = project.image;
        fieldImagePreview.hidden = false;
      } else {
        fieldImagePreview.hidden = true;
      }
    } else {
      formTitle.textContent = "Add project";
      formEl.reset();
      fieldImagePreview.hidden = true;
    }

    formModal.hidden = false;
  }

  function closeForm() {
    formModal.hidden = true;
    editingIndex = -1;
    pendingImageUrl = null;
  }

  async function uploadImage(file) {
    uploadStatus.textContent = "Uploading…";
    try {
      const res = await fetch("/api/upload-image", {
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
      pendingImageUrl = data.url;
      fieldImagePreview.src = data.url;
      fieldImagePreview.hidden = false;
      uploadStatus.textContent = "Uploaded.";
    } catch (err) {
      uploadStatus.textContent = "Upload failed — try again.";
    }
  }

  fieldImage.addEventListener("change", () => {
    const file = fieldImage.files && fieldImage.files[0];
    if (file) uploadImage(file);
  });

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
      image: pendingImageUrl || (existing ? existing.image : null) || null,
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
      setStatus("Save failed — try again.", true);
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
