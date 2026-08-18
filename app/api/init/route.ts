import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);

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
    // A closing belongs to the whole shift, not just its author.
    await sql`ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS shift_employees JSONB DEFAULT '[]'`;

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
    // Audit trail covers the open remainder too, so consumption is derivable.
    await sql`ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS old_open NUMERIC`;
    await sql`ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS new_open NUMERIC`;

    // Which build actually ran the migrations. `ok: true` alone is ambiguous —
    // an older deployment still answering during a rollout returns it too, and
    // then the new columns silently never get created.
    return NextResponse.json({
      ok: true,
      message: 'Databáze inicializována — všechny tabulky připraveny.',
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
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
