import os
import sqlite3
import requests

DB_NAME = "areasosta.db"
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
REMOTE_DB_ENABLED = os.getenv("USE_REMOTE_DB", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def _api_call(method, path, payload=None):
    if not REMOTE_DB_ENABLED:
        return None
    try:
        response = requests.request(
            method, f"{API_BASE_URL}{path}", json=payload, timeout=5
        )
        if response.status_code in {200, 201, 204}:
            return response.json() if response.content else {}
        return None
    except requests.RequestException:
        return None


def inizializza_db():
    if REMOTE_DB_ENABLED:
        health = _api_call("GET", "/health")
        if health and health.get("status") == "ok":
            return

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute(
        "CREATE TABLE IF NOT EXISTS transazioni ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "data TEXT NOT NULL, "
        "tipo TEXT NOT NULL, "
        "nome_cliente TEXT NOT NULL, "
        "targa TEXT, "
        "importo REAL NOT NULL)"
    )

    cursor.execute(
        "CREATE TABLE IF NOT EXISTS clienti ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "nome_cliente TEXT UNIQUE NOT NULL, "
        "targa TEXT, "
        "email TEXT)"
    )

    cursor.execute(
        "CREATE TABLE IF NOT EXISTS mappa_stalli ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "num_stallo INTEGER NOT NULL, "
        "mese INTEGER NOT NULL, "
        "anno INTEGER NOT NULL, "
        "nome_cliente TEXT, "
        "targa TEXT, "
        "email TEXT, "
        "dal TEXT, "
        "al TEXT, "
        "stato TEXT)"
    )

    cursor.execute(
        "CREATE TABLE IF NOT EXISTS impostazioni (chiave TEXT PRIMARY KEY, valore TEXT)"
    )

    defaults = [
        ("password", "admin"),
        ("costo_giornaliero", "18.00"),
        ("costo_alta_stagione", "25.00"),
        ("costo_carico_scarico", "7.00"),
    ]
    for chiave, valore in defaults:
        cursor.execute(
            "INSERT OR IGNORE INTO impostazioni (chiave, valore) VALUES (?, ?)",
            (chiave, valore),
        )

    conn.commit()
    conn.close()


def leggi_impostazione(chiave):
    if REMOTE_DB_ENABLED:
        data = _api_call("GET", f"/impostazioni/{chiave}")
        if data:
            return data.get("valore")

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT valore FROM impostazioni WHERE chiave = ?", (chiave,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else None


def salva_impostazione(chiave, valore):
    if REMOTE_DB_ENABLED:
        result = _api_call(
            "POST", "/impostazioni", {"chiave": chiave, "valore": valore}
        )
        if result:
            return result

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO impostazioni (chiave, valore) VALUES (?, ?)",
        (chiave, valore),
    )
    conn.commit()
    conn.close()


def salva_transazione(data, tipo, nome_cliente, targa, importo):
    if REMOTE_DB_ENABLED:
        result = _api_call(
            "POST",
            "/transazioni",
            {
                "data": data,
                "tipo": tipo,
                "nome_cliente": nome_cliente,
                "targa": targa,
                "importo": importo,
            },
        )
        if result:
            return result

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO transazioni (data, tipo, nome_cliente, targa, importo) VALUES (?, ?, ?, ?, ?)",
        (data, tipo, nome_cliente, targa, importo),
    )

    cursor.execute(
        "INSERT INTO clienti (nome_cliente, targa) VALUES (?, ?) "
        "ON CONFLICT(nome_cliente) DO UPDATE SET targa=excluded.targa",
        (nome_cliente, targa),
    )

    conn.commit()
    conn.close()


def cerca_clienti_per_iniziali(lettere):
    if not lettere or len(lettere) < 1:
        return []

    if REMOTE_DB_ENABLED:
        data = _api_call("GET", "/clienti")
        if data:
            return [
                (item.get("nome_cliente"), item.get("targa"))
                for item in data
                if str(item.get("nome_cliente", ""))
                .upper()
                .startswith(str(lettere).upper())
            ][:5]

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT nome_cliente, targa FROM clienti WHERE nome_cliente LIKE ? LIMIT 5",
        (f"{lettere}%",),
    )
    risultati = cursor.fetchall()
    conn.close()
    return risultati


def salva_prenotazione_stallo(
    num_stallo, mese, anno, nome_cliente, targa, email, dal, al, stato
):
    if REMOTE_DB_ENABLED:
        result = _api_call(
            "POST",
            "/mappa",
            {
                "num_stallo": num_stallo,
                "mese": mese,
                "anno": anno,
                "nome_cliente": nome_cliente,
                "targa": targa,
                "email": email,
                "dal": dal,
                "al": al,
                "stato": stato,
            },
        )
        if result:
            return result

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute(
        "DELETE FROM mappa_stalli WHERE num_stallo = ? AND mese = ? AND anno = ?",
        (num_stallo, mese, anno),
    )

    if stato != "libero":
        cursor.execute(
            "INSERT INTO mappa_stalli (num_stallo, mese, anno, nome_cliente, targa, email, dal, al, stato) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (num_stallo, mese, anno, nome_cliente, targa, email, dal, al, stato),
        )

    conn.commit()
    conn.close()


def carica_mappa_stalli():
    if REMOTE_DB_ENABLED:
        data = _api_call("GET", "/mappa")
        if data:
            return [
                (
                    item.get("num_stallo"),
                    item.get("mese"),
                    item.get("anno"),
                    item.get("nome_cliente"),
                    item.get("targa"),
                    item.get("email"),
                    item.get("dal"),
                    item.get("al"),
                    item.get("stato"),
                )
                for item in data
            ]

    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT num_stallo, mese, anno, nome_cliente, targa, email, dal, al, stato FROM mappa_stalli"
    )
    righe = cursor.fetchall()
    conn.close()
    return righe


if __name__ == "__main__":
    inizializza_db()
    print("Database 'areasosta.db' generato correttamente!")
