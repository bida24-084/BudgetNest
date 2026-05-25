// ============================================================
//  db.js
//  CRUD operations for all budget tables
//  All functions are RLS-safe — Supabase automatically filters
//  rows to only those owned by the currently signed-in user.
// ============================================================

import { supabase, getCurrentUser } from './supabaseClient.js';


// ════════════════════════════════════════════════════════════
//  SHARED HELPER
// ════════════════════════════════════════════════════════════

async function uid() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}


// ════════════════════════════════════════════════════════════
//  STUDENT — EXPENSES
// ════════════════════════════════════════════════════════════

/**
 * Add a new expense.
 * @param {{ title, amount, category, note?, date? }} item
 */
export async function createExpense({ title, amount, category, note = '', date = null }) {
  const studentId = await uid();
  const { data, error } = await supabase
    .from('student_expenses')
    .insert({
      student_id: studentId,
      title,
      amount,
      category,
      note,
      date: date || new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) throw new Error('createExpense: ' + error.message);
  return data;
}

/**
 * Get all expenses for the current student.
 * Optional filters: category, dateFrom, dateTo
 */
export async function getExpenses({ category = null, dateFrom = null, dateTo = null } = {}) {
  const studentId = await uid();
  let query = supabase
    .from('student_expenses')
    .select('*')
    .eq('student_id', studentId)
    .order('date', { ascending: false });

  if (category)  query = query.eq('category', category);
  if (dateFrom)  query = query.gte('date', dateFrom);
  if (dateTo)    query = query.lte('date', dateTo);

  const { data, error } = await query;
  if (error) throw new Error('getExpenses: ' + error.message);
  return data;
}

/**
 * Update an existing expense by id.
 * Only the owning student can update (enforced by RLS).
 */
export async function updateExpense(id, fields) {
  const { data, error } = await supabase
    .from('student_expenses')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error('updateExpense: ' + error.message);
  return data;
}

/** Delete an expense by id. */
export async function deleteExpense(id) {
  const { error } = await supabase
    .from('student_expenses')
    .delete()
    .eq('id', id);

  if (error) throw new Error('deleteExpense: ' + error.message);
  return true;
}


// ════════════════════════════════════════════════════════════
//  STUDENT — INCOME
// ════════════════════════════════════════════════════════════

export async function createIncome({ title, amount, source, note = '', date = null }) {
  const studentId = await uid();
  const { data, error } = await supabase
    .from('student_income')
    .insert({
      student_id: studentId,
      title,
      amount,
      source,
      note,
      date: date || new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) throw new Error('createIncome: ' + error.message);
  return data;
}

export async function getIncome({ source = null, dateFrom = null, dateTo = null } = {}) {
  const studentId = await uid();
  let query = supabase
    .from('student_income')
    .select('*')
    .eq('student_id', studentId)
    .order('date', { ascending: false });

  if (source)   query = query.eq('source', source);
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo)   query = query.lte('date', dateTo);

  const { data, error } = await query;
  if (error) throw new Error('getIncome: ' + error.message);
  return data;
}

export async function updateIncome(id, fields) {
  const { data, error } = await supabase
    .from('student_income')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error('updateIncome: ' + error.message);
  return data;
}

export async function deleteIncome(id) {
  const { error } = await supabase
    .from('student_income')
    .delete()
    .eq('id', id);

  if (error) throw new Error('deleteIncome: ' + error.message);
  return true;
}

/**
 * Student budget summary: total income, total expenses, balance.
 * Optional: pass dateFrom / dateTo to scope to a month.
 */
export async function getStudentSummary({ dateFrom = null, dateTo = null } = {}) {
  const [expenses, income] = await Promise.all([
    getExpenses({ dateFrom, dateTo }),
    getIncome({ dateFrom, dateTo }),
  ]);
  const totalExpenses = expenses.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  const totalIncome   = income.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  return {
    totalIncome:    +totalIncome.toFixed(2),
    totalExpenses:  +totalExpenses.toFixed(2),
    balance:        +(totalIncome - totalExpenses).toFixed(2),
    expenseRows:    expenses,
    incomeRows:     income,
  };
}


// ════════════════════════════════════════════════════════════
//  BUSINESS — OPERATIONAL COSTS
// ════════════════════════════════════════════════════════════

export async function createCost({ title, amount, category, note = '', date = null }) {
  const businessId = await uid();
  const { data, error } = await supabase
    .from('business_costs')
    .insert({
      business_id: businessId,
      title,
      amount,
      category,
      note,
      date: date || new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) throw new Error('createCost: ' + error.message);
  return data;
}

export async function getCosts({ category = null, dateFrom = null, dateTo = null } = {}) {
  const businessId = await uid();
  let query = supabase
    .from('business_costs')
    .select('*')
    .eq('business_id', businessId)
    .order('date', { ascending: false });

  if (category)  query = query.eq('category', category);
  if (dateFrom)  query = query.gte('date', dateFrom);
  if (dateTo)    query = query.lte('date', dateTo);

  const { data, error } = await query;
  if (error) throw new Error('getCosts: ' + error.message);
  return data;
}

export async function updateCost(id, fields) {
  const { data, error } = await supabase
    .from('business_costs')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error('updateCost: ' + error.message);
  return data;
}

export async function deleteCost(id) {
  const { error } = await supabase
    .from('business_costs')
    .delete()
    .eq('id', id);

  if (error) throw new Error('deleteCost: ' + error.message);
  return true;
}


// ════════════════════════════════════════════════════════════
//  BUSINESS — REVENUE
// ════════════════════════════════════════════════════════════

export async function createRevenue({ title, amount, stream, note = '', date = null }) {
  const businessId = await uid();
  const { data, error } = await supabase
    .from('business_revenue')
    .insert({
      business_id: businessId,
      title,
      amount,
      stream,
      note,
      date: date || new Date().toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) throw new Error('createRevenue: ' + error.message);
  return data;
}

export async function getRevenue({ stream = null, dateFrom = null, dateTo = null } = {}) {
  const businessId = await uid();
  let query = supabase
    .from('business_revenue')
    .select('*')
    .eq('business_id', businessId)
    .order('date', { ascending: false });

  if (stream)   query = query.eq('stream', stream);
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo)   query = query.lte('date', dateTo);

  const { data, error } = await query;
  if (error) throw new Error('getRevenue: ' + error.message);
  return data;
}

export async function updateRevenue(id, fields) {
  const { data, error } = await supabase
    .from('business_revenue')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error('updateRevenue: ' + error.message);
  return data;
}

export async function deleteRevenue(id) {
  const { error } = await supabase
    .from('business_revenue')
    .delete()
    .eq('id', id);

  if (error) throw new Error('deleteRevenue: ' + error.message);
  return true;
}

/**
 * Business P&L summary: total revenue, total costs, profit.
 */
export async function getBusinessSummary({ dateFrom = null, dateTo = null } = {}) {
  const [costs, revenue] = await Promise.all([
    getCosts({ dateFrom, dateTo }),
    getRevenue({ dateFrom, dateTo }),
  ]);
  const totalCosts   = costs.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  const totalRevenue = revenue.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  return {
    totalRevenue:  +totalRevenue.toFixed(2),
    totalCosts:    +totalCosts.toFixed(2),
    profit:        +(totalRevenue - totalCosts).toFixed(2),
    costRows:      costs,
    revenueRows:   revenue,
  };
}


// ════════════════════════════════════════════════════════════
//  LISTINGS  (Businesses write; all authenticated users read)
// ════════════════════════════════════════════════════════════

export async function createListing({ title, description, category, price, pricePeriod = 'once' }) {
  const businessId = await uid();
  const { data, error } = await supabase
    .from('listings')
    .insert({
      business_id:  businessId,
      title,
      description,
      category,
      price,
      price_period: pricePeriod,
    })
    .select()
    .single();

  if (error) throw new Error('createListing: ' + error.message);
  return data;
}

/** Fetch all ACTIVE listings (any authenticated user). Optional category filter. */
export async function getListings({ category = null } = {}) {
  let query = supabase
    .from('listings')
    .select('*, profiles(business_name, phone)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw new Error('getListings: ' + error.message);
  return data;
}

/** Fetch listings belonging to the currently signed-in business. */
export async function getMyListings() {
  const businessId = await uid();
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) throw new Error('getMyListings: ' + error.message);
  return data;
}

export async function updateListing(id, fields) {
  const { data, error } = await supabase
    .from('listings')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error('updateListing: ' + error.message);
  return data;
}

/** Soft-delete: set is_active = false instead of destroying the row. */
export async function deactivateListing(id) {
  return updateListing(id, { is_active: false });
}

export async function deleteListing(id) {
  const { error } = await supabase
    .from('listings')
    .delete()
    .eq('id', id);

  if (error) throw new Error('deleteListing: ' + error.message);
  return true;
}
