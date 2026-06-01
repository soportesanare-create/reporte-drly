// Firebase config + Anonymous Auth (wait handled by page)
const firebaseConfig = {
  apiKey: "AIzaSyAX1AA7tTnlnApVZlnnuMkB42k3W5IlwoM",
  authDomain: "sanare-cotizador.firebaseapp.com",
  projectId: "sanare-cotizador",
  storageBucket: "sanare-cotizador.firebasestorage.app",
  messagingSenderId: "902613920907",
  appId: "1:902613920907:web:0e73bd5def3cf4396a788e"
};
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
window.db = firebase.firestore();
// Trigger anonymous sign-in ASAP; pages will wait for auth state before listening.
try {
  if (firebase.auth) {
    firebase.auth().onAuthStateChanged((u)=>{
      if(!u) firebase.auth().signInAnonymously().catch(console.error);
    });
  }
} catch(e){ console.error(e); }
