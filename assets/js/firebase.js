// assets/js/firebase.js
(function(){
  const firebaseConfig = {
    apiKey: "AIzaSyB4u2G41xdGkgBC0KltleRpcg5Lwru2RIU",
    authDomain: "tngon-b37d6.firebaseapp.com",
    databaseURL: "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tngon-b37d6",
    storageBucket: "tngon-b37d6.firebasestorage.app",
    messagingSenderId: "580319242104",
    appId: "1:580319242104:web:6922e4327bdc8286c30a8d",
    measurementId: "G-LHEH8ZC6SL"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  firebase.auth().signInAnonymously().catch((e)=>{
    console.error("Firebase anonymous auth failed:", e);
  });
})();
