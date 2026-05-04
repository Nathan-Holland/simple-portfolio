// ── Supabase helpers ─────────────────────────────────────
async function supabaseInsert(item) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/items`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(item)
    });
    if (!res.ok) throw new Error(await res.text());
}

// ── OG metadata fetch ────────────────────────────────────
async function fetchMeta(url) {
    try {
        const res  = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        const html = data.contents || '';
        const get  = prop => {
            const m = html.match(new RegExp(`${prop}[^>]*content="([^"]+)"`));
            return m ? m[1] : null;
        };
        const title = (get('og:title') || get('twitter:title') || '').split(' - ')[0].trim();
        const image = get('og:image') || get('twitter:image');
        const pm    = html.match(/"price":"([^"]+)"/);
        const sym   = url.includes('/es/') ? '€' : url.includes('/gb/') ? '£' : '$';
        const price = pm ? sym + pm[1] : null;
        return { title, image, price };
    } catch { return {}; }
}

// ── UI helpers ───────────────────────────────────────────
const statusEl   = document.getElementById('status');
const previewImg = document.getElementById('preview-img');
const titleInput = document.getElementById('title-input');
const urlInput   = document.getElementById('url-input');
const catSelect  = document.getElementById('cat-select');
const priceField = document.getElementById('price-field');
const priceInput = document.getElementById('price-input');
const saveBtn    = document.getElementById('save-btn');

let savedImageUrl = null;

function showPreview(src) {
    if (!src) return;
    savedImageUrl = src;
    previewImg.src = src;
    previewImg.onload  = () => previewImg.classList.add('loaded');
    previewImg.onerror = () => { previewImg.classList.remove('loaded'); savedImageUrl = null; };
}

function setStatus(msg) { statusEl.textContent = msg; }

catSelect.addEventListener('change', () => {
    const cat = catSelect.value;
    priceField.style.display = (cat === 'interior' || cat === 'fashion') ? 'flex' : 'none';
});

// ── Init: check for pending item or read active tab ──────
async function init() {
    setStatus('Loading…');

    // Check for pending item from right-click context menu
    const { pendingItem } = await chrome.storage.local.get('pendingItem');

    if (pendingItem) {
        await chrome.storage.local.remove('pendingItem');

        if (pendingItem.type === 'image') {
            showPreview(pendingItem.imageUrl);
            urlInput.value   = pendingItem.pageUrl || '';
            titleInput.value = pendingItem.title || '';
            setStatus('Image captured');
            // Try to fetch page meta for title
            if (pendingItem.pageUrl) {
                const meta = await fetchMeta(pendingItem.pageUrl);
                if (meta.title) titleInput.value = meta.title;
                if (meta.price) priceInput.value = meta.price;
            }
        } else {
            urlInput.value = pendingItem.pageUrl || '';
            titleInput.value = pendingItem.title || '';
            setStatus('Fetching…');
            const meta = await fetchMeta(pendingItem.pageUrl);
            if (meta.title) titleInput.value = meta.title;
            if (meta.image) showPreview(meta.image);
            if (meta.price) priceInput.value = meta.price;
            setStatus('');
        }
        return;
    }

    // Default: read the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { setStatus(''); return; }

    urlInput.value   = tab.url;
    titleInput.value = tab.title || '';

    setStatus('Fetching…');
    const meta = await fetchMeta(tab.url);
    if (meta.title) titleInput.value = meta.title;
    if (meta.image) showPreview(meta.image);
    if (meta.price) priceInput.value = meta.price;
    setStatus('');
}

// ── Save ─────────────────────────────────────────────────
saveBtn.addEventListener('click', async () => {
    const title    = titleInput.value.trim();
    const url      = urlInput.value.trim();
    const category = catSelect.value;

    if (!title && !url) return;

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    const item = {
        title:    title || new URL(url).hostname.replace('www.', ''),
        url:      url || '#',
        category,
        image:    savedImageUrl || null,
        price:    priceInput.value.trim() || null
    };

    try {
        await supabaseInsert(item);
        saveBtn.textContent = 'Saved ✓';
        saveBtn.classList.add('saved');
        setTimeout(() => window.close(), 800);
    } catch (err) {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save';
        setStatus('Error — check config');
        console.error(err);
    }
});

init();
