import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    let closingIndex = 'not reached';
    let closingIndexes: string[] = [];
    let closingConstraints: string[] = [];

    // ---- Teams ----
    await sql`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id INTEGER,
        join_code TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Users ----
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        avatar TEXT DEFAULT '👤',
        phone TEXT,
        job_title TEXT DEFAULT 'Barista',
        shift_preference TEXT DEFAULT 'flexible',
        employer_id INTEGER,
        team_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id INTEGER`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light'`;

    // ---- Invitations ----
    await sql`
      CREATE TABLE IF NOT EXISTS invitations (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        job_title TEXT DEFAULT 'Barista',
        invited_by INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Shifts ----
    await sql`
      CREATE TABLE IF NOT EXISTS shifts (
        id SERIAL PRIMARY KEY,
        team_id INTEGER,
        employee_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS team_id INTEGER`;
    // shift created automatically from a clock-in / added via a closing (not planned)
    await sql`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS auto_created BOOLEAN DEFAULT FALSE`;

    await sql`
      CREATE TABLE IF NOT EXISTS shift_requests (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        request_type TEXT NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Monthly availability ----
    await sql`
      CREATE TABLE IF NOT EXISTS availability_requests (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        unavailable_dates JSONB DEFAULT '[]',
        preferred_shift TEXT DEFAULT 'flexible',
        max_shifts INTEGER,
        note TEXT,
        status TEXT DEFAULT 'submitted',
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Inventory ----
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL PRIMARY KEY,
        team_id INTEGER,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        min_quantity INTEGER NOT NULL DEFAULT 5,
        critical_quantity INTEGER NOT NULL DEFAULT 2,
        max_quantity INTEGER NOT NULL DEFAULT 100,
        unit TEXT NOT NULL DEFAULT 'ks',
        supplier TEXT,
        created_by INTEGER,
        updated_by INTEGER,
        updated_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS team_id INTEGER`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS critical_quantity INTEGER NOT NULL DEFAULT 2`;
    // unit cost → stock valuation (quantity × unit_cost)
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_cost INTEGER`;

    // ---- Shift swap marketplace ----
    await sql`
      CREATE TABLE IF NOT EXISTS shift_offers (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        shift_id INTEGER NOT NULL,
        offered_by INTEGER NOT NULL,
        claimed_by INTEGER,
        status TEXT DEFAULT 'open',   -- open | claimed | approved | cancelled
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS created_by INTEGER`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS updated_by INTEGER`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`;

    await sql`
      CREATE TABLE IF NOT EXISTS inventory_log (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        old_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    await sql`
      CREATE TABLE IF NOT EXISTS inventory_reports (
        id SERIAL PRIMARY KEY,
        reported_by INTEGER NOT NULL,
        items TEXT NOT NULL,
        note TEXT,
        status TEXT DEFAULT 'new',
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Chat ----
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'direct',
        name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS conversation_members (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        last_read_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        content TEXT,
        attachment_url TEXT,
        attachment_type TEXT,
        attachment_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL,
        channel TEXT NOT NULL DEFAULT 'general',
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Guides ----
    await sql`
      CREATE TABLE IF NOT EXISTS guide_categories (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'book',
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS guides (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        category_id INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        checklist JSONB DEFAULT '[]',
        created_by INTEGER NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`ALTER TABLE guides ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'`;

    // ---- Procedures / checklists ----
    await sql`
      CREATE TABLE IF NOT EXISTS procedures (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT DEFAULT 'check',
        color TEXT DEFAULT 'lime',
        items JSONB DEFAULT '[]',
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS procedure_runs (
        id SERIAL PRIMARY KEY,
        procedure_id INTEGER NOT NULL,
        team_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        checked_items JSONB DEFAULT '[]',
        total_items INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running',
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        duration_seconds INTEGER
      )`;

    // ---- Inventory categories ----
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_categories (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Tasks / planning / reports / recipes ----
    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        assigned_to INTEGER NOT NULL,
        created_by INTEGER NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        due_date TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS planning_cards (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        "column" TEXT NOT NULL DEFAULT 'ideas',
        position INTEGER DEFAULT 0,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        revenue INTEGER NOT NULL DEFAULT 0,
        customers INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS recipes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        ingredients TEXT NOT NULL,
        instructions TEXT NOT NULL,
        prep_time INTEGER DEFAULT 5,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Notifications & push ----
    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        type TEXT DEFAULT 'info',
        link TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- v2: shift types, opening hours, scheduling prefs, supplier links, procedure reminders ----
    await sql`
      CREATE TABLE IF NOT EXISTS shift_types (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        color TEXT DEFAULT 'lime',
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS fixed_assignments (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        weekday INTEGER NOT NULL,
        shift_type_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}'`;
    // shift types can follow opening hours: start at open / end at close (per day)
    await sql`ALTER TABLE shift_types ADD COLUMN IF NOT EXISTS starts_at_open BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE shift_types ADD COLUMN IF NOT EXISTS ends_at_close BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS remind_at TEXT`;
    await sql`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS remind_days JSONB DEFAULT '[]'`;
    // reminder can be anchored to opening / closing time instead of a fixed time
    await sql`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS remind_anchor TEXT DEFAULT 'time'`; // 'time' | 'open' | 'close'
    await sql`ALTER TABLE availability_requests ADD COLUMN IF NOT EXISTS day_preferences JSONB DEFAULT '{}'`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_url TEXT`;

    // ---- Cash closings (uzávěrky) ----
    await sql`
      CREATE TABLE IF NOT EXISTS cash_closings (
        id SERIAL PRIMARY KEY,
        team_id INTEGER,
        created_by INTEGER NOT NULL,
        date TEXT NOT NULL,
        shift_label TEXT,
        opening_cash INTEGER NOT NULL DEFAULT 0,
        cash_revenue INTEGER NOT NULL DEFAULT 0,
        card_revenue INTEGER NOT NULL DEFAULT 0,
        tips INTEGER NOT NULL DEFAULT 0,
        expenses INTEGER NOT NULL DEFAULT 0,
        cash_removed INTEGER NOT NULL DEFAULT 0,
        self_payout INTEGER NOT NULL DEFAULT 0,
        closing_cash INTEGER NOT NULL DEFAULT 0,
        customers INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        shift_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    // team payout mode: whether staff are paid daily in cash (enables self_payout field)
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS pay_daily_cash BOOLEAN DEFAULT FALSE`;
    // link a closing to the shift it belongs to
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS shift_id INTEGER`;
    // approval flow for closings submitted by someone who wasn't on shift
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT TRUE`;
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS approved_by INTEGER`;
    // a closing filled by one colleague on behalf of another points to the main one
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS covered_by INTEGER`;

    // ---- Attendance / time tracking (kiosk / tablet) ----
    await sql`
      CREATE TABLE IF NOT EXISTS time_entries (
        id SERIAL PRIMARY KEY,
        team_id INTEGER,
        employee_id INTEGER NOT NULL,
        clock_in TIMESTAMP NOT NULL DEFAULT NOW(),
        clock_out TIMESTAMP,
        source TEXT DEFAULT 'kiosk',
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    // wages: hourly rate per member (Kc/h)
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS hourly_rate INTEGER DEFAULT 0`;
    // Scheduling rule: how many days in a row a person may be rostered.
    // Team-wide default on teams, optional per-person override on users;
    // NULL on both means no limit.
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS max_consecutive_days INTEGER`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS max_consecutive_days INTEGER`;
    // Fair rotation (NULL = on) + monthly hour caps (team default, per-person override).
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS balance_shifts BOOLEAN`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS max_month_hours INTEGER`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS max_month_hours INTEGER`;
    // Uploaded files stored in Postgres when Vercel Blob is unavailable —
    // photos must never silently stop working because a token expired.
    await sql`
      CREATE TABLE IF NOT EXISTS uploads (
        id SERIAL PRIMARY KEY,
        team_id INTEGER,
        user_id INTEGER,
        name TEXT,
        mime TEXT,
        data TEXT,
        blob_path TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS blob_path TEXT`;
    await sql`ALTER TABLE uploads ALTER COLUMN data DROP NOT NULL`;
    // Desired drawer float: the closing computes the end-of-shift removal so
    // exactly this amount stays for the next shift.
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS drawer_float INTEGER`;
    // A closing can belong to an off-site event (venkovní akce) — it lives
    // beside the shop's own closing for that day, never instead of it.
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS event_id INTEGER`;
    // Tips split by how they were paid. Only the cash half ever reaches the
    // drawer; counting card tips towards the expected cash invented a manko.
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS tips_card INTEGER DEFAULT 0`;
    // Receipts snapped on the go (TO GO mode) — photo + amounts, optionally
    // pushed into the stock later.
    await sql`
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        user_id INTEGER,
        photo_url TEXT,
        supplier TEXT,
        amount INTEGER,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    // Scheduling: may the generator split one shift between two people?
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS allow_split_shifts BOOLEAN`;
    // Per-person opt-out from split shifts (NULL = allowed when the team allows).
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS split_shifts_ok BOOLEAN`;
    // watchdog for forgotten clock-outs: when the person was already reminded
    await sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS nudged_at TIMESTAMP`;

    // ---- Announcements (pinned team board) ----
    await sql`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        author_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        pinned BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Time off (vacation / sick day) requests ----
    await sql`
      CREATE TABLE IF NOT EXISTS time_off_requests (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        type TEXT DEFAULT 'vacation',
        note TEXT,
        status TEXT DEFAULT 'pending',
        decided_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )`;

    // ---- Supplier orders (from the shopping list) ----
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        created_by INTEGER NOT NULL,
        supplier TEXT,
        items JSONB DEFAULT '[]',
        total_cost INTEGER,
        status TEXT DEFAULT 'ordered',
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        received_at TIMESTAMP
      )`;

    // ---- Improvement suggestions (team idea board) ----
    await sql`
      CREATE TABLE IF NOT EXISTS suggestions (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        author_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        status TEXT DEFAULT 'new',
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS suggestion_votes (
        suggestion_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        PRIMARY KEY (suggestion_id, user_id)
      )`;

    // invited members may come in with an elevated role
    await sql`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'employee'`;
    // optional per-employee PIN for the shared kiosk device
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin TEXT`;
    // per-user notification category preferences (server-side, synced across devices)
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_prefs JSONB DEFAULT '{}'`;
    // recurring tasks + per-task checklists
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence TEXT`;          // null | 'daily' | 'weekdays' | 'weekly'
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'`;
    // day-bound tasks (assigned_to NULL = anyone on the team can do it), team
    // scoping, recurring-series grouping, and who actually completed it.
    await sql`ALTER TABLE tasks ALTER COLUMN assigned_to DROP NOT NULL`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id INTEGER`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS series_id TEXT`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_by INTEGER`;
    // whether closings are locked to shifts (default on)
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS closing_requires_shift BOOLEAN DEFAULT TRUE`;
    // whether the daily cash payout is taken FROM the register (true) or from
    // money set aside (false). Drives whether the expected-cash math deducts it.
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS payout_from_register BOOLEAN DEFAULT TRUE`;
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS payout_from_register BOOLEAN`;

    // ---- Business/localization settings (make the app fit ANY team) ----
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CZK'`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'cs-CZ'`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS week_start INTEGER DEFAULT 1`; // 1 = Monday, 0 = Sunday
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS labor_target_pct INTEGER`;      // target labor cost as % of revenue
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS low_stock_default INTEGER DEFAULT 5`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS critical_stock_default INTEGER DEFAULT 2`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS business_type TEXT`;
    // per-team dashboard customization: { employer: {widgetId:false}, employee: {...} }
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS dashboard_config JSONB DEFAULT '{}'`;

    // ---- Noisium integration (per-team) ----
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS noisium_token TEXT`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS noisium_project_id TEXT`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS noisium_base_url TEXT`;
    await sql`ALTER TABLE planning_cards ADD COLUMN IF NOT EXISTS noisium_task_id TEXT`;

    // ---- Procedure runs: allow skipping steps ----
    await sql`ALTER TABLE procedure_runs ADD COLUMN IF NOT EXISTS skipped_items JSONB DEFAULT '[]'`;

    // ---- Employee rewards / leveling ----
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS levels_config JSONB DEFAULT '[]'`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS points_config JSONB DEFAULT '{}'`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`;
    await sql`
      CREATE TABLE IF NOT EXISTS shift_reviews (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        work_date TEXT NOT NULL,
        rating INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        points INTEGER NOT NULL DEFAULT 0,
        reviewed_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (employee_id, work_date)
      )`;
    // Employer review notes attached directly to individual items.
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_note TEXT`;
    await sql`ALTER TABLE procedure_runs ADD COLUMN IF NOT EXISTS review_note TEXT`;
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS review_note TEXT`;

    // ---- Cash tips: do they physically stay in the drawer? ----
    // Team default + per-closing override (mirrors payout_from_register).
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS tips_in_drawer BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS tips_in_drawer BOOLEAN`;
    // Itemised cash movements behind the aggregate columns, plus why the drawer
    // didn't match when it didn't.
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS movements JSONB`;
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS diff_reason TEXT`;
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS diff_note TEXT`;
    // How the drawer was counted, by denomination — {"500": 3, "100": 7}.
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS denominations JSONB`;
    // Plans & billing prep: stored plan + trial end. Existing teams are
    // grandfathered to Pro (the UPDATE touches only NULL rows, so it's
    // idempotent and never downgrades anyone).
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS plan TEXT`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP`;
    // who clicked "Mám zájem o Pro" — demand signal until real billing exists
    await sql`
      CREATE TABLE IF NOT EXISTS billing_interest (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`UPDATE teams SET plan = 'pro' WHERE plan IS NULL`;
    // end-of-shift removal: cash carried out AFTER the drawer was counted
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS final_removal INTEGER NOT NULL DEFAULT 0`;

    // ---- Public share links (customer-facing menu) ----
    await sql`
      CREATE TABLE IF NOT EXISTS share_links (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL DEFAULT 'inventory',
        category_id INTEGER,
        excluded JSONB DEFAULT '[]',
        title TEXT,
        note TEXT,
        enabled BOOLEAN DEFAULT TRUE,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    // Colours and logo for every share page of the team.
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS share_theme JSONB`;

    // ---- Zákaznické menu (iPad před podnikem + QR do mobilu hosta) ----
    await sql`
      CREATE TABLE IF NOT EXISTS menu_boards (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        eyebrow TEXT,
        title TEXT,
        note TEXT,
        wifi_ssid TEXT,
        wifi_password TEXT,
        currency TEXT DEFAULT 'Kč',
        pin_hash TEXT,
        enabled BOOLEAN DEFAULT TRUE,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`;
    // Slug je celá veřejná adresa menu (/api/menu/public/<slug>), takže musí
    // být jedinečný napříč všemi týmy — ne jen uvnitř jednoho. Kdyby si ho
    // dva podniky zabraly, veřejné čtení by nevědělo, čí menu vydat.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS menu_boards_slug ON menu_boards (slug)`;
    await sql`
      CREATE TABLE IF NOT EXISTS menu_sections (
        id SERIAL PRIMARY KEY,
        board_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        column_no INTEGER DEFAULT 1,
        position INTEGER DEFAULT 0
      )`;
    await sql`CREATE INDEX IF NOT EXISTS menu_sections_board ON menu_sections (board_id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        section_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        price INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        sold_out BOOLEAN DEFAULT FALSE,
        pos_product_id TEXT,
        position INTEGER DEFAULT 0
      )`;
    await sql`CREATE INDEX IF NOT EXISTS menu_items_section ON menu_items (section_id)`;
    // Vzhled menu (barvy, logo, písma, prvky na pozadí). Prázdné = vzhled
    // zapečený ve stránce, takže staré menu vypadá dál stejně.
    await sql`ALTER TABLE menu_boards ADD COLUMN IF NOT EXISTS theme JSONB`;
    // A closing belongs to the whole shift, not just its author.
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS shift_employees JSONB DEFAULT '[]'`;
    // Business day the closing belongs to. A night shift ending at 02:00 files
    // its closing on the NEXT calendar date — shift_date keeps it attached to
    // the shift that earned it. Older rows simply mirror `date`.
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS shift_date TEXT`;
    try { await sql`UPDATE cash_closings SET shift_date = date WHERE shift_date IS NULL`; } catch { /* best-effort */ }

    // ---- Shift reviews: whole-shift scope, flags, per-item scoring ----
    await sql`ALTER TABLE shift_reviews ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'individual'`;
    await sql`ALTER TABLE shift_reviews ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE shift_reviews ADD COLUMN IF NOT EXISTS auto_points INTEGER DEFAULT 0`;
    await sql`ALTER TABLE shift_reviews ADD COLUMN IF NOT EXISTS seen_at TIMESTAMP`;
    // Points/notes/flags attached to one concrete item of a shift.
    await sql`
      CREATE TABLE IF NOT EXISTS shift_review_items (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        work_date TEXT NOT NULL,
        kind TEXT NOT NULL,
        ref_id INTEGER NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        flagged BOOLEAN DEFAULT FALSE,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (employee_id, work_date, kind, ref_id)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS shift_review_items_lookup ON shift_review_items (team_id, employee_id, work_date)`;
    // per-step skip reasons on a run + which procedures are mandatory before the closing
    await sql`ALTER TABLE procedure_runs ADD COLUMN IF NOT EXISTS skip_reasons JSONB`;
    await sql`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS require_before_closing BOOLEAN DEFAULT FALSE`;
    // items/categories that only show inside their category, not on the "Vše" overview
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS hide_from_overview BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS hide_from_overview BOOLEAN DEFAULT FALSE`;
    // employee submissions await employer approval; NULL/TRUE = approved (legacy rows)
    await sql`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT TRUE`;
    await sql`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS submitted_by INTEGER`;
    await sql`ALTER TABLE guides ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT TRUE`;
    await sql`ALTER TABLE guides ADD COLUMN IF NOT EXISTS submitted_by INTEGER`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT TRUE`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS submitted_by INTEGER`;
    // one share link can be pinned to every dashboard (including the kiosk)
    await sql`ALTER TABLE share_links ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE`;
    // customer-facing "novinka / tip" badge on share pages
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS highlight TEXT`;
    // structured shift handover, stored with the closing that ends the shift
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS handover JSONB`;
    // stocktakes: one row per counted inventory session
    await sql`
      CREATE TABLE IF NOT EXISTS stocktakes (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        created_by INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        data JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )`;
    // suppliers as first-class entities; items/orders point at them
    await sql`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_id INTEGER`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_id INTEGER`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP`;
    // rewards catalog: what points can buy, and who asked for what
    await sql`
      CREATE TABLE IF NOT EXISTS rewards_catalog (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        icon TEXT,
        cost INTEGER NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS reward_redemptions (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        reward_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        cost INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        decided_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        decided_at TIMESTAMP
      )`;
    // guides that every employee must read, with read receipts
    await sql`ALTER TABLE guides ADD COLUMN IF NOT EXISTS require_read BOOLEAN DEFAULT FALSE`;
    await sql`
      CREATE TABLE IF NOT EXISTS guide_reads (
        id SERIAL PRIMARY KEY,
        guide_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        read_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (guide_id, user_id)
      )`;
    // quick polls inside the team chat
    await sql`
      CREATE TABLE IF NOT EXISTS polls (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        conversation_id INTEGER,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        created_by INTEGER NOT NULL,
        closed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS poll_votes (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        option_idx INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (poll_id, user_id)
      )`;
    // audit trail of the important writes, for the employer's eyes
    await sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        team_id INTEGER,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity TEXT,
        entity_id INTEGER,
        detail TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS audit_log_team ON audit_log (team_id, created_at DESC)`;
    // events: concerts, lectures, offsite tea-house trips — with crew,
    // checklist, packing list and a simple money outcome
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        kind TEXT DEFAULT 'other',
        date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        location TEXT,
        offsite BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'planned',
        public BOOLEAN DEFAULT FALSE,
        capacity INTEGER,
        checklist JSONB DEFAULT '[]',
        packing JSONB DEFAULT '[]',
        crew JSONB DEFAULT '[]',
        revenue INTEGER,
        costs INTEGER,
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS events_team_date ON events (team_id, date)`;
    // a shift can belong to an event (created from its crew assignment)
    await sql`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS event_id INTEGER`;
    // POS connection (Storyous): one per team, credentials live server-side only
    await sql`
      CREATE TABLE IF NOT EXISTS pos_connections (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT 'storyous',
        client_id TEXT NOT NULL,
        client_secret TEXT NOT NULL,
        merchant_id TEXT NOT NULL,
        place_id TEXT NOT NULL,
        place_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    await sql`ALTER TABLE pos_connections ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP`;
    // which POS product consumes which stock item (and how much per sale)
    await sql`
      CREATE TABLE IF NOT EXISTS pos_product_map (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT,
        item_id INTEGER NOT NULL,
        amount_per_sale NUMERIC NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (team_id, product_id)
      )`;
    // What sold, per day and product. Kept on our side so the monthly margin
    // analysis reads one table instead of re-downloading a month of bill items
    // from the POS (that would be a request per receipt).
    await sql`
      CREATE TABLE IF NOT EXISTS pos_sales (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT,
        qty NUMERIC NOT NULL DEFAULT 0,
        UNIQUE (team_id, date, product_id)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS pos_sales_team_date ON pos_sales (team_id, date)`;

    // bills already deducted — a receipt must never be written off twice
    await sql`
      CREATE TABLE IF NOT EXISTS pos_processed_bills (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        bill_id TEXT NOT NULL,
        processed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (team_id, bill_id)
      )`;
    // recipes: one POS product may consume SEVERAL stock items (wine + spice…)
    await sql`ALTER TABLE pos_product_map DROP CONSTRAINT IF EXISTS pos_product_map_team_id_product_id_key`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pos_product_map_ingredient
      ON pos_product_map (team_id, product_id, item_id)`;
    // what sold recently without a recipe — the "map me" queue
    await sql`
      CREATE TABLE IF NOT EXISTS pos_unmapped (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT,
        sold_count NUMERIC NOT NULL DEFAULT 0,
        last_seen TIMESTAMP DEFAULT NOW(),
        UNIQUE (team_id, product_id)
      )`;

    // ---- One closing per person per day, enforced at the database ----
    // (stub rows for covered coworkers are exempt). Guarded: teams with historic
    // duplicates keep working — the index just doesn't materialise for them.
    try {
      // Event closings live BESIDE the shop's daily closing, so the uniqueness
      // guard must ignore them — the old index (without event_id) blocked the
      // shop closing whenever an event closing existed for the same day.
      // …and it is one closing per SHIFT, not per day: covering the morning and
      // then the evening means two closings, both legitimate. Shiftless
      // closings still collapse to one per day (COALESCE), which is what the
      // double-submit guard was really for.
      // The old index lives under its own name; the per-shift one gets a new
      // name so a failed rename can't leave us silently on the old rule. Its
      // outcome is reported in the response — a swallowed migration here means
      // legitimate second closings keep bouncing with a duplicate error.
      // One closing per person per BUSINESS DAY — the day the till is counted
      // for. A Friday shift closed at 00:40 belongs to Friday, so the rule keys
      // on shift_date (falling back to date for rows filed before that column
      // existed), never on the calendar date the form happened to be submitted.
      //
      // Two lessons from production, both paid for:
      //   1. `DROP INDEX IF EXISTS <name>` reported success and left the old
      //      rule standing — it matches nothing when the object is owned by a
      //      constraint or lives in another schema. So old rules are looked up
      //      in the catalogue and removed by their real schema, constraint
      //      first.
      //   2. A bare `CREATE UNIQUE INDEX` also returned without error and left
      //      no index behind, while the same statement inside a DO block took
      //      effect. Creation therefore goes through a DO block too, and the
      //      outcome is read back from the catalogue instead of trusted.
      await sql`
        DO $do$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT schemaname, indexname FROM pg_indexes
            WHERE tablename = 'cash_closings'
              AND indexname IN ('cash_closings_one_per_day', 'cash_closings_one_per_shift')
          LOOP
            BEGIN
              EXECUTE format('ALTER TABLE %I.cash_closings DROP CONSTRAINT IF EXISTS %I',
                             r.schemaname, r.indexname);
            EXCEPTION WHEN others THEN NULL;
            END;
            EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.schemaname, r.indexname);
          END LOOP;
          IF to_regclass('cash_closings_one_per_business_day') IS NULL THEN
            CREATE UNIQUE INDEX cash_closings_one_per_business_day
            ON cash_closings (created_by, (COALESCE(shift_date, date)))
            WHERE covered_by IS NULL AND event_id IS NULL;
          END IF;
        END
        $do$;`;
      // One statement, one snapshot: asking to_regclass and pg_indexes in two
      // separate round trips gave contradictory answers, and a contradiction
      // between two connections tells you nothing. This asks both at once.
      const [after] = await sql`
        SELECT to_regclass('cash_closings_one_per_business_day')::text AS reg,
               (SELECT string_agg(schemaname || '.' || indexname, ', ' ORDER BY indexname)
                  FROM pg_indexes WHERE tablename = 'cash_closings') AS list,
               current_database() AS db, current_schema() AS schema`;
      closingIndex = after?.reg
        ? `one_per_business_day (${after.reg})`
        : `index nevznikl — ${after?.db}/${after?.schema}: ${after?.list ?? 'nic'}`;
    } catch (e) {
      // duplicates exist — SELECT-before-INSERT stays the only guard
      closingIndex = 'failed: ' + String(e).slice(0, 160);
    }
    // What the database actually ends up with. Reported because a migration
    // that reports success while the old rule survives is worse than one that
    // fails loudly — that combination cost a round of blind guessing.
    try {
      const rows = await sql`
        SELECT schemaname, indexname FROM pg_indexes
        WHERE tablename = 'cash_closings' ORDER BY indexname`;
      closingIndexes = (rows as any[]).map(r => `${r.schemaname}.${r.indexname}`);
      const cons = await sql`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'cash_closings'::regclass AND contype IN ('u', 'p')
        ORDER BY conname`;
      closingConstraints = (cons as any[]).map(r => r.conname);
    } catch { /* diagnostics only */ }

    // ---- Open-package tracking (tobacco tins, bottles, sacks…) ----
    // The category carries the settings; items inherit and only override size.
    await sql`ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS tracks_open BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS content_unit TEXT`;
    await sql`ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS default_package_size NUMERIC`;
    await sql`ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS scale JSONB`;
    // Subcategories: a category may sit under another one (one level deep).
    await sql`ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS parent_id INTEGER`;
    // Whether min/critical are counted in packages or in the content unit.
    await sql`ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS threshold_unit TEXT`;
    // What a new item in this category starts with, so the repeated fields are
    // filled in once on the category instead of on every product.
    await sql`ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS defaults JSONB`;
    // Shown on the item preview without opening it.
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS brand TEXT`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS description TEXT`;
    // Parked items: kept in the catalogue but out of the way until restocked.
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE`;

    // Items point at their category by id, so two subcategories under different
    // parents may share a name. `category` stays as the display label and as the
    // fallback for rows created before this ran.
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category_id INTEGER`;
    try {
      await sql`
        UPDATE inventory_items i
        SET category_id = c.id
        FROM inventory_categories c
        WHERE i.category_id IS NULL
          AND c.name = i.category
          AND c.team_id = i.team_id`;
    } catch { /* nothing to backfill */ }
    // Per item: how big its package is and how much is left in the open one.
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS package_size NUMERIC`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS open_amount NUMERIC`;
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS content_unit TEXT`;
    // Audit trail covers the open remainder too, so consumption is derivable.
    await sql`ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS old_open NUMERIC`;
    await sql`ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS new_open NUMERIC`;
    // A photo of the thing itself — the crew writes new stock in from the floor
    // and the picture is what makes „Sirup Mango" recognizable to the employer.
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS photo_url TEXT`;
    // Pojmenované porce položky: „panák 0,04 l", „do drinku 0,02 l". Definují
    // se jednou u položky a receptury je pak jen vybírají — místo aby se 0,02
    // přepisovalo u každého koktejlu znovu (a někde se spletl řád).
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS portions JSONB DEFAULT '[]'`;

    // Which build actually ran the migrations. `ok: true` alone is ambiguous —
    // an older deployment still answering during a rollout returns it too, and
    // then the new columns silently never get created.
    return NextResponse.json({
      ok: true,
      message: 'Databáze inicializována — všechny tabulky připraveny.',
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      // Migrations that are allowed to fail silently report their outcome here,
      // so a swallowed one can be seen from outside instead of guessed at.
      closingIndex,
      closingIndexes,
      closingConstraints,
    });
  } catch (error) {
    console.error('Init error:', error);
    return NextResponse.json({
      ok: false,
      error: String(error),
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    }, { status: 500 });
  }
}
