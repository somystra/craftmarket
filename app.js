/* ==========================================================================
   CraftOrbit — app.js
   Vanilla ES6+. Firebase Auth + Firestore + YouTube Data API v3 verification.
   ========================================================================== */

/* ---------- 1. Firebase config & init ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyBqKqszWBCMrKIjN0Wb9PxC7wArkjd5FSU",
  authDomain: "netchat-52007.firebaseapp.com",
  databaseURL: "https://netchat-52007-default-rtdb.firebaseio.com",
  projectId: "netchat-52007",
  storageBucket: "netchat-52007.firebasestorage.app",
  messagingSenderId: "145404562699",
  appId: "1:145404562699:web:5eeb4c6abc3e18675b660e",
  measurementId: "G-YKM3J5YR9F"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ---------- 2. Channel / admin constants ---------- */
const YOUTUBE_CHANNEL_ID = "UCKdUT9Kd8k-n38C1JXgLzTQ";
const CHANNEL_NAME = "CraftOrbit";
const ADMIN_EMAIL = "akmalsomirzaev64@gmail.com";
const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/channel/${YOUTUBE_CHANNEL_ID}?sub_confirmation=1`;

/* In-memory session state (never persisted to localStorage) */
let currentUser = null;      // Firebase user object
let currentAccessToken = null; // OAuth access token w/ youtube.readonly scope
let pendingWorld = null;     // world object the modal is currently unlocking

/* ---------- 3. DOM refs ---------- */
const $ = (sel) => document.querySelector(sel);

const chunkLoader   = $('#chunk-loader');
const authSlot      = $('#auth-slot');
const adminSection  = $('#admin-section');
const worldForm     = $('#world-form');
const formStatus    = $('#form-status');
const worldsGrid    = $('#worlds-grid');

const modalOverlay      = $('#modal-overlay');
const modalClose        = $('#modal-close');
const modalWorldName    = $('#modal-world-name');
const modalText         = $('#modal-text');
const modalStatus       = $('#modal-status');
const modalActions      = $('#modal-actions');
const openChannelBtn    = $('#open-channel-btn');
const verifyBtn         = $('#verify-btn');
const downloadLinkBtn   = $('#download-link-btn');

/* ---------- 4. Boot ---------- */
window.addEventListener('load', () => {
  $('#year').textContent = new Date().getFullYear();
  // Give the chunk-loader a beat so the animation reads intentionally,
  // then reveal the page.
  setTimeout(() => chunkLoader.classList.add('hidden'), 700);
});

/* ---------- 5. Auth ---------- */
function buildGoogleProvider() {
  const provider = new firebase.auth.GoogleAuthProvider();
  // Needed to check the user's own subscriptions via YouTube Data API v3.
  provider.addScope('https://www.googleapis.com/auth/youtube.readonly');
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

async function signIn() {
  try {
    const result = await auth.signInWithPopup(buildGoogleProvider());
    const credential = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
    currentAccessToken = credential?.accessToken || null;
    currentUser = result.user;
    return currentUser;
  } catch (err) {
    console.error('Sign-in failed:', err);
    alert('Sign-in was cancelled or failed. Please try again.');
    return null;
  }
}

async function signOutUser() {
  await auth.signOut();
  currentUser = null;
  currentAccessToken = null;
}

auth.onAuthStateChanged((user) => {
  currentUser = user;
  renderAuthUI(user);
  toggleAdminSection(user);
});

function renderAuthUI(user) {
  if (!user) {
    authSlot.innerHTML = `
      <button id="login-btn" class="btn btn-neon">
        <span>Login with Google</span>
      </button>`;
    $('#login-btn').addEventListener('click', signIn);
    return;
  }

  const isAdmin = user.email === ADMIN_EMAIL;
  authSlot.innerHTML = `
    <div class="user-chip">
      ${isAdmin ? '<span class="admin-tag">ADMIN</span>' : ''}
      <img src="${user.photoURL || ''}" alt="${user.displayName || 'User'}" referrerpolicy="no-referrer">
      <button id="logout-btn" class="btn btn-outline">Logout</button>
    </div>`;
  $('#logout-btn').addEventListener('click', signOutUser);
}

function toggleAdminSection(user) {
  const isAdmin = !!user && user.email === ADMIN_EMAIL;
  adminSection.hidden = !isAdmin;
}

/* ---------- 6. Admin: world upload form ---------- */
worldForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!currentUser || currentUser.email !== ADMIN_EMAIL) {
    setFormStatus('Not authorized.', true);
    return;
  }

  const world = {
    title: $('#w-title').value.trim(),
    version: $('#w-version').value.trim(),
    optifine: $('#w-optifine').checked,
    description: $('#w-desc').value.trim(),
    imageUrl: $('#w-image').value.trim(),
    downloadUrl: $('#w-link').value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    setFormStatus('Publishing…');
    await db.collection('worlds').add(world);
    setFormStatus('World published ✔');
    worldForm.reset();
    $('#w-optifine').checked = true;
  } catch (err) {
    console.error('Publish failed:', err);
    setFormStatus('Failed to publish. Check Firestore rules/console.', true);
  }
});

function setFormStatus(msg, isError = false) {
  formStatus.textContent = msg;
  formStatus.classList.toggle('error', isError);
}

/* ---------- 7. Worlds grid: live Firestore listener ---------- */
db.collection('worlds').orderBy('createdAt', 'desc').onSnapshot(
  (snapshot) => {
    // Remove previously-rendered dynamic cards (keep static placeholders).
    worldsGrid.querySelectorAll('[data-dynamic="true"]').forEach((n) => n.remove());

    snapshot.forEach((doc) => {
      const world = { id: doc.id, ...doc.data() };
      worldsGrid.insertAdjacentHTML('beforeend', renderWorldCard(world));
    });

    attachUnlockHandlers();
  },
  (err) => console.error('Firestore listener error:', err)
);

function renderWorldCard(world) {
  const img = world.imageUrl || '';
  return `
    <article class="world-card" data-dynamic="true" data-id="${world.id}">
      <div class="world-card-image" style="background-image:url('${escapeHtml(img)}')">
        <span class="badge badge-version">${escapeHtml(world.version || '')}</span>
        ${world.optifine ? '<span class="badge badge-optifine">OptiFine</span>' : ''}
      </div>
      <div class="world-card-body">
        <h3>${escapeHtml(world.title || 'Untitled World')}</h3>
        <p>${escapeHtml(world.description || '')}</p>
        <button class="btn btn-locked" data-action="unlock" data-id="${world.id}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3" y="6" width="8" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 6V4a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" stroke-width="1.4"/></svg>
          <span>Unlock Download</span>
        </button>
      </div>
    </article>`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/* Static placeholder cards' download links (no Firestore doc behind them) */
const PLACEHOLDER_WORLDS = {
  0: { title: 'CraftOrbit Survival World V1', downloadUrl: '#', name: 'CraftOrbit Survival World V1' },
  1: { title: 'CraftOrbit Skyblock: Genesis', downloadUrl: '#', name: 'CraftOrbit Skyblock: Genesis' },
};

function attachUnlockHandlers() {
  document.querySelectorAll('[data-action="unlock"]').forEach((btn) => {
    btn.onclick = () => handleUnlockClick(btn);
  });
}

// Attach handlers for the two static placeholder cards on first load too.
document.querySelectorAll('.world-card[data-placeholder="true"] [data-action="unlock"]').forEach((btn, i) => {
  btn.dataset.placeholderIndex = i;
  btn.onclick = () => handleUnlockClick(btn);
});

/* ---------- 8. Unlock / subscription verification flow ---------- */
async function handleUnlockClick(btn) {
  // Resolve which world this button refers to.
  let world;
  if (btn.dataset.id) {
    world = await getWorldById(btn.dataset.id);
  } else {
    const idx = btn.dataset.placeholderIndex;
    world = PLACEHOLDER_WORLDS[idx];
  }
  if (!world) return;

  pendingWorld = { ...world, _btn: btn };

  // 1. Require Google sign-in first.
  if (!currentUser) {
    const user = await signIn();
    if (!user) return; // cancelled
  }

  openModal();
}

async function getWorldById(id) {
  try {
    const snap = await db.collection('worlds').doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.error('Failed to fetch world:', err);
    return null;
  }
}

function openModal() {
  modalWorldName.textContent = `◈ ${pendingWorld.title || 'WORLD LOCKED'}`;
  modalText.textContent = `Subscribe to ${CHANNEL_NAME} on YouTube, then verify your subscription to unlock this download.`;
  modalStatus.hidden = true;
  modalStatus.className = 'modal-status';
  modalActions.hidden = false;
  downloadLinkBtn.hidden = true;
  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
  pendingWorld = null;
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

openChannelBtn.addEventListener('click', () => {
  window.open(YOUTUBE_CHANNEL_URL, '_blank', 'noopener');
});

verifyBtn.addEventListener('click', async () => {
  await verifySubscription();
});

async function verifySubscription() {
  if (!currentAccessToken) {
    // Access token missing (e.g. returning session) — re-auth to obtain
    // a fresh token carrying the youtube.readonly scope.
    modalStatus.hidden = false;
    modalStatus.className = 'modal-status pending';
    modalStatus.textContent = 'Refreshing Google session…';
    const user = await signIn();
    if (!user || !currentAccessToken) {
      modalStatus.className = 'modal-status denied';
      modalStatus.textContent = 'Could not verify — please try signing in again.';
      return;
    }
  }

  verifyBtn.disabled = true;
  modalStatus.hidden = false;
  modalStatus.className = 'modal-status pending';
  modalStatus.textContent = 'Tekshirilmoqda… checking your subscription…';

  try {
    const isSubscribed = await checkYouTubeSubscription(currentAccessToken, YOUTUBE_CHANNEL_ID);

    if (isSubscribed) {
      modalStatus.className = 'modal-status pending';
      modalStatus.textContent = 'Subscription confirmed ✔';
      modalActions.hidden = true;
      downloadLinkBtn.hidden = false;
      downloadLinkBtn.href = pendingWorld.downloadUrl || '#';

      // Reflect unlocked state on the underlying card button too.
      if (pendingWorld._btn) {
        pendingWorld._btn.outerHTML = `
          <a class="btn btn-unlocked" href="${escapeHtml(pendingWorld.downloadUrl || '#')}" target="_blank" rel="noopener">
            <span>Download World</span>
          </a>`;
      }
    } else {
      modalStatus.className = 'modal-status denied';
      modalStatus.textContent = 'Not subscribed yet. Subscribe, then check again.';
      window.open(YOUTUBE_CHANNEL_URL, '_blank', 'noopener');
      verifyBtn.textContent = 'Check Again';
    }
  } catch (err) {
    console.error('YouTube verification failed:', err);
    modalStatus.className = 'modal-status denied';
    modalStatus.textContent = 'Verification failed. Please try again.';
  } finally {
    verifyBtn.disabled = false;
  }
}

/**
 * Calls YouTube Data API v3 subscriptions.list with mine=true, scoped to
 * a single channel via forChannelId. Returns true if the signed-in user
 * is subscribed to YOUTUBE_CHANNEL_ID.
 */
async function checkYouTubeSubscription(accessToken, channelId) {
  const url = new URL('https://www.googleapis.com/youtube/v3/subscriptions');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('mine', 'true');
  url.searchParams.set('forChannelId', channelId);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    // 401 usually means the access token expired — force a re-auth next time.
    if (res.status === 401) currentAccessToken = null;
    throw new Error(`YouTube API error: ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data.items) && data.items.length > 0;
}
