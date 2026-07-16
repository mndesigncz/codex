import { pgTable, text, timestamp, integer, boolean, serial, pgEnum, jsonb } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['employer', 'employee']);
export const shiftTypeEnum = pgEnum('shift_type', ['morning', 'afternoon', 'flexible']);
export const priorityEnum = pgEnum('priority', ['high', 'medium', 'low']);

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: integer('owner_id').notNull(),
  joinCode: text('join_code').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('employee'),
  avatar: text('avatar').default('👤'),
  phone: text('phone'),
  jobTitle: text('job_title').default('Barista'),
  shiftPreference: shiftTypeEnum('shift_preference').default('flexible'),
  employerId: integer('employer_id'),
  teamId: integer('team_id'),
  theme: text('theme').default('light'), // light | dark | system
  createdAt: timestamp('created_at').defaultNow(),
});

// Email invitations for employees to join a team
export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  jobTitle: text('job_title').default('Barista'),
  invitedBy: integer('invited_by').notNull(),
  status: text('status').default('pending'), // pending | accepted | revoked
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Shifts & scheduling
// ---------------------------------------------------------------------------
export const shifts = pgTable('shifts', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id'),
  employeeId: integer('employee_id').notNull(),
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  type: shiftTypeEnum('type').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const shiftRequests = pgTable('shift_requests', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull(),
  requestType: text('request_type').notNull(),
  date: text('date').notNull(),
  note: text('note'),
  status: text('status').default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Monthly availability submitted by employees for the next month's schedule
export const availabilityRequests = pgTable('availability_requests', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  employeeId: integer('employee_id').notNull(),
  month: text('month').notNull(), // YYYY-MM
  unavailableDates: jsonb('unavailable_dates').default([]), // string[] of YYYY-MM-DD
  preferredShift: text('preferred_shift').default('flexible'),
  maxShifts: integer('max_shifts'),
  note: text('note'),
  status: text('status').default('submitted'), // submitted | processed
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id'),
  name: text('name').notNull(),
  category: text('category').notNull(),
  quantity: integer('quantity').notNull().default(0),
  minQuantity: integer('min_quantity').notNull().default(5),
  criticalQuantity: integer('critical_quantity').notNull().default(2),
  maxQuantity: integer('max_quantity').notNull().default(100),
  unit: text('unit').notNull().default('ks'),
  supplier: text('supplier'),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const inventoryLog = pgTable('inventory_log', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id').notNull(),
  userId: integer('user_id').notNull(),
  oldQuantity: integer('old_quantity').notNull(),
  newQuantity: integer('new_quantity').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const inventoryReports = pgTable('inventory_reports', {
  id: serial('id').primaryKey(),
  reportedBy: integer('reported_by').notNull(),
  items: text('items').notNull(),
  note: text('note'),
  status: text('status').default('new'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Chat (team channel + direct threads, with attachments)
// ---------------------------------------------------------------------------
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  type: text('type').notNull().default('direct'), // team | direct
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const conversationMembers = pgTable('conversation_members', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull(),
  userId: integer('user_id').notNull(),
  lastReadAt: timestamp('last_read_at').defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull(),
  senderId: integer('sender_id').notNull(),
  content: text('content'),
  attachmentUrl: text('attachment_url'),
  attachmentType: text('attachment_type'), // image | file
  attachmentName: text('attachment_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Legacy single-channel messages (kept for backwards compatibility)
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  senderId: integer('sender_id').notNull(),
  channel: text('channel').notNull().default('general'),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Guides / návody
// ---------------------------------------------------------------------------
export const guideCategories = pgTable('guide_categories', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon').default('book'),
  position: integer('position').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const guides = pgTable('guides', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  categoryId: integer('category_id'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  checklist: jsonb('checklist').default([]), // string[] optional checklist steps
  createdBy: integer('created_by').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Tasks, planning, reports, recipes
// ---------------------------------------------------------------------------
export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  assignedTo: integer('assigned_to').notNull(),
  createdBy: integer('created_by').notNull(),
  priority: priorityEnum('priority').notNull().default('medium'),
  status: text('status').default('pending'),
  dueDate: text('due_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const planningCards = pgTable('planning_cards', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  column: text('column').notNull().default('ideas'),
  position: integer('position').default(0),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const dailyReports = pgTable('daily_reports', {
  id: serial('id').primaryKey(),
  date: text('date').notNull(),
  revenue: integer('revenue').notNull().default(0),
  customers: integer('customers').notNull().default(0),
  notes: text('notes'),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ingredients: text('ingredients').notNull(),
  instructions: text('instructions').notNull(),
  prepTime: integer('prep_time').default(5),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Notifications & push
// ---------------------------------------------------------------------------
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  type: text('type').default('info'), // info | chat | inventory | shift | invite
  link: text('link'),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Procedures / checklists (otevíračka, zavíračka, custom postupy)
// ---------------------------------------------------------------------------
export const procedures = pgTable('procedures', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon').default('check'),
  color: text('color').default('lime'),
  items: jsonb('items').default([]), // string[] of step texts
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const procedureRuns = pgTable('procedure_runs', {
  id: serial('id').primaryKey(),
  procedureId: integer('procedure_id').notNull(),
  teamId: integer('team_id').notNull(),
  userId: integer('user_id').notNull(),
  checkedItems: jsonb('checked_items').default([]), // number[] indexes checked
  totalItems: integer('total_items').default(0),
  status: text('status').default('running'), // running | completed
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  durationSeconds: integer('duration_seconds'),
});

// Custom inventory categories per team
export const inventoryCategories = pgTable('inventory_categories', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  name: text('name').notNull(),
  position: integer('position').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Shift types, opening hours, scheduling preferences (v2)
// ---------------------------------------------------------------------------
export const shiftTypes = pgTable('shift_types', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  name: text('name').notNull(),          // e.g. "Ranní"
  startTime: text('start_time').notNull(), // "06:00"
  endTime: text('end_time').notNull(),     // "14:00"
  color: text('color').default('lime'),
  position: integer('position').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Employer-assigned recurring days ("this day is theirs")
export const fixedAssignments = pgTable('fixed_assignments', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id').notNull(),
  employeeId: integer('employee_id').notNull(),
  weekday: integer('weekday').notNull(),   // 0=Mon .. 6=Sun
  shiftTypeId: integer('shift_type_id'),   // optional preferred shift type
  createdAt: timestamp('created_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Noisium (Plan app) integration — per-team connection
// ---------------------------------------------------------------------------
// Note: these live on the teams table via ALTER in the init route:
//   teams.noisium_token TEXT, teams.noisium_project_id TEXT, teams.noisium_base_url TEXT
