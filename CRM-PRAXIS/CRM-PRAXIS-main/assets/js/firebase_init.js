
// Firebase INIT + Auth (CDN v10.12.5)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAyksNhyRX-7QnZSOF27txNU-_SeMoOGps",
  authDomain: "crm-innvida-76e2e.firebaseapp.com",
  projectId: "crm-innvida-76e2e",
  storageBucket: "crm-innvida-76e2e.firebasestorage.app",
  messagingSenderId: "865341286325",
  appId: "1:865341286325:web:9fe061fa3c2c7fea4e9bfc"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth(app);
signInAnonymously(auth).catch((e) => console.error("[auth] signInAnonymously:", e));
onAuthStateChanged(auth, (user) => {
  console.log(user ? "[auth] listo (uid="+user.uid+")" : "[auth] sin sesión");
});
