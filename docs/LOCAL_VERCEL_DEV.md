# Local Backend (Same As Vercel)

Per testare in locale lo stesso backend che gira su Vercel (stesse Function in `api/*`):

1. Installa dipendenze:
   - `npm install`
2. Avvia runtime locale (consigliato, nessun login richiesto):
   - `npm run dev:local`
3. Apri app:
   - `http://localhost:3000`

Con `npm run dev:local`, frontend statico e endpoint `/api/*` girano insieme sullo stesso host, usando direttamente gli handler reali in `api/*.mjs`.

## Sviluppo rapido con Vite

Ora anche `npm run dev` esegue in locale le route `/api/*` tramite middleware Vite che carica gli stessi handler in `api/*.mjs`.

- Comando:
  - `npm run dev`
- URL default:
  - `http://localhost:5173`

## Modalita Vercel CLI ufficiale

Se vuoi usare il runtime ufficiale Vercel in locale:

1. Login:
   - `vercel login`
2. Avvio:
   - `npm run dev:vercel`

Nota: senza login `vercel dev` restituisce errore credenziali.

## Endpoint utili

- Payload player:
  - `/api/player/payload?provider=animeunity&link=...`
- Episodi stagione:
  - `/api/player/episodes?provider=streamingunity&seasonLink=...`
- Stream episodio:
  - `/api/player/streams?provider=animeunity&link=...`

## Debug

- Runtime locale con log route API:
  - `npm run dev:local:debug`
- Avvio con log estesi:
  - `npm run dev:vercel:debug`
