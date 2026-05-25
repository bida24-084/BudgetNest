// ============================================================
//  admin-db.js
//  Admin-only database operations.
//  All functions require the caller to be authenticated
//  with user_type = 'admin' — enforced by Supabase RLS.
// ============================================================

import { supabase, getCurrentUser } from './supabaseClient.js';


// ════════════════════════════════════════════════════════════
//  DASHBOARD STATS
// ════════════════════════════════════════════════════════════

/**
 * Returns top-level KPI counts for the dashboard header.
 */
export async function getDashboardStats() {
  const [
    { count: totalStudents },
    { count: totalBusinesses },
    { count: pendingListings },
    { count: newEnquiries },
    { count: activeListings },
    { count: suspendedUsers },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('user_type', 'student'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('user_type', 'business'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('is_verified', false).eq('is_active', true),
    supabase.from('enquiries').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_suspended', true),
  ]);

  // Monthly revenue: sum of business_revenue for current month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: revenueData } = await supabase
    .from('business_revenue')
    .select('amount')
    .gte('date', monthStart.toISOString().split('T')[0]);

  const monthlyRevenue = (revenueData || [])
    .reduce((sum, r) => sum + parseFloat(r.amount), 0);

  return {
    totalStudents:   totalStudents  ?? 0,
    totalBusinesses: totalBusinesses ?? 0,
    pendingListings: pendingListings ?? 0,
    newEnquiries:    newEnquiries    ?? 0,
    activeListings:  activeListings  ?? 0,
    suspendedUsers:  suspendedUsers  ?? 0,
    monthlyRevenue:  +monthlyRevenue.toFixed(2),
  };
}

/**
 * Revenue grouped by month for the last 6 months.
 * Returns array of { month: 'Jan 2026', revenue: 1750, costs: 5000 }
 */
export async function getRevenueChart() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const from = sixMonthsAgo.toISOString().split('T')[0];

  const [{ data: rev }, { data: costs }] = await Promise.all([
    supabase.from('business_revenue').select('amount, date').gte('date', from),
    supabase.from('business_costs').select('amount, date').gte('date', from),
  ]);

  const months = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleString('default', { month: 'short', year: 'numeric' });
    months[key] = { month: key, revenue: 0, costs: 0 };
  }

  (rev || []).forEach(r => {
    const key = new Date(r.date).toLocaleString('default', { month: 'short', year: 'numeric' });
    if (months[key]) months[key].revenue += parseFloat(r.amount);
  });
  (costs || []).forEach(r => {
    const key = new Date(r.date).toLocaleString('default', { month: 'short', year: 'numeric' });
    if (months[key]) months[key].costs += parseFloat(r.amount);
  });

  return Object.values(months);
}


// ════════════════════════════════════════════════════════════
//  LISTINGS MANAGEMENT
// ════════════════════════════════════════════════════════════

/** Get all listings with their owner's business name. */
export async function getAllListings({ status = 'all', category = null } = {}) {
  let query = supabase
    .from('listings')
    .select('*, profiles(business_name, email, phone)')
    .order('created_at', { ascending: false });

  if (status === 'pending')  query = query.eq('is_verified', false).eq('is_active', true);
  if (status === 'verified') query = query.eq('is_verified', true).eq('is_active', true);
  if (status === 'inactive') query = query.eq('is_active', false);
  if (category)              query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw new Error('getAllListings: ' + error.message);
  return data;
}

/** Approve (verify) a listing and log the action. */
export async function approveListing(listingId, adminNote = '') {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('listings')
    .update({ is_verified: true, is_active: true })
    .eq('id', listingId)
    .select()
    .single();

  if (error) throw new Error('approveListing: ' + error.message);
  await logAction(user.id, 'approved_listing', 'listings', listingId,
    `Approved listing "${data.title}"${adminNote ? ': ' + adminNote : ''}`);
  return data;
}

/** Reject a listing (deactivate without verifying). */
export async function rejectListing(listingId, reason = '') {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('listings')
    .update({ is_active: false, is_verified: false })
    .eq('id', listingId)
    .select()
    .single();

  if (error) throw new Error('rejectListing: ' + error.message);
  await logAction(user.id, 'rejected_listing', 'listings', listingId,
    `Rejected listing "${data.title}"${reason ? ': ' + reason : ''}`);
  return data;
}

/** Toggle a listing's active state. */
export async function toggleListingActive(listingId, isActive) {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('listings')
    .update({ is_active: isActive })
    .eq('id', listingId)
    .select()
    .single();

  if (error) throw new Error('toggleListingActive: ' + error.message);
  await logAction(user.id, isActive ? 'activated_listing' : 'deactivated_listing',
    'listings', listingId, `${isActive ? 'Activated' : 'Deactivated'} listing "${data.title}"`);
  return data;
}


// ════════════════════════════════════════════════════════════
//  USER MANAGEMENT
// ════════════════════════════════════════════════════════════

/** Get all users with optional type filter and search. */
export async function getAllUsers({ userType = 'all', search = '' } = {}) {
  let query = supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (userType !== 'all') query = query.eq('user_type', userType);
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%,student_id.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error('getAllUsers: ' + error.message);
  return data;
}

/** Suspend a user account. */
export async function suspendUser(userId, reason = '') {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_suspended: true, suspended_reason: reason })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error('suspendUser: ' + error.message);
  await logAction(user.id, 'suspended_user', 'profiles', userId,
    `Suspended user "${data.full_name}"${reason ? ': ' + reason : ''}`);
  return data;
}

/** Reactivate a suspended user. */
export async function reinstateUser(userId) {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_suspended: false, suspended_reason: null })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error('reinstateUser: ' + error.message);
  await logAction(user.id, 'reinstated_user', 'profiles', userId,
    `Reinstated user "${data.full_name}"`);
  return data;
}


// ════════════════════════════════════════════════════════════
//  ENQUIRIES
// ════════════════════════════════════════════════════════════

/** Get all business enquiries with optional status filter. */
export async function getEnquiries({ status = 'all' } = {}) {
  let query = supabase
    .from('enquiries')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });

  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error('getEnquiries: ' + error.message);
  return data;
}

/** Update an enquiry status and optionally assign to a team member. */
export async function updateEnquiry(enquiryId, { status, adminNote, assignedTo } = {}) {
  const user = await getCurrentUser();
  const updates = {};
  if (status)     updates.status     = status;
  if (adminNote !== undefined) updates.admin_note = adminNote;
  if (assignedTo) updates.assigned_to = assignedTo;

  const { data, error } = await supabase
    .from('enquiries')
    .update(updates)
    .eq('id', enquiryId)
    .select()
    .single();

  if (error) throw new Error('updateEnquiry: ' + error.message);
  await logAction(user.id, 'updated_enquiry', 'enquiries', enquiryId,
    `Set enquiry from "${data.name}" to ${status}`);
  return data;
}

/** Save an enquiry from the public contact form (no auth required). */
export async function submitEnquiry({ name, phone, email, category, description, heardFrom }) {
  const { data, error } = await supabase
    .from('enquiries')
    .insert({ name, phone, email, category, description, heard_from: heardFrom })
    .select()
    .single();

  if (error) throw new Error('submitEnquiry: ' + error.message);
  return data;
}


// ════════════════════════════════════════════════════════════
//  TEAM / AUDIT LOG
// ════════════════════════════════════════════════════════════

/** Get admin team members. */
export async function getAdminTeam() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_type', 'admin')
    .order('created_at');

  if (error) throw new Error('getAdminTeam: ' + error.message);
  return data;
}

/** Get recent audit log entries. */
export async function getAuditLog({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('getAuditLog: ' + error.message);
  return data;
}

/** Internal helper — write an audit log entry. */
async function logAction(adminId, action, targetTable, targetId, detail) {
  await supabase.from('audit_log').insert({
    admin_id: adminId, action, target_table: targetTable,
    target_id: targetId, detail,
  });
}
