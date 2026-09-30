# App Store: podklady pro Managero a Managero client

Jedna složka na aplikaci, uvnitř formát, který čte `fastlane deliver`. Celý postup: `docs/obchody/APPLE.md`.

    apps/fastlane/{Appfile,Fastfile,Matchfile,Deliverfile,Supplyfile}   lane <app>_beta | _metadata | _listing | _submit
    apps/app-store/<app>/metadata/<cs|en-US>/*.txt   texty (name, subtitle, promotional_text, description, keywords, release_notes, *_url)
    apps/app-store/<app>/metadata/*.txt              kategorie, copyright
    apps/app-store/<app>/metadata/review_information/notes.txt   poznámky pro recenzenta ({{PROMĚNNÉ}} dosadí Fastfile z prostředí, hesla v repu nejsou)
    apps/app-store/<app>/snimky.json                 scénář snímků (pořadí, trasa, nadpisy cs/en-US), společný s Google Play
    apps/app-store/<app>/screenshots/<locale>/       generované PNG (v .gitignore)
    apps/app-store/<app>/previews/                   generované MP4 (v .gitignore)
    apps/app-store/ukazky/                           dvě ukázkové dvojice snímků v malém rozlišení k posouzení
    apps/app-store/_sablona/snimek.html              rámeček s nadpisem

Příkazy z kořene repa: `node apps/scripts/kontrola-listingu.mjs`, `apps/scripts/ikony.mjs`, `snimky.mjs --app=client`, `preview.mjs --app=client`.
Na Macu z `apps/`: `bundle exec fastlane ios client_listing`.

Prostředí (nic z toho do repa): APPLE_TEAM_ID, ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH,
REVIEW_FIRST_NAME, REVIEW_LAST_NAME, REVIEW_PHONE, REVIEW_EMAIL,
REVIEW_MANAGERO_USER, REVIEW_MANAGERO_PASSWORD, REVIEW_MANAGERO_EMPLOYEE_USER, REVIEW_MANAGERO_EMPLOYEE_PASSWORD,
REVIEW_CLIENT_USER, REVIEW_CLIENT_PASSWORD, (volitelně MATCH_GIT_URL, MATCH_PASSWORD).
Copyright: `{{PRAVNI_SUBJEKT}}` v `metadata/copyright.txt` doplň právním subjektem (kontrola `--release` bez toho neprojde).
