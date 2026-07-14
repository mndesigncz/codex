import { pgTable, text, timestamp, integer, boolean, serial, pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['employer', 'employee']);
export const shiftTypeEnum = pgEnum('shift_type', ['morning', 'afternoon', 'flexible']);
export const priorityEnum = pgEnum('priority', ['high', 'medium', 'low']);

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
  createdAt: timestamp('created_at').defaultNow(),
});

export const shifts = pgTable('shifts', {
  id: serial('id').primaryKey(),
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

export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  quantity: integer('quantity').notNull().default(0),
  minQuantity: integer('min_quantity').notNull().default(5),
  maxQuantity: integer('max_quantity').notNull().default(100),
  unit: text('unit').notNull().default('ks'),
  supplier: text('supplier'),
});

export const inventoryReports = pgTable('inventory_reports', {
  id: serial('id').primaryKey(),
  reportedBy: integer('reported_by').notNull(),
  items: text('items').notNull(),
  note: text('note'),
  status: text('status').default('new'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  senderId: integer('sender_id').notNull(),
  channel: text('channel').notNull().default('general'),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

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
