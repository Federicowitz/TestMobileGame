// Logica del gioco semplice
document.getElementById('click-btn').addEventListener('click', () => {
    alert('Funziona!');
});

// Registrazione del Service Worker per la PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then((registration) => {
                console.log('ServiceWorker registrato con successo: ', registration.scope);
            })
            .catch((err) => {
                console.log('Registrazione ServiceWorker fallita: ', err);
            });
    });
}