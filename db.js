// Gestore Database Locale IndexedDB per AreaSosta

const DB_NAME = 'AreaSostaDB';
const DB_VERSION = 1;

function apriDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Tabella Stalli
            if (!db.objectStoreNames.contains('stalli')) {
                db.createObjectStore('stalli', { keyPath: 'num_stallo' });
            }

            // Tabella Storico Anagrafica Clienti
            if (!db.objectStoreNames.contains('storico')) {
                const storeStorico = db.createObjectStore('storico', { keyPath: 'id', autoIncrement: true });
                storeStorico.createIndex('nome', 'nome', { unique: false });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject("Errore apertura IndexedDB: " + event.target.error);
    });
}

// Salva o aggiorna uno stallo
async function salvaStalloDB(stalloData) {
    const db = await apriDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('stalli', 'readwrite');
        const store = tx.objectStore('stalli');
        store.put(stalloData);
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e);
    });
}

// Recupera tutti gli stalli
async function caricaStalliDB() {
    const db = await apriDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('stalli', 'readonly');
        const store = tx.objectStore('stalli');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
}

// Salva cliente nello storico anagrafico
async function salvaAnagraficaDB(nome) {
    if (!nome) return;
    const db = await apriDB();
    const tx = db.transaction('storico', 'readwrite');
    const store = tx.objectStore('storico');

    const index = store.index('nome');
    const checkReq = index.get(nome);

    checkReq.onsuccess = () => {
        if (!checkReq.result) {
            store.add({ nome: nome, data_inserimento: new Date().toISOString() });
        }
    };
}

// Recupera tutta l'anagrafica
async function caricaStoricoDB() {
    const db = await apriDB();
    return new Promise((resolve) => {
        const tx = db.transaction('storico', 'readonly');
        const store = tx.objectStore('storico');
        const request = store.getAll();
        request.onsuccess = () => {
            const nomi = request.result.map(item => item.nome);
            resolve(nomi);
        };
        request.onerror = () => resolve([]);
    });
}

// --- FUNZIONI BACKUP E RIPRISTINO (JSON) ---

async function esportaBackupDB() {
    const stalli = await caricaStalliDB();
    const storico = await caricaStoricoDB();

    const datiBackup = {
        data_backup: new Date().toISOString(),
        stalli: stalli,
        storico: storico
    };

    const jsonStr = JSON.stringify(datiBackup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_areasosta_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function ripristinaBackupDB(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const dati = JSON.parse(e.target.result);
            if (dati.stalli && Array.isArray(dati.stalli)) {
                for (let s of dati.stalli) {
                    await salvaStalloDB(s);
                }
            }
            if (dati.storico && Array.isArray(dati.storico)) {
                for (let nome of dati.storico) {
                    await salvaAnagraficaDB(nome);
                }
            }
            alert("Backup JSON ripristinato con successo!");
            window.location.reload();
        } catch (err) {
            alert("Errore durante la lettura del file JSON.");
        }
    };
    reader.readAsText(file);
}

// --- FUNZIONI EXPORT E IMPORT (CSV / EXCEL) ---

async function esportaCSVStalli() {
    const stalli = await caricaStalliDB();

    if (!stalli || stalli.length === 0) {
        alert("Nessun dato da esportare.");
        return;
    }

    let csvContent = "Stallo;Stato;Nome Cliente;Targa;Email;Dal;Al\n";

    stalli.forEach(s => {
        const riga = [
            s.num_stallo || '',
            s.stato || '',
            `"${(s.nome_cliente || '').replace(/"/g, '""')}"`,
            `"${(s.targa || '').replace(/"/g, '""')}"`,
            `"${(s.email || '').replace(/"/g, '""')}"`,
            s.dal || '',
            s.al || ''
        ].join(";");
        csvContent += riga + "\n";
    });

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `stalli_areasosta_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

async function ripristinaCSVStalli(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const testo = e.target.result;
            const righe = testo.split(/\r?\n/);

            if (righe.length < 2) {
                alert("File CSV vuoto o non valido.");
                return;
            }

            const primaRiga = righe[0];
            const separatore = primaRiga.includes(';') ? ';' : ',';

            let contatore = 0;

            for (let i = 1; i < righe.length; i++) {
                const riga = righe[i].trim();
                if (!riga) continue;

                const colonne = riga.split(separatore).map(val => val.replace(/^"|"$/g, '').trim());

                if (colonne.length >= 2) {
                    const numStallo = parseInt(colonne[0]);
                    if (isNaN(numStallo)) continue;

                    const datiStallo = {
                        num_stallo: numStallo,
                        stato: colonne[1] || 'libero',
                        nome_cliente: colonne[2] || '',
                        targa: colonne[3] || '',
                        email: colonne[4] || '',
                        dal: colonne[5] || '',
                        al: colonne[6] || ''
                    };

                    await salvaStalloDB(datiStallo);

                    if (datiStallo.nome_cliente) {
                        await salvaAnagraficaDB(datiStallo.nome_cliente);
                    }
                    contatore++;
                }
            }

            alert(`✅ Importazione completata! Aggiornati ${contatore} stalli.`);
            fileInput.value = '';
            window.location.reload();

        } catch (err) {
            console.error("Errore importazione CSV:", err);
            alert("Errore durante l'importazione del file CSV.");
        }
    };

    reader.readAsText(file, "UTF-8");
}

async function resetMappaStalliDB(totaleStalli) {
    if (!confirm("Sei sicuro di voler resettare tutti gli stalli allo stato LIBERO?")) return;

    for (let i = 1; i <= totaleStalli; i++) {
        await salvaStalloDB({
            num_stallo: i,
            stato: 'libero',
            nome_cliente: '',
            targa: '',
            email: '',
            dal: '',
            al: ''
        });
    }
    window.location.reload();
}

// Aggiunge una prenotazione verificando i buchi liberi nello stallo
async function aggiungiPrenotazioneStalloDB(numStallo, nuovaPrenotazione) {
    const stalli = await caricaStalliDB();
    let stallo = stalli.find(s => s.num_stallo === numStallo);

    if (!stallo) {
        stallo = { num_stallo: numStallo, prenotazioni: [] };
    } else if (!Array.isArray(stallo.prenotazioni)) {
        stallo.prenotazioni = [];
        if (stallo.nome_cliente && stallo.dal && stallo.al) {
            stallo.prenotazioni.push({
                nome_cliente: stallo.nome_cliente,
                targa: stallo.targa || '',
                email: stallo.email || '',
                dal: stallo.dal,
                al: stallo.al,
                stato: stallo.stato || 'prenotato'
            });
        }
    }

    // Controllo sovrapposizioni date
    const inizioNuovo = new Date(nuovaPrenotazione.dal);
    const fineNuovo = new Date(nuovaPrenotazione.al);

    const haConflitto = stallo.prenotazioni.some(p => {
        const inizioEsistente = new Date(p.dal);
        const fineEsistente = new Date(p.al);
        return (inizioNuovo < fineEsistente && fineNuovo > inizioEsistente);
    });

    if (haConflitto) {
        alert("⚠️ Impossibile inserire: Lo stallo è già occupato/prenotato in queste date!");
        return false;
    }

    stallo.prenotazioni.push(nuovaPrenotazione);

    if (nuovaPrenotazione.nome_cliente) {
        await salvaAnagraficaDB(nuovaPrenotazione.nome_cliente);
    }

    await salvaStalloDB(stallo);
    return true;
}

// Elimina una prenotazione specifica da uno stallo
async function rimuoviPrenotazioneStalloDB(numStallo, indexPrenotazione) {
    const stalli = await caricaStalliDB();
    let stallo = stalli.find(s => s.num_stallo === numStallo);

    if (stallo && Array.isArray(stallo.prenotazioni)) {
        stallo.prenotazioni.splice(indexPrenotazione, 1);
        await salvaStalloDB(stallo);
        return true;
    }
    return false;
}