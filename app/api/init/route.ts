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
    await sql`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS remind_at TEXT`;
    await sql`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS remind_days JSONB DEFAULT '[]'`;
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
        created_at TIMESTAMP DEFAULT NOW()
      )`;
    // team payout mode: whether staff are paid daily in cash (enables self_payout field)
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS pay_daily_cash BOOLEAN DEFAULT FALSE`;

    // ---- Noisium integration (per-team) ----
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS noisium_token TEXT`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS noisium_project_id TEXT`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS noisium_base_url TEXT`;
    await sql`ALTER TABLE planning_cards ADD COLUMN IF NOT EXISTS noisium_task_id TEXT`;

    return NextResponse.json({ ok: true, message: 'Databáze inicializována — všechny tabulky připraveny.' });
  } catch (error) {
    console.error('Init error:', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
