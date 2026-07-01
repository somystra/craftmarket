// Firebase modullarini import qilish
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

// 1. SIZNING TAYYOR FIREBASE KONFIGURATSIYANGIZ
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
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

// YouTube API uchun zarur bo'lgan scopelarni qo'shish (Obunani tekshirish uchun)
provider.addScope('https://www.googleapis.com/auth/youtube.readonly');

// 2. GLOBAL O'ZGARUVCHILAR VA DOIMIYLAR
const ADMIN_EMAIL = "akmalsomirzaev64@gmail.com";
const CHANNEL_ID = "UCKdUT9Kd8k-n38C1JXgLzTQ"; // CraftOrbit Channel ID
let currentUser = null;
let userAccessToken = null; // YouTube API uchun token
let allWorlds = []; // Qidiruv filtratsiyasi uchun kesh
let activeDownloadLink = null; // Modal oynada ochilishi kerak bo'lgan link

// DOM Elementlarini ushlab olish
const loginGate = document.getElementById("login-gate");
const mainContent = document.getElementById("main-content");
const btnGoogleLogin = document.getElementById("btn-google-login");
const btnLogout = document.getElementById("btn-logout");
const userAvatar = document.getElementById("user-avatar");
const adminSection = document.getElementById("admin-section");
const adminForm = document.getElementById("admin-upload-form");
const progressBar = document.querySelector(".progress-bar");
const progressBarContainer = document.getElementById("upload-progress");
const worldsGrid = document.getElementById("worlds-grid");
const searchBar = document.getElementById("search-bar");

// Modal Elementlari
const subModal = document.getElementById("sub-modal");
const closeModal = document.querySelector(".close-modal");
const btnVerifySub = document.getElementById("btn-verify-sub");
const modalErrorMsg = document.getElementById("modal-error-msg");

// 3. AUTHENTICATION (GOOGLE TIZIMIGA KIRISH) LOGIKASI
btnGoogleLogin.addEventListener("click", async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        // Google OAuth muvaffaqiyatli bo'lsa, YouTube API uchun token olamiz
        const credential = GoogleAuthProvider.credentialFromResult(result);
        userAccessToken = credential.accessToken;
    } catch (error) {
        console.error("Tizimga kirishda xatolik:", error);
        alert("Google orqali kirish amalga oshmadi. Qaytadan urinib ko'ring.");
    }
});

btnLogout.addEventListener("click", () => {
    signOut(auth).then(() => {
        window.location.reload();
    });
});

// Foydalanuvchi holatini doimiy kuzatib turish
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        // Splash screen (darvoza)ni yopish va asosiy saytni ochish
        loginGate.classList.add("hidden");
        mainContent.classList.remove("hidden");
        
        // Profil rasmini joylashtirish
        userAvatar.src = user.photoURL || "https://via.placeholder.com/40";
        
        // ADMIN ekanligini tekshirish
        if (user.email === ADMIN_EMAIL) {
            adminSection.classList.remove("hidden");
        } else {
            adminSection.classList.add("hidden");
        }
        
        // Dunyolarni Firestore'dan real-vaqtda yuklab olishni boshlash
        listenToWorlds();
    } else {
        // Tizimdan chiqilgan bo'lsa, faqat login oynasini ko'rsatish
        loginGate.classList.remove("hidden");
        mainContent.classList.add("hidden");
    }
});

// 4. ADMIN: FIREBASE STORAGE'GA RASM YUKLASH VA FIRESTORE'GA SAQLASH
adminForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const title = document.getElementById("world-title").value;
    const version = document.getElementById("world-version").value;
    const optifine = document.getElementById("world-optifine").checked;
    const desc = document.getElementById("world-desc").value;
    const downloadLink = document.getElementById("world-link").value;
    const imageFile = document.getElementById("world-image").files[0];
    
    if (!imageFile) return;
    
    // Rasm uchun unikal nom yaratish va Storage referensiyasini olish
    const storageRef = ref(storage, `world_images/${Date.now()}_${imageFile.name}`);
    const uploadTask = uploadBytesResumable(storageRef, imageFile);
    
    progressBarContainer.classList.remove("hidden");
    document.getElementById("btn-submit-world").disabled = true;
    
    // Yuklanish jarayonini (Progress bar) kuzatish
    uploadTask.on('state_changed', 
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            progressBar.style.width = progress + '%';
        }, 
        (error) => {
            console.error("Rasmni yuklashda xatolik:", error);
            alert("Rasm yuklanmadi. Firebase Storage qoidalarini tekshiring.");
            progressBarContainer.classList.add("hidden");
            document.getElementById("btn-submit-world").disabled = false;
        }, 
        async () => {
            // Yuklanish muvaffaqiyatli tugagach, rasmdan doimiy URL link olamiz
            const imageURL = await getDownloadURL(uploadTask.snapshot.ref);
            
            // Ma'lumotlarni Firestore'ga yozish
            try {
                await addDoc(collection(db, "worlds"), {
                    title: title,
                    version: version,
                    optifine: optifine,
                    description: desc,
                    downloadLink: downloadLink,
                    imageUrl: imageURL,
                    createdAt: new Date()
                });
                
                alert("Yangi dunyo muvaffaqiyatli qo'shildi!");
                adminForm.reset();
            } catch (err) {
                console.error("Firestore'ga yozishda xatolik:", err);
            } finally {
                progressBarContainer.classList.add("hidden");
                progressBar.style.width = '0%';
                document.getElementById("btn-submit-world").disabled = false;
            }
        }
    );
});

// 5. FIRESTORE'DAN DUNYOLARNI UKLAB OLISH VA EKRANGA CHIQARISH
function listenToWorlds() {
    const q = query(collection(db, "worlds"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        allWorlds = [];
        worldsGrid.innerHTML = "";
        
        if (snapshot.empty) {
            // Agar bazada hech narsa bo'lmasa, namunaviy 2 ta dunyoni ko'rsatamiz
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
    if (worlds.length === 0) {
        worldsGrid.innerHTML = `<div class="loading-spinner">Qidiruv bo'yicha hech qanday dunyo topilmadi.</div>`;
        return;
    }
    
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
    
    // Yuklab olish tugmalariga klik hodisasini bog'lash
    document.querySelectorAll(".btn-unlock").forEach(btn => {
        btn.addEventListener("click", (e) => {
            activeDownloadLink = e.currentTarget.getAttribute("data-link");
            // Agar foydalanuvchi admin bo'lsa — obunani tekshirmasdan to'g'ridan-to'g'ri yuklab oladi
            if (currentUser && currentUser.email === ADMIN_EMAIL) {
                window.open(activeDownloadLink, '_blank');
            } else {
                openSubModal();
            }
        });
    });
}

// 6. REAL-VAYTDA JONLI QIDIRUV (REAL-TIME SEARCH)
searchBar.addEventListener("input", (e) => {
    const queryText = e.target.value.toLowerCase().trim();
    
    const filteredWorlds = allWorlds.filter(world => {
        return world.title.toLowerCase().includes(queryText) || 
               world.version.toLowerCase().includes(queryText) || 
               world.description.toLowerCase().includes(queryText);
    });
    
    renderWorlds(filteredWorlds);
});

// 7. YOUTUBE API: OBUNANI TEKSHIRISH LOGIKASI
function openSubModal() {
    subModal.classList.remove("hidden");
    modalErrorMsg.classList.add("hidden");
}

closeModal.addEventListener("click", () => subModal.classList.add("hidden"));

btnVerifySub.addEventListener("click", async () => {
    btnVerifySub.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Tekshirilmoqda...`;
    btnVerifySub.disabled = true;
    
    // Agar Google Login qilgandagi token hali mavjud bo'lmasa qayta so'raymiz
    if (!userAccessToken) {
        alert("Sessiya eskirgan. Iltimos saytni yangilab, Google orqali qayta kiring.");
        btnVerifySub.innerHTML = `<i class="fas fa-check-circle"></i> 2. Tekshirish`;
        btnVerifySub.disabled = false;
        return;
    }

    try {
        // YouTube Data API v3 orqali obunani tekshirish (subscriptions.list)
        const response = await fetch(`https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&forChannelId=${CHANNEL_ID}&mine=true`, {
            headers: {
                'Authorization': `Bearer ${userAccessToken}`,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        
        // Agar massivda ma'lumot bo'lsa, demak obuna bo'lgan
        if (data.items && data.items.length > 0) {
            modalErrorMsg.classList.add("hidden");
            subModal.classList.add("hidden");
            
            // Yuklab olish linkini yangi oynada ochish
            window.open(activeDownloadLink, '_blank');
        } else {
            // Obuna topilmasa xatolik matnini chiqarish
            modalErrorMsg.classList.remove("hidden");
        }
    } catch (error) {
        console.error("YouTube API bilan bog'lanishda xatolik:", error);
        alert("YouTube tizimi obunangizni tasdiqlay olmadi. Iltimos kanalga o'tib obuna bo'lganingizga ishonch hosil qiling.");
    } finally {
        btnVerifySub.innerHTML = `<i class="fas fa-check-circle"></i> 2. Tekshirish`;
        btnVerifySub.disabled = false;
    }
});

// Zaxira namunaviy kartochkalar (Baza bo'sh bo'lgan holat uchun)
function showPlaceholders() {
    const dummyWorlds = [
        {
            title: "CraftOrbit Survival World V1",
            version: "1.20.1",
            optifine: true,
            description: "Chiroyli shaderlar uchun optimizatsiya qilingan, barcha avtomatik fermalar qurilgan va ulkan geymerlar bazasiga ega ilk omon qolish dunyomiz.",
            downloadLink: "https://www.mediafire.com",
            imageUrl: ""
        }
    ];
    renderWorlds(dummyWorlds);
}
