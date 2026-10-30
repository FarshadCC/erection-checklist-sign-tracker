// =========================
// USER LOGIN
// =========================
// Change the usernames, passwords and display names below.
// NOTE: This is a client-side login. It is suitable for a small trusted
// internal tool, but it is NOT a secure authentication system for sensitive data.
const APP_USERS = [
    { username: "FarshadHeydari", password: "FH00001", displayName: "FarshadHeydari" },
    { username: "FrancescoTangocci", password: "FT00001", displayName: "FrancescoTangocci" },
    { username: "RomeoJRFlorendo", password: "R12345", displayName: "RomeoJRFlorendo" }
];

let currentUser = (localStorage.getItem("spanCurrentUser") || "").trim();

function getLoggedInUser() {
    return APP_USERS.find(u => u.displayName === currentUser || u.username === currentUser) || null;
}

function showLoginScreen() {
    const overlay = document.getElementById("loginOverlay");
    if (overlay) overlay.classList.remove("hidden");
}

function hideLoginScreen() {
    const overlay = document.getElementById("loginOverlay");
    if (overlay) overlay.classList.add("hidden");
}

function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;
    const error = document.getElementById("loginError");
    const user = APP_USERS.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (!user) {
        if (error) {
            error.textContent = "Invalid username or password.";
            error.classList.remove("hidden");
        }
        return;
    }

    currentUser = user.displayName;
    localStorage.setItem("spanCurrentUser", currentUser);
    if (error) error.classList.add("hidden");
    hideLoginScreen();
    const userEl = document.getElementById("currentUser");
    if (userEl) userEl.textContent = currentUser;
}

function logoutUser() {
    localStorage.removeItem("spanCurrentUser");
    currentUser = "";
    const userEl = document.getElementById("currentUser");
    if (userEl) userEl.textContent = "Not signed in";
    const form = document.getElementById("loginForm");
    if (form) form.reset();
    showLoginScreen();
}

window.addEventListener("storage", function(event) {
    if (event.key === "spanCurrentUser") {
        currentUser = (event.newValue || "").trim();
        const el = document.getElementById("currentUser");
        if (el) el.textContent = currentUser || "Not signed in";
        if (currentUser) hideLoginScreen();
        else showLoginScreen();
    }
});

let draftFolder = null;
let revisionFolder = null;
let approvedFolder = null;
let checklistFiles = [];
let inspectorFolderHandle = null;

let checklistState = JSON.parse(localStorage.getItem("checklistState") || "{}");
let inspectors = [];
let activityLog = [];

const DB_NAME = "SPAN_Erection_DB";
const DB_VERSION = 1;
const STORE_NAME = "folders";
const MAX_INSPECTORS = 10;

const SUPABASE_URL = "https://pfftaymhqcjiubsgqjrx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmZnRheW1ocWNqaXVic2dxanJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMDAyNzEsImV4cCI6MjEwMzg3NjI3MX0.egyGFautS6j6lWXHh9E0MoAo23Sw0-gxqtN-rXkFHEE";
const supabaseClient = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// =========================
// PAGE LOAD
// =========================

document.addEventListener("DOMContentLoaded", async function () {
    const userEl = document.getElementById("currentUser");
    if (userEl) userEl.textContent = currentUser || "Not signed in";

    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.addEventListener("submit", handleLogin);
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", logoutUser);

    if (getLoggedInUser()) hideLoginScreen();
    else showLoginScreen();

    document.getElementById("selectDraftBtn").addEventListener("click", selectDraftFolder);
    document.getElementById("selectRevisionBtn").addEventListener("click", selectRevisionFolder);
    document.getElementById("selectApprovedBtn").addEventListener("click", selectApprovedFolder);
    document.getElementById("refreshBtn").addEventListener("click", refreshPDFList);
    document.getElementById("processBtn").addEventListener("click", processChecklist);
    document.getElementById("searchInput").addEventListener("input", filterChecklist);
    document.getElementById("statusFilter").addEventListener("change", filterChecklist);

    document.getElementById("addInspectorBtn").addEventListener("click", function () {
        openInspectorModal();
    });
    document.getElementById("closeInspectorModalBtn").addEventListener("click", closeInspectorModal);
    document.getElementById("cancelInspectorBtn").addEventListener("click", closeInspectorModal);
    document.querySelector(".modal-backdrop").addEventListener("click", closeInspectorModal);
    document.getElementById("inspectorForm").addEventListener("submit", saveInspectorFromForm);
    document.getElementById("selectInspectorFolderBtn").addEventListener("click", selectInspectorFolder);
    document.getElementById("exportLogBtn").addEventListener("click", exportActivityLogCSV);
    document.getElementById("clearLogBtn").addEventListener("click", clearActivityLog);

    await restoreSavedFolders();
    await loadSharedData();
    renderInspectorManagement();
    renderActivityLog();

    const openInspectorsBtn = document.getElementById("openInspectorsBtn");
    if (openInspectorsBtn) openInspectorsBtn.addEventListener("click", async () => {
        await loadSharedData();
        showSubpage("managementPage");
        document.getElementById("inspectorsPanel")?.scrollIntoView({behavior:"smooth", block:"start"});
        renderInspectorManagement();
    });
    const openActivityBtn = document.getElementById("openActivityBtn");
    if (openActivityBtn) openActivityBtn.addEventListener("click", async () => {
        await loadSharedData();
        showSubpage("managementPage");
        document.getElementById("activityPanel")?.scrollIntoView({behavior:"smooth", block:"start"});
        renderActivityLog();
    });
    const backFromManagementBtn = document.getElementById("backFromManagementBtn");
    if (backFromManagementBtn) backFromManagementBtn.addEventListener("click", () => showSubpage(""));

    setupPdfViewerControls();
    document.getElementById("pdfPagesContainer")?.addEventListener("scroll", updatePdfPageIndicator, { passive: true });
});

// =========================
// FOLDER SELECTION
// =========================

async function selectDraftFolder() {
    await selectWorkflowFolder("draft", "Draft folder selected successfully.");
}

async function selectRevisionFolder() {
    await selectWorkflowFolder("revision", "Revision Required folder selected successfully.");
}

async function selectApprovedFolder() {
    await selectWorkflowFolder("approved", "Approved folder selected successfully.");
}

async function selectWorkflowFolder(type, successMessage) {
    try {
        if (!window.showDirectoryPicker) {
            showMessage("Your browser does not support folder access. Please use Microsoft Edge or Google Chrome.", true);
            return;
        }

        const handle = await window.showDirectoryPicker({ mode: "readwrite" });

        if (type === "draft") draftFolder = handle;
        if (type === "revision") revisionFolder = handle;
        if (type === "approved") approvedFolder = handle;

        await saveFolderHandle(type, handle);
        updateWorkflowFolderUI(type, handle);
        showMessage(successMessage, false);
    } catch (error) {
        if (error && error.name !== "AbortError") {
            console.error("Folder selection error:", error);
            showMessage("Could not select the folder.", true);
        }
    }
}

function updateWorkflowFolderUI(type, handle) {
    const ids = {
        draft: ["draftFolderName", "draftStatus"],
        revision: ["revisionFolderName", "revisionStatus"],
        approved: ["approvedFolderName", "approvedStatus"]
    };

    const [nameId, statusId] = ids[type];
    document.getElementById(nameId).textContent = handle.name;
    updateFolderStatus(statusId, "connected");
    localStorage.setItem(`${type}FolderName`, handle.name);
}

// =========================
// READ PDF FILES
// =========================

async function refreshPDFList() {
    if (!draftFolder) {
        showMessage("Please select the Draft Folder first.", true);
        return;
    }

    try {
        const hasPermission = await checkFolderPermission(draftFolder);
        if (!hasPermission) {
            updateFolderStatus("draftStatus", "permission");
            showMessage("Permission is required for the Draft Folder.", true);
            return;
        }

        updateFolderStatus("draftStatus", "connected");
        checklistFiles = [];

        for await (const entry of draftFolder.values()) {
            if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".pdf")) {
                checklistFiles.push(entry);
            }
        }

        checklistFiles.sort((a, b) => a.name.localeCompare(b.name));
        renderChecklist();
        showMessage(`${checklistFiles.length} PDF file(s) found.`, false);
    } catch (error) {
        console.error("Refresh error:", error);
        updateFolderStatus("draftStatus", "disconnected");
        showMessage("Could not access the Draft Folder.", true);
    }
}

// =========================
// RENDER CHECKLIST
// =========================

function renderChecklist() {
    const tbody = document.getElementById("checklistBody");
    tbody.innerHTML = "";

    checklistFiles.forEach(function (file, index) {
        const row = document.createElement("tr");
        const savedState = checklistState[file.name] || {
            approve: false,
            revision: false,
            inspector: "",
            comment: ""
        };

        const inspectorOptions = buildInspectorOptions(savedState.inspector);

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHtml(removeExtension(file.name))}</td>
            <td>
                <button class="pdf-link" data-index="${index}" title="Preview and sign PDF inside SPAN">📄</button>
            </td>
            <td>
                <input type="checkbox" class="approve-checkbox" data-index="${index}" ${savedState.approve ? "checked" : ""}>
            </td>
            <td>
                <input type="checkbox" class="revision-checkbox" data-index="${index}" ${savedState.revision ? "checked" : ""}>
            </td>
            <td>
                <select class="inspector-select" data-index="${index}">
                    ${inspectorOptions}
                </select>
            </td>
            <td>
                <input type="text" class="comment-input" data-index="${index}" placeholder="Comment" value="${escapeHtml(savedState.comment)}">
            </td>
            <td>
                <span class="status pending" data-index="${index}">Pending</span>
            </td>
        `;

        tbody.appendChild(row);
    });

    setupChecklistControls();
    setupPDFButtons();
    filterChecklist();
}

function buildInspectorOptions(selectedName) {
    let html = `<option value="">Select inspector</option>`;

    inspectors.forEach(function (inspector) {
        const selected = inspector.name === selectedName ? "selected" : "";
        html += `<option value="${escapeHtml(inspector.name)}" ${selected}>${escapeHtml(inspector.name)}</option>`;
    });

    if (selectedName && !inspectors.some(i => i.name === selectedName)) {
        html += `<option value="${escapeHtml(selectedName)}" selected>${escapeHtml(selectedName)} (saved value)</option>`;
    }

    return html;
}

function removeExtension(fileName) {
    return fileName.replace(/\.pdf$/i, "");
}

// =========================
// CHECKLIST CONTROLS
// =========================

function setupChecklistControls() {
    document.querySelectorAll(".approve-checkbox").forEach(function (checkbox) {
        checkbox.addEventListener("change", function () {
            const index = Number(this.dataset.index);
            const revisionCheckbox = getControl(".revision-checkbox", index);
            const inspectorSelect = getControl(".inspector-select", index);
            const commentInput = getControl(".comment-input", index);

            if (this.checked) {
                revisionCheckbox.checked = false;
                inspectorSelect.value = "";
                commentInput.value = "";
            }

            applyChecklistRowState(index);
            saveChecklistState(index);
            updateStatus(index);
            filterChecklist();
        });
    });

    document.querySelectorAll(".revision-checkbox").forEach(function (checkbox) {
        checkbox.addEventListener("change", function () {
            const index = Number(this.dataset.index);
            const approveCheckbox = getControl(".approve-checkbox", index);

            if (this.checked) {
                approveCheckbox.checked = false;
            }

            applyChecklistRowState(index);
            saveChecklistState(index);
            updateStatus(index);
            filterChecklist();
        });
    });

    document.querySelectorAll(".inspector-select").forEach(function (select) {
        select.addEventListener("change", function () {
            saveChecklistState(Number(this.dataset.index));
        });
    });

    document.querySelectorAll(".comment-input").forEach(function (input) {
        input.addEventListener("input", function () {
            saveChecklistState(Number(this.dataset.index));
        });
    });

    for (let i = 0; i < checklistFiles.length; i++) {
        applyChecklistRowState(i);
        updateStatus(i);
    }
}

function getControl(selector, index) {
    return document.querySelector(`${selector}[data-index="${index}"]`);
}

function applyChecklistRowState(index) {
    const approveCheckbox = getControl(".approve-checkbox", index);
    const revisionCheckbox = getControl(".revision-checkbox", index);
    const inspectorSelect = getControl(".inspector-select", index);
    const commentInput = getControl(".comment-input", index);

    const revisionEnabled = revisionCheckbox.checked;
    const approved = approveCheckbox.checked;

    inspectorSelect.disabled = !revisionEnabled;
    commentInput.disabled = !revisionEnabled;

    if (approved) {
        inspectorSelect.disabled = true;
        commentInput.disabled = true;
    }
}

// =========================
// OPEN PDF
// =========================

function setupPDFButtons() {
    document.querySelectorAll(".pdf-link").forEach(function (button) {
        button.addEventListener("click", async function () {
            const index = Number(this.dataset.index);
            try {
                await openPdfPreview(index);
            } catch (error) {
                console.error("PDF preview error:", error);
                showMessage(`Could not open the PDF preview. ${error.message || error}`, true);
            }
        });
    });
}


// =========================
// IN-APP PDF VIEWER + PERSONAL SIGNATURES
// =========================
let activePdfHandle = null;
let activePdfBytes = null;
let activePdfDocument = null;
let activePdfName = "";
let pdfZoom = 1.0;
let pdfPlacedItems = [];
let pdfPlacementMode = null;
let pdfToastTimer = null;
let uploadedSignatureData = "";

function signatureStorageKey() {
    const userKey = (currentUser || "guest").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    return `spanPersonalSignature:${userKey}`;
}

function getPersonalSignature() {
    try { return JSON.parse(localStorage.getItem(signatureStorageKey()) || "null"); }
    catch (_) { return null; }
}

function savePersonalSignature(data) {
    localStorage.setItem(signatureStorageKey(), JSON.stringify(data));
    renderSavedSignaturePreview();
    pdfViewerToast("Personal signature saved on this device.");
}

function setupPdfViewerControls() {
    const byId = id => document.getElementById(id);
    byId("pdfCloseBtn")?.addEventListener("click", closePdfPreview);
    byId("pdfZoomInBtn")?.addEventListener("click", () => changePdfZoom(0.15));
    byId("pdfZoomOutBtn")?.addEventListener("click", () => changePdfZoom(-0.15));

    // Ctrl + mouse wheel zooms the PDF, not the browser page.
    // Keep this listener non-passive so preventDefault() can block browser zoom.
    const pdfPagesContainer = byId("pdfPagesContainer");
    pdfPagesContainer?.addEventListener("wheel", event => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();

        // A small fixed step keeps zoom predictable across different mouse wheels.
        changePdfZoom(event.deltaY < 0 ? 0.10 : -0.10);
    }, { passive: false });

    byId("pdfPrevPageBtn")?.addEventListener("click", () => scrollPdfPage(-1));
    byId("pdfNextPageBtn")?.addEventListener("click", () => scrollPdfPage(1));
    byId("pdfMySignatureBtn")?.addEventListener("click", openSignatureSettings);
    byId("pdfAddSignatureBtn")?.addEventListener("click", beginSignaturePlacement);
    byId("pdfAddDateBtn")?.addEventListener("click", beginDatePlacement);
    byId("pdfSaveOriginalBtn")?.addEventListener("click", savePdfToOriginal);

    byId("closeSignatureSettingsBtn")?.addEventListener("click", closeSignatureSettings);
    document.querySelector("[data-close-signature-settings]")?.addEventListener("click", closeSignatureSettings);
    document.querySelectorAll("[data-signature-tab]").forEach(button => {
        button.addEventListener("click", () => switchSignatureTab(button.dataset.signatureTab));
    });

    const drawCanvas = byId("signatureDrawCanvas");
    if (drawCanvas) {
        const ctx = drawCanvas.getContext("2d");
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#172554";
        let drawing = false;
        drawCanvas.addEventListener("pointerdown", event => {
            drawing = true;
            drawCanvas.setPointerCapture(event.pointerId);
            const p = canvasPoint(drawCanvas, event);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
        });
        drawCanvas.addEventListener("pointermove", event => {
            if (!drawing) return;
            const p = canvasPoint(drawCanvas, event);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        });
        const stopDrawing = () => { drawing = false; };
        drawCanvas.addEventListener("pointerup", stopDrawing);
        drawCanvas.addEventListener("pointercancel", stopDrawing);
    }

    byId("clearSignatureCanvasBtn")?.addEventListener("click", clearSignatureCanvas);
    byId("saveDrawnSignatureBtn")?.addEventListener("click", saveDrawnSignature);
    byId("typedSignatureName")?.addEventListener("input", event => {
        byId("typedSignaturePreview").textContent = event.target.value || "Your Name";
    });
    byId("saveTypedSignatureBtn")?.addEventListener("click", saveTypedSignature);
    byId("signatureImageUpload")?.addEventListener("change", handleSignatureUpload);
    byId("saveUploadedSignatureBtn")?.addEventListener("click", () => {
        if (!uploadedSignatureData) return;
        savePersonalSignature({ type: "image", dataUrl: uploadedSignatureData, updatedAt: new Date().toISOString() });
        closeSignatureSettings();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            if (!byId("signatureSettingsModal").classList.contains("hidden")) closeSignatureSettings();
            else if (!byId("pdfViewer").classList.contains("hidden")) closePdfPreview();
        }
    });
}

function canvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
}

async function openPdfPreview(index) {
    const entry = checklistFiles[index];
    if (!entry) throw new Error("The selected PDF is no longer in the Draft folder.");

    if (!window.pdfjsLib || !window.PDFLib) {
        throw new Error("The PDF viewer libraries could not be loaded. Check your internet connection and reload the app.");
    }

    activePdfHandle = entry;
    activePdfName = entry.name;
    activePdfBytes = new Uint8Array(await (await entry.getFile()).arrayBuffer());
    pdfPlacedItems = [];
    pdfPlacementMode = null;
    pdfZoom = 1;

    const viewer = document.getElementById("pdfViewer");
    viewer.classList.remove("hidden");
    document.body.classList.add("pdf-viewer-open");
    document.getElementById("pdfViewerFileName").textContent = activePdfName;
    document.getElementById("pdfViewerHint").classList.add("hidden");
    document.getElementById("pdfPagesContainer").innerHTML = '<div class="pdf-viewer-loading">Loading PDF...</div>';

    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    await loadAndRenderActivePdf();
    renderSavedSignaturePreview();
}

async function loadAndRenderActivePdf() {
    const loadingTask = window.pdfjsLib.getDocument({ data: activePdfBytes.slice() });
    activePdfDocument = await loadingTask.promise;
    await renderPdfPages();
}

async function renderPdfPages() {
    const container = document.getElementById("pdfPagesContainer");
    container.innerHTML = "";
    const total = activePdfDocument.numPages;
    document.getElementById("pdfViewerPageInfo").textContent = `Page 1 of ${total}`;
    document.getElementById("pdfZoomLabel").textContent = `${Math.round(pdfZoom * 100)}%`;

    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
        const page = await activePdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: pdfZoom });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);

        const pageWrap = document.createElement("section");
        pageWrap.className = "pdf-page-wrap";
        pageWrap.dataset.pageNumber = String(pageNumber);
        pageWrap.style.width = `${viewport.width}px`;
        pageWrap.style.height = `${viewport.height}px`;

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page-canvas";
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const overlay = document.createElement("div");
        overlay.className = "pdf-page-overlay";
        overlay.dataset.pageIndex = String(pageNumber - 1);
        overlay.addEventListener("click", event => handlePdfPageClick(event, overlay));

        pageWrap.appendChild(canvas);
        pageWrap.appendChild(overlay);
        container.appendChild(pageWrap);

        const context = canvas.getContext("2d");
        await page.render({
            canvasContext: context,
            viewport,
            transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
        }).promise;

        pageWrap.dataset.pdfWidth = String(page.getViewport({ scale: 1 }).width);
        pageWrap.dataset.pdfHeight = String(page.getViewport({ scale: 1 }).height);
        renderPlacedItemsForPage(pageNumber - 1, overlay);
    }

    updatePdfPageIndicator();
}

function updatePdfPageIndicator() {
    const wraps = [...document.querySelectorAll(".pdf-page-wrap")];
    if (!wraps.length) return;
    const containerRect = document.getElementById("pdfPagesContainer").getBoundingClientRect();
    let current = 1;
    let minDistance = Infinity;
    wraps.forEach((wrap, index) => {
        const distance = Math.abs(wrap.getBoundingClientRect().top - containerRect.top - 16);
        if (distance < minDistance) { minDistance = distance; current = index + 1; }
    });
    document.getElementById("pdfViewerPageInfo").textContent = `Page ${current} of ${wraps.length}`;
}

function changePdfZoom(delta) {
    if (!activePdfDocument) return;
    const next = Math.max(0.55, Math.min(2.5, Math.round((pdfZoom + delta) * 100) / 100));
    if (next === pdfZoom) return;
    pdfZoom = next;
    renderPdfPages().catch(error => pdfViewerToast(`Could not change zoom: ${error.message}`, true));
}

function scrollPdfPage(direction) {
    const wraps = [...document.querySelectorAll(".pdf-page-wrap")];
    if (!wraps.length) return;
    const container = document.getElementById("pdfPagesContainer");
    const rect = container.getBoundingClientRect();
    let index = wraps.findIndex(wrap => wrap.getBoundingClientRect().bottom > rect.top + 20);
    if (index < 0) index = wraps.length - 1;
    index = Math.max(0, Math.min(wraps.length - 1, index + direction));
    wraps[index].scrollIntoView({ behavior: "smooth", block: "start" });
}

function beginSignaturePlacement() {
    const signature = getPersonalSignature();
    if (!signature || !signature.dataUrl) {
        openSignatureSettings();
        pdfViewerToast("Create and save your personal signature first.");
        return;
    }
    pdfPlacementMode = { type: "signature", dataUrl: signature.dataUrl };
    showPdfViewerHint("Click anywhere on a PDF page to place your saved signature. You can then move or resize it.");
}

function beginDatePlacement() {
    const dateText = new Date().toLocaleDateString("en-CA");
    pdfPlacementMode = { type: "date", text: dateText, dataUrl: makeTextImage(dateText, true) };
    showPdfViewerHint("Click anywhere on a PDF page to place today's date. Double-click the date to edit it.");
}

function showPdfViewerHint(message) {
    const hint = document.getElementById("pdfViewerHint");
    hint.textContent = message;
    hint.classList.remove("hidden");
}

function handlePdfPageClick(event, overlay) {
    if (!pdfPlacementMode || event.target !== overlay) return;
    const rect = overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const item = {
        id: `pdf-item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        pageIndex: Number(overlay.dataset.pageIndex),
        x: Math.max(0, Math.min(0.78, x - 0.11)),
        y: Math.max(0, Math.min(0.92, y - 0.04)),
        w: 0.22,
        h: 0.08,
        type: pdfPlacementMode.type,
        dataUrl: pdfPlacementMode.dataUrl,
        text: pdfPlacementMode.text || ""
    };
    pdfPlacedItems.push(item);
    renderPlacedItemsForPage(item.pageIndex, overlay);
    pdfPlacementMode = null;
    document.getElementById("pdfViewerHint").classList.add("hidden");
}

function renderPlacedItemsForPage(pageIndex, overlay) {
    overlay.innerHTML = "";
    pdfPlacedItems.filter(item => item.pageIndex === pageIndex).forEach(item => {
        const element = document.createElement("div");
        element.className = `pdf-placed-item ${item.type === "date" ? "pdf-placed-date" : "pdf-placed-signature"}`;
        element.dataset.itemId = item.id;
        element.style.left = `${item.x * 100}%`;
        element.style.top = `${item.y * 100}%`;
        element.style.width = `${item.w * 100}%`;
        element.style.height = `${item.h * 100}%`;

        if (item.type === "signature") {
            const image = document.createElement("img");
            image.src = item.dataUrl;
            image.alt = "Signature";
            element.appendChild(image);
        } else {
            const text = document.createElement("span");
            text.textContent = item.text;
            text.style.fontSize = `${Math.max(8, overlay.clientHeight * item.h * 0.42)}px`;
            element.appendChild(text);
            element.title = "Double-click to edit date";
            element.addEventListener("dblclick", event => {
                event.stopPropagation();
                const revised = prompt("Edit date:", item.text);
                if (revised !== null && revised.trim()) {
                    item.text = revised.trim();
                    item.dataUrl = makeTextImage(item.text, true);
                    renderPlacedItemsForPage(pageIndex, overlay);
                }
            });
        }

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "pdf-item-remove";
        remove.title = "Remove this placement";
        remove.textContent = "×";
        remove.addEventListener("pointerdown", event => event.stopPropagation());
        remove.addEventListener("click", event => {
            event.stopPropagation();
            pdfPlacedItems = pdfPlacedItems.filter(candidate => candidate.id !== item.id);
            renderPlacedItemsForPage(pageIndex, overlay);
        });
        element.appendChild(remove);

        const resize = document.createElement("button");
        resize.type = "button";
        resize.className = "pdf-item-resize";
        resize.title = "Resize";
        resize.textContent = "↘";
        element.appendChild(resize);

        element.addEventListener("pointerdown", event => {
            if (event.target === resize) return;
            startPdfItemDrag(event, item, overlay, element);
        });
        resize.addEventListener("pointerdown", event => {
            event.stopPropagation();
            startPdfItemResize(event, item, overlay, element);
        });
        element.addEventListener("click", event => event.stopPropagation());
        overlay.appendChild(element);
    });
}

function startPdfItemDrag(event, item, overlay, element) {
    event.preventDefault();
    const rect = overlay.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = item.x;
    const initialY = item.y;

    const move = moveEvent => {
        item.x = Math.max(0, Math.min(1 - item.w, initialX + (moveEvent.clientX - startX) / rect.width));
        item.y = Math.max(0, Math.min(1 - item.h, initialY + (moveEvent.clientY - startY) / rect.height));
        element.style.left = `${item.x * 100}%`;
        element.style.top = `${item.y * 100}%`;
    };
    const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
}

function startPdfItemResize(event, item, overlay, element) {
    event.preventDefault();
    const rect = overlay.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialW = item.w;
    const initialH = item.h;
    const move = moveEvent => {
        item.w = Math.max(0.06, Math.min(0.75, initialW + (moveEvent.clientX - startX) / rect.width));
        item.h = Math.max(0.035, Math.min(0.35, initialH + (moveEvent.clientY - startY) / rect.height));
        element.style.width = `${item.w * 100}%`;
        element.style.height = `${item.h * 100}%`;
        const dateText = element.querySelector("span");
        if (dateText) dateText.style.fontSize = `${Math.max(8, overlay.clientHeight * item.h * 0.42)}px`;
    };
    const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
}

async function savePdfToOriginal() {
    if (!activePdfHandle || !activePdfBytes) return;
    if (!pdfPlacedItems.length) {
        pdfViewerToast("Add a signature or date before saving.", true);
        return;
    }
    const saveButton = document.getElementById("pdfSaveOriginalBtn");
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    let writable = null;
    try {
        const permission = await activePdfHandle.queryPermission({ mode: "readwrite" });
        if (permission !== "granted") {
            const requested = await activePdfHandle.requestPermission({ mode: "readwrite" });
            if (requested !== "granted") throw new Error("Write permission was not granted for the original PDF.");
        }

        const pdfDoc = await window.PDFLib.PDFDocument.load(activePdfBytes);
        for (const item of pdfPlacedItems) {
            const page = pdfDoc.getPage(item.pageIndex);
            const { width: pageWidth, height: pageHeight } = page.getSize();
            const x = item.x * pageWidth;
            const width = item.w * pageWidth;
            const height = item.h * pageHeight;
            const y = pageHeight - (item.y * pageHeight) - height;
            const imageBytes = dataUrlToBytes(item.dataUrl);
            const image = await pdfDoc.embedPng(imageBytes);
            page.drawImage(image, { x, y, width, height });
        }

        const savedBytes = await pdfDoc.save();
        writable = await activePdfHandle.createWritable({ keepExistingData: false });
        await writable.write(savedBytes);
        await writable.close();
        writable = null;

        activePdfBytes = new Uint8Array(await (await activePdfHandle.getFile()).arrayBuffer());
        pdfPlacedItems = [];
        await loadAndRenderActivePdf();
        pdfViewerToast("Saved successfully to the original PDF.");
    } catch (error) {
        if (writable) {
            try { await writable.abort(); } catch (_) {}
        }
        console.error("Save signed PDF error:", error);
        pdfViewerToast(`Could not save the original PDF. ${error.message || error}`, true);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save to Original";
    }
}

function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(",")[1] || "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function makeTextImage(text, isDate = false) {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 260;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#172554";
    ctx.textBaseline = "middle";
    ctx.font = isDate ? "58px Arial" : "italic 92px cursive";
    ctx.fillText(text, 24, canvas.height / 2, canvas.width - 48);
    return canvas.toDataURL("image/png");
}

function openSignatureSettings() {
    const modal = document.getElementById("signatureSettingsModal");
    const typedName = document.getElementById("typedSignatureName");
    typedName.value = currentUser || "";
    document.getElementById("typedSignaturePreview").textContent = typedName.value || "Your Name";
    renderSavedSignaturePreview();
    modal.classList.remove("hidden");
}

function closeSignatureSettings() {
    document.getElementById("signatureSettingsModal").classList.add("hidden");
}

function switchSignatureTab(tab) {
    document.querySelectorAll("[data-signature-tab]").forEach(button =>
        button.classList.toggle("active", button.dataset.signatureTab === tab));
    document.querySelectorAll("[data-signature-panel]").forEach(panel =>
        panel.classList.toggle("hidden", panel.dataset.signaturePanel !== tab));
}

function renderSavedSignaturePreview() {
    const preview = document.getElementById("savedSignaturePreview");
    if (!preview) return;
    const signature = getPersonalSignature();
    preview.innerHTML = "";
    if (!signature || !signature.dataUrl) {
        preview.textContent = "No signature saved yet";
        return;
    }
    const image = document.createElement("img");
    image.src = signature.dataUrl;
    image.alt = "Your saved signature";
    preview.appendChild(image);
}

function clearSignatureCanvas() {
    const canvas = document.getElementById("signatureDrawCanvas");
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function trimSignatureCanvas(sourceCanvas) {
    const ctx = sourceCanvas.getContext("2d");
    const { data, width, height } = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < minX) throw new Error("Please draw your signature first.");
    const padding = 18;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);
    const cropped = document.createElement("canvas");
    cropped.width = maxX - minX + 1;
    cropped.height = maxY - minY + 1;
    cropped.getContext("2d").drawImage(sourceCanvas, minX, minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    return cropped.toDataURL("image/png");
}

function saveDrawnSignature() {
    try {
        const dataUrl = trimSignatureCanvas(document.getElementById("signatureDrawCanvas"));
        savePersonalSignature({ type: "draw", dataUrl, updatedAt: new Date().toISOString() });
        closeSignatureSettings();
    } catch (error) { pdfViewerToast(error.message, true); }
}

function saveTypedSignature() {
    const name = document.getElementById("typedSignatureName").value.trim();
    if (!name) { pdfViewerToast("Enter your name for the typed signature.", true); return; }
    savePersonalSignature({ type: "text", name, dataUrl: makeTextImage(name), updatedAt: new Date().toISOString() });
    closeSignatureSettings();
}

function handleSignatureUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
        pdfViewerToast("Please select a PNG or JPG image.", true);
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement("canvas");
            const scale = Math.min(1, 1200 / image.width, 500 / image.height);
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
            uploadedSignatureData = canvas.toDataURL("image/png");
            document.getElementById("saveUploadedSignatureBtn").disabled = false;
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
}

function pdfViewerToast(message, isError = false) {
    const toast = document.getElementById("pdfViewerToast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("error", Boolean(isError));
    toast.classList.remove("hidden");
    clearTimeout(pdfToastTimer);
    pdfToastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

function closePdfPreview() {
    const viewer = document.getElementById("pdfViewer");
    viewer.classList.add("hidden");
    document.body.classList.remove("pdf-viewer-open");
    document.getElementById("pdfPagesContainer").innerHTML = "";
    document.getElementById("pdfViewerHint").classList.add("hidden");
    activePdfHandle = null;
    activePdfBytes = null;
    activePdfDocument = null;
    activePdfName = "";
    pdfPlacedItems = [];
    pdfPlacementMode = null;
}


// =========================
// PROCESS CHECKLIST
// =========================

async function processChecklist() {
    if (!draftFolder) {
        showMessage("Please select the Draft Folder.", true);
        return;
    }
    if (!revisionFolder) {
        showMessage("Please select the Revision Required Folder.", true);
        return;
    }
    if (!approvedFolder) {
        showMessage("Please select the Approved Folder.", true);
        return;
    }

    const permissions = [
        [draftFolder, "draftStatus", "Draft"],
        [revisionFolder, "revisionStatus", "Revision Required"],
        [approvedFolder, "approvedStatus", "Approved"]
    ];

    for (const [handle, statusId, label] of permissions) {
        if (!(await checkFolderPermission(handle))) {
            updateFolderStatus(statusId, "permission");
            showMessage(`Permission is required for the ${label} Folder.`, true);
            return;
        }
        updateFolderStatus(statusId, "connected");
    }

    const rows = [];

    for (let i = 0; i < checklistFiles.length; i++) {
        const approve = getControl(".approve-checkbox", i).checked;
        const revision = getControl(".revision-checkbox", i).checked;
        const inspector = getControl(".inspector-select", i).value.trim();
        const comment = getControl(".comment-input", i).value.trim();

        if (approve && revision) {
            showMessage(`Row ${i + 1} - List: ${removeExtension(checklistFiles[i].name)}\n\nBoth APPROVE and REVISION REQUIRED are selected.\n\nPlease select only one option.`, true);
            return;
        }

        if (revision && !inspector) {
            showMessage(`Row ${i + 1} - List: ${removeExtension(checklistFiles[i].name)}\n\nPlease select an Inspector before processing a revision.`, true);
            return;
        }

        if (revision && !comment) {
            showMessage(`Row ${i + 1} - List: ${removeExtension(checklistFiles[i].name)}\n\nPlease enter a Comment before processing a revision.`, true);
            return;
        }

        rows.push({ file: checklistFiles[i], approve, revision, inspector, comment });
    }

    const rowsToProcess = rows.filter(row => row.approve || row.revision);
    if (rowsToProcess.length === 0) {
        showMessage("No checklist files are selected for processing.", true);
        return;
    }

    updateProgress(0, rowsToProcess.length);

    let approvedCount = 0;
    let revisionCount = 0;
    let processedCount = 0;

    try {
        for (const row of rowsToProcess) {
            const inspectorRecord = findInspector(row.inspector);

            if (row.approve) {
                await moveFile(row.file, draftFolder, approvedFolder);
                delete checklistState[row.file.name];

                await addActivityLog({
                    fileName: row.file.name,
                    action: "Approved",
                    inspector: row.inspector,
                    comment: row.comment,
                    source: draftFolder.name,
                    destination: approvedFolder.name,
                    inspectorEmail: inspectorRecord ? inspectorRecord.email : "",
                    inspectorFolder: inspectorRecord ? inspectorRecord.folderAddress : ""
                });

                approvedCount++;
            } else if (row.revision) {
                await moveFile(row.file, draftFolder, revisionFolder);
                await createCommentFile(row, revisionFolder);
                delete checklistState[row.file.name];

                await addActivityLog({
                    fileName: row.file.name,
                    action: "Revision Required",
                    inspector: row.inspector,
                    comment: row.comment,
                    source: draftFolder.name,
                    destination: revisionFolder.name,
                    inspectorEmail: inspectorRecord ? inspectorRecord.email : "",
                    inspectorFolder: inspectorRecord ? inspectorRecord.folderAddress : ""
                });

                revisionCount++;
            }

            processedCount++;
            updateProgress(processedCount, rowsToProcess.length);
        }

        localStorage.setItem("checklistState", JSON.stringify(checklistState));
        await refreshPDFList();

        showMessage(`Process completed.\n\nApproved: ${approvedCount} file(s)\n\nRevision Required: ${revisionCount} file(s)`, false);
        renderActivityLog();
    } catch (error) {
        console.error("Process error:", error);
        showMessage(`Processing stopped because an error occurred.\n\n${error.message || "Unknown error"}`, true);
    }
}

async function moveFile(fileEntry, sourceFolder, destinationFolder) {
    const file = await fileEntry.getFile();
    const destinationFile = await destinationFolder.getFileHandle(file.name, { create: true });
    const writable = await destinationFile.createWritable();
    await writable.write(file);
    await writable.close();
    await sourceFolder.removeEntry(file.name);
}

async function createCommentFile(row, revisionFolder) {
    const listName = removeExtension(row.file.name);
    const inspector = row.inspector || "Unknown";
    const txtFileName = `${listName} - ${sanitizeFileNamePart(inspector)}.txt`;
    const txtFile = await revisionFolder.getFileHandle(txtFileName, { create: true });
    const writable = await txtFile.createWritable();
    await writable.write(row.comment || "");
    await writable.close();
}

// =========================
// INSPECTOR MANAGEMENT
// =========================

function openInspectorModal(inspectorId = "") {
    const modal = document.getElementById("inspectorModal");
    const form = document.getElementById("inspectorForm");
    form.reset();
    document.getElementById("inspectorEditId").value = inspectorId;
    inspectorFolderHandle = null;

    if (inspectorId) {
        const inspector = inspectors.find(item => item.id === inspectorId);
        if (inspector) {
            document.getElementById("inspectorModalTitle").textContent = "Edit Inspector";
            document.getElementById("inspectorName").value = inspector.name;
            document.getElementById("inspectorEmail").value = inspector.email || "";
            document.getElementById("inspectorFolderAddress").value = inspector.folderAddress || "";
            loadInspectorFolderHandle(inspectorId);
        }
    } else {
        document.getElementById("inspectorModalTitle").textContent = "Add Inspector";
    }

    document.getElementById("inspectorSelectedFolder").textContent = "No folder selected";
    modal.classList.remove("hidden");
    setTimeout(() => document.getElementById("inspectorName").focus(), 0);
}

function closeInspectorModal() {
    document.getElementById("inspectorModal").classList.add("hidden");
    inspectorFolderHandle = null;
}

async function saveInspectorFromForm(event) {
    event.preventDefault();
    if (!supabaseClient) return showMessage("Supabase is not configured.", true);
    const editId=document.getElementById("inspectorEditId").value.trim();
    const id=editId || crypto.randomUUID();
    const name=document.getElementById("inspectorName").value.trim();
    const email=document.getElementById("inspectorEmail").value.trim();
    const folderAddress=document.getElementById("inspectorFolderAddress").value.trim();
    if(!name) return showMessage("Inspector Name is required.", true);
    if(inspectors.some(x=>x.name.toLowerCase()===name.toLowerCase() && x.id!==id)) return showMessage("An inspector with this name already exists.", true);
    if(!editId && inspectors.length>=MAX_INSPECTORS) return showMessage("You can save a maximum of 10 inspectors.", true);
    try {
        const {error}=await supabaseClient.from("inspectors").upsert({id,name,email,folder_address:folderAddress},{onConflict:"id"});
        if(error) throw error;
        if(inspectorFolderHandle) await saveFolderHandle(`inspector:${id}`,inspectorFolderHandle);
        await loadSharedData(); renderInspectorManagement(); renderChecklist(); closeInspectorModal();
        showMessage(`Inspector "${name}" saved successfully.`, false);
    } catch(error) { console.error(error); showMessage(`Could not save Inspector.

${error.message||error}`, true); }
}

async function selectInspectorFolder() {
    try {
        if (!window.showDirectoryPicker) {
            showMessage("Your browser does not support folder access. Please use Microsoft Edge or Google Chrome.", true);
            return;
        }

        inspectorFolderHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        document.getElementById("inspectorSelectedFolder").textContent = inspectorFolderHandle.name;
    } catch (error) {
        if (error && error.name !== "AbortError") {
            console.error("Inspector folder selection error:", error);
            showMessage("Could not select the inspector folder.", true);
        }
    }
}

async function loadInspectorFolderHandle(id) {
    try {
        inspectorFolderHandle = await getSavedFolderHandle(`inspector:${id}`);
        if (inspectorFolderHandle) {
            document.getElementById("inspectorSelectedFolder").textContent = inspectorFolderHandle.name;
        }
    } catch (error) {
        console.error("Could not restore inspector folder handle:", error);
    }
}

function renderInspectorManagement() {
    const container = document.getElementById("inspectorList");
    const limitMessage = document.getElementById("inspectorLimitMessage");
    container.innerHTML = "";

    limitMessage.classList.add("hidden");

    if (inspectors.length === 0) {
        container.innerHTML = `<div class="empty-state">No inspectors saved yet. Click <strong>Add Inspector</strong> to create one.</div>`;
    } else {
        inspectors.forEach(function (inspector) {
            const card = document.createElement("div");
            card.className = "inspector-card";
            card.innerHTML = `
                <div class="inspector-card-top">
                    <div>
                        <h3>${escapeHtml(inspector.name)}</h3>
                        <div class="inspector-meta">
                            <div><strong>Email:</strong> ${escapeHtml(inspector.email || "Not provided")}</div>
                            <div><strong>Folder:</strong> ${escapeHtml(inspector.folderAddress || "Not provided")}</div>
                        </div>
                    </div>
                    <div class="inspector-actions">
                        <button class="icon-button edit-inspector" data-id="${inspector.id}" title="Edit">✎</button>
                        <button class="icon-button delete delete-inspector" data-id="${inspector.id}" title="Delete">×</button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    if (inspectors.length >= MAX_INSPECTORS) {
        limitMessage.textContent = "Inspector limit reached: 10 of 10 inspectors are saved.";
        limitMessage.classList.remove("hidden");
        document.getElementById("addInspectorBtn").disabled = true;
    } else {
        document.getElementById("addInspectorBtn").disabled = false;
    }

    container.querySelectorAll(".edit-inspector").forEach(button => {
        button.addEventListener("click", () => openInspectorModal(button.dataset.id));
    });

    container.querySelectorAll(".delete-inspector").forEach(button => {
        button.addEventListener("click", () => deleteInspector(button.dataset.id));
    });
}

async function deleteInspector(id) {
    const inspector=inspectors.find(x=>x.id===id); if(!inspector) return;
    if(!confirm(`Delete inspector "${inspector.name}"?`)) return;
    if(!supabaseClient) return showMessage("Supabase is not configured.", true);
    try { const {error}=await supabaseClient.from("inspectors").delete().eq("id",id); if(error) throw error; await loadSharedData(); renderInspectorManagement(); renderChecklist(); showMessage(`Inspector "${inspector.name}" was deleted.`,false); }
    catch(error){ console.error(error); showMessage(`Could not delete Inspector.

${error.message||error}`,true); }
}

function findInspector(name) {
    return inspectors.find(item => item.name === name) || null;
}

// =========================
// ACTIVITY LOG
// =========================

async function addActivityLog(data) {
    if(!supabaseClient) throw new Error("Supabase is not configured.");
    const {error}=await supabaseClient.from("activity_log").insert({
        user_name:currentUser, file_name:data.fileName||"", action:data.action||"", inspector:data.inspector||"",
        inspector_email:data.inspectorEmail||"", inspector_folder:data.inspectorFolder||"", comment:data.comment||"",
        source:data.source||"", destination:data.destination||""
    });
    if(error) throw error;
    await loadSharedData();
}

async function loadSharedData() {
    if(!supabaseClient) return;
    try {
        const [i,l]=await Promise.all([
            supabaseClient.from("inspectors").select("*").order("name",{ascending:true}),
            supabaseClient.from("activity_log").select("*").order("timestamp",{ascending:false})
        ]);
        if(i.error) throw i.error; if(l.error) throw l.error;
        inspectors=(i.data||[]).map(x=>({id:x.id,name:x.name||"",email:x.email||"",folderAddress:x.folder_address??x.folderAddress??""}));
        activityLog=(l.data||[]).map(x=>({timestamp:x.timestamp,user:x.user_name??x.user??"",fileName:x.file_name??"",action:x.action??"",inspector:x.inspector??"",inspectorEmail:x.inspector_email??"",inspectorFolder:x.inspector_folder??"",comment:x.comment??"",source:x.source??"",destination:x.destination??""}));
    } catch(error){ console.error("Supabase load error:",error); showMessage(`Could not load shared data.

${error.message||error}`,true); }
}

function renderActivityLog() {
    const tbody = document.getElementById("activityBody");
    const empty = document.getElementById("emptyActivity");
    const count = document.getElementById("logCount");

    tbody.innerHTML = "";
    count.textContent = `${activityLog.length} ${activityLog.length === 1 ? "entry" : "entries"}`;

    if (activityLog.length === 0) {
        empty.classList.remove("hidden");
        return;
    }

    empty.classList.add("hidden");

    activityLog.forEach(function (entry) {
        const row = document.createElement("tr");
        const actionClass = entry.action === "Approved" ? "approved" : "revision";
        row.innerHTML = `
            <td>${escapeHtml(formatDateTime(entry.timestamp))}</td>
            <td>${escapeHtml(entry.user)}</td>
            <td>${escapeHtml(removeExtension(entry.fileName))}</td>
            <td><span class="log-action ${actionClass}">${escapeHtml(entry.action)}</span></td>
            <td>${escapeHtml(entry.inspector || "—")}</td>
            <td>${escapeHtml(entry.inspectorEmail || "—")}</td>
            <td class="log-comment">${escapeHtml(entry.comment || "—")}</td>
            <td>${escapeHtml(entry.source || "—")}</td>
            <td>${escapeHtml(entry.destination || "—")}</td>
            <td>${escapeHtml(entry.inspectorFolder || "—")}</td>
        `;
        tbody.appendChild(row);
    });
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function exportActivityLogCSV() {
    if (activityLog.length === 0) {
        showMessage("There is no activity to export.", true);
        return;
    }

    const headers = [
        "Date / Time",
        "User",
        "File Name",
        "Action",
        "Inspector",
        "Inspector Email",
        "Inspector Folder",
        "Comment",
        "Source",
        "Destination"
    ];

    const rows = activityLog.map(entry => [
        formatDateTime(entry.timestamp),
        entry.user,
        entry.fileName,
        entry.action,
        entry.inspector,
        entry.inspectorEmail,
        entry.inspectorFolder,
        entry.comment,
        entry.source,
        entry.destination
    ]);

    const csv = [headers, ...rows]
        .map(row => row.map(csvEscape).join(","))
        .join("\r\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SPAN_Erection_Activity_Log_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showMessage("Activity Log exported successfully as CSV.", false);
}

async function clearActivityLog() {
    if(!activityLog.length) return showMessage("The Activity Log is already empty.",false);
    if(!confirm("Clear the complete Activity Log? This cannot be undone.")) return;
    try {
        const {error}=await supabaseClient.from("activity_log").delete().not("id","is",null);
        if(error) throw error; await loadSharedData(); renderActivityLog(); showMessage("Activity Log cleared.",false);
    } catch(error){ console.error(error); showMessage(`Could not clear Activity Log.

${error.message||error}`,true); }
}

function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

// =========================
// MESSAGE / STATUS / FILTER
// =========================

function showMessage(message, isError) {
    const messageBox = document.getElementById("messageBox");
    messageBox.textContent = message;
    messageBox.classList.remove("hidden");
    messageBox.classList.toggle("error", Boolean(isError));
}

function updateStatus(index) {
    const approve = getControl(".approve-checkbox", index).checked;
    const revision = getControl(".revision-checkbox", index).checked;
    const status = getControl(".status", index);

    status.className = "status";

    if (approve) {
        status.textContent = "Approved";
        status.classList.add("approved");
    } else if (revision) {
        status.textContent = "Revision Required";
        status.classList.add("revision");
    } else {
        status.textContent = "Pending";
        status.classList.add("pending");
    }
}

function filterChecklist() {
    const searchText = document.getElementById("searchInput").value.toLowerCase().trim();
    const selectedStatus = document.getElementById("statusFilter").value;
    const rows = document.querySelectorAll("#checklistBody tr");

    rows.forEach(function (row, index) {
        const file = checklistFiles[index];
        if (!file) return;

        const fileName = removeExtension(file.name).toLowerCase();
        const statusElement = row.querySelector(".status");
        let status = "pending";

        if (statusElement.classList.contains("approved")) status = "approved";
        if (statusElement.classList.contains("revision")) status = "revision";

        const matchesSearch = fileName.includes(searchText);
        const matchesStatus = selectedStatus === "all" || selectedStatus === status;
        row.style.display = matchesSearch && matchesStatus ? "" : "none";
    });
}

function saveChecklistState(index) {
    const file = checklistFiles[index];
    if (!file) return;

    checklistState[file.name] = {
        approve: getControl(".approve-checkbox", index).checked,
        revision: getControl(".revision-checkbox", index).checked,
        inspector: getControl(".inspector-select", index).value,
        comment: getControl(".comment-input", index).value
    };

    localStorage.setItem("checklistState", JSON.stringify(checklistState));
}

// =========================
// DATABASE / FOLDER HANDLES
// =========================

function openDatabase() {
    return new Promise(function (resolve, reject) {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function () {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = function () {
            resolve(request.result);
        };

        request.onerror = function () {
            reject(request.error);
        };
    });
}

async function saveFolderHandle(name, handle) {
    const db = await openDatabase();

    return new Promise(function (resolve, reject) {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.put(handle, name);

        transaction.oncomplete = function () {
            db.close();
            resolve();
        };

        transaction.onerror = function () {
            db.close();
            reject(transaction.error);
        };
    });
}

async function getSavedFolderHandle(name) {
    const db = await openDatabase();

    return new Promise(function (resolve, reject) {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(name);

        request.onsuccess = function () {
            db.close();
            resolve(request.result || null);
        };

        request.onerror = function () {
            db.close();
            reject(request.error);
        };
    });
}

async function restoreSavedFolders() {
    try {
        draftFolder = await getSavedFolderHandle("draft");
        revisionFolder = await getSavedFolderHandle("revision");
        approvedFolder = await getSavedFolderHandle("approved");

        if (draftFolder) {
            updateWorkflowFolderUI("draft", draftFolder);
            updateFolderStatus("draftStatus", "permission");
        }
        if (revisionFolder) {
            updateWorkflowFolderUI("revision", revisionFolder);
            updateFolderStatus("revisionStatus", "permission");
        }
        if (approvedFolder) {
            updateWorkflowFolderUI("approved", approvedFolder);
            updateFolderStatus("approvedStatus", "permission");
        }
    } catch (error) {
        console.error("Could not restore saved folders:", error);
    }
}

async function checkFolderPermission(handle) {
    if (!handle) return false;

    try {
        const permission = await handle.queryPermission({ mode: "readwrite" });
        if (permission === "granted") return true;

        const requestedPermission = await handle.requestPermission({ mode: "readwrite" });
        return requestedPermission === "granted";
    } catch (error) {
        console.error("Permission error:", error);
        return false;
    }
}

function updateFolderStatus(elementId, status) {
    const element = document.getElementById(elementId);
    element.className = "folder-status";

    if (status === "connected") {
        element.textContent = "Connected";
        element.classList.add("connected");
    } else if (status === "permission") {
        element.textContent = "Permission Required";
        element.classList.add("permission");
    } else {
        element.textContent = "Not Connected";
        element.classList.add("disconnected");
    }
}

// =========================
// PROGRESS
// =========================

function updateProgress(current, total) {
    const container = document.getElementById("progressContainer");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const progressPercent = document.getElementById("progressPercent");

    if (total === 0) {
        container.classList.add("hidden");
        return;
    }

    container.classList.remove("hidden");
    const percent = Math.round((current / total) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `Processing ${current} of ${total}...`;
    progressPercent.textContent = `${percent}%`;
}

// =========================
// HELPERS
// =========================

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function sanitizeFileNamePart(value) {
    return String(value || "Unknown").replace(/[\\/:*?"<>|]/g, "_").trim() || "Unknown";
}


function showSubpage(pageId) {
    document.querySelectorAll(".subpage").forEach(e=>e.classList.add("hidden"));
    document.querySelectorAll(".main-page-section").forEach(e=>e.classList.remove("hidden"));
    if(pageId){ document.querySelectorAll(".main-page-section").forEach(e=>e.classList.add("hidden")); const p=document.getElementById(pageId); if(p)p.classList.remove("hidden"); window.scrollTo({top:0,behavior:"smooth"}); }
}
