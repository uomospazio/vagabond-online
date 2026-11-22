# Vagabond Online

Gioco di strategia per due persone. React, TypeScript e Vite generano un sito statico per GitHub Pages. Supabase gestisce sessioni anonime, lobby private con codice, aggiornamenti in tempo reale e regole di gioco.

## Regole

Sulla plancia 6 × 6 ogni colore parte con una pedina vicino a ciascun angolo. L’avorio apre il turno. A ogni turno si sposta una sola pedina. Il percorso può cambiare direzione lungo qualsiasi sequenza di scanalature ortogonali libere. Le pedine bloccano il passaggio e non si catturano. Vince chi allinea quattro pedine consecutive in orizzontale, verticale o diagonale. La rivincita scambia i colori e conserva il timer.

Coordinate iniziali con colonne A–F e righe 1–6, contate dall’alto.

| Colore | Posizioni |
| --- | --- |
| Avorio | C1, F2, A5, D6 |
| Verde | D1, A2, F5, C6 |

## Come funziona il multiplayer

Le scritture transitano dalla RPC PostgreSQL. Ogni operazione identifica il partecipante tramite `auth.uid()`. La RPC blocca la riga della lobby durante la transazione e una policy RLS limita la lettura ai partecipanti attivi nella lobby. Il frontend calcola solo le anteprime dei percorsi. Il server valida nuovamente il percorso, il turno e la scadenza. Il browser visualizza il tempo partendo da un campione del clock server e usando un orologio monotono locale. Cron chiude le partite scadute anche a browser chiusi. I partecipanti mantengono il posto dopo una disconnessione. Lo stato di presenza usa un aggiornamento ogni 8 secondi e una soglia di 25 secondi.

## Avvio e test

Richiede Node.js 22.12 o successivo. Copia `.env.example` in `.env.local` per configurare il multiplayer locale. Usa l’URL e la chiave Publishable indicati da `supabase status` quando provi il backend locale.

```sh
npm ci
npm run dev
npm test
npm run build
```

Per i test PostgreSQL usa Docker, Supabase CLI e `psql`.

```sh
supabase start
supabase db reset
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/tests/lobby.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/tests/cron.sql
```

Con Supabase locale attivo, imposta URL e chiave pubblicabile locali in `.env.local`, esegui `npx playwright install chromium` e poi `npm run test:e2e`. Il test usa due sessioni Chromium separate. Per provare la sincronizzazione manualmente, apri il sito in due profili browser separati. Crea una partita nel primo e usa il codice nel secondo. Verifica la modifica del nickname, chiudi e riapri uno dei profili, e prova una rivincita. Per il timer automatico, chiudi entrambi i browser durante una partita a 15 secondi, attendi la scadenza e riapri il sito.

## Prima pubblicazione

### 1. Prepara Supabase

Crea un progetto dal [dashboard Supabase](https://supabase.com/dashboard). In **Authentication → Sign In / Providers** abilita gli accessi anonimi. Nella finestra **Connect** copia il **Project URL** e la chiave **Publishable**. Serviranno per GitHub Pages.

Per applicare lo schema, scegli una delle due procedure.

- **Supabase CLI.** Dalla cartella del progetto, esegui `supabase login`, `supabase link --project-ref RIFERIMENTO_PROGETTO` e `supabase db push`. Il riferimento è visibile nel Project URL, tra `https://` e `.supabase.co`.
- **Dashboard.** Apri **SQL Editor → New query**, incolla il contenuto della [migrazione SQL](supabase/migrations/20261122000000_vagabond.sql) e premi **Run** una volta su un progetto nuovo. Se in futuro colleghi la CLI allo stesso progetto, registra prima la migrazione con `supabase migration repair --status applied 20261122000000`.

Puoi verificare la configurazione in SQL Editor.

```sql
select
  to_regclass('public.vagabond_rooms') is not null as lobby_creata,
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vagabond_rooms'
  ) as realtime_attivo,
  exists (
    select 1 from cron.job
    where jobname = 'vagabond-turn-expiry' and active
  ) as timer_attivo;
```

Le tre colonne dovrebbero risultare `true`.

### 2. Carica il codice su GitHub

Crea un repository chiamato `vagabond-online`. Per GitHub Pages con un account GitHub Free, usa un repository pubblico. L’accesso alle partite continua a richiedere il codice lobby e una sessione anonima.

Da un computer con Git, apri la cartella estratta che contiene `package.json`, `src` e `.github`. Per un repository GitHub vuoto:

```sh
git init -b main
git add .
git commit -m "Prima versione di Vagabond Online"
git remote add origin https://github.com/TUO-UTENTE/vagabond-online.git
git push -u origin main
```

### 3. Attiva GitHub Pages

1. Nel repository, apri **Settings → Pages → Build and deployment**. Seleziona **GitHub Actions**.
2. Apri **Settings → Secrets and variables → Actions → Variables**. Crea `VITE_SUPABASE_URL` con il Project URL e `VITE_SUPABASE_PUBLISHABLE_KEY` con la chiave Publishable. Le chiavi `service_role` e `sb_secret_…` vanno tenute fuori dal sito.
3. Apri **Actions → Pubblica su GitHub Pages → Run workflow**, seleziona il branch `main` e avvia il workflow. Esegue i test PostgreSQL e la partita automatizzata tra due browser prima del deploy.
4. Quando il workflow è verde, trovi il link in **Settings → Pages**. Per un repository `vagabond-online` di un account personale, di solito è `https://TUO-UTENTE.github.io/vagabond-online/`.
5. Riporta il link in Supabase, sotto **Authentication → URL Configuration → Site URL**. Poi aprilo in due profili separati, crea una lobby e inserisci il codice nel secondo browser.

Se **Actions** è rosso, apri il job fallito e cerca il primo errore nello step contrassegnato con la X. Nel caso di una build senza variabili, aggiungi entrambe le variabili del punto 2 e riavvia il workflow.
