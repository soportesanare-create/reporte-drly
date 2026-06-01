INNVIDA CRM — Firestore only (v3)
====================================

Qué cambió
- La tabla de Médicos ahora se alimenta **solo de Firestore** (onSnapshot).
- Se incluye `assets/js/firestore_importer.js` para **migrar medicos.json a Firestore**.
- `firebase_medicos.js` usa `initializeFirestore` con caché persistente (sin warnings).

Cómo importar tus 332 médicos (una sola vez)
1) Sube estos archivos a tu hosting (GitHub Pages).
2) Abre la consola del navegador (F12 → Console) y ejecuta:
   import("/assets/js/firestore_importer.js").then(m => m.importarDesdeJSON("URL_ABSOLUTA_A_TU_medicos.json"))
   Reemplaza la URL por tu medicos.json público en GitHub/Vercel.

Roles por KAM (Rules recomendadas)
----------------------------------
Pega en Firestore → Rules:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn(){ return request.auth != null; }

    // Admins por email (ajusta tus correos)
    function isAdmin(){
      return isSignedIn() && (
        request.auth.token.email in [
          "admin@sanare.com",
          "ops@sanare.com"
        ]
      );
    }

    // Visibilidad por KAM (campo 'kam' en el documento)
    function isOwnerKAM(resourceData){
      return isSignedIn() && resourceData.kam == request.auth.token.email;
    }

    match /medicos/{id} {
      allow read:   if isAdmin() || isOwnerKAM(resource.data);
      allow create: if isAdmin() || (isSignedIn() && request.resource.data.kam == request.auth.token.email);
      allow update: if isAdmin() || isOwnerKAM(resource.data);
      allow delete: if isAdmin();
    }
  }
}

Auth
----
- Para pruebas rápidas puedes usar **Anonymous** y Rules de pruebas.
- Para producción, habilita **Email/Password** y asigna KAMs por su correo.
- Agrega tus dominios en Authentication → Settings → Authorized domains
  (ej. localhost, <tuusuario>.github.io, tu-dominio.vercel.app).

Botones
-------
- El botón "Guardar médico" debe tener `id="btnGuardarMedico"` o `onclick="guardarMedicoDesdeForm()"`.
- CSV: el botón con id `btnCSV` o texto "CSV" descargará los datos visibles.

