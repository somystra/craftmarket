// Firebase modullarini import qilish
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from "firebase/firestore";

// 1. FIREBASE KONFIGURATSIYANGIZ
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

// Firebase xizmatlarini ishga tushirish
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// YouTube API uchun zarur bo'lgan scope
provider.addScope('https://www.googleapis.com/auth/youtube.readonly');

// GLOBAL O'ZGARUVCHILAR
const ADMIN_EMAIL = "akmalsomirzaev64@gmail.com";
const CHANNEL_ID = "UCKdUT9Kd8k-n38C1JXgLzTQ"; 
let currentUser = null;
let userAccessToken = null; 
let allWorlds = []; 
let activeDownloadLink = null; 

// DOM Elementlari
const loginGate = document.getElementById("login-gate");
const mainContent = document.getElementById("main-content");
const btnGoogleLogin = document.getElementById("btn-google-login");
const btnLogout = document.getElementById("btn-logout");
const userAvatar = document.getElementById("user-avatar");
const adminSection = document.getElementById("admin-section");
const adminForm = document.getElementById("admin-upload-form");
const worldsGrid = document.getElementById("worlds-grid");
const searchBar = document.getElementById("search-bar");

// Modal Elementlari
const subModal = document.getElementById("sub-modal");
const closeModal = document.querySelector(".close-modal");
const btnVerifySub = document.getElementById("btn-verify-sub");
const modalErrorMsg = document.getElementById("modal-error-msg");

// 2. GOOGLE LOGIN TUGMASI HODISASI
btnGoogleLogin.addEventListener("click", async () => {
    console.log("Login tugmasi bosildi..."); // Brauzer konsolida tekshirish uchun
    try {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        userAccessToken = credential.accessToken;
        console.log("Tizimga muvaffaqiyatli kirildi!");
    } catch (error) {
        console.error("Tizimga kirishda xatolik yuz berdi:", error);
        alert("Xatolik: " + error.message + "\nIltimos, brauzer konsolini (F12) tekshiring.");
    }
});

// Logout logikasi
btnLogout.addEventListener("click", () => {
    signOut(auth).then(() => {
        window.location.reload();
    });
});

// Foydalanuvchi holatini doimiy kuzatib turish
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginGate.classList.add("hidden");
        mainContent.classList.remove("hidden");
        userAvatar.src = user.photoURL || "https://via.placeholder.com/40";
        
        // Admin tekshiruvi
        if (user.email === ADMIN_EMAIL) {
            adminSection.classList.remove("hidden");
        } else {
            adminSection.classList.add("hidden");
        }
        
        listenToWorlds();
    } else {
        loginGate.classList.remove("hidden");
        mainContent.classList.add("hidden");
    }
});

// 3. ADMIN: FIRESTORE'GA RASM LINKI BILAN SAQLASH (TEKIN VARIANT)
adminForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const title = document.getElementById("world-title").value;
    const version = document.getElementById("world-version").value;
    const optifine = document.getElementById("world-optifine").checked;
    const desc = document.getElementById("world-desc").value;
    const imageURL = document.getElementById("world-image-url").value; // Linkni olish
    const downloadLink = document.getElementById("world-link").value;
    
    document.getElementById("btn-submit-world").disabled = true;
    
    try {
        await addDoc(collection(db, "worlds"), {
            title: title,
            version: version,
            optifine: optifine,
            description: desc,
            imageUrl: imageURL,
            downloadLink: downloadLink,
            createdAt: new Date()
        });
        
        alert("Yangi dunyo muvaffaqiyatli qo'shildi!");
        adminForm.reset();
    } catch (err) {
        console.error("Firestore'ga yozishda xatolik:", err);
        alert("Bazaga yozishda xatolik: " + err.message);
    } finally {
        document.getElementById("btn-submit-world").disabled = false;
    }
});

// 4. FIRESTORE'DAN DUNYOLARNI O'QISH
function listenToWorlds() {
    const q = query(collection(db, "worlds"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        allWorlds = [];
        if (snapshot.empty) {
            showPlaceholders();
            return;
        }
        snapshot.forEach((doc) => {
            allWorlds.push({ id: doc.id, ...doc.data() });
        });
        renderWorlds(allWorlds);
    });
}

function renderWorlds(worlds) {
    worldsGrid.innerHTML = "";
    worlds.forEach(world => {
        const card = document.createElement("div");
        card.className = "world-card";
        card.innerHTML = `
            <div class="world-img-container">
                <img src="${world.imageUrl}" alt="${world.title}" class="world-img" onerror="this.src='https://via.placeholder.com/350x180?text=Minecraft+World'">
                <div class="badge-container">
                    <span class="badge">Versiya: ${world.version}</span>
                    ${world.optifine ? '<span class="badge optifine">OptiFine</span>' : ''}
                </div>
            </div>
            <div class="world-info">
                <h3 class="world-title">${world.title}</h3>
                <p class="world-desc">${world.description}</p>
                <button class="neon-btn btn-unlock" data-link="${world.downloadLink}">
                    <i class="fas fa-lock"></i> Yuklab olishni ochish
                </button>
            </div>
        `;
        worldsGrid.appendChild(card);
    });
    
    document.querySelectorAll(".btn-unlock").forEach(btn => {
        btn.addEventListener("click", (e) => {
            activeDownloadLink = e.currentTarget.getAttribute("data-link");
            if (currentUser && currentUser.email === ADMIN_EMAIL) {
                window.open(activeDownloadLink, '_blank');
            } else {
                openSubModal();
            }
        });
    });
}

// 5. JONLI QIDIRUV
searchBar.addEventListener("input", (e) => {
    const queryText = e.target.value.toLowerCase().trim();
    const filteredWorlds = allWorlds.filter(world => {
        return world.title.toLowerCase().includes(queryText) || 
               world.version.toLowerCase().includes(queryText) || 
               world.description.toLowerCase().includes(queryText);
    });
    renderWorlds(filteredWorlds);
});

// 6. MODAL VA YOUTUBE TEKSHIRUV
function openSubModal() {
    subModal.classList.remove("hidden");
    modalErrorMsg.classList.add("hidden");
}

closeModal.addEventListener("click", () => subModal.classList.add("hidden"));

btnVerifySub.addEventListener("click", async () => {
    btnVerifySub.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Tekshirilmoqda...`;
    btnVerifySub.disabled = true;
    
    if (!userAccessToken) {
        alert("Sessiya eskirgan. Iltimos qayta kiring.");
        btnVerifySub.innerHTML = `<i class="fas fa-check-circle"></i> 2. Tekshirish`;
        btnVerifySub.disabled = false;
        return;
    }

    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&forChannelId=${CHANNEL_ID}&mine=true`, {
            headers: {
                'Authorization': `Bearer ${userAccessToken}`,
                'Accept': 'application/json'
            }
        });
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            modalErrorMsg.classList.add("hidden");
            subModal.classList.add("hidden");
            window.open(activeDownloadLink, '_blank');
        } else {
            modalErrorMsg.classList.remove("hidden");
        }
    } catch (error) {
        console.error("YouTube API xatolik:", error);
        alert("Obunani aniqlab bo'lmadi.");
    } finally {
        btnVerifySub.innerHTML = `<i class="fas fa-check-circle"></i> 2. Tekshirish`;
        btnVerifySub.disabled = false;
    }
});

function showPlaceholders() {
    const dummyWorlds = [
        {
            title: "CraftOrbit Survival World V1",
            version: "1.20.1",
            optifine: true,
            description: "Chiroyli shaderlar uchun optimizatsiya qilingan, barcha avtomatik fermalar qurilgan va ulkan geymerlar bazasiga ega ilk omon qolish dunyomiz.",
            downloadLink: "https://www.mediafire.com",
            imageUrl: "https://via.placeholder.com/350x180?text=CraftOrbit+World"
        }
    ];
    renderWorlds(dummyWorlds);
}
