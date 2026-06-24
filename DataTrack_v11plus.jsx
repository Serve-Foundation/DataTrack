const { useState, useMemo, useEffect } = React;

const SUPABASE_URL = "https://fusfagflbqxmzftfwddd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1c2ZhZ2ZsYnF4bXpmdGZ3ZGRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4Nzk0MDQsImV4cCI6MjA5NDQ1NTQwNH0.TL5ix8s0Ehj1idPraFagYi0ABrsQ_tSSmP3pEeXNZcQ";
const APP_BASE_URL = "https://serve-foundation.github.io/DataTrack/";
const isSupabaseConfigured = SUPABASE_URL.startsWith("https://") && !SUPABASE_ANON_KEY.startsWith("PASTE_");
const sb = isSupabaseConfigured && typeof supabase !== "undefined"
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
const formatAuthError = (err, action) => {
  const message = err?.message || err || "";
  if (message === "Failed to fetch" || err?.name === "AuthRetryableFetchError") {
    return `Could not reach Supabase to ${action}. The configured project URL is not resolving: ${SUPABASE_URL}`;
  }
  return message || `Unable to ${action}.`;
};

function normalizeMultiValueFields() {
  CONTACTS.forEach(c => {
    if (typeof c.email === "string") { c.emails = c.email ? [{ value: c.email, label: "work", is_primary: true }] : []; delete c.email; }
    if (typeof c.phone === "string") { c.phones = c.phone ? [{ value: c.phone, label: "work", is_primary: true }] : []; delete c.phone; }
    if (!c.emails) c.emails = [];
    if (!c.phones) c.phones = [];
  });
  AGENCIES.forEach(a => {
    if (typeof a.general_email === "string") { a.emails = a.general_email ? [{ value: a.general_email, label: "main", is_primary: true }] : []; delete a.general_email; }
    if (typeof a.general_phone === "string") { a.phones = a.general_phone ? [{ value: a.general_phone, label: "main", is_primary: true }] : []; delete a.general_phone; }
    if (!a.emails) a.emails = [];
    if (!a.phones) a.phones = [];
  });
}

function recomputeAgencyCounts() {
  Object.keys(contactCountMap).forEach(k => delete contactCountMap[k]);
  CONTACTS.forEach(c => { contactCountMap[c.agency_id] = (contactCountMap[c.agency_id] || 0) + 1; });
  Object.keys(datasetCountMap).forEach(k => delete datasetCountMap[k]);
  DATASETS.forEach(d => { datasetCountMap[d.agency_id] = (datasetCountMap[d.agency_id] || 0) + 1; });
}

async function loadSupabaseSeedTables() {
  if (!sb) return { error: isSupabaseConfigured ? "Supabase client failed to initialize." : "" };
  const tables = [
    ["agencies", AGENCIES],
    ["contacts", CONTACTS],
    ["datasets", DATASETS],
    ["communications", COMMUNICATIONS],
    ["requests", REQUESTS],
    ["tasks", TASKS],
    ["notes", NOTES],
    ["data_reviews", DATA_REVIEWS],
    ["users", SYSTEM_USERS],
    ["email_templates", EMAIL_TEMPLATES],
    ["feedback_presets", FEEDBACK_PRESETS],
  ];
  tables.forEach(([, target]) => target.splice(0, target.length));
  const results = await Promise.all(tables.map(([table]) => sb.from(table).select("*")));
  const error = results.find(result => result.error)?.error;
  if (error) return { error: error.message };
  results.forEach((result, index) => {
    const target = tables[index][1];
    target.splice(0, target.length, ...(result.data || []));
  });
  normalizeMultiValueFields();
  recomputeAgencyCounts();
  return { error: "" };
}

function setupRealtimeSubscriptions(setSaveKey) {
  if (!sb) return null;
  const TABLE_MAP = [
    ["agencies",        AGENCIES],
    ["contacts",        CONTACTS],
    ["datasets",        DATASETS],
    ["communications",  COMMUNICATIONS],
    ["requests",        REQUESTS],
    ["tasks",           TASKS],
    ["notes",           NOTES],
    ["data_reviews",    DATA_REVIEWS],
    ["users",           SYSTEM_USERS],
    ["email_templates", EMAIL_TEMPLATES],
    ["feedback_presets",FEEDBACK_PRESETS],
  ];
  const channel = sb.channel("datatrack-realtime");
  TABLE_MAP.forEach(([table, array]) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      const { eventType, new: rec, old: oldRec } = payload;
      if (eventType === "INSERT") {
        if (!array.find(r => r.id === rec.id)) array.push(rec);
      } else if (eventType === "UPDATE") {
        const idx = array.findIndex(r => r.id === rec.id);
        if (idx > -1) Object.assign(array[idx], rec);
        else array.push(rec);
      } else if (eventType === "DELETE") {
        const idx = array.findIndex(r => r.id === oldRec.id);
        if (idx > -1) array.splice(idx, 1);
      }
      normalizeMultiValueFields();
      recomputeAgencyCounts();
      setSaveKey(k => k + 1);
    });
  });
  channel.subscribe();
  return channel;
}

async function deleteAgencyRecord(agencyId) {
  if (sb) {
    const { error } = await sb.from("agencies").delete().eq("id", agencyId);
    if (error) throw error;
  }
  const idx = AGENCIES.findIndex(a => a.id === agencyId);
  if (idx > -1) AGENCIES.splice(idx, 1);
  recomputeAgencyCounts();
}

async function deleteRequestRecord(requestId) {
  if (sb) {
    const { error } = await sb.from("requests").delete().eq("id", requestId);
    if (error) throw error;
  }
  const idx = REQUESTS.findIndex(r => r.id === requestId);
  if (idx > -1) REQUESTS.splice(idx, 1);
}

async function deleteCommunicationRecord(commId) {
  if (sb) {
    const { error } = await sb.from("communications").delete().eq("id", commId);
    if (error) throw error;
  }
  const idx = COMMUNICATIONS.findIndex(c => c.id === commId);
  if (idx > -1) COMMUNICATIONS.splice(idx, 1);
}

const pickDbFields = (obj, keys) => keys.reduce((acc, key) => {
  if (obj[key] !== undefined) acc[key] = obj[key];
  return acc;
}, {});

const normalizeDbPayload = (payload) => {
  const cleaned = { ...payload };
  ["agency_id", "contact_id", "dataset_id", "request_id", "sent_to_contact"].forEach(key => {
    if (cleaned[key] === "") cleaned[key] = null;
  });
  return cleaned;
};

async function saveSupabaseBackedRecord(table, array, idPrefix, localRecord, dbFields) {
  let savedRecord = { ...localRecord };
  const isExisting = savedRecord.id && !String(savedRecord.id).startsWith("new");
  if (!savedRecord.id || String(savedRecord.id).startsWith("new")) savedRecord.id = `${idPrefix}_${Date.now()}`;
  if (!savedRecord.created_at) savedRecord.created_at = new Date().toISOString();
  const payload = normalizeDbPayload({ ...pickDbFields(savedRecord, dbFields), id: savedRecord.id });
  if (sb) {
    const result = isExisting
      ? await sb.from(table).update(payload).eq("id", savedRecord.id).select().single()
      : await sb.from(table).insert(payload).select().single();
    if (result.error) throw result.error;
    savedRecord = { ...savedRecord, ...(result.data || {}) };
  }
  const idx = array.findIndex(item => item.id === savedRecord.id);
  if (idx > -1) Object.assign(array[idx], savedRecord);
  else array.push(savedRecord);
  normalizeMultiValueFields();
  recomputeAgencyCounts();
  return savedRecord;
}

// ═══ SUPABASE-BACKED DATA ARRAYS ═══
const AGENCIES = [];

const CONTACTS = [];

const COUNTIES = ["Alameda","Alpine","Amador","Butte","Calaveras","Colusa","Contra Costa","Fresno","Humboldt","Imperial","Inyo","Kern","Kings","Lake","Los Angeles","Marin","Mendocino","Napa","Nevada","Orange","Placer","Plumas","Riverside","Sacramento","San Benito","San Bernardino","San Francisco","San Luis Obispo","San Mateo","Santa Barbara","Santa Clara","Shasta","Siskiyou","Sonoma","Sutter","Tehama","Trinity","Tulare","Ventura","Yolo","Yuba"];

const DATASETS = [];

const datasetCountMap = {};
DATASETS.forEach(d => { datasetCountMap[d.agency_id] = (datasetCountMap[d.agency_id] || 0) + 1; });

const NOTES = [];

const COMMUNICATIONS = [];

const REQUESTS = [];

// ═══ CONTACT DETAIL ═══
function ContactDetail({ contactId, onBack, onNav, onAgency, onEditRecord, onOpenCommForm }) {
  const contact = CONTACTS.find(c => c.id === contactId);
  if (!contact) return React.createElement("div", { style: { padding: 40, textAlign: "center", color: "#9CA3A0" } }, "Contact not found.");

  const agency = AGENCIES.find(a => a.id === contact.agency_id);
  const contactComms = COMMUNICATIONS.filter(c => c.contact_id === contactId || (c.agency_id === contact.agency_id));
  const [tab, setTab] = useState("details");
  const deptColors = { "Code Enforcement": { bg: "#FEF3C7", color: "#92400E" }, "Building": { bg: "#CCFBF1", color: "#115E59" }, "Legal": { bg: "#EDE9FE", color: "#5B21B6" }, "Main Office": { bg: "#D1FAE5", color: "#065F46" } };
  const dc = deptColors[contact.department] || { bg: "#F5F2EE", color: "#525252" };
  const primaryEmail = getPrimaryEmail(contact);
  const primaryPhone = getPrimaryPhone(contact);

  const tabs = [
    { id: "details", label: "Details" },
    { id: "communications", label: "Communications", count: contactComms.length },
    { id: "notes", label: "Notes", count: NOTES.filter(n => n.entity_type === "contact" && n.entity_id === contactId).length },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, padding: 0, border: "none", background: "none", color: "#14B8A6", fontSize: 13, cursor: "pointer", marginBottom: 16, fontWeight: 500, fontFamily: F }}>
        <Icon name="arrow_left" size={15} color="#14B8A6" /> Back to Contacts
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>{contact.first_name} {contact.last_name}</h1>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, backgroundColor: dc.bg, color: dc.color }}>{contact.department}</span>
            {contact.is_active === false && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, fontWeight: 600, backgroundColor: "#FEE2E2", color: "#DC2626" }}>ARCHIVED</span>}
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>{contact.title} · {agency?.name}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canLogComm() && <button onClick={() => onOpenCommForm && onOpenCommForm(contact.agency_id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
            {"✉"} Log Communication
          </button>}
          {canTask() && <button onClick={() => onEditRecord && onEditRecord({ type: "task_create", record: { contact_id: contactId, agency_id: contact.agency_id } })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
            + Task
          </button>}
          {canEdit() && <button onClick={() => onEditRecord && onEditRecord({ type: "contact", record: { ...contact } })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#fff", color: "#0F766E", border: "1px solid #99F6E4", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
            Edit Contact
          </button>}
        </div>
      </div>

      {/* Info cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div style={{ padding: "14px 16px", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Icon name="mail" size={14} color="#9CA3A0" />
            <span style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 500, textTransform: "uppercase", fontFamily: F }}>Email(s)</span>
          </div>
          {(contact.emails||[]).length === 0 ? <div style={{ fontSize: 13, color: "#D1CDC8" }}>{"\u2014"}</div> :
            (contact.emails||[]).map((e,i) => (
              <div key={i} style={{ fontSize: 13, color: "#0D9488", fontWeight: e.is_primary ? 600 : 400, fontFamily: F }}>
                {e.value} <span style={{ fontSize: 10, color: "#9CA3A0" }}>({e.label}){e.is_primary ? " \u2605" : ""}</span>
              </div>
            ))
          }
        </div>
        <div style={{ padding: "14px 16px", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Icon name="phone" size={14} color="#9CA3A0" />
            <span style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 500, textTransform: "uppercase", fontFamily: F }}>Phone(s)</span>
          </div>
          {(contact.phones||[]).length === 0 ? <div style={{ fontSize: 13, color: "#D1CDC8" }}>{"\u2014"}</div> :
            (contact.phones||[]).map((p,i) => (
              <div key={i} style={{ fontSize: 13, color: "#171717", fontWeight: p.is_primary ? 600 : 400, fontFamily: F }}>
                {p.value} <span style={{ fontSize: 10, color: "#9CA3A0" }}>({p.label}){p.is_primary ? " \u2605" : ""}</span>
              </div>
            ))
          }
        </div>
        <div style={{ padding: "14px 16px", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Icon name="building" size={14} color="#9CA3A0" />
            <span style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 500, textTransform: "uppercase", fontFamily: F }}>Agency</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0D9488", cursor: "pointer", fontFamily: F }} onClick={() => { onNav("agencies"); onAgency(contact.agency_id); }}>{agency?.name || "\u2014"}</div>
          <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 2 }}>{agency?.jurisdiction} County</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #E8E4DF", marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: F, color: tab === t.id ? "#0F766E" : "#6B7280", borderBottom: tab === t.id ? "2px solid #0F766E" : "2px solid transparent", marginBottom: -2 }}>
            {t.label}
            {t.count !== undefined && <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 9999, backgroundColor: tab === t.id ? "#CCFBF1" : "#F5F2EE", color: tab === t.id ? "#0F766E" : "#9CA3A0" }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "20px 24px" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: "0 0 16px", fontFamily: F }}>Contact Information</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13, color: "#525252", lineHeight: 2.2 }}>
            <div>
              <div><strong>Full Name:</strong> {contact.first_name} {contact.last_name}</div>
              <div><strong>Title:</strong> {contact.title || "\u2014"}</div>
              <div><strong>Department:</strong> {contact.department || "\u2014"}</div>
              <div><strong>Primary Contact:</strong> {contact.is_primary ? "Yes" : "No"}</div>
              <div><strong>Status:</strong> {contact.is_active !== false ? "Active" : "Archived"}</div>
            </div>
            <div>
              <div><strong>Agency:</strong> <span style={{ color: "#0D9488", cursor: "pointer" }} onClick={() => { onNav("agencies"); onAgency(contact.agency_id); }}>{agency?.name}</span></div>
              <div><strong>County:</strong> {agency?.jurisdiction || "\u2014"}</div>
            </div>
          </div>
        </div>
      )}

      {tab === "communications" && (
        <div>
          {contactComms.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", color: "#9CA3A0", fontSize: 13 }}>No communications logged.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {contactComms.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10).map(comm => (
                <div key={comm.id} style={{ padding: "12px 16px", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{CHANNEL_ICONS[comm.channel]}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{comm.subject}</span>
                    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, backgroundColor: comm.direction === "outbound" ? "#CCFBF1" : "#D1FAE5", color: comm.direction === "outbound" ? "#115E59" : "#065F46", fontWeight: 600 }}>{comm.direction === "outbound" ? "\u2197" : "\u2199"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 3 }}>{comm.user_name} · {formatDateTime(comm.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "notes" && <NotesPanel entityType="contact" entityId={contactId} />}
    </div>
  );
}

// ═══ CONNECT DASHBOARD ═══

// ═══ ADMIN DATA ═══
const SYSTEM_USERS = [];

const EMAIL_TEMPLATES = [];

const SYSTEM_SETTINGS = {
  shared_email: "",
  org_name: "DataTrack",
  default_followup_email: 5,
  default_followup_phone: 3,
  default_followup_foia: 14,
  default_followup_portal: 7,
};

const TASKS = [];

const DATA_REVIEWS = [];

const FEEDBACK_PRESETS = [];

// ═══ ROLE-BASED PERMISSIONS ═══
let CURRENT_ROLE = "viewer";
let PREVIEW_ROLE = null;
const effectiveRole  = () => PREVIEW_ROLE ?? CURRENT_ROLE;
const canCreate  = () => ["admin", "specialist", "analyst"].includes(effectiveRole());
const canEdit    = () => ["admin", "specialist", "analyst"].includes(effectiveRole());
const canDelete  = () => effectiveRole() === "admin";
const canLogComm = () => ["admin", "specialist", "analyst"].includes(effectiveRole());
const canTask    = () => effectiveRole() !== "viewer";
const canNote    = () => effectiveRole() !== "viewer";
const canReview  = () => effectiveRole() !== "viewer";
const isAdmin    = () => CURRENT_ROLE === "admin";

const TASK_TYPE_CONFIG = {
  follow_up: { label: "Follow-up", color: "#D97706", bg: "#FEF3C7" },
  data_review: { label: "Data Review", color: "#7C3AED", bg: "#EDE9FE" },
  outreach: { label: "Outreach", color: "#0F766E", bg: "#CCFBF1" },
  clarification: { label: "Clarification", color: "#0891B2", bg: "#CFFAFE" },
  general: { label: "General", color: "#6B7280", bg: "#F5F2EE" },
};

const PRIORITY_CONFIG = {
  low: { label: "Low", color: "#9CA3A0", bg: "#F5F2EE" },
  normal: { label: "Normal", color: "#0F766E", bg: "#CCFBF1" },
  high: { label: "High", color: "#D97706", bg: "#FEF3C7" },
  urgent: { label: "Urgent", color: "#DC2626", bg: "#FEE2E2" },
};

const REVIEW_STATUS_CONFIG = {
  pending: { label: "Pending", color: "#6B7280", bg: "#F5F2EE" },
  approved: { label: "Approved", color: "#059669", bg: "#D1FAE5" },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEE2E2" },
  needs_revision: { label: "Needs Revision", color: "#D97706", bg: "#FEF3C7" },
  needs_clarification: { label: "Needs Clarification", color: "#7C3AED", bg: "#EDE9FE" },
};


// Precompute contact/dataset counts per agency
const contactCountMap = {};
CONTACTS.forEach(c => { contactCountMap[c.agency_id] = (contactCountMap[c.agency_id] || 0) + 1; });

// Normalize contacts/agencies to multi-value format
CONTACTS.forEach(c => {
  if (typeof c.email === "string") { c.emails = c.email ? [{ value: c.email, label: "work", is_primary: true }] : []; delete c.email; }
  if (typeof c.phone === "string") { c.phones = c.phone ? [{ value: c.phone, label: "work", is_primary: true }] : []; delete c.phone; }
  if (!c.emails) c.emails = [];
  if (!c.phones) c.phones = [];
});
AGENCIES.forEach(a => {
  if (typeof a.general_email === "string") { a.emails = a.general_email ? [{ value: a.general_email, label: "main", is_primary: true }] : []; delete a.general_email; }
  if (typeof a.general_phone === "string") { a.phones = a.general_phone ? [{ value: a.general_phone, label: "main", is_primary: true }] : []; delete a.general_phone; }
  if (!a.emails) a.emails = [];
  if (!a.phones) a.phones = [];
});
const getPrimaryEmail = (rec) => { const e = (rec.emails||[]).find(e => e.is_primary) || (rec.emails||[])[0]; return e ? e.value : ""; };
const getPrimaryPhone = (rec) => { const p = (rec.phones||[]).find(p => p.is_primary) || (rec.phones||[])[0]; return p ? p.value : ""; };

// ═══ CONSTANTS ═══
const F = "'Plus Jakarta Sans', system-ui, sans-serif";
const sel = { padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#525252", backgroundColor: "#fff", cursor: "pointer", fontFamily: F };
const AGENCY_TYPES = { city: "City", county: "County", state: "State", federal: "Federal", special_district: "Special District" };
const STATUS_CONFIG = {
  identified: { label: "Identified", color: "#6B7280", bg: "#F3F4F6" },
  contacted: { label: "Contacted", color: "#D97706", bg: "#FEF3C7" },
  negotiating: { label: "Negotiating", color: "#7C3AED", bg: "#EDE9FE" },
  acquired: { label: "Acquired", color: "#0D9488", bg: "#CCFBF1" },
  automated: { label: "Automated", color: "#059669", bg: "#D1FAE5" },
  active: { label: "Active", color: "#047857", bg: "#A7F3D0" },
  discontinued: { label: "Discontinued", color: "#DC2626", bg: "#FEE2E2" },
};
const CATEGORY_LABELS = { code_violations: "Code Violations", tax_liens: "Tax Liens", tax_sales: "Tax Sales", permits: "Permits", assessments: "Assessments", foreclosures: "Foreclosures", other: "Other" };
const METHOD_LABELS = { api: "API", foia: "FOIA", portal: "Portal", scraping: "Scraping", direct_purchase: "Direct Purchase", manual_request: "Manual Request", unknown: "Unknown" };
const FORMAT_LABELS = { csv: "CSV", excel: "Excel", json: "JSON", xml: "XML", pdf: "PDF", api: "API", database_dump: "DB Dump", web_portal: "Web Portal" };
const DELIVERY_LABELS = { email: "Email", ftp: "FTP", api: "API", portal_download: "Portal", other: "Other" };
const FREQ_LABELS = { real_time: "Real-time", daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annually: "Annually", one_time: "One-time", unknown: "Unknown" };

const REQ_TYPE_CONFIG = {
  cpra: { label: "CPRA", color: "#7C3AED", bg: "#EDE9FE" },
  foia: { label: "FOIA", color: "#0D9488", bg: "#CCFBF1" },
  api_access: { label: "API Access", color: "#059669", bg: "#D1FAE5" },
  portal_registration: { label: "Portal Reg.", color: "#0891B2", bg: "#CFFAFE" },
  manual_request: { label: "Manual", color: "#D97706", bg: "#FEF3C7" },
  purchase: { label: "Purchase", color: "#DC2626", bg: "#FEE2E2" },
};
const REQ_STATUS_CONFIG = {
  draft: { label: "Draft", color: "#9CA3A0", bg: "#F5F2EE" },
  submitted: { label: "Submitted", color: "#0D9488", bg: "#CCFBF1" },
  awaiting_response: { label: "Awaiting Response", color: "#D97706", bg: "#FEF3C7" },
  in_progress: { label: "In Progress", color: "#7C3AED", bg: "#EDE9FE" },
  received: { label: "Received", color: "#059669", bg: "#D1FAE5" },
  closed: { label: "Closed", color: "#525252", bg: "#F5F2EE" },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEE2E2" },
};
const CHANNEL_ICONS = { email: "\u2709", phone: "\u260E", portal: "\u25EB", foia: "\u229F", in_person: "\u2295", other: "\u25C7" };

function formatDate(d) { if (!d) return "\u2014"; return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function formatDateTime(d) { if (!d) return "\u2014"; return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

// ═══ COMPONENTS ═══
function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || { label: status, color: "#6B7280", bg: "#F3F4F6" };
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 600, letterSpacing: "0.03em", color: c.color, backgroundColor: c.bg, textTransform: "uppercase" }}>{c.label}</span>;
}

function TypeBadge({ type }) {
  const colors = { city: { bg: "#CCFBF1", color: "#115E59" }, county: { bg: "#D1FAE5", color: "#065F46" }, special_district: { bg: "#FEF3C7", color: "#92400E" } };
  const s = colors[type] || { bg: "#F3F4F6", color: "#4B5563" };
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: s.color, backgroundColor: s.bg, textTransform: "capitalize" }}>{AGENCY_TYPES[type] || type}</span>;
}

function Icon({ name, size = 18, color = "currentColor" }) {
  const p = {
    building: <><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1" strokeLinecap="round"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></>,
    database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></>,
    message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></>,
    chevron: <path d="M9 18l6-6-6-6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    mail: <><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>,
    globe: <><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></>,
    arrow_left: <><path d="M19 12H5M12 19l-7-7 7-7"/></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></>,
    chevL: <path d="M15 18l-6-6 6-6"/>,
    chevR: <path d="M9 18l6-6-6-6"/>,
    help_circle: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" style={{ flexShrink: 0 }}>{p[name]}</svg>;
}

const SIDEBAR_W = 220;

const NAV_ITEMS = [
  { id: "dashboard", icon: "home", label: "Dashboard" },
  { id: "agencies", icon: "building", label: "Agencies" },
  { id: "datasets", icon: "database", label: "Datasets" },
  { id: "communications", icon: "message", label: "Communications" },
  { id: "contacts", icon: "users", label: "Contacts" },
  { id: "requests", icon: "mail", label: "Requests" },
  { id: "tasks", icon: "clock", label: "Tasks" },
  { id: "help", icon: "help_circle", label: "Help" },
];

const VALID_PAGES = new Set([...NAV_ITEMS.map(item => item.id), "settings"]);
const PAGE_STORAGE_KEY = "datatrack_active_page";
function getInitialPage() {
  try {
    const savedPage = window.localStorage.getItem(PAGE_STORAGE_KEY);
    return VALID_PAGES.has(savedPage) ? savedPage : "dashboard";
  } catch {
    return "dashboard";
  }
}
function persistPage(pageId) {
  if (!VALID_PAGES.has(pageId)) return;
  try {
    window.localStorage.setItem(PAGE_STORAGE_KEY, pageId);
  } catch {}
}

function Sidebar({ active, onNav, onAgency, currentUser, onSignOut }) {
  const displayName = currentUser?.user_metadata?.full_name || currentUser?.email || "User";
  const initials = displayName.split(/\s|@/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "U";
  return (
    <div style={{ width: SIDEBAR_W, minWidth: SIDEBAR_W, height: "100vh", backgroundColor: "#1A1A2E", display: "flex", flexDirection: "column", position: "fixed", left: 0, top: 0, zIndex: 100 }}>
      <div style={{ padding: "20px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #14B8A6, #0D9488)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>DT</span>
          </div>
          <div>
            <div style={{ color: "#F1F5F9", fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: F }}>DataTrack</div>
            <div style={{ color: "#5EEAD4", fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Acquire</div>
          </div>
        </div>
      </div>
      <nav style={{ padding: "4px 8px", flex: 1 }}>
        {NAV_ITEMS.map(item => {
          const isA = active === item.id;
          return (
            <button key={item.id} onClick={() => { onNav(item.id); if (item.id === "agencies") onAgency(null); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", marginBottom: 2, border: "none", borderRadius: 6, cursor: "pointer",
                backgroundColor: isA ? "rgba(20,184,166,0.12)" : "transparent",
                color: isA ? "#5EEAD4" : "#94A3B8" }}
              onMouseEnter={e => { if (!isA) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (!isA) e.currentTarget.style.backgroundColor = isA ? "rgba(20,184,166,0.12)" : "transparent"; }}>
              <Icon name={item.icon} size={17} />
              <span style={{ fontSize: 13, fontWeight: isA ? 600 : 400, fontFamily: F }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{ padding: "12px 8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {isAdmin() && <button onClick={() => onNav("settings")} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", border: "none", borderRadius: 6, cursor: "pointer", backgroundColor: active === "settings" ? "rgba(20,184,166,0.12)" : "transparent", color: active === "settings" ? "#5EEAD4" : "#64748B" }}>
          <Icon name="settings" size={17} />
          <span style={{ fontSize: 13, fontFamily: F }}>Settings</span>
        </button>}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 4px" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "#115E59", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#99F6E4", fontSize: 11, fontWeight: 700 }}>{initials}</span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: "#CBD5E1", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
            <button onClick={onSignOut} style={{ padding: 0, border: "none", background: "none", color: "#5EEAD4", fontSize: 10, cursor: "pointer", fontFamily: F }}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ AGENCY LIST ═══
const PER_PAGE = 25;

function AgencyList({ onSelect, initFilter, onNewRecord }) {
  const [search, setSearch] = useState(initFilter?.search || "");
  const [county, setCounty] = useState(initFilter?.county || "all");
  const [type, setType] = useState(initFilter?.type || "all");
  const [sortBy, setSort] = useState("name");
  const [pg, setPg] = useState(1);
  const [version, setVersion] = useState(0);

  const filtered = useMemo(() => {
    let r = AGENCIES.filter(a => {
      if (search) { const s = search.toLowerCase(); if (!a.name.toLowerCase().includes(s) && !a.jurisdiction.toLowerCase().includes(s)) return false; }
      if (county !== "all" && a.jurisdiction !== county) return false;
      if (type !== "all" && a.agency_type !== type) return false;
      return true;
    });
    r.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "county") return a.jurisdiction.localeCompare(b.jurisdiction);
      if (sortBy === "contacts") return (contactCountMap[b.id]||0) - (contactCountMap[a.id]||0);
      return 0;
    });
    return r;
  }, [search, county, type, sortBy, version]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const page = Math.min(pg, totalPages || 1);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const resetPage = () => setPg(1);
  const deleteAgency = async (agency, e) => {
    e.stopPropagation();
    const linkedContacts = contactCountMap[agency.id] || 0;
    const linkedDatasets = datasetCountMap[agency.id] || 0;
    const warning = linkedContacts || linkedDatasets
      ? `\n\nThis agency has ${linkedContacts} contact(s) and ${linkedDatasets} dataset(s). Supabase may block deletion until linked records are removed.`
      : "";
    if (!window.confirm(`Delete ${agency.name}?${warning}`)) return;
    try {
      await deleteAgencyRecord(agency.id);
      setVersion(v => v + 1);
    } catch (error) {
      window.alert(`Unable to delete agency: ${error.message || "Unknown error"}`);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Agencies</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>{filtered.length} agencies across {new Set(filtered.map(a => a.jurisdiction)).size} counties</p>
        </div>
        {canCreate() && <button onClick={() => onNewRecord && onNewRecord({ type: "agency", record: {} })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
          <Icon name="plus" size={15} color="#fff" /> Add Agency
        </button>}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 180 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={15} color="#9CA3A0" /></div>
          <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder="Search agencies or counties..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, outline: "none", color: "#262626", backgroundColor: "#fff", boxSizing: "border-box", fontFamily: F }} />
        </div>
        <select value={county} onChange={e => { setCounty(e.target.value); resetPage(); }} style={sel}>
          <option value="all">All Counties ({COUNTIES.length})</option>
          {COUNTIES.map(c => <option key={c} value={c}>{c} County</option>)}
        </select>
        <select value={type} onChange={e => { setType(e.target.value); resetPage(); }} style={sel}>
          <option value="all">All Types</option>
          <option value="city">City</option>
          <option value="county">County</option>
          <option value="special_district">Special District</option>
        </select>
        <select value={sortBy} onChange={e => setSort(e.target.value)} style={sel}>
          <option value="name">Name</option>
          <option value="county">County</option>
          <option value="contacts">Most Contacts</option>
        </select>
      </div>

      <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAF9F7" }}>
              {["Agency", "County", "Type", "Website", "Datasets", "Contacts", ""].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E8E4DF", fontFamily: F }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((a, i) => (
              <tr key={a.id} onClick={() => onSelect(a.id)}
                style={{ cursor: "pointer", borderBottom: i < paged.length - 1 ? "1px solid #F0EDE8" : "none", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#F8FAFC"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{a.name}</div>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: "#525252" }}>{a.jurisdiction}</td>
                <td style={{ padding: "12px 16px" }}><TypeBadge type={a.agency_type} /></td>
                <td style={{ padding: "12px 16px", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.website ? <a href={a.website} target="_blank" rel="noopener noreferrer" style={{ color: "#0D9488", textDecoration: "none" }} onClick={e => e.stopPropagation()}>{a.website.replace(/https?:\/\//, '').replace(/\/$/, '')}</a> : <span style={{ color: "#D1CDC8" }}>\u2014</span>}
                </td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: datasetCountMap[a.id] ? "#7C3AED" : "#D1CDC8", fontWeight: datasetCountMap[a.id] ? 600 : 400 }}>{datasetCountMap[a.id] || 0}</td>
                <td style={{ padding: "12px 16px", fontSize: 13, color: contactCountMap[a.id] ? "#0F766E" : "#D1CDC8", fontWeight: contactCountMap[a.id] ? 600 : 400 }}>{contactCountMap[a.id] || 0}</td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  {canDelete() && <button onClick={(e) => deleteAgency(a, e)} style={{ padding: "5px 9px", border: "1px solid #FCA5A5", borderRadius: 5, backgroundColor: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: F }}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#9CA3A0", fontSize: 13 }}>No agencies match your filters.</div>}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 13, color: "#6B7280", fontFamily: F }}>
          <span>Showing {(page-1)*PER_PAGE+1} - {Math.min(page*PER_PAGE, filtered.length)} of {filtered.length}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPg(p => Math.max(1, p-1))} disabled={page <= 1}
              style={{ padding: "6px 10px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.4 : 1, fontSize: 12 }}>
              <Icon name="chevL" size={14} color="#525252" />
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <button key={p} onClick={() => setPg(p)}
                  style={{ padding: "6px 10px", border: "1px solid", borderColor: p === page ? "#0F766E" : "#E8E4DF", borderRadius: 6, backgroundColor: p === page ? "#0F766E" : "#fff", color: p === page ? "#fff" : "#525252", cursor: "pointer", fontSize: 12, fontWeight: p === page ? 700 : 400, minWidth: 34 }}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPg(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
              style={{ padding: "6px 10px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.4 : 1, fontSize: 12 }}>
              <Icon name="chevR" size={14} color="#525252" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ AGENCY DETAIL ═══
function AgencyDetail({ agencyId, onBack, onOpenForm, onDelete, onEditRecord, onViewContact }) {
  const agency = AGENCIES.find(a => a.id === agencyId);
  const agContacts = CONTACTS.filter(c => c.agency_id === agencyId);
  const [tab, setTab] = useState("contacts");

  if (!agency) return <div style={{ padding: 40, textAlign: "center", color: "#9CA3A0" }}>Agency not found.</div>;

  const agNotes = NOTES.filter(n => n.entity_type === "agency" && n.entity_id === agencyId);
  const tabs = [
    { id: "contacts", label: "Contacts", count: agContacts.length },
    { id: "datasets", label: "Datasets", count: DATASETS.filter(d => d.agency_id === agencyId).length },
    { id: "communications", label: "Communications", count: COMMUNICATIONS.filter(c => c.agency_id === agencyId).length },
    { id: "notes", label: "Notes", count: agNotes.length },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, padding: 0, border: "none", background: "none", color: "#14B8A6", fontSize: 13, cursor: "pointer", marginBottom: 16, fontWeight: 500, fontFamily: F }}>
        <Icon name="arrow_left" size={15} color="#14B8A6" /> Back to Agencies
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>{agency.name}</h1>
            <TypeBadge type={agency.agency_type} />
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>{agency.jurisdiction} County, {agency.state}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canDelete() && <button onClick={() => onDelete && onDelete(agency)} style={{ padding: "8px 14px", backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FCA5A5", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
            Delete
          </button>}
          {canLogComm() && <button onClick={() => onOpenForm && onOpenForm(agencyId)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
            <Icon name="message" size={14} color="#fff" /> Log Communication
          </button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { icon: "globe", label: "Website", value: agency.website ? new URL(agency.website).hostname : "\u2014", href: agency.website },
          { icon: "phone", label: "Phone", value: agency.general_phone || "\u2014" },
          { icon: "mail", label: "Email", value: agency.general_email || "\u2014" },
          { icon: "users", label: "Contacts", value: String(agContacts.length) },
        ].map(card => (
          <div key={card.label} style={{ padding: "14px 16px", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Icon name={card.icon} size={14} color="#9CA3A0" />
              <span style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: F }}>{card.label}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {card.href ? <a href={card.href} target="_blank" rel="noopener noreferrer" style={{ color: "#0D9488", textDecoration: "none" }}>{card.value}</a> : card.value}
            </div>
          </div>
        ))}
      </div>

      {agency.notes && (
        <div style={{ padding: "12px 16px", backgroundColor: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A", marginBottom: 24, fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
          <strong style={{ fontSize: 12 }}>Department Notes:</strong> {agency.notes}
        </div>
      )}

      <div style={{ display: "flex", gap: 0, borderBottom: "2px dashed #E8E4DF", marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: F, color: tab === t.id ? "#0F766E" : "#6B7280", borderBottom: tab === t.id ? "2px solid #0F766E" : "2px solid transparent", marginBottom: -2 }}>
            {t.label}
            <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 9999, backgroundColor: tab === t.id ? "#CCFBF1" : "#F5F2EE", color: tab === t.id ? "#0F766E" : "#9CA3A0" }}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "contacts" && (
        <div>
          {canCreate() && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => onEditRecord && onEditRecord({ type: "contact", record: { agency_id: agencyId, is_active: true } })} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", backgroundColor: "#F8F6F3", color: "#525252", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: F }}>
              <Icon name="plus" size={13} color="#525252" /> Add Contact
            </button>
          </div>}
          {agContacts.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>\uD83D\uDCCB</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#525252", fontFamily: F }}>No contacts yet</div>
              <div style={{ fontSize: 12, color: "#9CA3A0", marginTop: 4 }}>Add a contact to start tracking outreach for this agency</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
              {agContacts.map(c => (
                <div key={c.id} onClick={() => onViewContact && onViewContact(c.id)} style={{ padding: "14px 16px", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", cursor: onViewContact ? "pointer" : "default" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#171717", fontFamily: F }}>
                        {c.first_name} {c.last_name}
                        {c.is_primary && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 9999, backgroundColor: "#CCFBF1", color: "#0F766E", fontWeight: 600 }}>PRIMARY</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{c.title}</div>
                    </div>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, backgroundColor: c.department === "Code Enforcement" ? "#FEF3C7" : c.department === "Building" ? "#CCFBF1" : c.department === "Legal" ? "#EDE9FE" : "#F5F2EE", color: c.department === "Code Enforcement" ? "#92400E" : c.department === "Building" ? "#1E40AF" : c.department === "Legal" ? "#5B21B6" : "#6B7280", fontWeight: 600 }}>{c.department}</span>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                    {getPrimaryEmail(c) && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#525252" }}><Icon name="mail" size={12} color="#9CA3A0" /> {getPrimaryEmail(c)}</div>}
                    {getPrimaryPhone(c) && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#525252" }}><Icon name="phone" size={12} color="#9CA3A0" /> {getPrimaryPhone(c)}</div>}
                    {!getPrimaryEmail(c) && !getPrimaryPhone(c) && <div style={{ fontSize: 12, color: "#D1CDC8", fontStyle: "italic" }}>No contact details on file</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "datasets" && (() => {
        const agDs = DATASETS.filter(d => d.agency_id === agencyId);
        return agDs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", backgroundColor: "#fff", borderRadius: 8, border: "2px dashed #E2E8F0" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>\uD83D\uDDC3\uFE0F</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#525252", fontFamily: F }}>No datasets tracked yet</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {agDs.map(ds => (
              <div key={ds.id} style={{ padding: "14px 16px", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#99F6E4"} onMouseLeave={e => e.currentTarget.style.borderColor = "#E8E4DF"}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#171717", fontFamily: F }}>{ds.name}</span>
                    <StatusBadge status={ds.acquisition_status} />
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "#6B7280" }}>
                    <span>{CATEGORY_LABELS[ds.data_category]}</span>
                    <span>Method: {METHOD_LABELS[ds.acquisition_method] || "Unknown"}</span>
                    <span>Refresh: {FREQ_LABELS[ds.refresh_frequency] || "Unknown"}</span>
                    {ds.cost_amount > 0 && <span style={{ color: "#D97706", fontWeight: 600 }}>${ds.cost_amount}</span>}
                    {ds.automation_feasible && <span style={{ color: "#059669", fontWeight: 600 }}>\u2713 Automatable</span>}
                  </div>
                </div>
                <Icon name="chevron" size={16} color="#D1CDC8" />
              </div>
            ))}
          </div>
        );
      })()}

      {tab === "communications" && (() => {
        const agComms = COMMUNICATIONS.filter(c => c.agency_id === agencyId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        const datasetMap = {}; DATASETS.forEach(d => { datasetMap[d.id] = d; });
        const contactMap = {}; CONTACTS.forEach(c => { contactMap[c.id] = c; });
        const channelColors = { email: "#CCFBF1", phone: "#D1FAE5", portal: "#EDE9FE", foia: "#FEF3C7", other: "#F3F4F6" };
        return agComms.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", backgroundColor: "#fff", borderRadius: 8, border: "2px dashed #E2E8F0" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{"\u2709\uFE0F"}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#525252", fontFamily: F }}>No communications logged</div>
            <div style={{ fontSize: 12, color: "#9CA3A0", marginTop: 4 }}>Click "Log Communication" to record your first interaction</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {agComms.map(comm => {
              const ds = comm.dataset_id ? datasetMap[comm.dataset_id] : null;
              const ct = comm.contact_id ? contactMap[comm.contact_id] : null;
              const isOverdue = comm.follow_up_status === "open" && new Date(comm.follow_up_date) < new Date();
              return (
                <div key={comm.id} style={{ padding: "14px 16px", backgroundColor: "#fff", borderRadius: 8, border: isOverdue ? "1px solid #FCA5A5" : "1px solid #E8E4DF", borderLeft: isOverdue ? "3px solid #DC2626" : "3px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 10, flex: 1 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: channelColors[comm.channel] || "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                        {CHANNEL_ICONS[comm.channel] || "\u25C7"}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{comm.subject}</span>
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 600, backgroundColor: comm.direction === "outbound" ? "#CCFBF1" : "#D1FAE5", color: comm.direction === "outbound" ? "#1E40AF" : "#065F46" }}>{comm.direction === "outbound" ? "\u2197 OUT" : "\u2199 IN"}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 3 }}>
                          {comm.user_name}{ct ? ` \u2192 ${ct.first_name} ${ct.last_name}` : ""}{ds ? ` · ${ds.name}` : ""}
                        </div>
                        <p style={{ fontSize: 12, color: "#6B7280", margin: "6px 0 0", lineHeight: 1.5 }}>{comm.body}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 11, color: "#9CA3A0" }}>{formatDateTime(comm.created_at)}</div>
                      {comm.follow_up_status === "open" && (
                        <div style={{ fontSize: 10, marginTop: 6, padding: "2px 8px", borderRadius: 4, display: "inline-block", fontWeight: 600, backgroundColor: isOverdue ? "#FEE2E2" : "#FEF3C7", color: isOverdue ? "#DC2626" : "#D97706" }}>
                          {isOverdue ? "\u26A0 Overdue" : "\u23F0 " + formatDate(comm.follow_up_date)}
                        </div>
                      )}
                      {comm.follow_up_status === "completed" && (
                        <div style={{ fontSize: 10, marginTop: 6, padding: "2px 8px", borderRadius: 4, display: "inline-block", fontWeight: 600, backgroundColor: "#D1FAE5", color: "#059669" }}>{"\u2713"} Done</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {tab === "notes" && <NotesPanel entityType="agency" entityId={agencyId} />}
    </div>
  );
}

// ═══ DASHBOARD ═══
function Dashboard({ onNav, onAgency, dashRole, onDashRoleChange: setDashRole }) {
  const typeCounts = {};
  AGENCIES.forEach(a => { typeCounts[a.agency_type] = (typeCounts[a.agency_type] || 0) + 1; });

  const topCounties = useMemo(() => {
    const cc = {};
    AGENCIES.forEach(a => { cc[a.jurisdiction] = (cc[a.jurisdiction] || 0) + 1; });
    return Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, []);

  const withContacts = AGENCIES.filter(a => contactCountMap[a.id]);
  const withWebsite = AGENCIES.filter(a => a.website);
  const overdueComms = COMMUNICATIONS.filter(c => c.follow_up_status === "open" && new Date(c.follow_up_date) < new Date());
  const openFollowUps = COMMUNICATIONS.filter(c => c.follow_up_status === "open");

  const statusCounts = useMemo(() => {
    const c = {};
    DATASETS.forEach(d => { c[d.acquisition_status] = (c[d.acquisition_status] || 0) + 1; });
    return c;
  }, []);

  const cardStyle = (color) => ({
    padding: 16, backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: "0 0 4px", fontFamily: F }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>California statewide data acquisition overview</p>
        </div>
        {isAdmin() ? (
          <select value={dashRole} onChange={e => setDashRole(e.target.value)}
            style={{ padding: "8px 14px", border: "1px solid #0F766E", borderRadius: 6, fontSize: 13, color: "#525252", backgroundColor: "#fff", cursor: "pointer", fontFamily: F, fontWeight: 600 }}>
            <option value="admin">Admin View</option>
            <option value="specialist">Acquisition Specialist</option>
            <option value="analyst">Data Analyst</option>
            <option value="viewer">Viewer</option>
          </select>
        ) : (
          <div style={{ padding: "8px 14px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#525252", backgroundColor: "#fff", fontFamily: F, fontWeight: 600 }}>
            {{ admin: "Admin View", specialist: "Acquisition Specialist", analyst: "Data Analyst", viewer: "Viewer" }[CURRENT_ROLE] || CURRENT_ROLE}
          </div>
        )}
      </div>

      {/* Row 1: Key metrics — all clickable */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Agencies", value: AGENCIES.length, color: "#0F766E", onClick: () => onNav("agencies") },
          { label: "Counties", value: typeCounts.county || 0, color: "#7C3AED", onClick: () => onNav("agencies", { type: "county" }) },
          { label: "Cities", value: typeCounts.city || 0, color: "#0891B2", onClick: () => onNav("agencies", { type: "city" }) },
          { label: "Total Datasets", value: DATASETS.length, color: "#059669", onClick: () => onNav("datasets") },
          { label: "Open Requests", value: REQUESTS.filter(r => !["closed","received","rejected"].includes(r.status)).length, color: "#7C3AED", onClick: () => onNav("requests") },
          { label: "Total Contacts", value: CONTACTS.length, color: "#D97706", onClick: () => onNav("contacts") },
          { label: "Open Tasks", value: TASKS.filter(t => t.status === "open" || t.status === "in_progress").length, color: "#0891B2", onClick: () => onNav("tasks") },
          { label: "Overdue Follow-ups", value: overdueComms.length, color: overdueComms.length > 0 ? "#DC2626" : "#059669", onClick: () => onNav("tasks", { status: "overdue", view: "team" }) },
        ].map(s => (
          <div key={s.label} onClick={s.onClick} style={cardStyle(s.color)}
            onMouseEnter={e => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.boxShadow = `0 2px 8px ${s.color}20`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#E8E4DF"; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6, fontFamily: F }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: F }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Row 2: Pipeline — clickable statuses */}
      <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "16px 20px", marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: "0 0 14px", fontFamily: F }}>Acquisition Pipeline <span style={{ fontWeight: 400, fontSize: 12, color: "#9CA3A0" }}>— click any stage to drill in</span></h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(STATUS_CONFIG).filter(([k]) => k !== "discontinued").map(([status, config]) => (
            <div key={status} onClick={() => onNav("datasets", { status })}
              style={{ flex: "1 1 100px", padding: "10px 12px", borderRadius: 6, backgroundColor: config.bg, textAlign: "center", minWidth: 90, cursor: "pointer", transition: "transform 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
              <div style={{ fontSize: 22, fontWeight: 700, color: config.color, fontFamily: F }}>{statusCounts[status] || 0}</div>
              <div style={{ fontSize: 11, color: config.color, fontWeight: 500, marginTop: 2 }}>{config.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Analyst view: Dataset category breakdown */}
      {dashRole === "analyst" && (
        <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "16px 20px", marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: "0 0 14px", fontFamily: F }}>Dataset Categories</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
              const count = DATASETS.filter(d => d.data_category === cat).length;
              if (count === 0) return null;
              const autoCount = DATASETS.filter(d => d.data_category === cat && d.automation_feasible).length;
              return (
                <div key={cat} onClick={() => onNav("datasets", { category: cat })}
                  style={{ flex: "1 1 140px", padding: "12px", borderRadius: 6, backgroundColor: "#FAF9F7", cursor: "pointer", textAlign: "center", border: "1px solid #E8E4DF" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#14B8A6"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#E8E4DF"}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#0F766E", fontFamily: F }}>{count}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#525252", marginTop: 2 }}>{label}</div>
                  <div style={{ fontSize: 10, color: "#9CA3A0", marginTop: 2 }}>{autoCount} automatable</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Specialist view: My assigned requests */}
      {dashRole === "specialist" && (
        <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>My Open Requests</h2>
            <button onClick={() => onNav("requests")} style={{ padding: "4px 10px", backgroundColor: "#F5F2EE", color: "#525252", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>View All {"→"}</button>
          </div>
          {REQUESTS.filter(r => r.assigned_to === "Sarah Chen" && !["closed","received","rejected"].includes(r.status)).slice(0, 5).map(r => {
            const ag = AGENCIES.find(a => a.id === r.agency_id);
            const rs = REQ_STATUS_CONFIG[r.status];
            return (
              <div key={r.id} onClick={() => onNav("requests")} style={{ padding: "8px 0", borderBottom: "1px solid #F0EDE8", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{r.title}</span>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 9999, backgroundColor: rs?.bg, color: rs?.color, fontWeight: 600 }}>{rs?.label}</span>
                </div>
                <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 2 }}>{ag?.name} · {r.assigned_to}</div>
              </div>
            );
          })}
          {REQUESTS.filter(r => r.assigned_to === "Sarah Chen" && !["closed","received","rejected"].includes(r.status)).length === 0 && (
            <div style={{ padding: 16, textAlign: "center", color: "#9CA3A0", fontSize: 12 }}>No open requests assigned to you.</div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Data Coverage */}
        <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "16px 20px" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: "0 0 12px", fontFamily: F }}>Data Coverage</h2>
          {[
            { label: "Agencies with website", count: withWebsite.length, pct: Math.round(withWebsite.length / AGENCIES.length * 100) },
            { label: "Agencies with contacts", count: withContacts.length, pct: Math.round(withContacts.length / AGENCIES.length * 100) },
            { label: "Open follow-ups", count: openFollowUps.length, pct: Math.min(100, Math.round(openFollowUps.length / Math.max(1,COMMUNICATIONS.length) * 100)), click: () => onNav("tasks", { status: "open", view: "team" }) },
          ].map(item => (
            <div key={item.label} style={{ marginBottom: 12, cursor: item.click ? "pointer" : "default" }} onClick={item.click}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#525252", marginBottom: 4, fontFamily: F }}>
                <span>{item.label}</span>
                <span style={{ fontWeight: 600 }}>{item.count} ({item.pct}%)</span>
              </div>
              <div style={{ height: 6, backgroundColor: "#F8F6F3", borderRadius: 3 }}>
                <div style={{ height: 6, backgroundColor: "#14B8A6", borderRadius: 3, width: `${item.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Largest Counties — clickable */}
        <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "16px 20px" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: "0 0 12px", fontFamily: F }}>{dashRole === "analyst" ? "Datasets by County" : "Largest Counties"}</h2>
          {topCounties.map(([name, count], i) => (
            <div key={name} onClick={() => onNav("agencies", { county: name })}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < topCounties.length - 1 ? "1px solid #F0EDE8" : "none", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#F8FAFC"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
              <span style={{ fontSize: 13, color: "#171717", fontFamily: F }}>{name} County</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ height: 4, width: Math.max(20, count * 3), backgroundColor: "#14B8A6", borderRadius: 2 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#0F766E", minWidth: 20, textAlign: "right" }}>{count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Overdue follow-ups — clickable */}
      {overdueComms.length > 0 && (
        <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #FCA5A5", padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#DC2626", margin: 0, fontFamily: F, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="alert" size={15} color="#DC2626" /> Overdue Follow-ups ({overdueComms.length})
            </h2>
            <button onClick={() => onNav("tasks", { status: "overdue", view: "team" })}
              style={{ padding: "4px 10px", backgroundColor: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
              View All {"\u2192"}
            </button>
          </div>
          {overdueComms.slice(0, 5).map(c => {
            const ag = AGENCIES.find(a => a.id === c.agency_id);
            const daysOver = Math.abs(Math.ceil((new Date(c.follow_up_date) - new Date()) / 86400000));
            return (
              <div key={c.id} onClick={() => { onNav("agencies"); onAgency(c.agency_id); }}
                style={{ padding: "8px 0", borderBottom: "1px solid #FEE2E2", cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{c.subject}</div>
                <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 2 }}>{ag?.name} · {daysOver}d overdue · {c.user_name}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent activity — clickable */}
      <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Recent Activity</h2>
          <button onClick={() => onNav("communications")}
            style={{ padding: "4px 10px", backgroundColor: "#F8F6F3", color: "#525252", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
            View All {"\u2192"}
          </button>
        </div>
        {COMMUNICATIONS.slice(0, dashRole === "admin" ? 10 : 5).map(c => {
          const ag = AGENCIES.find(a => a.id === c.agency_id);
          return (
            <div key={c.id} onClick={() => { onNav("agencies"); onAgency(c.agency_id); }}
              style={{ padding: "8px 0", borderBottom: "1px solid #F0EDE8", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }}>{CHANNEL_ICONS[c.channel]}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{c.subject}</span>
                <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, backgroundColor: c.direction === "outbound" ? "#CCFBF1" : "#D1FAE5", color: c.direction === "outbound" ? "#1E40AF" : "#065F46", fontWeight: 600 }}>{c.direction === "outbound" ? "\u2197" : "\u2199"}</span>
              </div>
              <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 2 }}>{ag?.name} · {c.user_name} · {formatDateTime(c.created_at)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ═══ DATASET LIST ═══
const DS_PER_PAGE = 20;

function DatasetList({ onNav, onAgency, initFilter, onEditRecord }) {
  const [search, setSearch] = useState(initFilter?.search || "");
  const [statusF, setStatusF] = useState(initFilter?.status || "all");
  const [catF, setCatF] = useState(initFilter?.category || "all");
  const [countyF, setCountyF] = useState("all");
  const [methodF, setMethodF] = useState("all");
  const [autoF, setAutoF] = useState("all");
  const [sortBy, setSortBy] = useState("status");
  const [pg, setPg] = useState(1);
  const [expanded, setExpanded] = useState(null);

  const agencyMap = useMemo(() => {
    const m = {};
    AGENCIES.forEach(a => { m[a.id] = a; });
    return m;
  }, []);

  const matchesNonStatusFilters = (d) => {
      const ag = agencyMap[d.agency_id];
      if (search) {
        const s = search.toLowerCase();
      if (!d.name.toLowerCase().includes(s) && !(ag && ag.name.toLowerCase().includes(s)) && !(ag && ag.jurisdiction.toLowerCase().includes(s))) return false;
      }
      if (catF !== "all" && d.data_category !== catF) return false;
      if (countyF !== "all" && ag && ag.jurisdiction !== countyF) return false;
      if (methodF !== "all" && d.acquisition_method !== methodF) return false;
      if (autoF === "yes" && !d.automation_feasible) return false;
      if (autoF === "no" && d.automation_feasible) return false;
      return true;
  };

  const filteredForCounts = useMemo(() => DATASETS.filter(matchesNonStatusFilters), [search, catF, countyF, methodF, autoF, agencyMap]);

  const filtered = useMemo(() => {
    let r = filteredForCounts.filter(d => {
      if (statusF !== "all" && d.acquisition_status !== statusF) return false;
      return true;
    });
    r.sort((a, b) => {
      const statusOrder = { identified: 0, contacted: 1, negotiating: 2, acquired: 3, automated: 4, active: 5, discontinued: 6 };
      if (sortBy === "status") return (statusOrder[a.acquisition_status] || 0) - (statusOrder[b.acquisition_status] || 0);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "category") return a.data_category.localeCompare(b.data_category);
      if (sortBy === "agency") return (agencyMap[a.agency_id]?.name || "").localeCompare(agencyMap[b.agency_id]?.name || "");
      if (sortBy === "cost") return (b.cost_amount || 0) - (a.cost_amount || 0);
      return 0;
    });
    return r;
  }, [filteredForCounts, statusF, sortBy, agencyMap]);

  const totalPages = Math.ceil(filtered.length / DS_PER_PAGE);
  const page = Math.min(pg, totalPages || 1);
  const paged = filtered.slice((page - 1) * DS_PER_PAGE, page * DS_PER_PAGE);
  const resetPage = () => setPg(1);

  // Pipeline summary
  const statusCounts = useMemo(() => {
    const c = {};
    filteredForCounts.forEach(d => { c[d.acquisition_status] = (c[d.acquisition_status] || 0) + 1; });
    return c;
  }, [filteredForCounts]);

  const totalCost = useMemo(() => filteredForCounts.reduce((s, d) => s + (d.cost_amount || 0), 0), [filteredForCounts]);
  const autoCount = useMemo(() => filteredForCounts.filter(d => d.automation_feasible).length, [filteredForCounts]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Datasets</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>{filtered.length} data sources across {new Set(filtered.map(d => agencyMap[d.agency_id]?.jurisdiction).filter(Boolean)).size} counties</p>
        </div>
        {canCreate() && <button onClick={() => onEditRecord && onEditRecord({ type: "dataset", record: { acquisition_status: "identified", acquisition_method: "unknown", refresh_frequency: "unknown", cost_amount: 0, automation_feasible: false } })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
          <Icon name="plus" size={15} color="#fff" /> Add Dataset
        </button>}
      </div>

      {/* Pipeline Summary Bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const count = statusCounts[status] || 0;
          const isActive = statusF === status;
          return (
            <button key={status} onClick={() => { setStatusF(isActive ? "all" : status); resetPage(); }}
              style={{ padding: "6px 12px", borderRadius: 6, border: isActive ? `2px solid ${config.color}` : "1px solid #E8E4DF", backgroundColor: isActive ? config.bg : "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: config.color, fontFamily: F }}>{count}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: config.color, textTransform: "uppercase", letterSpacing: "0.03em" }}>{config.label}</span>
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center", fontSize: 12, color: "#6B7280", fontFamily: F }}>
          <span>{autoCount} automatable</span>
          <span style={{ color: "#E8E4DF" }}>|</span>
          <span style={{ color: totalCost > 0 ? "#D97706" : "#6B7280", fontWeight: totalCost > 0 ? 600 : 400 }}>${totalCost.toLocaleString()} total cost</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 170 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={15} color="#9CA3A0" /></div>
          <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder="Search datasets or agencies..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, outline: "none", color: "#262626", backgroundColor: "#fff", boxSizing: "border-box", fontFamily: F }} />
        </div>
        <select value={catF} onChange={e => { setCatF(e.target.value); resetPage(); }} style={sel}>
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={countyF} onChange={e => { setCountyF(e.target.value); resetPage(); }} style={sel}>
          <option value="all">All Counties</option>
          {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={methodF} onChange={e => { setMethodF(e.target.value); resetPage(); }} style={sel}>
          <option value="all">All Methods</option>
          {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={autoF} onChange={e => { setAutoF(e.target.value); resetPage(); }} style={sel}>
          <option value="all">Automation: Any</option>
          <option value="yes">Automatable</option>
          <option value="no">Manual Only</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={sel}>
          <option value="status">Sort: Pipeline Stage</option>
          <option value="name">Name</option>
          <option value="agency">Sort: Agency A-Z</option>
          <option value="category">Sort: Category</option>
          <option value="cost">Sort: Highest Cost</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAF9F7" }}>
              {["Dataset", "Agency", "Category", "Status", "Method", "Frequency", "Cost", "Auto"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E8E4DF", fontFamily: F, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((ds, i) => {
              const ag = agencyMap[ds.agency_id];
              const isExp = expanded === ds.id;
              return [
                <tr key={ds.id} onClick={() => setExpanded(isExp ? null : ds.id)}
                  style={{ cursor: "pointer", borderBottom: "1px solid #F0EDE8", transition: "background 0.1s", backgroundColor: isExp ? "#F8FAFC" : "transparent" }}
                  onMouseEnter={e => { if (!isExp) e.currentTarget.style.backgroundColor = "#FAFBFC"; }}
                  onMouseLeave={e => { if (!isExp) e.currentTarget.style.backgroundColor = "transparent"; }}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{ds.name}</div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ fontSize: 12, color: "#525252", fontWeight: 500 }}>{ag?.name || "\u2014"}</div>
                    <div style={{ fontSize: 11, color: "#9CA3A0" }}>{ag?.jurisdiction} County</div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      backgroundColor: ds.data_category === "code_violations" ? "#FEF3C7" : ds.data_category === "tax_liens" ? "#CCFBF1" : ds.data_category === "tax_sales" ? "#EDE9FE" : ds.data_category === "permits" ? "#D1FAE5" : ds.data_category === "foreclosures" ? "#FEE2E2" : "#F3F4F6",
                      color: ds.data_category === "code_violations" ? "#92400E" : ds.data_category === "tax_liens" ? "#1E40AF" : ds.data_category === "tax_sales" ? "#5B21B6" : ds.data_category === "permits" ? "#065F46" : ds.data_category === "foreclosures" ? "#991B1B" : "#374151",
                    }}>{CATEGORY_LABELS[ds.data_category]}</span>
                  </td>
                  <td style={{ padding: "11px 14px" }}><StatusBadge status={ds.acquisition_status} /></td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#525252" }}>{METHOD_LABELS[ds.acquisition_method] || "\u2014"}</td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: "#525252" }}>{FREQ_LABELS[ds.refresh_frequency] || "\u2014"}</td>
                  <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: ds.cost_amount > 0 ? 600 : 400, color: ds.cost_amount > 0 ? "#D97706" : "#D1CDC8" }}>
                    {ds.cost_amount > 0 ? `$${ds.cost_amount}` : "Free"}
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "center" }}>
                    {ds.automation_feasible ?
                      <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%", backgroundColor: "#D1FAE5", color: "#059669", fontSize: 12, lineHeight: "20px", textAlign: "center", fontWeight: 700 }}>{"\u2713"}</span> :
                      <span style={{ color: "#D1CDC8", fontSize: 12 }}>{"\u2014"}</span>
                    }
                  </td>
                </tr>,
                isExp && (
                  <tr key={ds.id + "-detail"}>
                    <td colSpan={8} style={{ padding: 0, borderBottom: "1px solid #E8E4DF" }}>
                      <div style={{ padding: "16px 20px", backgroundColor: "#FAF9F7", borderTop: "1px solid #E8E4DF" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                          <div>
                            <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Acquisition Details</div>
                            <div style={{ fontSize: 12, color: "#525252", lineHeight: 1.8 }}>
                              <div><strong>Method:</strong> {METHOD_LABELS[ds.acquisition_method] || "Unknown"}</div>
                              <div><strong>Status:</strong> {STATUS_CONFIG[ds.acquisition_status]?.label || ds.acquisition_status}</div>
                              <div><strong>Frequency:</strong> {FREQ_LABELS[ds.refresh_frequency] || "Unknown"}</div>
                              {ds.delivery_format && <div><strong>Format:</strong> {FORMAT_LABELS[ds.delivery_format] || ds.delivery_format}</div>}
                              {ds.delivery_method && <div><strong>Delivery:</strong> {DELIVERY_LABELS[ds.delivery_method] || ds.delivery_method}</div>}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Cost & Automation</div>
                            <div style={{ fontSize: 12, color: "#525252", lineHeight: 1.8 }}>
                              <div><strong>Cost:</strong> {ds.cost_amount > 0 ? `$${ds.cost_amount} (${ds.cost_frequency})` : "Free"}</div>
                              <div><strong>Automatable:</strong> {ds.automation_feasible ? "Yes" : "No"}</div>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Agency</div>
                            <div style={{ fontSize: 12, color: "#525252", lineHeight: 1.8 }}>
                              <div><strong>{ag?.name}</strong></div>
                              <div>{ag?.jurisdiction} County, CA</div>
                              {ag?.website && <div><a href={ag.website} target="_blank" rel="noopener noreferrer" style={{ color: "#0D9488", textDecoration: "none" }}>{ag.website.replace(/https?:\/\//, '').replace(/\/$/, '')}</a></div>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); onNav("agencies"); onAgency(ds.agency_id); }}
                              style={{ marginTop: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#14B8A6", backgroundColor: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 4, cursor: "pointer", fontFamily: F }}>
                              View Agency {"\u2192"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              ];
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#9CA3A0", fontSize: 13 }}>No datasets match your filters.</div>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 13, color: "#6B7280", fontFamily: F }}>
          <span>Showing {(page-1)*DS_PER_PAGE+1}{"\u2013"}{Math.min(page*DS_PER_PAGE, filtered.length)} of {filtered.length}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPg(p => Math.max(1, p-1))} disabled={page <= 1}
              style={{ padding: "6px 10px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.4 : 1, fontSize: 12 }}>
              <Icon name="chevL" size={14} color="#525252" />
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <button key={p} onClick={() => setPg(p)}
                  style={{ padding: "6px 10px", border: "1px solid", borderColor: p === page ? "#0F766E" : "#E8E4DF", borderRadius: 6, backgroundColor: p === page ? "#0F766E" : "#fff", color: p === page ? "#fff" : "#525252", cursor: "pointer", fontSize: 12, fontWeight: p === page ? 700 : 400, minWidth: 34 }}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPg(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
              style={{ padding: "6px 10px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.4 : 1, fontSize: 12 }}>
              <Icon name="chevR" size={14} color="#525252" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══ NEW COMMUNICATION FORM (Modal) ═══
const CHANNEL_DEFAULTS = { email: 5, phone: 3, portal: 7, foia: 14, other: 5 };
const OUTCOME_OPTIONS = [
  { value: "", label: "Select outcome..." },
  { value: "pending", label: "Pending / No outcome yet" },
  { value: "successful", label: "Successful - got what we needed" },
  { value: "info_received", label: "Info received - partial" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "no_answer", label: "No answer" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "referred", label: "Referred to another contact" },
  { value: "rejected", label: "Request denied / rejected" },
];

function CommForm({ onClose, prefillAgency, prefillDataset, currentUser }) {
  const [agencyId, setAgencyId] = useState(prefillAgency || "");
  const [datasetId, setDatasetId] = useState(prefillDataset || "");
  const [contactId, setContactId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [channel, setChannel] = useState("email");
  const [direction, setDirection] = useState("outbound");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const agencyDatasets = useMemo(() => agencyId ? DATASETS.filter(d => d.agency_id === agencyId) : [], [agencyId]);
  const agencyContacts = useMemo(() => agencyId ? CONTACTS.filter(c => c.agency_id === agencyId) : [], [agencyId]);
  const agencyRequests = useMemo(() => agencyId ? REQUESTS.filter(r => r.agency_id === agencyId && !["closed","rejected"].includes(r.status)) : [], [agencyId]);
  const loggedBy = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.display_name || currentUser?.email || "User";

  // Auto-set follow-up default when channel changes
  const setChannelWithDefault = (ch) => {
    setChannel(ch);
    const days = CHANNEL_DEFAULTS[ch] || 5;
    const d = new Date();
    d.setDate(d.getDate() + days);
    setFollowUpDate(d.toISOString().split('T')[0]);
  };

  // Set initial follow-up on mount
  useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + CHANNEL_DEFAULTS.email);
    setFollowUpDate(d.toISOString().split('T')[0]);
  }, []);

  const handleSave = async () => {
    setSaveError("");
    try {
      await saveSupabaseBackedRecord("communications", COMMUNICATIONS, "comm", {
      agency_id: agencyId, contact_id: contactId, dataset_id: datasetId,
      request_id: requestId, channel, direction, subject, body,
      user_name: loggedBy, outcome, follow_up_date: followUpDate,
      follow_up_status: followUpDate ? "open" : "", created_at: new Date().toISOString(),
    }, ["agency_id","contact_id","dataset_id","request_id","channel","direction","subject","body","user_name","outcome","follow_up_date","follow_up_status","edit_log","created_at"]);
      setSaved(true); setTimeout(() => onClose(), 1200);
    } catch (error) {
      setSaveError(error.message || "Unable to save communication.");
    }
  };
  const isEmail = channel === "email";
  const canSave = agencyId && subject && body;
  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", backgroundColor: "#fff", fontFamily: F, boxSizing: "border-box", outline: "none" };
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F };

  if (saved) {
    return (
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
        <div style={{ backgroundColor: "#fff", borderRadius: 12, padding: 40, textAlign: "center", maxWidth: 400 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>{"\u2713"}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#171717", fontFamily: F }}>Communication Logged</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            {followUpDate ? `Follow-up scheduled for ${followUpDate}` : "No follow-up set"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, paddingTop: 40, overflowY: "auto" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: "100%", maxWidth: 680, margin: "0 16px 40px", boxShadow: "0 25px 50px rgba(0,0,0,0.15)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #E8E4DF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Log Communication</h2>
            <p style={{ fontSize: 12, color: "#9CA3A0", margin: "2px 0 0" }}>Record an interaction with an agency</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 6, border: "none", backgroundColor: "#F5F2EE", cursor: "pointer", fontSize: 16, color: "#6B7280", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {/* Channel + Direction Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Channel *</label>
              <div style={{ display: "flex", gap: 4 }}>
                {[["email", "\u2709 Email"], ["phone", "\u260E Phone"], ["portal", "\u25EB Portal"], ["foia", "\u229F FOIA"], ["other", "\u25C7 Other"]].map(([val, lbl]) => (
                  <button key={val} onClick={() => setChannelWithDefault(val)}
                    style={{ flex: 1, padding: "7px 4px", border: channel === val ? "2px solid #0F766E" : "1px solid #E8E4DF", borderRadius: 6, backgroundColor: channel === val ? "#F0FDFA" : "#fff", color: channel === val ? "#0F766E" : "#6B7280", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F, whiteSpace: "nowrap" }}>
                    {lbl}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#9CA3A0", marginTop: 3 }}>Default follow-up: {CHANNEL_DEFAULTS[channel]} days</div>
            </div>
            <div>
              <label style={labelStyle}>Direction *</label>
              <div style={{ display: "flex", gap: 4 }}>
                {[["outbound", "\u2197 Outbound"], ["inbound", "\u2199 Inbound"]].map(([val, lbl]) => (
                  <button key={val} onClick={() => setDirection(val)}
                    style={{ flex: 1, padding: "7px 8px", border: direction === val ? "2px solid #0F766E" : "1px solid #E8E4DF", borderRadius: 6, backgroundColor: direction === val ? "#F0FDFA" : "#fff", color: direction === val ? "#0F766E" : "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Template selector */}
          {channel === "email" || channel === "foia" ? (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Message Template <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#9CA3A0" }}>(optional)</span></label>
              <select onChange={e => {
                const t = EMAIL_TEMPLATES.find(t => t.id === e.target.value);
                if (t) { setSubject(t.subject); setBody(t.body); }
              }} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">No template - start blank</option>
                {EMAIL_TEMPLATES.filter(t => t.channel === channel || t.channel === "email").map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ) : channel === "phone" ? (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Call Script <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#9CA3A0" }}>(optional)</span></label>
              <select onChange={e => {
                const t = EMAIL_TEMPLATES.find(t => t.id === e.target.value);
                if (t) { setBody(t.body); }
              }} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">No script</option>
                {EMAIL_TEMPLATES.filter(t => t.channel === "phone").map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ) : null}

          {/* Agency (REQUIRED) */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Agency * <span style={{ color: "#DC2626", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(required)</span></label>
            <select value={agencyId} onChange={e => { setAgencyId(e.target.value); setDatasetId(""); setContactId(""); setRequestId(""); }} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">Select an agency...</option>
              {AGENCIES.map(a => <option key={a.id} value={a.id}>{a.name} — {a.jurisdiction} County</option>)}
            </select>
          </div>

          {/* Dataset + Contact + Request Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Dataset</label>
              <select value={datasetId} onChange={e => setDatasetId(e.target.value)} disabled={!agencyId} style={{ ...inputStyle, cursor: agencyId ? "pointer" : "not-allowed", opacity: agencyId ? 1 : 0.5 }}>
                <option value="">None</option>
                {agencyDatasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Contact</label>
              <select value={contactId} onChange={e => setContactId(e.target.value)} disabled={!agencyId} style={{ ...inputStyle, cursor: agencyId ? "pointer" : "not-allowed", opacity: agencyId ? 1 : 0.5 }}>
                <option value="">None</option>
                {agencyContacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.department}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Request <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#9CA3A0" }}>(link to)</span></label>
              <select value={requestId} onChange={e => setRequestId(e.target.value)} disabled={!agencyId} style={{ ...inputStyle, cursor: agencyId ? "pointer" : "not-allowed", opacity: agencyId ? 1 : 0.5 }}>
                <option value="">None</option>
                {agencyRequests.map(r => {
                  const rc = REQ_STATUS_CONFIG[r.status];
                  return <option key={r.id} value={r.id}>[{rc?.label}] {r.title}</option>;
                })}
              </select>
            </div>
          </div>

          {/* Subject */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Subject *</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={isEmail ? "Subject from the email or message..." : "Brief description of the interaction..."} style={inputStyle} />
          </div>

          {/* Body */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{isEmail ? "Email Summary Or Text" : channel === "phone" ? "Call Notes" : "Details"} *</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={isEmail ? "Paste or summarize the email that was sent or received..." : "Describe the interaction, key takeaways, next steps..."} rows={5}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
          </div>

          {/* Outcome + Follow-up Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Outcome</label>
              <select value={outcome} onChange={e => setOutcome(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {OUTCOME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Follow-up Date</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setFollowUpDate("")}
                  style={{ padding: "8px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", color: "#9CA3A0", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", fontFamily: F }}>Clear</button>
              </div>
              <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                {[["3d", 3], ["5d", 5], ["10d", 10], ["2w", 14], ["30d", 30]].map(([label, days]) => {
                  const d = new Date(); d.setDate(d.getDate() + days);
                  const val = d.toISOString().split('T')[0];
                  return (
                    <button key={label} onClick={() => setFollowUpDate(val)}
                      style={{ padding: "3px 7px", border: "1px solid #E8E4DF", borderRadius: 3, backgroundColor: followUpDate === val ? "#F0FDFA" : "#fff", color: followUpDate === val ? "#0F766E" : "#9CA3A0", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #E8E4DF", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#FAF9F7", borderRadius: "0 0 12px 12px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", color: "#525252", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: F }}>
            Cancel
          </button>
          {saveError && <div style={{ flex: 1, margin: "0 12px", fontSize: 12, color: "#DC2626", alignSelf: "center", fontFamily: F }}>{saveError}</div>}
          <button onClick={handleSave} disabled={!canSave}
            style={{ padding: "8px 20px", border: "none", borderRadius: 6, backgroundColor: canSave ? "#0F766E" : "#D1CDC8", color: "#fff", fontSize: 13, fontWeight: 600, cursor: canSave ? "pointer" : "not-allowed", fontFamily: F }}>
            Save Communication
          </button>
        </div>
      </div>
    </div>
  );
}


// ═══ COMM DETAIL ═══
function CommDetail({ comm, onClose, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(true);
  const [data, setData] = useState({...comm});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const agency = AGENCIES.find(a => a.id === data.agency_id);
  const contact = data.contact_id ? CONTACTS.find(c => c.id === data.contact_id) : null;
  const dataset = data.dataset_id ? DATASETS.find(d => d.id === data.dataset_id) : null;
  const iS = { width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", backgroundColor: "#fff", fontFamily: F, boxSizing: "border-box", outline: "none" };
  const lS = { display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F };
  const save = async () => {
    setSaveError("");
    const idx = COMMUNICATIONS.findIndex(c => c.id === data.id);
    if (idx > -1) {
      const orig = COMMUNICATIONS[idx];
      const changed = [];
      if (orig.subject !== data.subject) changed.push("subject");
      if (orig.body !== data.body) changed.push("body");
      if (orig.channel !== data.channel) changed.push("channel");
      if (orig.outcome !== data.outcome) changed.push("outcome");
      if (changed.length > 0) {
        if (!data.edit_log) data.edit_log = orig.edit_log || [];
        data.edit_log.push({ by: data.user_name || "User", date: new Date().toISOString(), fields: changed });
      }
    }
    try {
      const savedRecord = await saveSupabaseBackedRecord("communications", COMMUNICATIONS, "comm", data, ["agency_id","contact_id","dataset_id","request_id","channel","direction","subject","body","user_name","outcome","follow_up_date","follow_up_status","edit_log","created_at"]);
      setData(savedRecord);
      if (onSaved) onSaved(savedRecord);
      setSaved(true); setTimeout(() => { setSaved(false); onClose(); }, 800);
    } catch (error) {
      setSaveError(error.message || "Unable to save communication.");
    }
  };
  const deleteLog = async () => {
    if (!window.confirm(`Delete communication "${data.subject || data.id}"?`)) return;
    setSaveError("");
    try {
      await deleteCommunicationRecord(data.id);
      if (onDeleted) onDeleted(data.id);
      onClose();
    } catch (error) {
      setSaveError(error.message || "Unable to delete communication.");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, paddingTop: 40, overflowY: "auto" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: "100%", maxWidth: 640, margin: "0 16px 40px", boxShadow: "0 25px 50px rgba(0,0,0,0.15)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #E8E4DF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{CHANNEL_ICONS[data.channel]}</span>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>{editing ? "Edit Log" : data.subject}</h2>
            </div>
            <div style={{ fontSize: 12, color: "#9CA3A0", marginTop: 4 }}>{data.user_name} · {formatDateTime(data.created_at)} · {data.direction}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 6, border: "none", backgroundColor: "#F5F2EE", cursor: "pointer", fontSize: 16, color: "#6B7280" }}>{"\u2715"}</button>
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {saved && <div style={{ padding: "8px 12px", backgroundColor: "#D1FAE5", borderRadius: 6, marginBottom: 12, fontSize: 13, color: "#059669", fontWeight: 600 }}>{"\u2713"} Saved</div>}
          {saveError && <div style={{ padding: "8px 12px", backgroundColor: "#FEF2F2", borderRadius: 6, marginBottom: 12, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>{saveError}</div>}
          {!editing ? (
            <div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {agency && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, backgroundColor: "#CCFBF1", color: "#0F766E", fontWeight: 600 }}>{agency.name}</span>}
                {contact && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, backgroundColor: "#EDE9FE", color: "#7C3AED", fontWeight: 600 }}>{contact.first_name} {contact.last_name}</span>}
                {dataset && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, backgroundColor: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>{dataset.name}</span>}
                {data.outcome && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, backgroundColor: "#F5F2EE", color: "#525252", fontWeight: 600 }}>Outcome: {data.outcome}</span>}
              </div>
              <div style={{ fontSize: 13, color: "#525252", lineHeight: 1.8, whiteSpace: "pre-wrap", backgroundColor: "#FAF9F7", padding: "16px", borderRadius: 8, border: "1px solid #E8E4DF" }}>{data.body || "No content recorded."}</div>
              {data.follow_up_date && <div style={{ marginTop: 12, padding: "8px 12px", backgroundColor: "#FFFBEB", borderRadius: 6, border: "1px solid #FDE68A", fontSize: 12, color: "#92400E" }}>Follow-up: {formatDate(data.follow_up_date)} · {data.follow_up_status}</div>}
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 12 }}><label style={lS}>Subject</label><input value={data.subject||""} onChange={e => setData({...data, subject: e.target.value})} style={iS} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={lS}>Channel</label><select value={data.channel} onChange={e => setData({...data, channel: e.target.value})} style={{...iS,cursor:"pointer"}}><option value="email">Email</option><option value="phone">Phone</option><option value="foia">FOIA</option><option value="portal">Portal</option></select></div>
                <div><label style={lS}>Outcome</label><input value={data.outcome||""} onChange={e => setData({...data, outcome: e.target.value})} placeholder="e.g., left voicemail" style={iS} /></div>
              </div>
              <div style={{ marginBottom: 12 }}><label style={lS}>Body</label><textarea value={data.body||""} onChange={e => setData({...data, body: e.target.value})} rows={6} style={{...iS,resize:"vertical",lineHeight:1.6}} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", color: "#525252", fontSize: 13, cursor: "pointer", fontFamily: F }}>Cancel</button>
                <button onClick={save} style={{ padding: "8px 20px", border: "none", borderRadius: 6, backgroundColor: "#0F766E", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Save</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ COMMUNICATIONS LOG ═══
function CommLog({ onNav, onAgency, onOpenForm, initFilter, onEditRecord }) {
  const [search, setSearch] = useState(initFilter?.search || "");
  const [channelF, setChannelF] = useState(initFilter?.channel || "all");
  const [dirF, setDirF] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [editingComm, setEditingComm] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [commError, setCommError] = useState("");

  const agencyMap = useMemo(() => { const m = {}; AGENCIES.forEach(a => { m[a.id] = a; }); return m; }, []);
  const contactMap = useMemo(() => { const m = {}; CONTACTS.forEach(c => { m[c.id] = c; }); return m; }, []);
  const datasetMap = useMemo(() => { const m = {}; DATASETS.forEach(d => { m[d.id] = d; }); return m; }, []);

  const CHANNEL_ICONS = { email: "\u2709\uFE0F", phone: "\u260E\uFE0F", foia: "\u2696\uFE0F", portal: "\uD83D\uDCBB", mail: "\uD83D\uDCEC" };
  const filtered = useMemo(() => {
    let r = [...COMMUNICATIONS];
    if (search) r = r.filter(c => (c.subject||"").toLowerCase().includes(search.toLowerCase()) || (c.body||"").toLowerCase().includes(search.toLowerCase()));
    if (channelF !== "all") r = r.filter(c => c.channel === channelF);
    if (dirF !== "all") r = r.filter(c => c.direction === dirF);
    r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return r;
  }, [search, channelF, dirF, refreshKey]);

  const deleteComm = async (comm) => {
    if (!window.confirm(`Delete log "${comm.subject || comm.id}"?`)) return;
    setCommError("");
    try {
      await deleteCommunicationRecord(comm.id);
      setExpanded(prev => prev === comm.id ? null : prev);
      setRefreshKey(k => k + 1);
    } catch (error) {
      setCommError(error.message || "Unable to delete communication.");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Communications</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>{COMMUNICATIONS.length} logged interactions</p>
        </div>
        {canLogComm() && <button onClick={() => onOpenForm && onOpenForm()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}><Icon name="plus" size={15} color="#fff" /> Log Communication</button>}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}><div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={15} color="#9CA3A0" /></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search communications..." style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, outline: "none", color: "#262626", backgroundColor: "#fff", boxSizing: "border-box", fontFamily: F }} /></div>
        <select value={channelF} onChange={e => setChannelF(e.target.value)} style={sel}><option value="all">All Channels</option><option value="email">Email</option><option value="phone">Phone</option><option value="foia">FOIA</option><option value="portal">Portal</option></select>
        <select value={dirF} onChange={e => setDirF(e.target.value)} style={sel}><option value="all">All Directions</option><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select>
      </div>
      {commError && <div style={{ padding: "8px 12px", backgroundColor: "#FEF2F2", borderRadius: 6, marginBottom: 12, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>{commError}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map(comm => {
          const ag = agencyMap[comm.agency_id];
          const ct = comm.contact_id ? contactMap[comm.contact_id] : null;
          const ds = comm.dataset_id ? datasetMap[comm.dataset_id] : null;
          const isExp = expanded === comm.id;
          return (
            <div key={comm.id} style={{ backgroundColor: "#fff", borderRadius: 8, border: `1px solid ${isExp ? "#5EEAD4" : "#E8E4DF"}`, overflow: "hidden" }}>
              <div onClick={() => setExpanded(isExp ? null : comm.id)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15 }}>{CHANNEL_ICONS[comm.channel]}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{comm.subject}</span>
                    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, backgroundColor: comm.direction === "outbound" ? "#CCFBF1" : "#D1FAE5", color: comm.direction === "outbound" ? "#115E59" : "#065F46", fontWeight: 600 }}>{comm.direction === "outbound" ? "\u2197 Out" : "\u2199 In"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 12, color: "#6B7280" }}>
                    <span>{comm.user_name}</span>
                    {ag && <><span style={{ color: "#D1CDC8" }}>{"\u00B7"}</span><span>{ag.name}</span></>}
                    {ct && <><span style={{ color: "#D1CDC8" }}>{"\u00B7"}</span><span>{ct.first_name} {ct.last_name}</span></>}
                    <span style={{ color: "#D1CDC8" }}>{"\u00B7"}</span><span>{formatDateTime(comm.created_at)}</span>
                  </div>
                </div>
                <Icon name={isExp ? "chevL" : "chevR"} size={14} color="#D1CDC8" />
              </div>
              {isExp && (
                <div style={{ padding: "16px 20px", backgroundColor: "#FAF9F7", borderTop: "1px solid #E8E4DF" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Details</div>
                      <div style={{ fontSize: 12, color: "#525252", lineHeight: 2 }}>
                        <div><strong>Channel:</strong> {comm.channel}</div>
                        <div><strong>Direction:</strong> {comm.direction}</div>
                        <div><strong>Date:</strong> {formatDateTime(comm.created_at)}</div>
                        <div><strong>Logged by:</strong> {comm.user_name}</div>
                        {comm.outcome && <div><strong>Outcome:</strong> {comm.outcome}</div>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Linked Records</div>
                      <div style={{ fontSize: 12, color: "#525252", lineHeight: 2 }}>
                        <div><strong>Agency:</strong> {ag ? <span style={{ color: "#0D9488", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onNav("agencies"); onAgency(comm.agency_id); }}>{ag.name}</span> : "\u2014"}</div>
                        <div><strong>Contact:</strong> {ct ? <span style={{ color: "#0D9488" }}>{ct.first_name} {ct.last_name}</span> : "\u2014"}</div>
                        <div><strong>Dataset:</strong> {ds ? ds.name : "\u2014"}</div>
                      </div>
                    </div>
                    <div>
                      {comm.follow_up_date && (
                        <div>
                          <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Follow-up</div>
                          <div style={{ fontSize: 12, color: "#525252", lineHeight: 2 }}>
                            <div><strong>Due:</strong> {formatDate(comm.follow_up_date)}</div>
                            <div><strong>Status:</strong> {comm.follow_up_status}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {comm.body && <div style={{ padding: "10px 12px", backgroundColor: "#fff", borderRadius: 6, border: "1px solid #E8E4DF", fontSize: 12, color: "#525252", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 12, maxHeight: 200, overflowY: "auto" }}>{comm.body}</div>}
                  {comm.edit_log && comm.edit_log.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Edit History</div>
                      {comm.edit_log.map((e, i) => <div key={i} style={{ fontSize: 11, color: "#6B7280", padding: "2px 0" }}>Edited by {e.by} · {formatDateTime(e.date)} · Changed: {e.fields.join(", ")}</div>)}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    {canEdit() && <button onClick={(e) => { e.stopPropagation(); setEditingComm({...comm}); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", backgroundColor: "#0F766E", border: "none", borderRadius: 5, cursor: "pointer", fontFamily: F }}>Edit Log</button>}
                    {canDelete() && <button onClick={(e) => { e.stopPropagation(); deleteComm(comm); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#DC2626", backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 5, cursor: "pointer", fontFamily: F }}>Delete Log</button>}
                    {canTask() && <button onClick={(e) => { e.stopPropagation(); setEditingComm(null); if (typeof onEditRecord === "function") { onEditRecord({ type: "task_create", record: { agency_id: comm.agency_id || "", contact_id: comm.contact_id || "", dataset_id: comm.dataset_id || "", title: "Task: " + comm.subject } }); } }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#D97706", backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 5, cursor: "pointer", fontFamily: F }}>+ Task</button>}
                    {ag && <button onClick={(e) => { e.stopPropagation(); onNav("agencies"); onAgency(comm.agency_id); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#0D9488", backgroundColor: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 5, cursor: "pointer", fontFamily: F }}>View Agency {"\u2192"}</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#9CA3A0", fontSize: 13, backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>No communications match your filters.</div>}
      {editingComm && <CommDetail comm={editingComm} onClose={() => setEditingComm(null)} onSaved={(savedComm) => { setEditingComm(savedComm); setRefreshKey(k => k + 1); }} onDeleted={(deletedId) => { setExpanded(prev => prev === deletedId ? null : prev); setRefreshKey(k => k + 1); }} />}
    </div>
  );
}

function NotesPanel({ entityType, entityId }) {
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState("general");
  const [newContent, setNewContent] = useState("");
  const [newPinned, setNewPinned] = useState(false);
  const [saveError, setSaveError] = useState("");

  const entityNotes = NOTES.filter(n => n.entity_type === entityType && n.entity_id === entityId);

  const filtered = useMemo(() => {
    let r = entityNotes;
    if (filter !== "all") r = r.filter(n => n.note_type === filter);
    const pinned = r.filter(n => n.is_pinned).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const unpinned = r.filter(n => !n.is_pinned).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    return [...pinned, ...unpinned];
  }, [entityNotes, filter]);

  const typeCounts = useMemo(() => {
    const c = {};
    entityNotes.forEach(n => { c[n.note_type] = (c[n.note_type] || 0) + 1; });
    return c;
  }, [entityNotes]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setSaveError("");
    const note = {
      entity_type: entityType,
      entity_id: entityId,
      note_type: newType,
      content: newContent.trim(),
      is_pinned: newPinned,
      created_by: "Sarah Chen",
      created_at: new Date().toISOString(),
    };
    try {
      await saveSupabaseBackedRecord("notes", NOTES, "note", note, ["entity_type","entity_id","note_type","content","is_pinned","created_by","created_at"]);
      setNewContent("");
      setNewPinned(false);
      setShowAdd(false);
    } catch (error) {
      setSaveError(error.message || "Unable to save note.");
    }
  };

  return (
    <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #E8E4DF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Notes</h3>
          <span style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 500 }}>{entityNotes.length}</span>
        </div>
        {canNote() && <button onClick={() => setShowAdd(!showAdd)}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", backgroundColor: showAdd ? "#FEE2E2" : "#F0FDFA", color: showAdd ? "#DC2626" : "#0F766E", border: "none", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
          {showAdd ? "\u2715 Cancel" : "+ Add Note"}
        </button>}
      </div>

      {/* Add note form */}
      {canNote() && showAdd && (
        <div style={{ padding: "12px 16px", backgroundColor: "#FAFBFC", borderBottom: "1px solid #E8E4DF" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {Object.entries(NOTE_TYPE_CONFIG).map(([key, cfg]) => (
              <button key={key} onClick={() => setNewType(key)}
                style={{ padding: "3px 10px", borderRadius: 4, border: newType === key ? `2px solid ${cfg.color}` : "1px solid #E8E4DF", backgroundColor: newType === key ? cfg.bg : "#fff", color: cfg.color, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                {cfg.icon} {cfg.label}
              </button>
            ))}
          </div>
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Write a note..." rows={3}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", fontFamily: F, resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5 }} />
          {saveError && <div style={{ marginTop: 8, fontSize: 12, color: "#DC2626", fontFamily: F }}>{saveError}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280", cursor: "pointer" }}>
              <input type="checkbox" checked={newPinned} onChange={e => setNewPinned(e.target.checked)} style={{ accentColor: "#0F766E" }} />
              Pin to top
            </label>
            <button onClick={handleAdd} disabled={!newContent.trim()}
              style={{ padding: "6px 14px", backgroundColor: newContent.trim() ? "#0F766E" : "#D1CDC8", color: "#fff", border: "none", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: newContent.trim() ? "pointer" : "not-allowed", fontFamily: F }}>
              Save Note
            </button>
          </div>
        </div>
      )}

      {/* Type filter tabs */}
      {entityNotes.length > 0 && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #F0EDE8", display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("all")}
            style={{ padding: "3px 8px", borderRadius: 4, border: filter === "all" ? "1px solid #0F766E" : "1px solid transparent", backgroundColor: filter === "all" ? "#F0FDFA" : "transparent", color: filter === "all" ? "#0F766E" : "#9CA3A0", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
            All ({entityNotes.length})
          </button>
          {Object.entries(NOTE_TYPE_CONFIG).map(([key, cfg]) => {
            const count = typeCounts[key] || 0;
            if (count === 0) return null;
            return (
              <button key={key} onClick={() => setFilter(key)}
                style={{ padding: "3px 8px", borderRadius: 4, border: filter === key ? `1px solid ${cfg.color}` : "1px solid transparent", backgroundColor: filter === key ? cfg.bg : "transparent", color: filter === key ? cfg.color : "#9CA3A0", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                {cfg.icon} {cfg.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Notes list */}
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#9CA3A0", fontSize: 12 }}>
            {entityNotes.length === 0 ? "No notes yet. Click \"+ Add Note\" to get started." : "No notes match this filter."}
          </div>
        ) : (
          filtered.map(note => {
            const cfg = NOTE_TYPE_CONFIG[note.note_type] || NOTE_TYPE_CONFIG.general;
            return (
              <div key={note.id} style={{ padding: "10px 16px", borderBottom: "1px solid #F5F2EE", backgroundColor: note.is_pinned ? "#FFFBEB" : "transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {note.is_pinned && <span style={{ fontSize: 11 }}>{"\uD83D\uDCCC"}</span>}
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, backgroundColor: cfg.bg, color: cfg.color, fontWeight: 600 }}>{cfg.icon} {cfg.label}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "#D1CDC8" }}>{formatDateTime(note.created_at)} · {note.created_by}</span>
                </div>
                <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.5, margin: 0 }}>{note.content}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ═══ FOLLOW-UP QUEUE ═══

// ═══ CONTACT DIRECTORY ═══
function ContactDirectory({ onNav, onAgency, initFilter, onSelectContact, onEditRecord }) {
  const [search, setSearch] = useState(initFilter?.search || "");
  const [deptF, setDeptF] = useState(initFilter?.dept || "all");
  const [countyF, setCountyF] = useState(initFilter?.county || "all");
  const [activeF, setActiveF] = useState("active");
  const [sortBy, setSortBy] = useState("agency");

  const agencyMap = useMemo(() => { const m = {}; AGENCIES.forEach(a => { m[a.id] = a; }); return m; }, []);
  const depts = useMemo(() => [...new Set(CONTACTS.map(c => c.department))].sort(), []);

  const filtered = useMemo(() => {
    let r = CONTACTS.filter(c => {
      const ag = agencyMap[c.agency_id];
      if (search) {
        const s = search.toLowerCase();
        if (!(c.first_name + " " + c.last_name).toLowerCase().includes(s) && !(c.title || "").toLowerCase().includes(s) && !getPrimaryEmail(c).toLowerCase().includes(s) && !getPrimaryPhone(c).toLowerCase().includes(s) && !(ag && ag.name.toLowerCase().includes(s))) return false;
      }
      if (deptF !== "all" && c.department !== deptF) return false;
      if (countyF !== "all" && ag && ag.jurisdiction !== countyF) return false;
      if (activeF === "active" && !c.is_active) return false;
      if (activeF === "archived" && c.is_active) return false;
      return true;
    });
    r.sort((a, b) => {
      if (sortBy === "agency") return (agencyMap[a.agency_id]?.name || "").localeCompare(agencyMap[b.agency_id]?.name || "");
      if (sortBy === "name") return (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name);
      if (sortBy === "department") return a.department.localeCompare(b.department);
      return 0;
    });
    return r;
  }, [search, deptF, countyF, activeF, sortBy, agencyMap]);

  const deptColors = { "Code Enforcement": { bg: "#FEF3C7", color: "#92400E" }, "Building": { bg: "#CCFBF1", color: "#115E59" }, "Legal": { bg: "#EDE9FE", color: "#5B21B6" }, "Main Office": { bg: "#D1FAE5", color: "#065F46" } };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Contact Directory</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>{filtered.length} contacts across {new Set(filtered.map(c => agencyMap[c.agency_id]?.jurisdiction).filter(Boolean)).size} counties</p>
        </div>
        {canCreate() && <button onClick={() => onEditRecord && onEditRecord({ type: "contact", record: { is_active: true } })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
          <Icon name="plus" size={15} color="#fff" /> Add Contact
        </button>}
      </div>

      {/* Department summary */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {depts.map(dept => {
          const count = CONTACTS.filter(c => c.department === dept).length;
          const dc = deptColors[dept] || { bg: "#F3F4F6", color: "#525252" };
          const isActive = deptF === dept;
          return (
            <button key={dept} onClick={() => { setDeptF(isActive ? "all" : dept); }}
              style={{ padding: "6px 12px", borderRadius: 6, border: isActive ? `2px solid ${dc.color}` : "1px solid #E8E4DF", backgroundColor: isActive ? dc.bg : "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: dc.color, fontFamily: F }}>{count}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: dc.color }}>{dept}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 170 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={15} color="#9CA3A0" /></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts, titles, emails, agencies..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, outline: "none", color: "#262626", backgroundColor: "#fff", boxSizing: "border-box", fontFamily: F }} />
        </div>
        <select value={countyF} onChange={e => setCountyF(e.target.value)} style={sel}>
          <option value="all">All Counties</option>
          {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={activeF} onChange={e => setActiveF(e.target.value)} style={sel}>
          <option value="active">Active Only</option>
          <option value="all">All</option>
          <option value="archived">Archived</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={sel}>
          <option value="agency">Sort: Agency</option>
          <option value="name">Sort: Name</option>
          <option value="department">Sort: Department</option>
        </select>
      </div>

      {/* Contact table */}
      <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAF9F7" }}>
              {["Contact", "Agency", "Department", "Phone", "Email"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E8E4DF", fontFamily: F }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const ag = agencyMap[c.agency_id];
              const dc = deptColors[c.department] || { bg: "#F3F4F6", color: "#525252" };
              return (
                <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F0EDE8" : "none", cursor: "pointer", opacity: c.is_active ? 1 : 0.55 }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#F8FAFC"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                  onClick={() => onSelectContact && onSelectContact(c.id)}>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>
                      {c.first_name} {c.last_name}
                      {c.is_primary && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 9999, backgroundColor: "#CCFBF1", color: "#0F766E", fontWeight: 700, verticalAlign: "middle" }}>PRIMARY</span>}
                      {!c.is_active && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 9999, backgroundColor: "#FEE2E2", color: "#DC2626", fontWeight: 700, verticalAlign: "middle" }}>ARCHIVED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 1 }}>{c.title}</div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ fontSize: 12, color: "#525252", fontWeight: 500 }}>{ag?.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3A0" }}>{ag?.jurisdiction} County</div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, backgroundColor: dc.bg, color: dc.color }}>{c.department}</span>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: getPrimaryPhone(c) ? "#525252" : "#D1CDC8" }}>{getPrimaryPhone(c) || "\u2014"}</td>
                  <td style={{ padding: "11px 14px", fontSize: 12, color: getPrimaryEmail(c) ? "#0D9488" : "#D1CDC8", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getPrimaryEmail(c) || "\u2014"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#9CA3A0", fontSize: 13 }}>No contacts match your filters.</div>}
      </div>
    </div>
  );
}


// ═══ REQUEST LIST ═══
function RequestList({ onNav, onAgency, initFilter, onEditRecord }) {
  const [search, setSearch] = useState(initFilter?.search || "");
  const [statusF, setStatusF] = useState(initFilter?.status || "all");
  const [typeF, setTypeF] = useState("all");
  const [assignedF, setAssignedF] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [pg, setPg] = useState(1);
  const [sortBy, setSortBy] = useState("newest");
  const [tick, setTick] = useState(0);

  const agencyMap = useMemo(() => { const m = {}; AGENCIES.forEach(a => { m[a.id] = a; }); return m; }, []);
  const datasetMap = useMemo(() => { const m = {}; DATASETS.forEach(d => { m[d.id] = d; }); return m; }, []);
  const users = useMemo(() => [...new Set(REQUESTS.map(r => r.assigned_to))].sort(), []);

  const filtered = useMemo(() => {
    let r = REQUESTS.filter(req => {
      if (search) {
        const s = search.toLowerCase();
        const ag = agencyMap[req.agency_id];
        if (!req.title.toLowerCase().includes(s) && !(ag && ag.name.toLowerCase().includes(s)) && !(req.reference_number || "").toLowerCase().includes(s)) return false;
      }
      if (statusF !== "all" && req.status !== statusF) return false;
      if (typeF !== "all" && req.request_type !== typeF) return false;
      if (assignedF !== "all" && req.assigned_to !== assignedF) return false;
      return true;
    });
    r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    r.sort((a, b) => sortBy === "newest" ? new Date(b.created_at||0) - new Date(a.created_at||0) : new Date(a.created_at||0) - new Date(b.created_at||0));
    return r;
  }, [search, statusF, typeF, assignedF, agencyMap, sortBy, tick]);

  const PER = 15;
  const totalPages = Math.ceil(filtered.length / PER);
  const page = Math.min(pg, totalPages || 1);
  const paged = filtered.slice((page - 1) * PER, page * PER);
  const resetPage = () => setPg(1);

  const statusCounts = useMemo(() => {
    const c = {};
    REQUESTS.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, []);

  const awaitingCount = statusCounts.awaiting_response || 0;
  const totalCost = REQUESTS.reduce((s, r) => s + (r.cost_paid || 0), 0);

  const deleteRequest = async (req, e) => {
    e.stopPropagation();
    const linkedComms = COMMUNICATIONS.filter(c => c.request_id === req.id).length;
    const linkedTasks = TASKS.filter(t => t.request_id === req.id).length;
    const warning = linkedComms || linkedTasks
      ? `\n\nThis request has ${linkedComms} communication(s) and ${linkedTasks} task(s) linked to it. Supabase may block deletion until linked records are removed.`
      : "";
    if (!window.confirm(`Delete request "${req.title}"?${warning}`)) return;
    try {
      await deleteRequestRecord(req.id);
      if (expanded === req.id) setExpanded(null);
      setTick(t => t + 1);
    } catch (error) {
      window.alert(`Unable to delete request: ${error.message || "Unknown error"}`);
    }
  };

  const daysUntilExpected = (r) => {
    if (!r.expected_response_date || r.status === "received" || r.status === "closed") return null;
    const now = new Date(); now.setHours(0,0,0,0);
    const exp = new Date(r.expected_response_date); exp.setHours(0,0,0,0);
    return Math.ceil((exp - now) / 86400000);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Requests</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
            {REQUESTS.length} acquisition requests
            {awaitingCount > 0 && <span style={{ color: "#D97706", fontWeight: 600 }}> · {awaitingCount} awaiting response</span>}
          </p>
        </div>
        {canCreate() && <button onClick={() => onEditRecord && onEditRecord({ type: "request", record: { status: "draft", request_type: "cpra", created_at: new Date().toISOString(), cost_quoted: 0, cost_paid: 0 } })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
          <Icon name="plus" size={15} color="#fff" /> New Request
        </button>}
      </div>

      {/* Status pipeline */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(REQ_STATUS_CONFIG).map(([status, cfg]) => {
          const count = statusCounts[status] || 0;
          const isActive = statusF === status;
          return (
            <button key={status} onClick={() => { setStatusF(isActive ? "all" : status); resetPage(); }}
              style={{ padding: "6px 12px", borderRadius: 6, border: isActive ? `2px solid ${cfg.color}` : "1px solid #E8E4DF", backgroundColor: isActive ? cfg.bg : "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: cfg.color, fontFamily: F }}>{count}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, letterSpacing: "0.02em" }}>{cfg.label}</span>
            </button>
          );
        })}
        {totalCost > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", fontSize: 12, color: "#D97706", fontWeight: 600 }}>
            ${totalCost.toLocaleString()} spent
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 170 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={15} color="#9CA3A0" /></div>
          <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder="Search requests, agencies, reference #..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, outline: "none", color: "#262626", backgroundColor: "#fff", boxSizing: "border-box", fontFamily: F }} />
        </div>
        <select value={typeF} onChange={e => { setTypeF(e.target.value); resetPage(); }} style={sel}>
          <option value="all">All Types</option>
          {Object.entries(REQ_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={assignedF} onChange={e => { setAssignedF(e.target.value); resetPage(); }} style={sel}>
          <option value="all">All Assignees</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={sel}><option value="newest">Newest First</option><option value="oldest">Oldest First</option></select>
      </div>

      {/* Request cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {paged.map(req => {
          const ag = agencyMap[req.agency_id];
          const ds = datasetMap[req.dataset_id];
          const isExp = expanded === req.id;
          const daysLeft = daysUntilExpected(req);
          const reqType = REQ_TYPE_CONFIG[req.request_type] || REQ_TYPE_CONFIG.manual_request;
          const reqStatus = REQ_STATUS_CONFIG[req.status] || REQ_STATUS_CONFIG.draft;
          const relatedComms = COMMUNICATIONS.filter(c => c.request_id === req.id || (c.agency_id === req.agency_id && c.dataset_id === req.dataset_id));

          return (
            <div key={req.id} style={{ backgroundColor: "#fff", borderRadius: 8, border: `1px solid ${isExp ? "#99F6E4" : "#E8E4DF"}`, overflow: "hidden", transition: "border-color 0.15s" }}>
              <div onClick={() => setExpanded(isExp ? null : req.id)}
                style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                onMouseEnter={e => { if (!isExp) e.currentTarget.parentElement.style.borderColor = "#99F6E4"; }}
                onMouseLeave={e => { if (!isExp) e.currentTarget.parentElement.style.borderColor = "#E8E4DF"; }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{req.title}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, backgroundColor: reqType.bg, color: reqType.color }}>{reqType.label}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, fontWeight: 600, backgroundColor: reqStatus.bg, color: reqStatus.color }}>{reqStatus.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 12, color: "#6B7280", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 500, color: "#525252" }}>{ag?.name}</span>
                    {ds && <><span style={{ color: "#D1CDC8" }}>{"\u00B7"}</span><span>{ds.name}</span></>}
                    {req.reference_number && <><span style={{ color: "#D1CDC8" }}>{"\u00B7"}</span><span style={{ fontFamily: "monospace", fontSize: 11, color: "#9CA3A0" }}>{req.reference_number}</span></>}
                    <span style={{ color: "#D1CDC8" }}>{"\u00B7"}</span>
                    <span>{req.assigned_to}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {daysLeft !== null && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      backgroundColor: daysLeft < 0 ? "#FEE2E2" : daysLeft <= 3 ? "#FEF3C7" : "#F5F2EE",
                      color: daysLeft < 0 ? "#DC2626" : daysLeft <= 3 ? "#D97706" : "#6B7280"
                    }}>
                      {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
                    </span>
                  )}
                  {req.cost_quoted > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#D97706" }}>${req.cost_quoted}</span>
                  )}
                  <Icon name={isExp ? "chevL" : "chevR"} size={14} color="#D1CDC8" />
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "16px 20px", backgroundColor: "#FAF9F7", borderTop: "1px solid #E8E4DF" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Request Details</div>
                      <div style={{ fontSize: 12, color: "#525252", lineHeight: 2 }}>
                        <div><strong>Type:</strong> {reqType.label}</div>
                        <div><strong>Status:</strong> {reqStatus.label}</div>
                        <div><strong>Assigned:</strong> {req.assigned_to}</div>
                        {req.reference_number && <div><strong>Reference:</strong> <span style={{ fontFamily: "monospace" }}>{req.reference_number}</span></div>}
                        <div><strong>Created:</strong> {formatDate(req.created_at)}</div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Timeline & Cost</div>
                      <div style={{ fontSize: 12, color: "#525252", lineHeight: 2 }}>
                        {req.submitted_date && <div><strong>Submitted:</strong> {formatDate(req.submitted_date)}</div>}
                        {req.expected_response_date && <div><strong>Expected:</strong> {formatDate(req.expected_response_date)}</div>}
                        {req.actual_response_date && <div><strong>Received:</strong> {formatDate(req.actual_response_date)}</div>}
                        {req.cost_quoted > 0 && <div><strong>Quoted:</strong> ${req.cost_quoted}</div>}
                        {req.cost_paid > 0 && <div><strong>Paid:</strong> ${req.cost_paid}</div>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Linked Records</div>
                      <div style={{ fontSize: 12, color: "#525252", lineHeight: 2 }}>
                        <div>
                          <strong>Agency:</strong>{" "}
                          <span onClick={(e) => { e.stopPropagation(); onNav("agencies"); onAgency(req.agency_id); }}
                            style={{ color: "#0D9488", cursor: "pointer" }}>{ag?.name}</span>
                        </div>
                        {ds && <div><strong>Dataset:</strong> {ds.name}</div>}
                        <div><strong>Related comms:</strong> {relatedComms.length}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {canEdit() && <button onClick={(e) => { e.stopPropagation(); onEditRecord && onEditRecord({ type: "request", record: { ...req } }); }}
                          style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#fff", backgroundColor: "#0F766E", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: F }}>
                          Edit Request
                        </button>}
                        {canTask() && <button onClick={(e) => { e.stopPropagation(); onEditRecord && onEditRecord({ type: "task_create", record: { agency_id: req.agency_id || "", contact_id: req.sent_to_contact || "", dataset_id: req.dataset_id || "", request_id: req.id, title: "Task: " + req.title } }); }}
                          style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#D97706", backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 4, cursor: "pointer", fontFamily: F }}>
                          + Task
                        </button>}
                        {canDelete() && <button onClick={(e) => deleteRequest(req, e)}
                          style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#DC2626", backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 4, cursor: "pointer", fontFamily: F }}>
                          Delete
                        </button>}
                        <button onClick={(e) => { e.stopPropagation(); onNav("agencies"); onAgency(req.agency_id); }}
                          style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#14B8A6", backgroundColor: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 4, cursor: "pointer", fontFamily: F }}>
                          View Agency {"\u2192"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {relatedComms.length > 0 && (
                    <div style={{ marginTop: 16, borderTop: "1px solid #E8E4DF", paddingTop: 12 }}>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Communication Thread</div>
                      {relatedComms.slice(0, 4).map(c => (
                        <div key={c.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #F0EDE8", fontSize: 12 }}>
                          <span style={{ width: 20, textAlign: "center" }}>{CHANNEL_ICONS[c.channel]}</span>
                          <span style={{ flex: 1, color: "#525252" }}>{c.subject}</span>
                          <span style={{ color: "#9CA3A0", fontSize: 11 }}>{c.user_name} · {formatDateTime(c.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#9CA3A0", fontSize: 13, backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>No requests match your filters.</div>}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 13, color: "#6B7280", fontFamily: F }}>
          <span>Showing {(page-1)*PER+1}{"\u2013"}{Math.min(page*PER, filtered.length)} of {filtered.length}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPg(p => Math.max(1, p-1))} disabled={page <= 1} style={{ padding: "6px 10px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.4 : 1, fontSize: 12 }}><Icon name="chevL" size={14} color="#525252" /></button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => { let p; if (totalPages <= 7) p = i+1; else if (page <= 4) p = i+1; else if (page >= totalPages-3) p = totalPages-6+i; else p = page-3+i; return (<button key={p} onClick={() => setPg(p)} style={{ padding: "6px 10px", border: "1px solid", borderColor: p === page ? "#0F766E" : "#E8E4DF", borderRadius: 6, backgroundColor: p === page ? "#0F766E" : "#fff", color: p === page ? "#fff" : "#525252", cursor: "pointer", fontSize: 12, fontWeight: p === page ? 700 : 400, minWidth: 34 }}>{p}</button>); })}
            <button onClick={() => setPg(p => Math.min(totalPages, p+1))} disabled={page >= totalPages} style={{ padding: "6px 10px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.4 : 1, fontSize: 12 }}><Icon name="chevR" size={14} color="#525252" /></button>
          </div>
        </div>
      )}
    </div>
  );
}



// ═══ RECORD FORMS ═══
function MultiField({ label, items, setItems, placeholder, type }) {
  const add = () => setItems([...items, { value: "", label: type === "email" ? "work" : "work", is_primary: items.length === 0 }]);
  const remove = (i) => { const n = items.filter((_,idx) => idx !== i); if (n.length > 0 && !n.some(x => x.is_primary)) n[0].is_primary = true; setItems(n); };
  const update = (i, key, val) => { const n = [...items]; n[i] = { ...n[i], [key]: val }; if (key === "is_primary" && val) n.forEach((x,idx) => { if (idx !== i) x.is_primary = false; }); setItems(n); };
  const labels = type === "email" ? ["work","personal","other"] : ["work","mobile","main","fax","other"];
  const inputS = { flex: 1, padding: "7px 10px", border: "1px solid #E8E4DF", borderRadius: 5, fontSize: 13, color: "#262626", fontFamily: F, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: F }}>{label}</label>
        <button type="button" onClick={add} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 8px", backgroundColor: "#F0FDFA", color: "#0F766E", border: "1px solid #99F6E4", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>+ Add</button>
      </div>
      {items.length === 0 && <div style={{ fontSize: 12, color: "#D1CDC8", padding: "6px 0" }}>None added. Click + Add.</div>}
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <input value={item.value} onChange={e => update(i, "value", e.target.value)} placeholder={placeholder} style={inputS} />
          <select value={item.label} onChange={e => update(i, "label", e.target.value)} style={{ padding: "7px 6px", border: "1px solid #E8E4DF", borderRadius: 5, fontSize: 11, color: "#6B7280", fontFamily: F, cursor: "pointer", width: 80 }}>
            {labels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#9CA3A0", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="radio" name={`primary_${label}_${type}`} checked={item.is_primary} onChange={() => update(i, "is_primary", true)} style={{ accentColor: "#0F766E" }} /> primary
          </label>
          <button type="button" onClick={() => remove(i)} style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #E8E4DF", backgroundColor: "#fff", color: "#DC2626", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{"\u2212"}</button>
        </div>
      ))}
    </div>
  );
}

// ═══ RECORD FORMS ═══
function RecordForm({ type, record, onClose }) {
  const isEdit = record && record.id && !String(record.id).startsWith("new");
  const [data, setData] = useState(record || {});
  const [emails, setEmails] = useState(record?.emails || (record?.email ? [{ value: record.email, label: "work", is_primary: true }] : []));
  const [phones, setPhones] = useState(record?.phones || (record?.phone ? [{ value: record.phone, label: "work", is_primary: true }] : []));
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const set = (k, v) => setData(prev => ({ ...prev, [k]: v }));

  const agencyDatasets = useMemo(() => data.agency_id ? DATASETS.filter(d => d.agency_id === data.agency_id) : [], [data.agency_id]);

  if (saved) {
    return (
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
        <div style={{ backgroundColor: "#fff", borderRadius: 12, padding: 40, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 22 }}>{"\u2713"}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#171717", fontFamily: F }}>{isEdit ? "Updated" : "Created"} successfully</div>
        </div>
      </div>
    );
  }

  const inputS = { width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", backgroundColor: "#fff", fontFamily: F, boxSizing: "border-box", outline: "none" };
  const labelS = { display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F };
  const titles = { agency: "Agency", contact: "Contact", dataset: "Dataset", request: "Request" };
  const pick = (obj, keys) => keys.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});
  const saveSupabaseBackedRecord = async (table, array, idPrefix, localRecord, dbRecord) => {
    let savedRecord = localRecord;
    if (!savedRecord.id || String(savedRecord.id).startsWith("new")) savedRecord = { ...savedRecord, id: `${idPrefix}_new_${Date.now()}` };
    const payload = normalizeDbPayload({ ...dbRecord, id: savedRecord.id });
    if (sb) {
      const result = isEdit
        ? await sb.from(table).update(payload).eq("id", savedRecord.id).select().single()
        : await sb.from(table).insert(payload).select().single();
      if (result.error) throw result.error;
      savedRecord = { ...savedRecord, ...(result.data || {}) };
    }
    const idx = array.findIndex(item => item.id === savedRecord.id);
    if (idx > -1) Object.assign(array[idx], savedRecord);
    else array.push(savedRecord);
    normalizeMultiValueFields();
    recomputeAgencyCounts();
  };
  const save = async () => {
    setSaveError("");
    const updated = { ...data, emails: emails, phones: phones };
    try {
      if (type === "contact") {
        const dbRecord = pick(updated, ["agency_id","first_name","last_name","title","department","emails","phones","is_primary","is_active","created_at"]);
        await saveSupabaseBackedRecord("contacts", CONTACTS, "c", updated, dbRecord);
      } else if (type === "agency") {
        const normalizedName = (updated.name || "").trim().toLowerCase();
        const normalizedJurisdiction = (updated.jurisdiction || "").trim().toLowerCase();
        const exactDuplicate = AGENCIES.find(a =>
          a.id !== updated.id &&
          (a.name || "").trim().toLowerCase() === normalizedName &&
          (a.jurisdiction || "").trim().toLowerCase() === normalizedJurisdiction
        );
        if (exactDuplicate) {
          throw new Error(`An agency named "${updated.name}" already exists in ${updated.jurisdiction || "this jurisdiction"}.`);
        }
        const sameName = AGENCIES.find(a =>
          a.id !== updated.id &&
          (a.name || "").trim().toLowerCase() === normalizedName
        );
        if (sameName && !window.confirm(`An agency named "${sameName.name}" already exists in ${sameName.jurisdiction || "another jurisdiction"}. Are you sure you want to create another?`)) {
          return;
        }
        const dbRecord = pick(updated, ["name","agency_type","state","jurisdiction","website","emails","phones","notes","created_at"]);
        await saveSupabaseBackedRecord("agencies", AGENCIES, "a", updated, dbRecord);
      } else if (type === "dataset") {
        const normalizedDataset = { ...updated, cost_type: updated.cost_type || updated.cost_frequency };
        const dbRecord = pick(normalizedDataset, ["agency_id","name","data_category","acquisition_status","acquisition_method","delivery_format","delivery_method","refresh_frequency","cost_amount","cost_type","turnaround_days","automation_feasible","portal_url","api_endpoint","acquisition_playbook","notes","created_at"]);
        await saveSupabaseBackedRecord("datasets", DATASETS, "d", normalizedDataset, dbRecord);
      } else if (type === "request") {
        const idx = REQUESTS.findIndex(r => r.id === data.id);
        const normalizedRequest = {
          ...updated,
          status: updated.status || "draft",
          request_type: updated.request_type || "cpra",
          cost_quoted: Number(updated.cost_quoted || 0),
          cost_paid: Number(updated.cost_paid || 0),
        };
        if (idx > -1) {
          const orig = REQUESTS[idx];
          const changed = [];
          for (const k of ["title","status","assigned_to","request_type","sent_to_contact","notes"]) { if (orig[k] !== normalizedRequest[k]) changed.push(k); }
          if (changed.length > 0) {
            normalizedRequest.edit_log = [...(orig.edit_log || []), { by: "Sarah Chen", date: new Date().toISOString(), fields: changed }];
          }
        }
        const dbRecord = pick(normalizedRequest, ["agency_id","dataset_id","title","request_type","status","assigned_to","sent_to_contact","reference_number","submitted_date","expected_response_date","cost_quoted","cost_paid","edit_log","notes","created_at"]);
        await saveSupabaseBackedRecord("requests", REQUESTS, "r", normalizedRequest, dbRecord);
      }
      setSaved(true);
      setTimeout(onClose, 1000);
    } catch (error) {
      setSaveError(error.message || "Unable to save record.");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, paddingTop: 40, overflowY: "auto" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: "100%", maxWidth: 620, margin: "0 16px 40px", boxShadow: "0 25px 50px rgba(0,0,0,0.15)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #E8E4DF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>{isEdit ? "Edit" : "New"} {titles[type]}</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 6, border: "none", backgroundColor: "#F5F2EE", cursor: "pointer", fontSize: 16, color: "#6B7280" }}>{"\u2715"}</button>
        </div>
        <div style={{ padding: "20px 24px", maxHeight: "60vh", overflowY: "auto" }}>
          {type === "agency" && (<>
            <div style={{ marginBottom: 14 }}><label style={labelS}>Agency Name *</label><input value={data.name||""} onChange={e => set("name",e.target.value)} placeholder="e.g., Cook County Assessor" style={inputS} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label style={labelS}>Type *</label><select value={data.agency_type||"city"} onChange={e => set("agency_type",e.target.value)} style={{...inputS,cursor:"pointer"}}><option value="city">City</option><option value="county">County</option><option value="special_district">Special District</option></select></div>
              <div><label style={labelS}>State</label><input value={data.state||"CA"} onChange={e => set("state",e.target.value)} style={inputS} /></div>
              <div><label style={labelS}>Jurisdiction</label><input value={data.jurisdiction||""} onChange={e => set("jurisdiction",e.target.value)} placeholder="County name" style={inputS} /></div>
            </div>
            <div style={{ marginBottom: 14 }}><label style={labelS}>Website</label><input value={data.website||""} onChange={e => set("website",e.target.value)} placeholder="https://..." style={inputS} /></div>
            <MultiField label="Phone Numbers" items={phones} setItems={setPhones} placeholder="(555) 123-4567" type="phone" />
            <MultiField label="Email Addresses" items={emails} setItems={setEmails} placeholder="info@agency.gov" type="email" />
            <div><label style={labelS}>Notes</label><textarea value={data.notes||""} onChange={e => set("notes",e.target.value)} rows={3} style={{...inputS,resize:"vertical",lineHeight:1.5}} /></div>
          </>)}
          {type === "contact" && (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label style={labelS}>First Name *</label><input value={data.first_name||""} onChange={e => set("first_name",e.target.value)} style={inputS} /></div>
              <div><label style={labelS}>Last Name *</label><input value={data.last_name||""} onChange={e => set("last_name",e.target.value)} style={inputS} /></div>
            </div>
            <div style={{ marginBottom: 14 }}><label style={labelS}>Agency *</label><select value={data.agency_id||""} onChange={e => set("agency_id",e.target.value)} style={{...inputS,cursor:"pointer"}}><option value="">Select agency...</option>{AGENCIES.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label style={labelS}>Title</label><input value={data.title||""} onChange={e => set("title",e.target.value)} placeholder="e.g., FOIA Officer" style={inputS} /></div>
              <div><label style={labelS}>Department</label><select value={data.department||""} onChange={e => set("department",e.target.value)} style={{...inputS,cursor:"pointer"}}><option value="">Select...</option><option value="Code Enforcement">Code Enforcement</option><option value="Building">Building</option><option value="Legal">Legal</option><option value="Main Office">Main Office</option><option value="IT">IT</option><option value="Records">Records</option></select></div>
            </div>
            <MultiField label="Email Addresses" items={emails} setItems={setEmails} placeholder="jane@agency.gov" type="email" />
            <MultiField label="Phone Numbers" items={phones} setItems={setPhones} placeholder="(555) 123-4567" type="phone" />
            <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#525252", cursor: "pointer" }}><input type="checkbox" checked={data.is_primary||false} onChange={e => set("is_primary",e.target.checked)} style={{ accentColor: "#0F766E" }} /> Primary contact</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#525252", cursor: "pointer" }}><input type="checkbox" checked={data.is_active!==false} onChange={e => set("is_active",e.target.checked)} style={{ accentColor: "#0F766E" }} /> Active</label>
            </div>
          </>)}
          {type === "dataset" && (<>
            <div style={{ marginBottom: 14 }}><label style={labelS}>Dataset Name *</label><input value={data.name||""} onChange={e => set("name",e.target.value)} placeholder="e.g., Tax Lien Sale Records" style={inputS} /></div>
            <div style={{ marginBottom: 14 }}><label style={labelS}>Agency *</label><select value={data.agency_id||""} onChange={e => set("agency_id",e.target.value)} style={{...inputS,cursor:"pointer"}}><option value="">Select agency...</option>{AGENCIES.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label style={labelS}>Category *</label><select value={data.data_category||""} onChange={e => set("data_category",e.target.value)} style={{...inputS,cursor:"pointer"}}><option value="">Select...</option>{Object.entries(CATEGORY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
              <div><label style={labelS}>Status</label><select value={data.acquisition_status||"identified"} onChange={e => set("acquisition_status",e.target.value)} style={{...inputS,cursor:"pointer"}}>{Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label style={labelS}>Method</label><select value={data.acquisition_method||"unknown"} onChange={e => set("acquisition_method",e.target.value)} style={{...inputS,cursor:"pointer"}}>{Object.entries(METHOD_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
              <div><label style={labelS}>Frequency</label><select value={data.refresh_frequency||"unknown"} onChange={e => set("refresh_frequency",e.target.value)} style={{...inputS,cursor:"pointer"}}>{Object.entries(FREQ_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label style={labelS}>Cost ($)</label><input type="number" value={data.cost_amount||0} onChange={e => set("cost_amount",Number(e.target.value))} style={inputS} /></div>
              <div><label style={labelS}>Turnaround (days)</label><input type="number" value={data.turnaround_days||""} onChange={e => set("turnaround_days",e.target.value)} style={inputS} /></div>
              <div><label style={labelS}>Automatable</label><select value={data.automation_feasible?"yes":"no"} onChange={e => set("automation_feasible",e.target.value==="yes")} style={{...inputS,cursor:"pointer"}}><option value="no">No</option><option value="yes">Yes</option></select></div>
            </div>
            <div><label style={labelS}>Acquisition Playbook</label><textarea value={data.acquisition_playbook||""} onChange={e => set("acquisition_playbook",e.target.value)} rows={3} placeholder="Step-by-step instructions..." style={{...inputS,resize:"vertical",lineHeight:1.5}} /></div>
          </>)}
          {type === "request" && (<>
            <div style={{ marginBottom: 14 }}><label style={labelS}>Title *</label><input value={data.title||""} onChange={e => set("title",e.target.value)} placeholder="e.g., CPRA - Alameda Tax Liens" style={inputS} /></div>
            <div style={{ marginBottom: 14 }}><label style={labelS}>Agency *</label><select value={data.agency_id||""} onChange={e => { set("agency_id",e.target.value); set("dataset_id",""); }} style={{...inputS,cursor:"pointer"}}><option value="">Select agency...</option>{AGENCIES.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label style={labelS}>Dataset</label><select value={data.dataset_id||""} onChange={e => set("dataset_id",e.target.value)} disabled={!data.agency_id} style={{...inputS,cursor:data.agency_id?"pointer":"not-allowed",opacity:data.agency_id?1:0.5}}><option value="">Select...</option>{agencyDatasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              <div><label style={labelS}>Type</label><select value={data.request_type||"cpra"} onChange={e => set("request_type",e.target.value)} style={{...inputS,cursor:"pointer"}}>{Object.entries(REQ_TYPE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label style={labelS}>Status</label><select value={data.status||"draft"} onChange={e => set("status",e.target.value)} style={{...inputS,cursor:"pointer"}}>{Object.entries(REQ_STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
              <div><label style={labelS}>Assigned To</label><select value={data.assigned_to||""} onChange={e => set("assigned_to",e.target.value)} style={{...inputS,cursor:"pointer"}}><option value="">Select...</option>{SYSTEM_USERS.filter(u=>u.is_active).map(u=><option key={u.id} value={u.full_name}>{u.full_name}</option>)}</select></div>
              <div><label style={labelS}>Sent To Contact</label><select value={data.sent_to_contact||""} onChange={e => set("sent_to_contact",e.target.value)} disabled={!data.agency_id} style={{...inputS,cursor:data.agency_id?"pointer":"not-allowed",opacity:data.agency_id?1:0.5}}><option value="">Select contact...</option>{agencyDatasets.length >= 0 && CONTACTS.filter(c => c.agency_id === data.agency_id).map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label style={labelS}>Reference #</label><input value={data.reference_number||""} onChange={e => set("reference_number",e.target.value)} placeholder="CPRA-2026-0001" style={inputS} /></div>
              <div><label style={labelS}>Expected Response</label><input type="date" value={data.expected_response_date||""} onChange={e => set("expected_response_date",e.target.value)} style={inputS} /></div>
            </div>
            <div><label style={labelS}>Notes</label><textarea value={data.notes||""} onChange={e => set("notes",e.target.value)} rows={3} style={{...inputS,resize:"vertical",lineHeight:1.5}} /></div>
          </>)}
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #E8E4DF", display: "flex", justifyContent: "flex-end", gap: 8, backgroundColor: "#FAF9F7", borderRadius: "0 0 12px 12px" }}>
          {saveError && <div style={{ marginRight: "auto", maxWidth: 330, fontSize: 12, color: "#DC2626", alignSelf: "center", fontFamily: F }}>{saveError}</div>}
          <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", color: "#525252", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: F }}>Cancel</button>
          <button onClick={save} style={{ padding: "8px 20px", border: "none", borderRadius: 6, backgroundColor: "#0F766E", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{isEdit ? "Save Changes" : "Create"}</button>
        </div>
      </div>
    </div>
  );
}


// ═══ TASKS (UNIFIED) ═══
function TaskList({ onNav, onAgency, initFilter, onViewContact }) {
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState(initFilter?.status || "open");
  const [typeF, setTypeF] = useState(initFilter?.type || "all");
  const [assigneeF, setAssigneeF] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const agencyMap = useMemo(() => { const m = {}; AGENCIES.forEach(a => { m[a.id] = a; }); return m; }, []);
  const datasetMap = useMemo(() => { const m = {}; DATASETS.forEach(d => { m[d.id] = d; }); return m; }, []);
  const contactMap = useMemo(() => { const m = {}; CONTACTS.forEach(c => { m[c.id] = c; }); return m; }, []);
  const users = useMemo(() => [...new Set(TASKS.flatMap(t => [t.assigned_to, t.assigned_by].filter(Boolean)))].sort(), []);

  const filtered = useMemo(() => {
    let r = TASKS.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusF !== "all" && t.status !== statusF) return false;
      if (typeF !== "all" && t.task_type !== typeF) return false;
      if (assigneeF !== "all" && t.assigned_to !== assigneeF) return false;
      return true;
    });
    r.sort((a, b) => {
      const pO = { urgent: 0, high: 1, normal: 2, low: 3 };
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (b.status === "completed" && a.status !== "completed") return -1;
      return (pO[a.priority]||2) - (pO[b.priority]||2) || new Date(a.due_date||"2099") - new Date(b.due_date||"2099");
    });
    return r;
  }, [search, statusF, typeF, assigneeF]);

  const sCounts = useMemo(() => { const c = {}; TASKS.forEach(t => { c[t.status] = (c[t.status]||0)+1; }); return c; }, []);
  const overdueCount = TASKS.filter(t => t.status === "open" && t.due_date && new Date(t.due_date) < new Date()).length;

  const [tick, setTick] = useState(0);
  const saveTaskRecord = async (task) => {
    await saveSupabaseBackedRecord("tasks", TASKS, "task", task, ["title","description","task_type","status","priority","assigned_by","assigned_to","due_date","agency_id","contact_id","dataset_id","request_id","note_history","assignment_history","completed_at","created_at"]);
    setTick(t => t + 1);
  };
  const snoozeTask = async (task, days, e) => {
    e.stopPropagation();
    const nd = new Date(task.due_date || new Date());
    nd.setDate(nd.getDate() + days);
    try { await saveTaskRecord({ ...task, due_date: nd.toISOString().split("T")[0], status: "open" }); }
    catch (error) { window.alert(`Unable to snooze task: ${error.message || "Unknown error"}`); }
  };
  const completeTask = async (task, e) => {
    e.stopPropagation();
    try { await saveTaskRecord({ ...task, status: "completed", completed_at: new Date().toISOString() }); }
    catch (error) { window.alert(`Unable to complete task: ${error.message || "Unknown error"}`); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Tasks</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>{TASKS.filter(t => t.status !== "completed" && t.status !== "cancelled").length} open{overdueCount > 0 && <span style={{ color: "#DC2626", fontWeight: 600 }}> · {overdueCount} overdue</span>}</p>
        </div>
        {canTask() && <button onClick={() => { setEditingTask(null); setShowForm(true); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}><Icon name="plus" size={15} color="#fff" /> New Task</button>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["all","All"],["open","Open"],["in_progress","In Progress"],["blocked","Blocked"],["completed","Done"]].map(([v,l]) => (
          <button key={v} onClick={() => setStatusF(v)} style={{ padding: "5px 12px", borderRadius: 6, border: statusF===v?"2px solid #0F766E":"1px solid #E8E4DF", backgroundColor: statusF===v?"#F0FDFA":"#fff", color: statusF===v?"#0F766E":"#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{l}{v!=="all"&&` (${sCounts[v]||0})`}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}><div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={15} color="#9CA3A0" /></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, outline: "none", color: "#262626", backgroundColor: "#fff", boxSizing: "border-box", fontFamily: F }} /></div>
        <select value={typeF} onChange={e => setTypeF(e.target.value)} style={sel}><option value="all">All Types</option>{Object.entries(TASK_TYPE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <select value={assigneeF} onChange={e => setAssigneeF(e.target.value)} style={sel}><option value="all">All Assignees</option>{users.map(u=><option key={u} value={u}>{u}</option>)}</select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map(task => {
          const ag = agencyMap[task.agency_id]; const ds = task.dataset_id?datasetMap[task.dataset_id]:null; const ct = task.contact_id?contactMap[task.contact_id]:null;
          const tc = TASK_TYPE_CONFIG[task.task_type]||TASK_TYPE_CONFIG.general; const pc = PRIORITY_CONFIG[task.priority]||PRIORITY_CONFIG.normal;
          const done = task.status==="completed"||task.status==="cancelled";
          const dl = task.due_date?Math.ceil((new Date(task.due_date)-new Date())/86400000):null;
          const late = !done&&dl!==null&&dl<0;
          const isExp = expanded === task.id;
          return (
            <div key={task.id} style={{ backgroundColor: "#fff", borderRadius: 8, border: `1px solid ${isExp?"#5EEAD4":late?"#FCA5A5":"#E8E4DF"}`, borderLeft: `4px solid ${done?"#D1FAE5":late?"#DC2626":tc.color}`, opacity: done?0.55:1, overflow: "visible" }}>
              <div onClick={() => setExpanded(isExp?null:task.id)} style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F, textDecoration: done?"line-through":"none" }}>{task.title}</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 600, backgroundColor: tc.bg, color: tc.color }}>{tc.label}</span>
                    {task.priority !== "normal" && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 600, backgroundColor: pc.bg, color: pc.color }}>{pc.label}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 12, color: "#6B7280", flexWrap: "wrap" }}>
                    {task.assigned_to && <span><strong>{task.assigned_to}</strong></span>}
                    {ag&&<><span style={{color:"#D1CDC8"}}>{"\u00B7"}</span><span>{ag.name}</span></>}
                    {ct&&<><span style={{color:"#D1CDC8"}}>{"\u00B7"}</span><span>{ct.first_name} {ct.last_name}</span></>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {dl!==null&&!done&&<span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, backgroundColor: late?"#FEE2E2":dl<=2?"#FEF3C7":"#F5F2EE", color: late?"#DC2626":dl<=2?"#D97706":"#6B7280" }}>{late?`${Math.abs(dl)}d late`:dl===0?"Today":`${dl}d`}</span>}
                  {done&&<span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, backgroundColor: "#D1FAE5", color: "#059669", fontWeight: 600 }}>{"\u2713"}</span>}
                  <Icon name={isExp?"chevL":"chevR"} size={14} color="#D1CDC8" />
                </div>
              </div>
              {isExp && (
                <div style={{ padding: "16px 20px", backgroundColor: "#FAF9F7", borderTop: "1px solid #E8E4DF", overflow: "visible" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Details</div>
                      <div style={{ fontSize: 12, color: "#525252", lineHeight: 2 }}>
                        <div><strong>Type:</strong> {tc.label}</div>
                        <div><strong>Priority:</strong> {pc.label}</div>
                        <div><strong>Status:</strong> {task.status.replace("_"," ")}</div>
                        <div><strong>Due:</strong> {task.due_date ? formatDate(task.due_date) : "\u2014"}</div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Assignment</div>
                      <div style={{ fontSize: 12, color: "#525252", lineHeight: 2 }}>
                        <div><strong>Assigned by:</strong> {task.assigned_by || "\u2014"}</div>
                        <div><strong>Assigned to:</strong> {task.assigned_to || "\u2014"}</div>
                        <div><strong>Created:</strong> {task.created_at ? formatDate(task.created_at) : "\u2014"}</div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Linked Records</div>
                      <div style={{ fontSize: 12, color: "#525252", lineHeight: 2 }}>
                        <div><strong>Agency:</strong> {ag ? <span style={{ color: "#0D9488", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onNav("agencies"); onAgency(task.agency_id); }}>{ag.name}</span> : "\u2014"}</div>
                        <div><strong>Contact:</strong> {ct ? <span style={{ color: "#0D9488", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onViewContact && onViewContact(ct.id); }}>{ct.first_name} {ct.last_name}</span> : "\u2014"}</div>
                        <div><strong>Dataset:</strong> {ds ? ds.name : "\u2014"}</div>
                      </div>
                    </div>
                  </div>
                  {task.description && <div style={{ padding: "10px 12px", backgroundColor: "#fff", borderRadius: 6, border: "1px solid #E8E4DF", fontSize: 12, color: "#525252", lineHeight: 1.5, marginBottom: 12 }}>{task.description}</div>}
                  {task.assignment_history && task.assignment_history.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Assignment History</div>
                      {task.assignment_history.map((h, i) => <div key={i} style={{ fontSize: 11, color: "#6B7280", padding: "3px 0" }}>{h.from} {"\u2192"} <strong style={{ color: "#0F766E" }}>{h.to}</strong> · {formatDateTime(h.date)}</div>)}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Notes</div>
                    <NotesPanel entityType="task" entityId={task.id} />
                  </div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    {canTask() && <button onClick={(e) => { e.stopPropagation(); setEditingTask({...task}); setShowForm(true); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", backgroundColor: "#0F766E", border: "none", borderRadius: 5, cursor: "pointer", fontFamily: F }}>Edit Task</button>}
                    {canTask() && !task.agency_id && <button onClick={(e) => { e.stopPropagation(); const newTask = {...task}; setEditingTask(newTask); setShowForm(true); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#0D9488", backgroundColor: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 5, cursor: "pointer", fontFamily: F }}>+ Link Agency</button>}
                    {canTask() && !task.contact_id && task.agency_id && <button onClick={(e) => { e.stopPropagation(); const newTask = {...task}; setEditingTask(newTask); setShowForm(true); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#0D9488", backgroundColor: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 5, cursor: "pointer", fontFamily: F }}>+ Link Contact</button>}
                    {canTask() && <button onClick={(e) => { e.stopPropagation(); setEditingTask({ task_type: "follow_up", priority: task.priority, status: "open", assigned_to: "", assigned_by: task.assigned_to, title: "Follow-up: " + task.title, due_date: "", agency_id: task.agency_id || "", contact_id: task.contact_id || "", dataset_id: task.dataset_id || "", description: "Follow-up to task: " + task.title, note_history: [] }); setShowForm(true); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#7C3AED", backgroundColor: "#EDE9FE", border: "1px solid #C4B5FD", borderRadius: 5, cursor: "pointer", fontFamily: F }}>Follow-Up Task</button>}
                    {canTask() && !done && <button onClick={(e) => completeTask(task, e)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#059669", backgroundColor: "#ECFDF5", border: "1px solid #D1FAE5", borderRadius: 5, cursor: "pointer", fontFamily: F }}>{"\u2713"} Complete</button>}
                    {canTask() && !done && <div style={{ position: "relative" }}>
                      <button onClick={(e) => { e.stopPropagation(); const el = e.currentTarget.nextSibling; el.style.display = el.style.display === "block" ? "none" : "block"; }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#D97706", backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 5, cursor: "pointer", fontFamily: F }}>{"\u23F0"} Snooze</button>
                      <div style={{ display: "none", position: "absolute", left: 0, top: 34, backgroundColor: "#fff", borderRadius: 6, border: "1px solid #E8E4DF", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 9999, padding: 4, minWidth: 110 }}>
                        {[["3 days",3],["5 days",5],["10 days",10],["2 weeks",14],["30 days",30]].map(([lbl,days]) => <button key={days} onClick={(e) => { snoozeTask(task,days,e); e.currentTarget.parentElement.style.display="none"; }} style={{ display: "block", width: "100%", padding: "6px 10px", border: "none", backgroundColor: "transparent", color: "#525252", fontSize: 12, cursor: "pointer", textAlign: "left", borderRadius: 4, fontFamily: F }} onMouseEnter={e=>e.currentTarget.style.backgroundColor="#F0FDFA"} onMouseLeave={e=>e.currentTarget.style.backgroundColor="transparent"}>+ {lbl}</button>)}
                      </div>
                    </div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length===0&&<div style={{ padding: 40, textAlign: "center", color: "#9CA3A0", fontSize: 13, backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>No tasks match this filter.</div>}
      {showForm && <TaskForm task={editingTask} onClose={() => { setShowForm(false); setEditingTask(null); }} />}
    </div>
  );
}

function TaskForm({ onClose, task }) {
  const isEdit = task && task.id;
  const [d, setD] = useState(task || { task_type: "follow_up", priority: "normal", status: "open", assigned_to: "", assigned_by: "Sarah Chen", title: "", due_date: "", agency_id: "", dataset_id: "", contact_id: "", description: "" });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const s = (k, v) => setD(prev => ({ ...prev, [k]: v }));
  const agContacts = useMemo(() => d.agency_id ? CONTACTS.filter(c => c.agency_id === d.agency_id) : [], [d.agency_id]);
  const agDatasets = useMemo(() => d.agency_id ? DATASETS.filter(ds => ds.agency_id === d.agency_id) : [], [d.agency_id]);
  const iS = { width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", backgroundColor: "#fff", fontFamily: F, boxSizing: "border-box", outline: "none" };
  const lS = { display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F };

  const save = async () => {
    setSaveError("");
    const nextTask = { ...d };
    const idx = TASKS.findIndex(t => t.id === d.id);
    if (idx > -1) {
      if (TASKS[idx].assigned_to !== d.assigned_to) {
        nextTask.assignment_history = [...(TASKS[idx].assignment_history || []), { from: TASKS[idx].assigned_to, to: d.assigned_to, date: new Date().toISOString(), by: "Sarah Chen" }];
      }
      if (!nextTask.note_history) nextTask.note_history = TASKS[idx].note_history || [];
    }
    else {
      nextTask.assignment_history = [];
      nextTask.note_history = nextTask.note_history || [];
      nextTask.created_at = nextTask.created_at || new Date().toISOString();
    }
    try {
      await saveSupabaseBackedRecord("tasks", TASKS, "task", nextTask, ["title","description","task_type","status","priority","assigned_by","assigned_to","due_date","agency_id","contact_id","dataset_id","request_id","note_history","assignment_history","completed_at","created_at"]);
      setSaved(true);
      setTimeout(onClose, 1000);
    } catch (error) {
      setSaveError(error.message || "Unable to save task.");
    }
  };

  if (saved) return (<div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}><div style={{ backgroundColor: "#fff", borderRadius: 12, padding: 40, textAlign: "center" }}><div style={{ fontSize: 22, marginBottom: 8 }}>{"\u2713"}</div><div style={{ fontSize: 15, fontWeight: 700, color: "#171717", fontFamily: F }}>{isEdit?"Task Updated":"Task Created"}</div></div></div>);
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, paddingTop: 40, overflowY: "auto" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: "100%", maxWidth: 580, margin: "0 16px 40px", boxShadow: "0 25px 50px rgba(0,0,0,0.15)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #E8E4DF", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>{isEdit?"Edit Task":"New Task"}</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 6, border: "none", backgroundColor: "#F5F2EE", cursor: "pointer", fontSize: 16, color: "#6B7280" }}>{"\u2715"}</button>
        </div>
        <div style={{ padding: "20px 24px", maxHeight: "60vh", overflowY: "auto" }}>
          <div style={{ marginBottom: 14 }}><label style={lS}>Title *</label><input value={d.title} onChange={e => s("title",e.target.value)} placeholder="Describe the task..." style={iS} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><label style={lS}>Type</label><select value={d.task_type} onChange={e => s("task_type",e.target.value)} style={{...iS,cursor:"pointer"}}>{Object.entries(TASK_TYPE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
            <div><label style={lS}>Priority</label><select value={d.priority} onChange={e => s("priority",e.target.value)} style={{...iS,cursor:"pointer"}}>{Object.entries(PRIORITY_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
            <div><label style={lS}>Status</label><select value={d.status} onChange={e => s("status",e.target.value)} style={{...iS,cursor:"pointer"}}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="blocked">Blocked</option><option value="cancelled">Cancelled</option></select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><label style={lS}>Assign To *</label><select value={d.assigned_to} onChange={e => s("assigned_to",e.target.value)} style={{...iS,cursor:"pointer"}}><option value="">Select...</option>{SYSTEM_USERS.filter(u=>u.is_active).map(u=><option key={u.id} value={u.full_name}>{u.full_name}</option>)}</select></div>
            <div>
              <label style={lS}>Due Date</label>
              <input type="date" value={d.due_date} onChange={e => s("due_date",e.target.value)} style={iS} />
              <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                {[["3d",3],["5d",5],["10d",10],["2w",14],["30d",30]].map(([lbl,days]) => {
                  const dt = new Date(); dt.setDate(dt.getDate()+days); const val = dt.toISOString().split('T')[0];
                  return <button key={lbl} type="button" onClick={() => s("due_date",val)} style={{ padding: "2px 6px", border: "1px solid #E8E4DF", borderRadius: 3, backgroundColor: d.due_date===val?"#F0FDFA":"#fff", color: d.due_date===val?"#0F766E":"#9CA3A0", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{lbl}</button>;
                })}
              </div>
            </div>
          </div>
          <div style={{ padding: "12px 14px", backgroundColor: "#FAF9F7", borderRadius: 8, border: "1px solid #E8E4DF", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8, fontFamily: F }}>Link To Records</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
              <div><label style={{ fontSize: 11, color: "#9CA3A0", fontFamily: F }}>Agency</label><select value={d.agency_id||""} onChange={e => { s("agency_id",e.target.value); s("contact_id",""); s("dataset_id",""); }} style={{...iS,cursor:"pointer",fontSize:12}}><option value="">None</option>{AGENCIES.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div><label style={{ fontSize: 11, color: "#9CA3A0", fontFamily: F }}>Contact</label><select value={d.contact_id||""} onChange={e => s("contact_id",e.target.value)} disabled={!d.agency_id} style={{...iS,cursor:d.agency_id?"pointer":"not-allowed",opacity:d.agency_id?1:0.5,fontSize:12}}><option value="">None</option>{agContacts.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</select></div>
            </div>
            <div><label style={{ fontSize: 11, color: "#9CA3A0", fontFamily: F }}>Dataset</label><select value={d.dataset_id||""} onChange={e => s("dataset_id",e.target.value)} disabled={!d.agency_id} style={{...iS,cursor:d.agency_id?"pointer":"not-allowed",opacity:d.agency_id?1:0.5,fontSize:12}}><option value="">None</option>{agDatasets.map(ds=><option key={ds.id} value={ds.id}>{ds.name}</option>)}</select></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={lS}>Notes</label><textarea value={d.description||""} onChange={e => s("description",e.target.value)} rows={3} placeholder="Additional details..." style={{...iS,resize:"vertical",lineHeight:1.5}} /></div>

          {d.assignment_history && d.assignment_history.length > 0 && (
            <div style={{ padding: "12px 14px", backgroundColor: "#FAF9F7", borderRadius: 8, border: "1px solid #E8E4DF" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8, fontFamily: F }}>Assignment History</div>
              {d.assignment_history.map((h, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: i < d.assignment_history.length - 1 ? "1px solid #E8E4DF" : "none", fontSize: 12, color: "#525252" }}>
                  <span style={{ fontWeight: 600 }}>{h.from}</span> {"\u2192"} <span style={{ fontWeight: 600, color: "#0F766E" }}>{h.to}</span>
                  <span style={{ color: "#9CA3A0", marginLeft: 8, fontSize: 11 }}>{formatDateTime(h.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #E8E4DF", display: "flex", justifyContent: "flex-end", gap: 8, backgroundColor: "#FAF9F7", borderRadius: "0 0 12px 12px" }}>
          {saveError && <div style={{ marginRight: "auto", maxWidth: 320, fontSize: 12, color: "#DC2626", alignSelf: "center", fontFamily: F }}>{saveError}</div>}
          <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", color: "#525252", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: F }}>Cancel</button>
          <button onClick={save} disabled={!d.title||!d.assigned_to} style={{ padding: "8px 20px", border: "none", borderRadius: 6, backgroundColor: d.title&&d.assigned_to?"#0F766E":"#D1CDC8", color: "#fff", fontSize: 13, fontWeight: 600, cursor: d.title&&d.assigned_to?"pointer":"not-allowed", fontFamily: F }}>{isEdit?"Save Changes":"Create Task"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══ DATA REVIEW PANEL ═══
function DataReviewPanel({ datasetId }) {
  const dsReviews = DATA_REVIEWS.filter(r => r.dataset_id === datasetId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  const [showNew, setShowNew] = useState(false);
  const [newStatus, setNewStatus] = useState("needs_revision");
  const [selectedPresets, setSelectedPresets] = useState([]);
  const [customNote, setCustomNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState("");

  const togglePreset = (code) => setSelectedPresets(prev => prev.includes(code) ? prev.filter(p => p !== code) : [...prev, code]);
  const presetCategories = useMemo(() => { const c = {}; FEEDBACK_PRESETS.forEach(p => { if (!c[p.category]) c[p.category] = []; c[p.category].push(p); }); return c; }, []);
  const submitReview = async () => {
    setSaveError("");
    try {
      await saveSupabaseBackedRecord("data_reviews", DATA_REVIEWS, "review", {
        dataset_id: datasetId,
        reviewed_by: "Sarah Chen",
        review_status: newStatus,
        feedback_presets: newStatus === "approved" ? [] : selectedPresets,
        custom_notes: customNote.trim(),
        file_name: "Manual review",
        created_at: new Date().toISOString(),
      }, ["dataset_id","reviewed_by","review_status","feedback_presets","custom_notes","file_name","created_at"]);
      setSubmitted(true);
      setTimeout(() => { setShowNew(false); setSubmitted(false); setSelectedPresets([]); setCustomNote(""); }, 1200);
    } catch (error) {
      setSaveError(error.message || "Unable to submit review.");
    }
  };

  return (
    <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #E8E4DF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>Data Reviews <span style={{ fontWeight: 400, color: "#9CA3A0" }}>({dsReviews.length})</span></h3>
        {canReview() && <button onClick={() => setShowNew(!showNew)} style={{ padding: "4px 10px", backgroundColor: showNew ? "#FEE2E2" : "#F0FDFA", color: showNew ? "#DC2626" : "#0F766E", border: "none", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
          {showNew ? "\u2715 Cancel" : "+ New Review"}
        </button>}
      </div>

      {canReview() && showNew && !submitted && (
        <div style={{ padding: "16px", backgroundColor: "#FAF9F7", borderBottom: "1px solid #E8E4DF" }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", fontFamily: F }}>Review Status</label>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {Object.entries(REVIEW_STATUS_CONFIG).filter(([k]) => k !== "pending").map(([k, cfg]) => (
                <button key={k} onClick={() => setNewStatus(k)} style={{ flex: 1, padding: "6px 4px", borderRadius: 6, border: newStatus === k ? `2px solid ${cfg.color}` : "1px solid #E8E4DF", backgroundColor: newStatus === k ? cfg.bg : "#fff", color: cfg.color, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{cfg.label}</button>
              ))}
            </div>
          </div>

          {newStatus !== "approved" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", fontFamily: F, marginBottom: 6, display: "block" }}>Feedback Presets</label>
              {Object.entries(presetCategories).map(([cat, presets]) => (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: "#9CA3A0", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{cat}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {presets.map(p => {
                      const selected = selectedPresets.includes(p.code);
                      return (
                        <button key={p.code} onClick={() => togglePreset(p.code)}
                          style={{ padding: "4px 10px", borderRadius: 4, border: selected ? "2px solid #0F766E" : "1px solid #E8E4DF", backgroundColor: selected ? "#CCFBF1" : "#fff", color: selected ? "#0F766E" : "#6B7280", fontSize: 11, fontWeight: selected ? 700 : 500, cursor: "pointer", fontFamily: F }}>
                          {selected && "\u2713 "}{p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", fontFamily: F }}>Custom Notes</label>
            <textarea value={customNote} onChange={e => setCustomNote(e.target.value)} rows={3} placeholder="Additional feedback or specific instructions..." style={{ width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", fontFamily: F, boxSizing: "border-box", outline: "none", resize: "vertical", lineHeight: 1.5, marginTop: 4 }} />
          </div>
          {saveError && <div style={{ marginBottom: 10, fontSize: 12, color: "#DC2626", fontFamily: F }}>{saveError}</div>}
          <button onClick={submitReview}
            style={{ padding: "8px 20px", border: "none", borderRadius: 6, backgroundColor: "#0F766E", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Submit Review</button>
        </div>
      )}
      {showNew && submitted && (
        <div style={{ padding: 24, textAlign: "center", backgroundColor: "#FAF9F7", borderBottom: "1px solid #E8E4DF" }}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>{"\u2713"}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>Review submitted</div>
        </div>
      )}

      <div style={{ maxHeight: 300, overflowY: "auto" }}>
        {dsReviews.length === 0 && !showNew && <div style={{ padding: 24, textAlign: "center", color: "#9CA3A0", fontSize: 12 }}>No reviews yet.</div>}
        {dsReviews.map(rev => {
          const rs = REVIEW_STATUS_CONFIG[rev.review_status];
          return (
            <div key={rev.id} style={{ padding: "12px 16px", borderBottom: "1px solid #F0EDE8" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, fontWeight: 600, backgroundColor: rs?.bg, color: rs?.color }}>{rs?.label}</span>
                  <span style={{ fontSize: 11, color: "#9CA3A0" }}>{rev.file_name}</span>
                </div>
                <span style={{ fontSize: 10, color: "#D1CDC8" }}>{formatDateTime(rev.created_at)} · {rev.reviewed_by}</span>
              </div>
              {rev.feedback_presets.length > 0 && (
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
                  {rev.feedback_presets.map(code => { const p = FEEDBACK_PRESETS.find(fp => fp.code === code); return p ? <span key={code} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, backgroundColor: "#FEF3C7", color: "#92400E", fontWeight: 500 }}>{p.label}</span> : null; })}
                </div>
              )}
              {rev.custom_notes && <p style={{ fontSize: 12, color: "#525252", margin: "4px 0 0", lineHeight: 1.4 }}>{rev.custom_notes}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ ADMIN SETTINGS ═══
const ROLE_CONFIG = {
  admin: { label: "Admin", color: "#DC2626", bg: "#FEE2E2", desc: "Full access. Manage users, settings, and all data." },
  specialist: { label: "Specialist", color: "#0F766E", bg: "#CCFBF1", desc: "Create and manage agencies, datasets, communications, requests." },
  analyst: { label: "Analyst", color: "#7C3AED", bg: "#EDE9FE", desc: "Create and manage agencies, contacts, datasets, communications, and requests. Cannot delete records." },
  viewer: { label: "Viewer", color: "#6B7280", bg: "#F5F2EE", desc: "Read-only access to all records." },
};

function AdminSettings() {
  if (!isAdmin()) return (
    <div style={{ padding: 40, textAlign: "center", color: "#9CA3A0", fontFamily: F, fontSize: 14 }}>
      Settings is only available to Admins.
    </div>
  );
  const [tab, setTab] = useState("users");
  const [editingUser, setEditingUser] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [localSettings, setLocalSettings] = useState({ ...SYSTEM_SETTINGS });

  const saveUser = async () => {
    try {
      await saveSupabaseBackedRecord("users", SYSTEM_USERS, "user", editingUser, ["full_name","email","display_name","role","is_active","last_active","created_at"]);
      setEditingUser(null);
    } catch (error) {
      window.alert(`Unable to save user: ${error.message || "Unknown error"}`);
    }
  };
  const saveTemplate = async () => {
    try {
      await saveSupabaseBackedRecord("email_templates", EMAIL_TEMPLATES, "tpl", editingTemplate, ["name","channel","subject","body","is_active"]);
      setEditingTemplate(null);
    } catch (error) {
      window.alert(`Unable to save template: ${error.message || "Unknown error"}`);
    }
  };

  const tabs = [
    { id: "users", label: "Users & Roles", count: SYSTEM_USERS.length },
    { id: "templates", label: "Message Templates", count: EMAIL_TEMPLATES.length },
    { id: "system", label: "System Settings", count: null },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: "0 0 4px", fontFamily: F }}>Admin Settings</h1>
      <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 24px" }}>Manage users, templates, and system configuration</p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #E8E4DF", marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setEditingUser(null); setEditingTemplate(null); }}
            style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: F, color: tab === t.id ? "#0F766E" : "#6B7280", borderBottom: tab === t.id ? "2px solid #0F766E" : "2px solid transparent", marginBottom: -2 }}>
            {t.label}
            {t.count !== null && <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 9999, backgroundColor: tab === t.id ? "#CCFBF1" : "#F5F2EE", color: tab === t.id ? "#0F766E" : "#9CA3A0" }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ─── USERS TAB ─── */}
      {tab === "users" && !editingUser && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {Object.entries(ROLE_CONFIG).map(([role, cfg]) => {
                const count = SYSTEM_USERS.filter(u => u.role === role).length;
                return (
                  <span key={role} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: cfg.bg, color: cfg.color }}>
                    {cfg.label}: {count}
                  </span>
                );
              })}
            </div>
            <button onClick={() => setEditingUser({ id: "new", full_name: "", email: "", display_name: "", role: "specialist", is_active: true })}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
              <Icon name="plus" size={15} color="#fff" /> Add User
            </button>
          </div>

          <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#FAF9F7" }}>
                  {["User", "Email", "Display Name", "Role", "Status", "Last Active", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E8E4DF", fontFamily: F }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SYSTEM_USERS.map((u, i) => {
                  const rc = ROLE_CONFIG[u.role];
                  return (
                    <tr key={u.id} style={{ borderBottom: i < SYSTEM_USERS.length - 1 ? "1px solid #F0EDE8" : "none", opacity: u.is_active ? 1 : 0.55 }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: rc?.bg || "#F5F2EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: rc?.color || "#6B7280" }}>{u.full_name.split(' ').map(n => n[0]).join('')}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{u.full_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, color: "#525252" }}>{u.email}</td>
                      <td style={{ padding: "12px 14px", fontSize: 12, color: "#6B7280" }}>{u.display_name}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, backgroundColor: rc?.bg, color: rc?.color }}>{rc?.label}</span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, fontWeight: 600, backgroundColor: u.is_active ? "#D1FAE5" : "#FEE2E2", color: u.is_active ? "#059669" : "#DC2626" }}>
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 11, color: "#9CA3A0" }}>{formatDate(u.last_active)}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <button onClick={() => setEditingUser({ ...u })}
                          style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#0D9488", backgroundColor: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 4, cursor: "pointer", fontFamily: F }}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Role descriptions */}
          <div style={{ marginTop: 20, padding: "16px 20px", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#171717", margin: "0 0 12px", fontFamily: F }}>Role Permissions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                <div key={role} style={{ padding: "10px 14px", borderRadius: 6, backgroundColor: "#FAF9F7", border: "1px solid #E8E4DF" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>{cfg.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── USER EDIT FORM ─── */}
      {tab === "users" && editingUser && (
        <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "24px", maxWidth: 560 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>{editingUser.id === "new" ? "Add New User" : `Edit: ${editingUser.full_name}`}</h3>
            <button onClick={() => setEditingUser(null)} style={{ fontSize: 12, color: "#0D9488", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: F }}>{"\u2190"} Back to list</button>
          </div>
          {[
            { key: "full_name", label: "Full Name", placeholder: "Jane Doe" },
            { key: "email", label: "Email", placeholder: "jane@data.org" },
            { key: "display_name", label: "Display Name", placeholder: "Jane Doe" },
          ].map(field => (
            <div key={field.key} style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F }}>{field.label}</label>
              <input value={editingUser[field.key]} onChange={e => setEditingUser({ ...editingUser, [field.key]: e.target.value })} placeholder={field.placeholder}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", backgroundColor: "#fff", fontFamily: F, boxSizing: "border-box", outline: "none" }} />
            </div>
          ))}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F }}>Role</label>
            <div style={{ display: "flex", gap: 6 }}>
              {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                <button key={role} onClick={() => setEditingUser({ ...editingUser, role })}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: editingUser.role === role ? `2px solid ${cfg.color}` : "1px solid #E8E4DF", backgroundColor: editingUser.role === role ? cfg.bg : "#fff", color: cfg.color, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                  {cfg.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 4 }}>{ROLE_CONFIG[editingUser.role]?.desc}</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#525252", cursor: "pointer" }}>
              <input type="checkbox" checked={editingUser.is_active} onChange={e => setEditingUser({ ...editingUser, is_active: e.target.checked })} style={{ accentColor: "#0F766E", width: 16, height: 16 }} />
              User is active
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditingUser(null)}
              style={{ padding: "8px 20px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", color: "#525252", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: F }}>Cancel</button>
            <button onClick={saveUser}
              style={{ padding: "8px 20px", border: "none", borderRadius: 6, backgroundColor: "#0F766E", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
              {editingUser.id === "new" ? "Create User" : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* ─── TEMPLATES TAB ─── */}
      {tab === "templates" && !editingTemplate && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button onClick={() => setEditingTemplate({ id: "new", name: "", channel: "email", subject: "", body: "", is_active: true })}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", backgroundColor: "#0F766E", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
              <Icon name="plus" size={15} color="#fff" /> New Template
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {EMAIL_TEMPLATES.map(t => {
              const channelLabel = { email: "\u2709 Email", phone: "\u260E Phone", foia: "\u229F FOIA", portal: "\u25EB Portal" }[t.channel] || t.channel;
              return (
                <div key={t.id} style={{ padding: "16px 18px", backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#5EEAD4"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#E8E4DF"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#171717", fontFamily: F }}>{t.name}</span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, backgroundColor: "#F0FDFA", color: "#0F766E" }}>{channelLabel}</span>
                      </div>
                      {t.subject && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Subject: {t.subject}</div>}
                      <div style={{ fontSize: 12, color: "#9CA3A0", lineHeight: 1.4, maxHeight: 40, overflow: "hidden" }}>{t.body.substring(0, 120)}...</div>
                    </div>
                    <button onClick={() => setEditingTemplate({ ...t })}
                      style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#0D9488", backgroundColor: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 4, cursor: "pointer", fontFamily: F, flexShrink: 0, marginLeft: 12 }}>Edit</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, padding: "12px 16px", backgroundColor: "#FAF9F7", borderRadius: 8, border: "1px solid #E8E4DF", fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>
            <strong>Available variables:</strong> {"{sender_name}"}, {"{sender_title}"}, {"{contact_name}"}, {"{agency_name}"}, {"{dataset}"}, {"{dataset_description}"}, {"{previous_subject}"}, {"{original_date}"}
          </div>
        </div>
      )}

      {/* ─── TEMPLATE EDIT FORM ─── */}
      {tab === "templates" && editingTemplate && (
        <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "24px", maxWidth: 640 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>{editingTemplate.id === "new" ? "New Template" : `Edit: ${editingTemplate.name}`}</h3>
            <button onClick={() => setEditingTemplate(null)} style={{ fontSize: 12, color: "#0D9488", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: F }}>{"\u2190"} Back to list</button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F }}>Template Name</label>
            <input value={editingTemplate.name} onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })} placeholder="e.g., Initial CPRA Request"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", fontFamily: F, boxSizing: "border-box", outline: "none" }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F }}>Channel</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[["email", "Email"], ["phone", "Phone"], ["foia", "FOIA"], ["portal", "Portal"]].map(([val, lbl]) => (
                <button key={val} onClick={() => setEditingTemplate({ ...editingTemplate, channel: val })}
                  style={{ padding: "6px 14px", borderRadius: 6, border: editingTemplate.channel === val ? "2px solid #0F766E" : "1px solid #E8E4DF", backgroundColor: editingTemplate.channel === val ? "#F0FDFA" : "#fff", color: editingTemplate.channel === val ? "#0F766E" : "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          {editingTemplate.channel !== "phone" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F }}>Subject Line</label>
              <input value={editingTemplate.subject} onChange={e => setEditingTemplate({ ...editingTemplate, subject: e.target.value })} placeholder="e.g., CPRA Request — {dataset}"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", fontFamily: F, boxSizing: "border-box", outline: "none" }} />
            </div>
          )}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F }}>{editingTemplate.channel === "phone" ? "Call Script" : "Message Body"}</label>
            <textarea value={editingTemplate.body} onChange={e => setEditingTemplate({ ...editingTemplate, body: e.target.value })} rows={10}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", fontFamily: F, boxSizing: "border-box", outline: "none", resize: "vertical", lineHeight: 1.6 }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditingTemplate(null)}
              style={{ padding: "8px 20px", border: "1px solid #E8E4DF", borderRadius: 6, backgroundColor: "#fff", color: "#525252", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: F }}>Cancel</button>
            <button onClick={saveTemplate}
              style={{ padding: "8px 20px", border: "none", borderRadius: 6, backgroundColor: "#0F766E", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
              {editingTemplate.id === "new" ? "Create Template" : "Save Template"}
            </button>
          </div>
        </div>
      )}

      {/* ─── SYSTEM SETTINGS TAB ─── */}
      {tab === "system" && (
        <div style={{ maxWidth: 560 }}>
          {/* Communication Logging Configuration */}
          <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "20px 24px", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: "0 0 16px", fontFamily: F }}>Communication Logging</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F }}>Shared Email Reference</label>
              <input value={localSettings.shared_email} onChange={e => setLocalSettings({ ...localSettings, shared_email: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", fontFamily: F, boxSizing: "border-box", outline: "none" }} />
              <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 3 }}>Optional reference address for logged communications. DataTrack records messages; it does not send them.</div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, fontFamily: F }}>Organization Name</label>
              <input value={localSettings.org_name} onChange={e => setLocalSettings({ ...localSettings, org_name: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", fontFamily: F, boxSizing: "border-box", outline: "none" }} />
            </div>
          </div>

          {/* Follow-up Defaults */}
          <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "20px 24px", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: "0 0 4px", fontFamily: F }}>Follow-up Defaults</h3>
            <p style={{ fontSize: 12, color: "#9CA3A0", margin: "0 0 16px" }}>Auto-set follow-up dates when logging communications by channel type.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { key: "default_followup_email", label: "Email", icon: "\u2709" },
                { key: "default_followup_phone", label: "Phone", icon: "\u260E" },
                { key: "default_followup_foia", label: "FOIA / CPRA", icon: "\u229F" },
                { key: "default_followup_portal", label: "Portal", icon: "\u25EB" },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4, fontFamily: F }}>{field.icon} {field.label}</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="number" value={localSettings[field.key]} onChange={e => setLocalSettings({ ...localSettings, [field.key]: parseInt(e.target.value) || 0 })}
                      style={{ width: 70, padding: "8px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 13, color: "#262626", fontFamily: F, textAlign: "center", outline: "none" }} />
                    <span style={{ fontSize: 12, color: "#9CA3A0" }}>days</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Info */}
          <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid #E8E4DF", padding: "20px 24px", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#171717", margin: "0 0 12px", fontFamily: F }}>System Overview</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Agencies", value: AGENCIES.length },
                { label: "Contacts", value: CONTACTS.length },
                { label: "Datasets", value: DATASETS.length },
                { label: "Requests", value: REQUESTS.length },
                { label: "Communications", value: COMMUNICATIONS.length },
                { label: "Notes", value: NOTES.length },
              ].map(s => (
                <div key={s.label} style={{ padding: "10px", borderRadius: 6, backgroundColor: "#FAF9F7", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#0F766E", fontFamily: F }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#9CA3A0", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <button style={{ padding: "10px 24px", border: "none", borderRadius: 6, backgroundColor: "#0F766E", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
            Save Settings
          </button>
        </div>
      )}
    </div>
  );
}


function LoginScreen({ onSignedIn }) {
  const [mode, setMode] = useState("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupRole, setSignupRole] = useState("viewer");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const isSignup = mode === "signup";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();
    if (isSignup) {
      if (!trimmedName) {
        setError("Enter your full name.");
        return;
      }
      if (!trimmedEmail) {
        setError("Enter your email address.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }
    setLoading(true);
    try {
      if (isSignup) {
        const { data, error } = await sb.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: APP_BASE_URL,
            data: {
              full_name: trimmedName,
              display_name: trimmedName,
              role: signupRole
            }
          }
        });
        if (error) {
          setError(formatAuthError(error, "create your account"));
          return;
        }
        if (data.session) {
          onSignedIn(data.session);
          return;
        }
        setNotice("Account created. Check your email to confirm your account, then sign in.");
        setPassword("");
        setConfirmPassword("");
        setMode("signin");
        return;
      }
      const { data, error } = await sb.auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) {
        setError(formatAuthError(error, "sign in"));
        return;
      }
      onSignedIn(data.session);
    } catch (err) {
      setError(formatAuthError(err, isSignup ? "create your account" : "sign in"));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  const sendPasswordReset = async () => {
    const trimmedEmail = email.trim();
    setError("");
    setNotice("");
    if (!trimmedEmail) {
      setError("Enter your email address first, then click Forgot password.");
      return;
    }
    setResetLoading(true);
    try {
      const resetOptions = { redirectTo: APP_BASE_URL };
      const { error } = await sb.auth.resetPasswordForEmail(trimmedEmail, resetOptions);
      if (error) {
        setError(formatAuthError(error, "send a password reset email"));
        return;
      }
      setNotice("Password reset email sent. Check your inbox for the reset link.");
    } catch (err) {
      setError(formatAuthError(err, "send a password reset email"));
    } finally {
      setResetLoading(false);
    }
  };

  const inputS = { width: "100%", padding: "10px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 14, color: "#262626", backgroundColor: "#fff", fontFamily: F, boxSizing: "border-box", outline: "none" };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F8F6F3", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, padding: 24 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 380, backgroundColor: "#fff", border: "1px solid #E8E4DF", borderRadius: 10, padding: 28, boxShadow: "0 18px 40px rgba(26,26,46,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: "linear-gradient(135deg, #14B8A6, #0D9488)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800 }}>DT</div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#171717" }}>DataTrack</div>
            <div style={{ fontSize: 11, color: "#0F766E", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{isSignup ? "Create account" : "Sign in"}</div>
          </div>
        </div>
        {isSignup && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 11, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>Full name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required={isSignup} style={inputS} />
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required style={inputS} />
        </div>
        <div style={{ marginBottom: isSignup ? 12 : 16 }}>
          <label style={{ display: "block", fontSize: 11, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={isSignup ? "new-password" : "current-password"} required style={inputS} />
          {!isSignup && (
            <button type="button" onClick={sendPasswordReset} disabled={resetLoading || loading} style={{ marginTop: 8, padding: 0, border: "none", background: "transparent", color: "#0F766E", fontSize: 12, fontWeight: 700, cursor: resetLoading || loading ? "default" : "pointer", fontFamily: F }}>
              {resetLoading ? "Sending reset email..." : "Forgot password?"}
            </button>
          )}
        </div>
        {isSignup && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>Confirm password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required={isSignup} style={inputS} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Role</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                  <button key={role} type="button" onClick={() => setSignupRole(role)}
                    style={{ padding: "8px", borderRadius: 6, border: signupRole === role ? `2px solid ${cfg.color}` : "1px solid #E8E4DF", backgroundColor: signupRole === role ? cfg.bg : "#fff", color: cfg.color, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {error && <div style={{ marginBottom: 14, padding: "9px 10px", borderRadius: 6, backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", color: "#DC2626", fontSize: 12 }}>{error}</div>}
        {notice && <div style={{ marginBottom: 14, padding: "9px 10px", borderRadius: 6, backgroundColor: "#F0FDFA", border: "1px solid #5EEAD4", color: "#0F766E", fontSize: 12 }}>{notice}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 14px", border: "none", borderRadius: 6, backgroundColor: loading ? "#99F6E4" : "#0F766E", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: F }}>
          {loading ? (isSignup ? "Creating account..." : "Signing in...") : (isSignup ? "Create account" : "Sign in")}
        </button>
        <button type="button" onClick={() => switchMode(isSignup ? "signin" : "signup")} disabled={loading || resetLoading}
          style={{ width: "100%", marginTop: 12, padding: "8px 14px", border: "1px solid #99F6E4", borderRadius: 6, backgroundColor: "#F0FDFA", color: "#0F766E", fontSize: 13, fontWeight: 700, cursor: loading || resetLoading ? "default" : "pointer", fontFamily: F }}>
          {isSignup ? "Already have an account? Sign in" : "Create an account"}
        </button>
      </form>
    </div>
  );
}

function PasswordResetScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const inputS = { width: "100%", padding: "10px 12px", border: "1px solid #E8E4DF", borderRadius: 6, fontSize: 14, color: "#262626", backgroundColor: "#fff", fontFamily: F, boxSizing: "border-box", outline: "none" };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) {
        setError(formatAuthError(error, "update your password"));
        return;
      }
      setNotice("Password updated. You can continue into DataTrack.");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setTimeout(onDone, 800);
    } catch (err) {
      setError(formatAuthError(err, "update your password"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F8F6F3", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, padding: 24 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 380, backgroundColor: "#fff", border: "1px solid #E8E4DF", borderRadius: 10, padding: 28, boxShadow: "0 18px 40px rgba(26,26,46,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: "linear-gradient(135deg, #14B8A6, #0D9488)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800 }}>DT</div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#171717" }}>DataTrack</div>
            <div style={{ fontSize: 11, color: "#0F766E", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Reset password</div>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>New password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required style={inputS} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>Confirm password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required style={inputS} />
        </div>
        {error && <div style={{ marginBottom: 14, padding: "9px 10px", borderRadius: 6, backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", color: "#DC2626", fontSize: 12 }}>{error}</div>}
        {notice && <div style={{ marginBottom: 14, padding: "9px 10px", borderRadius: 6, backgroundColor: "#F0FDFA", border: "1px solid #5EEAD4", color: "#0F766E", fontSize: 12 }}>{notice}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 14px", border: "none", borderRadius: 6, backgroundColor: loading ? "#99F6E4" : "#0F766E", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: F }}>
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}

// ═══ HELP CENTER ═══
function HelpSectionHeader({ num, title, id }) {
  return (
    <div id={"help-" + id} style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20, paddingTop: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#D5D5D0", letterSpacing: "0.1em", fontFamily: F, flexShrink: 0 }}>{num}</span>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#171717", margin: 0, fontFamily: F }}>{title}</h2>
    </div>
  );
}
function HelpDivider() {
  return <div style={{ height: 1, backgroundColor: "#E8E4DF", margin: "40px 0" }} />;
}
function HelpStepList({ steps }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: "#CCFBF1", color: "#0F766E", fontSize: 11, fontWeight: 700, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
          <p style={{ margin: 0, fontSize: 13, color: "#525252", lineHeight: 1.65, fontFamily: F, paddingTop: 3 }}>{step}</p>
        </div>
      ))}
    </div>
  );
}
function HelpTip({ children }) {
  return (
    <div style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderLeft: "3px solid #D97706", borderRadius: 6, padding: "10px 14px", marginTop: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ color: "#D97706", fontSize: 13, flexShrink: 0, lineHeight: 1 }}>✦</span>
      <p style={{ margin: 0, fontSize: 12, color: "#92400E", fontFamily: F, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}
function HelpNote({ children }) {
  return (
    <div style={{ backgroundColor: "#F0FDFA", border: "1px solid #99F6E4", borderLeft: "3px solid #0F766E", borderRadius: 6, padding: "10px 14px", marginTop: 14 }}>
      <p style={{ margin: 0, fontSize: 12, color: "#134E4A", fontFamily: F, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}
function HelpCodeBlock({ text }) {
  return (
    <pre style={{ backgroundColor: "#1E293B", color: "#94A3B8", fontSize: 11.5, fontFamily: "monospace", padding: "12px 14px", borderRadius: 6, margin: "12px 0 0", overflowX: "auto", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{text}</pre>
  );
}
function HelpInlineCode({ text }) {
  return (
    <code style={{ backgroundColor: "#F1F5F9", color: "#0F766E", fontSize: 11, fontFamily: "monospace", padding: "1px 5px", borderRadius: 3 }}>{text}</code>
  );
}
function HelpCheckItem({ text }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "5px 0" }}>
      <span style={{ color: "#0F766E", fontSize: 13, flexShrink: 0, lineHeight: 1.6 }}>✓</span>
      <p style={{ margin: 0, fontSize: 13, color: "#525252", lineHeight: 1.6, fontFamily: F }}>{text}</p>
    </div>
  );
}
function HelpRefTable({ headers, rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: F }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9CA3A0", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "2px solid #E8E4DF", backgroundColor: "#FAF9F7" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #E8E4DF", backgroundColor: i % 2 === 0 ? "#fff" : "#FAF9F7" }}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: "9px 12px", color: j === 0 ? "#0F766E" : "#525252", fontWeight: j === 0 ? 600 : 400, lineHeight: 1.5 }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const HELP_MANUAL_NAV = [
  { id: "purpose", label: "Purpose", num: "01" },
  { id: "who", label: "Who Uses DataTrack", num: "02" },
  { id: "signin", label: "Sign In & Account", num: "03" },
  { id: "navigation", label: "Main Navigation", num: "04" },
  { id: "workflows", label: "Everyday Workflows", num: "05" },
  { id: "standards", label: "Data Entry Standards", num: "06" },
  { id: "reference", label: "Quick Reference", num: "07" },
];

const HELP_WORKFLOWS = [
  {
    title: "Check Work Status",
    steps: [
      "Open Dashboard for a live count of open requests, overdue tasks, and recent activity.",
      "Click any metric tile to jump directly to the filtered list.",
      "Use the Tasks page to see your assigned items sorted by due date.",
    ],
  },
  {
    title: "Add or Update an Agency",
    steps: [
      "Go to Agencies and click New Agency.",
      "Enter the agency name, type (city, county, special district), county, and website.",
      "Add a general contact email and phone if known.",
      "Use the Notes tab on the Agency detail page to log informal context about the relationship.",
      "Save. The agency is immediately available in all linked dropdowns.",
    ],
    tip: "Use the official agency name as it appears in public records. Avoid abbreviations unless the agency itself uses them.",
  },
  {
    title: "Add a Contact",
    steps: [
      "Go to Contacts and click New Contact, or use the + Contact button on an Agency detail page.",
      "Select the linked agency from the dropdown.",
      "Enter the contact's name, title, department, email, and phone.",
      "Mark one email and one phone as primary if you add multiple.",
      "Save. The contact appears in communication and request dropdowns.",
      "Use the Notes tab on the Contact detail page to capture relationship context.",
    ],
  },
  {
    title: "Add or Update a Dataset",
    steps: [
      "Go to Datasets and click New Dataset.",
      "Link the dataset to an agency and choose the category and acquisition method.",
      "Set the current acquisition status and fill in format, refresh cadence, and cost fields if known.",
      "Add the portal or source URL if one exists.",
      "Save. Analysts can then add reviews from the dataset detail page.",
    ],
    tip: "If the dataset has a playbook or intake spec, paste the key details into the dataset notes so analysts have context.",
  },
  {
    title: "Log a Communication",
    steps: [
      "Click Log Communication from the Communications page or any agency or contact detail page.",
      "Choose the channel (Email, Phone, CPRA/FOIA, Portal) and direction (Inbound or Outbound).",
      "Select the linked agency and, if applicable, the contact, dataset, or request.",
      "Record the outcome and set a follow-up date if further action is needed.",
      "Save. Communications are permanent log entries and cannot be edited after saving.",
    ],
    note: "Communications are intentionally log-only. If a detail was entered incorrectly, add a follow-up communication noting the correction.",
  },
  {
    title: "Track a Request",
    steps: [
      "Go to Requests and click New Request.",
      "Choose the request type: CPRA, FOIA, API Access, Direct Purchase, or Manual Data.",
      "Link the agency, dataset, and assignee.",
      "Move the request through statuses as it progresses.",
      "Use the Notes tab on the request to preserve context between handoffs.",
      "Log each communication from the linked agency directly on the request.",
      "Close the request when the data is received or the effort is abandoned.",
    ],
    statusTable: {
      headers: ["Status", "Meaning"],
      rows: [
        ["Draft", "Started but not yet submitted to the agency."],
        ["Submitted", "Sent to the agency, awaiting response."],
        ["In Review", "Agency is processing the request."],
        ["Fulfilled", "Data received and ready for analyst review."],
        ["Partially Fulfilled", "Some records received; others pending."],
        ["Denied", "Request refused by the agency."],
        ["Closed", "Effort complete or abandoned."],
      ],
    },
  },
  {
    title: "Create and Manage Tasks",
    steps: [
      "Go to Tasks and click New Task, or click + Task from any agency, contact, or request detail page.",
      "Set the task type, priority, due date, and assignee.",
      "Add a note describing exactly what needs to happen.",
      "Complete a task using the Complete button. Snooze it if it should resurface later.",
      "Each status change and note is logged in the task history for handoff continuity.",
    ],
    statusTable: {
      headers: ["Status", "Use it when"],
      rows: [
        ["Open", "Assigned and needs action."],
        ["In Progress", "Actively being worked on."],
        ["Snoozed", "Not urgent — set to resurface on a specific date."],
        ["Blocked", "Cannot proceed without input or action from someone else."],
        ["Completed", "Work is done."],
      ],
    },
  },
  {
    title: "Review a Dataset",
    steps: [
      "Open the dataset from the Datasets page and click the Reviews tab.",
      "Click New Review and select the review status.",
      "Apply preset feedback tags that apply, then add custom notes for specific issues.",
      "Save. The review is logged with the reviewer and date.",
      "Update the dataset's acquisition status if the review changes the pipeline stage.",
      "Add a task if follow-up is needed from the agency.",
      "Use the Notes field on the review for issues not covered by a preset tag.",
    ],
    tip: "Use the preset tags for issues that come up repeatedly (missing fields, wrong format, incomplete coverage). Add custom notes for agency-specific or one-time issues.",
  },
  {
    title: "Add Notes",
    steps: [
      "Open any agency, contact, dataset, request, or task detail page.",
      "Click the Notes tab and type your note.",
      "Notes are timestamped with your name and permanently attached to the record.",
    ],
    tip: "Good notes answer: what happened, what was agreed, what is still open, and who is responsible. Avoid one-word entries like 'called' or 'emailed'.",
  },
];

function HelpUserManual() {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <HelpSectionHeader num="01" title="Purpose" id="purpose" />
      <p style={{ fontSize: 13, color: "#525252", lineHeight: 1.7, fontFamily: F, margin: "0 0 14px" }}>
        DataTrack is a shared workspace for data acquisition teams tracking public-sector real estate datasets across California. It keeps agency contacts, data requests, communications, tasks, and analyst reviews in one place so the whole team always works from the same record.
      </p>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", backgroundColor: "#CCFBF1", borderRadius: 20 }}>
        <Icon name="globe" size={12} color="#0F766E" />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "#0F766E", fontFamily: F }}>serve-foundation.github.io/DataTrack</span>
      </div>

      <HelpDivider />

      <HelpSectionHeader num="02" title="Who Uses DataTrack" id="who" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { role: "Admin", color: "#7C3AED", bg: "#EDE9FE", desc: "Manages users, roles, templates, and system settings. Can create and delete any record." },
          { role: "Specialist", color: "#0891B2", bg: "#CFFAFE", desc: "Handles agency outreach, logs communications, manages requests, and creates tasks." },
          { role: "Analyst", color: "#0F766E", bg: "#CCFBF1", desc: "Creates and manages agencies, contacts, datasets, communications, and requests. Reviews received datasets and submits analyst feedback. Cannot delete records." },
          { role: "Viewer", color: "#525252", bg: "#F5F2EE", desc: "Read-only access to all records. Cannot create, edit, or delete anything." },
        ].map(({ role, color, bg, desc }) => (
          <div key={role} style={{ padding: "16px 18px", backgroundColor: "#fff", border: "1px solid #E8E4DF", borderRadius: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, backgroundColor: bg, color, fontFamily: F, letterSpacing: "0.05em", textTransform: "uppercase" }}>{role}</span>
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#525252", lineHeight: 1.6, fontFamily: F }}>{desc}</p>
          </div>
        ))}
      </div>

      <HelpDivider />

      <HelpSectionHeader num="03" title="Sign In & Account Access" id="signin" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ padding: "18px 20px", backgroundColor: "#fff", border: "1px solid #E8E4DF", borderRadius: 8 }}>
          <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#9CA3A0", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: F }}>Sign In</p>
          <HelpStepList steps={["Open the app and enter your email and password.", "Click Sign In. DataTrack will load your records.", "To reset your password, click Forgot password? and check your email for a reset link."]} />
        </div>
        <div style={{ padding: "18px 20px", backgroundColor: "#fff", border: "1px solid #E8E4DF", borderRadius: 8 }}>
          <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#9CA3A0", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: F }}>Create an Account</p>
          <HelpStepList steps={["Click Create account on the sign-in screen.", "Enter your full name, email, password, and requested role.", "Confirm your email by clicking the link Supabase sends."]} />
        </div>
      </div>

      <HelpDivider />

      <HelpSectionHeader num="04" title="Main Navigation" id="navigation" />
      <p style={{ fontSize: 13, color: "#525252", lineHeight: 1.6, fontFamily: F, margin: "0 0 16px" }}>Use the left sidebar to navigate between areas. Your active page is saved between sessions.</p>
      <div style={{ border: "1px solid #E8E4DF", borderRadius: 8, overflow: "hidden" }}>
        <HelpRefTable
          headers={["Area", "Use it for"]}
          rows={[
            ["Dashboard", "Team overview, pipeline status, overdue work, and quick links."],
            ["Agencies", "Source agencies, jurisdiction details, linked contacts, datasets, and communications."],
            ["Contacts", "People at agencies — contact methods and communication history."],
            ["Datasets", "Target datasets, acquisition status, delivery format, cost, and analyst review."],
            ["Communications", "Logged interactions with agencies, including follow-up tracking."],
            ["Requests", "Formal and informal data request workflow tracking from draft to closure."],
            ["Tasks", "Shared work queue for follow-ups, reviews, clarifications, and assignments."],
            ["Settings", "User roles, email templates, and system configuration (Admin only)."],
          ]}
        />
      </div>

      <HelpDivider />

      <HelpSectionHeader num="05" title="Everyday Workflows" id="workflows" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {HELP_WORKFLOWS.map(({ title, steps, tip, note, statusTable }) => (
          <div key={title} style={{ padding: "20px 22px", backgroundColor: "#fff", border: "1px solid #E8E4DF", borderRadius: 8 }}>
            <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#0F766E", fontFamily: F }}>{title}</p>
            <HelpStepList steps={steps} />
            {tip && <HelpTip>{tip}</HelpTip>}
            {note && <HelpNote>{note}</HelpNote>}
            {statusTable && (
              <div style={{ marginTop: 16, border: "1px solid #E8E4DF", borderRadius: 6, overflow: "hidden" }}>
                <HelpRefTable headers={statusTable.headers} rows={statusTable.rows} />
              </div>
            )}
          </div>
        ))}
      </div>

      <HelpDivider />

      <HelpSectionHeader num="06" title="Data Entry Standards" id="standards" />
      <div style={{ padding: "20px 22px", backgroundColor: "#fff", border: "1px solid #E8E4DF", borderRadius: 8 }}>
        {[
          "Use the full official agency name. No abbreviations unless the agency uses them publicly.",
          "Use ISO date format (YYYY-MM-DD) when entering dates manually.",
          "Check for an existing record before creating a new agency, contact, or dataset.",
          "Fill in required fields completely. Partial records create gaps in reporting.",
          "Assign every task and request to a named person. Unassigned items do not get done.",
          "Set a due date on every task. Open-ended tasks are hard to prioritize.",
          "Use the Notes field for context that does not fit elsewhere — not as the primary record.",
          "Log communications as they happen, not days later. Details matter for CPRA timelines.",
        ].map((item, i) => <HelpCheckItem key={i} text={item} />)}
      </div>

      <HelpDivider />

      <HelpSectionHeader num="07" title="Quick Reference" id="reference" />
      <div style={{ border: "1px solid #E8E4DF", borderRadius: 8, overflow: "hidden" }}>
        <HelpRefTable
          headers={["Need", "Go to"]}
          rows={[
            ["See all overdue tasks", "Dashboard → Overdue Tasks tile"],
            ["Log a communication", "Communications → Log Communication, or any agency or contact detail page"],
            ["Find a dataset's status", "Datasets → search by name or agency"],
            ["View a request thread", "Requests → open request → Communications tab"],
            ["Reassign a task", "Tasks → open task → edit assignee"],
            ["Add a note to a record", "Open any detail page → Notes tab"],
            ["Reset a password", "Sign-in screen → Forgot password?"],
            ["Manage users and roles", "Settings → Users & Roles (Admin only)"],
          ]}
        />
      </div>
    </div>
  );
}

const HELP_ESCALATION_TEMPLATE = `Subject: DataTrack Support Request — [Short Description]

Reporter name:
Reporter role:
Date and time of issue:
Browser and OS:
App URL being used:

What I was trying to do:

What happened instead:

Error message (exact text or screenshot):

Steps already tried:

Is this blocking your work? Yes / No`;

const HELP_COMMON_ISSUES = [
  {
    id: "signin_issue", title: "I cannot sign in",
    check: ["Confirm your email and password are correct. Passwords are case-sensitive.", "Check that you are using the same email address your account was created with.", "Try the Forgot password? flow to reset your password."],
    tryList: ["Clear your browser cache and cookies, then try again.", "Try a different browser or an incognito / private window.", "Contact your Admin to confirm your account is active in Settings → Users & Roles."],
  },
  {
    id: "noaccess", title: "I created an account but cannot use the app",
    check: ["Check your email for a confirmation message from Supabase and click the link.", "Confirm your email address is verified in Supabase Auth.", "Ask your Admin to check that your account row exists in Settings → Users & Roles and is marked active."],
    tryList: ["Sign out and sign back in after the Admin has activated your account."],
  },
  {
    id: "resetmail", title: "Password reset email did not arrive",
    check: ["Check your spam or junk folder.", "Confirm the email address you entered matches your account exactly.", "Wait up to 5 minutes — delivery can be delayed."],
    tryList: ["Ask your Admin to resend the invite or trigger a reset from the Supabase dashboard.", "Verify that your Supabase project has the correct Site URL set to the deployed app URL."],
  },
  {
    id: "loading", title: "Page shows \"Loading Supabase data…\" for too long",
    tryList: ["Check your internet connection.", "Reload the page and try again.", "Open the browser console (F12 → Console) and look for fetch errors pointing to the Supabase URL."],
  },
  {
    id: "loadfail", title: "Page shows \"Supabase load failed\"",
    check: ["The Supabase project URL in the app may be wrong or the project may be paused.", "The anon key may have expired or been rotated.", "Row-level security policies may be blocking the read.", "One or more required tables may be missing from the database."],
    tryList: ["Check the Supabase dashboard and confirm the project is active.", "Re-run the schema SQL if tables are missing.", "Verify the SUPABASE_URL and SUPABASE_ANON_KEY constants in the app match the Supabase project settings."],
  },
  {
    id: "nosave", title: "A record will not save",
    check: ["Confirm all required fields are filled in.", "Check for a visible error message near the Save button.", "Open the browser console and look for a Supabase error response."],
    tryList: ["Reload and try again — the session may have timed out.", "Check that your role has permission to create or edit this record type."],
  },
  {
    id: "nodelete", title: "I cannot delete an agency or request",
    check: ["Agencies with linked contacts or datasets cannot be deleted until those linked records are removed first.", "Only Admins can delete certain record types."],
    tryList: ["Remove or unlink all contacts and datasets from the agency, then try deleting again.", "Ask an Admin to delete the record if your role does not have delete permissions."],
  },
  {
    id: "emptydropdown", title: "A contact or dataset dropdown is empty",
    check: ["The linked agency may not have any contacts or datasets added yet.", "The agency may not be saved — confirm the agency record exists."],
    tryList: ["Add the contact or dataset first, then return to the form and try again."],
  },
  {
    id: "notask", title: "A task does not show up",
    check: ["Check the filter on the Tasks page — the task may be filtered out by status or assignee.", "Snoozed tasks only reappear after their snooze date.", "The task may be assigned to a different user.", "Completed tasks are not shown by default — use the filter to include them."],
  },
  {
    id: "staledata", title: "Data looks old or different for two users",
    tryList: ["Reload the app — DataTrack loads data once per session.", "Sign out and sign back in to force a full data refresh.", "Ask the other user to reload and compare again."],
  },
  {
    id: "signuplimit", title: "New account confirmation email was not received",
    check: [
      "Supabase's built-in email service is rate-limited to 3 confirmation emails per hour on the free plan. If several people signed up recently, the email may have been silently dropped.",
      "Supabase does not queue dropped emails — once the limit is hit, emails for that hour are gone.",
      "Check your spam or junk folder before assuming the email was not sent.",
    ],
    tryList: [
      "Wait until the next hour and ask the user to request a new confirmation email by trying the Forgot password? flow or re-signing up.",
      "An Admin can manually confirm the account: go to Supabase Dashboard → Authentication → Users → find the user → click the menu → Confirm.",
      "To remove the limit entirely, configure a custom SMTP provider (e.g. Resend) under Supabase → Authentication → SMTP Settings. This replaces the built-in mailer and has no hourly cap.",
      "For an internal team tool, the simplest fix is to disable email confirmation entirely: Supabase → Authentication → Providers → Email → toggle off Confirm email. New users can then sign in immediately after account creation.",
    ],
  },
];

function HelpTroubleshooting({ openIssues, toggleIssue, openTech, toggleTech }) {
  const techSections = [
    {
      id: "localtest", title: "Run a local test",
      content: (
        <div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#525252", fontFamily: F, lineHeight: 1.6 }}>Run a local HTTP server from the project folder. Do not open the HTML file directly — auth flows require HTTP.</p>
          <HelpCodeBlock text={"python3 -m http.server 5174\n# Then open: http://localhost:5174/"} />
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#9CA3A0", fontFamily: F }}>If port 5174 is in use, try 5175 or any available port.</p>
        </div>
      ),
    },
    {
      id: "files", title: "Key files to check",
      content: (
        <div style={{ border: "1px solid #E8E4DF", borderRadius: 6, overflow: "hidden" }}>
          <HelpRefTable
            headers={["File", "Use"]}
            rows={[
              ["DataTrack_v11plus.jsx", "Main source — edit this for all logic and UI changes."],
              ["DataTrack_v11plus.html", "Runnable HTML — keep in sync with the JSX after changes."],
              ["index.html", "GitHub Pages entry point — same content as the HTML file."],
              ["simple-create-account-gateway.sql", "Supabase trigger for new user signup flow."],
              ["USER_MANUAL.md", "Plain-language user guide."],
              ["TROUBLESHOOTING_MANUAL.md", "Troubleshooting steps for users and admins."],
            ]}
          />
        </div>
      ),
    },
    {
      id: "supabase_cfg", title: "Supabase configuration checklist",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            "SUPABASE_URL in the app matches the project URL from Supabase → Settings → API.",
            "SUPABASE_ANON_KEY matches the anon public key from the same page.",
            "The Supabase project Site URL is set to the deployed GitHub Pages URL.",
            "Both the GitHub Pages URL and localhost are in the Auth Redirect URLs list.",
            "Row-level security policies allow reads for authenticated users on all required tables.",
            "The simple-create-account-gateway.sql trigger has been run in the SQL Editor.",
            "All required tables exist: agencies, contacts, datasets, communications, requests, tasks, notes, data_reviews, users, email_templates, feedback_presets.",
          ].map((item, i) => <HelpCheckItem key={i} text={item} />)}
        </div>
      ),
    },
    {
      id: "browser_checks", title: "Browser checks",
      content: (
        <div>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#525252", fontFamily: F, lineHeight: 1.6 }}>Open the browser console (F12 or Cmd+Option+I). Check the Console and Network tabs for errors. Common HTTP status codes:</p>
          <div style={{ border: "1px solid #E8E4DF", borderRadius: 6, overflow: "hidden" }}>
            <HelpRefTable
              headers={["Status", "Meaning"]}
              rows={[
                ["401", "Not authenticated — the session may have expired. Sign out and sign back in."],
                ["403", "Forbidden — row-level security is blocking the request. Check Supabase policies."],
                ["404", "Table or resource not found — confirm the table exists in Supabase."],
                ["0 / Failed to fetch", "Network error — Supabase project URL is unreachable or the project is paused."],
              ]}
            />
          </div>
        </div>
      ),
    },
    {
      id: "github_pages", title: "GitHub Pages checks",
      content: (
        <div>
          <HelpStepList steps={[
            "Confirm the latest commit to main has been pushed to the GitHub remote.",
            "Check the Actions tab in GitHub for any Pages deployment failures.",
            "Hard-reload the live page (Cmd+Shift+R or Ctrl+Shift+R) to bypass browser cache.",
            "Verify the Pages source is set to the main branch root in GitHub → Settings → Pages.",
          ]} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderLeft: "4px solid #D97706", borderRadius: 8, padding: "20px 22px", marginBottom: 32 }}>
        <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: F }}>Start Here</p>
        <HelpStepList steps={[
          "Reload the page. Most display issues resolve with a fresh load.",
          "Sign out and sign back in. This forces a full data refresh from Supabase.",
          "Try a different browser or incognito window to rule out extension conflicts.",
          "Open the browser console (F12) and note any red error messages before searching below.",
          "Check that you are on the latest deployed version of the app.",
        ]} />
        <div style={{ marginTop: 14 }}>
          <HelpInlineCode text="https://serve-foundation.github.io/DataTrack/" />
        </div>
      </div>

      <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3A0", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: F, margin: "0 0 12px" }}>Common User Issues</p>
      <div style={{ border: "1px solid #E8E4DF", borderRadius: 8, overflow: "hidden", marginBottom: 32 }}>
        {HELP_COMMON_ISSUES.map(({ id, title, check, tryList }, idx) => (
          <div key={id} style={{ borderBottom: idx < HELP_COMMON_ISSUES.length - 1 ? "1px solid #E8E4DF" : "none" }}>
            <button onClick={() => toggleIssue(id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", backgroundColor: openIssues[id] ? "#FAFAF9" : "#fff", border: "none", cursor: "pointer", fontFamily: F, textAlign: "left", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#D1D5DB", letterSpacing: "0.08em", flexShrink: 0, minWidth: 26, fontFamily: F }}>{"#" + String(idx + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{title}</span>
              </div>
              <span style={{ fontSize: 16, color: "#9CA3A0", display: "inline-block", transform: openIssues[id] ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0, lineHeight: 1 }}>›</span>
            </button>
            {openIssues[id] && (
              <div style={{ padding: "2px 18px 18px 56px", backgroundColor: "#FAFAF9", borderTop: "1px solid #E8E4DF" }}>
                {check && check.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 10.5, fontWeight: 700, color: "#9CA3A0", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: F, margin: "14px 0 8px" }}>Check</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {check.map((item, i) => <HelpCheckItem key={i} text={item} />)}
                    </div>
                  </div>
                )}
                {tryList && tryList.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10.5, fontWeight: 700, color: "#9CA3A0", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: F, margin: "14px 0 8px" }}>Try</p>
                    <HelpStepList steps={tryList} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {effectiveRole() === "admin" && (
        <>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3A0", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: F, margin: "0 0 12px" }}>Technical Troubleshooting</p>
          <div style={{ border: "1px solid #E8E4DF", borderRadius: 8, overflow: "hidden", marginBottom: 32 }}>
            {techSections.map(({ id, title, content }, idx) => (
              <div key={id} style={{ borderBottom: idx < techSections.length - 1 ? "1px solid #E8E4DF" : "none" }}>
                <button onClick={() => toggleTech(id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", backgroundColor: openTech[id] ? "#FAFAF9" : "#fff", border: "none", cursor: "pointer", fontFamily: F, textAlign: "left", gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#171717", fontFamily: F }}>{title}</span>
                  <span style={{ fontSize: 16, color: "#9CA3A0", display: "inline-block", transform: openTech[id] ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0, lineHeight: 1 }}>›</span>
                </button>
                {openTech[id] && (
                  <div style={{ padding: "2px 18px 18px", backgroundColor: "#FAFAF9", borderTop: "1px solid #E8E4DF" }}>
                    {content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3A0", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: F, margin: "0 0 12px" }}>Known Product Constraints</p>
      <div style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderLeft: "3px solid #D97706", borderRadius: 8, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
        {[
          "Communications cannot be edited after they are saved. Add a follow-up entry to correct a logged communication.",
          "Changes made by one user are pushed to all connected sessions automatically. If two users edit the same record at the same moment, the last save wins.",
          "File attachments are not supported. Reference file paths or storage locations in notes.",
          "The app does not send automated reminders for overdue tasks or follow-up dates.",
          "Deleted records cannot be recovered from within the app. Recovery requires a Supabase database restore.",
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ color: "#D97706", fontSize: 12, flexShrink: 0, lineHeight: 1.65 }}>⚠</span>
            <p style={{ margin: 0, fontSize: 12.5, color: "#92400E", fontFamily: F, lineHeight: 1.6 }}>{item}</p>
          </div>
        ))}
      </div>

    </div>
  );
}

function HelpCenter() {
  const [tab, setTab] = useState("manual");
  const [activeSection, setActiveSection] = useState("purpose");
  const [openIssues, setOpenIssues] = useState({});
  const [openTech, setOpenTech] = useState({});
  useEffect(() => {
    if (tab !== "manual") return;
    const onScroll = () => {
      let current = HELP_MANUAL_NAV[0].id;
      for (const { id } of HELP_MANUAL_NAV) {
        const el = document.getElementById("help-" + id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 100) current = id;
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [tab]);

  const toggleIssue = (id) => setOpenIssues(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleTech = (id) => setOpenTech(prev => ({ ...prev, [id]: !prev[id] }));
  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById("help-" + id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#171717", margin: "0 0 4px", fontFamily: F }}>Help Center</h1>
        <p style={{ fontSize: 13, color: "#9CA3A0", margin: 0, fontFamily: F }}>User manual and troubleshooting reference for DataTrack.</p>
      </div>
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #E8E4DF", marginBottom: 28 }}>
        {[{ id: "manual", label: "User Manual" }, { id: "troubleshooting", label: "Troubleshooting" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, color: tab === t.id ? "#0F766E" : "#6B7280", backgroundColor: "transparent", border: "none", borderBottom: tab === t.id ? "2px solid #0F766E" : "2px solid transparent", marginBottom: -2, cursor: "pointer", fontFamily: F }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "manual" ? (
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
          <div style={{ width: 168, flexShrink: 0, position: "sticky", top: 24, alignSelf: "flex-start" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3A0", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: F, margin: "0 0 10px" }}>On this page</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {HELP_MANUAL_NAV.map(({ id, label, num }) => (
                <button key={id} onClick={() => scrollTo(id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 5, border: "none", backgroundColor: activeSection === id ? "#CCFBF1" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: F }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: activeSection === id ? "#0F766E" : "#D1D5DB", letterSpacing: "0.06em", minWidth: 18, flexShrink: 0, fontFamily: F }}>{num}</span>
                  <span style={{ fontSize: 12, fontWeight: activeSection === id ? 600 : 400, color: activeSection === id ? "#0F766E" : "#6B7280", lineHeight: 1.4, fontFamily: F }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
          <HelpUserManual />
        </div>
      ) : (
        <HelpTroubleshooting openIssues={openIssues} toggleIssue={toggleIssue} openTech={openTech} toggleTech={toggleTech} />
      )}
    </div>
  );
}

// ═══ APP ═══
function App() {
  const [page, setPage] = useState(getInitialPage);
  const [selAgency, setSelAgency] = useState(null);
  const [selContact, setSelContact] = useState(null);
  const [showCommForm, setShowCommForm] = useState(false);
  const [commFormPrefill, setCommFormPrefill] = useState({});
  const [recordForm, setRecordForm] = useState(null);
  const [pageFilter, setPageFilter] = useState({});
  const [saveKey, setSaveKey] = useState(0);
  const [dashRole, setDashRole] = useState("admin");
  const [session, setSession] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [supabaseStatus, setSupabaseStatus] = useState({ loading: false, error: "", loaded: !isSupabaseConfigured });

  useEffect(() => {
    let mounted = true;
    if (!sb) {
      setAuthLoading(false);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      if (window.location.hash.includes("type=recovery")) setPasswordRecovery(true);
      setAuthLoading(false);
    });
    const { data: authListener } = sb.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let realtimeChannel = null;
    if (!isSupabaseConfigured || !session) return;
    setSupabaseStatus({ loading: true, error: "", loaded: false });
    loadSupabaseSeedTables().then(({ error }) => {
      if (!mounted) return;
      setSupabaseStatus({ loading: false, error, loaded: !error });
      if (!error) {
        const u = SYSTEM_USERS.find(u => u.email === session.user.email);
        CURRENT_ROLE = u?.role || "viewer";
        setDashRole(CURRENT_ROLE);
        setSaveKey(k => k + 1);
        realtimeChannel = setupRealtimeSubscriptions(setSaveKey);
      }
    });
    return () => {
      mounted = false;
      if (realtimeChannel && sb) sb.removeChannel(realtimeChannel);
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    CURRENT_ROLE = "viewer";
    PREVIEW_ROLE = null;
    if (sb) await sb.auth.signOut();
    setSession(null);
  };

  const handleDashRoleChange = (role) => {
    setDashRole(role);
    if (CURRENT_ROLE === "admin") {
      PREVIEW_ROLE = role === "admin" ? null : role;
      setSaveKey(k => k + 1);
    }
  };

  const setActivePage = (pg) => {
    persistPage(pg);
    setPage(pg);
  };

  const navTo = (pg, filter) => {
    setSelAgency(null);
    setSelContact(null);
    setPageFilter(filter || {});
    setActivePage(pg);
  };

  const openCommForm = (agencyId, datasetId) => {
    setCommFormPrefill({ agencyId: agencyId || "", datasetId: datasetId || "" });
    setShowCommForm(true);
  };

  const deleteAgency = async (agency) => {
    const linkedContacts = contactCountMap[agency.id] || 0;
    const linkedDatasets = datasetCountMap[agency.id] || 0;
    const warning = linkedContacts || linkedDatasets
      ? `\n\nThis agency has ${linkedContacts} contact(s) and ${linkedDatasets} dataset(s). Supabase may block deletion until linked records are removed.`
      : "";
    if (!window.confirm(`Delete ${agency.name}?${warning}`)) return;
    try {
      await deleteAgencyRecord(agency.id);
      setSelAgency(null);
      setSaveKey(k => k + 1);
    } catch (error) {
      window.alert(`Unable to delete agency: ${error.message || "Unknown error"}`);
    }
  };

  const renderPage = () => {
    if (page === "agencies" && selAgency) return <AgencyDetail key={saveKey} agencyId={selAgency} onBack={() => setSelAgency(null)} onOpenForm={openCommForm} onDelete={deleteAgency} onEditRecord={setRecordForm} onViewContact={(cid) => { setSelContact(cid); setActivePage("contacts"); }} />;
    switch (page) {
      case "dashboard": return <Dashboard key={saveKey} onNav={navTo} onAgency={setSelAgency} dashRole={dashRole} onDashRoleChange={handleDashRoleChange} />;
      case "agencies": return <AgencyList key={saveKey} onSelect={setSelAgency} initFilter={pageFilter} onNewRecord={setRecordForm} />;
      case "datasets": return <DatasetList key={saveKey} onNav={navTo} onAgency={setSelAgency} initFilter={pageFilter} onEditRecord={setRecordForm} />;
      case "communications": return <CommLog key={saveKey} onNav={navTo} onAgency={setSelAgency} onOpenForm={openCommForm} initFilter={pageFilter} onEditRecord={setRecordForm} />;
      case "contacts":
        if (selContact) return <ContactDetail contactId={selContact} onBack={() => setSelContact(null)} onNav={navTo} onAgency={setSelAgency} onEditRecord={setRecordForm} onOpenCommForm={openCommForm} />;
        return <ContactDirectory key={saveKey} onNav={navTo} onAgency={setSelAgency} initFilter={pageFilter} onSelectContact={setSelContact} onEditRecord={setRecordForm} />;
      case "requests": return <RequestList key={saveKey} onNav={navTo} onAgency={setSelAgency} initFilter={pageFilter} onEditRecord={setRecordForm} onViewContact={(cid) => { setSelContact(cid); setActivePage("contacts"); }} />;
      case "tasks": return <TaskList key={saveKey} onNav={navTo} onAgency={setSelAgency} initFilter={pageFilter} onViewContact={(cid) => { setSelContact(cid); setActivePage("contacts"); }} />;
      case "settings": return <AdminSettings key={saveKey} />;
      case "help": return <HelpCenter />;
      default: return null;
    }
  };

  return (
    authLoading ? (
      <div style={{ minHeight: "100vh", backgroundColor: "#F8F6F3", display: "flex", alignItems: "center", justifyContent: "center", color: "#0F766E", fontSize: 13, fontWeight: 700, fontFamily: F }}>Checking session...</div>
    ) : passwordRecovery && session ? (
      <PasswordResetScreen onDone={() => setPasswordRecovery(false)} />
    ) : isSupabaseConfigured && !session ? (
      <LoginScreen onSignedIn={setSession} />
    ) : (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#F8F6F3", fontFamily: F }}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <Sidebar active={page} onNav={navTo} onAgency={setSelAgency} currentUser={session?.user} onSignOut={signOut} />
      <main style={{ marginLeft: SIDEBAR_W, flex: 1, padding: "28px 32px", minHeight: "100vh", maxWidth: 1120 }}>
        {supabaseStatus.loading ? (
          <div style={{ padding: "10px 12px", borderRadius: 6, backgroundColor: "#F0FDFA", border: "1px solid #99F6E4", color: "#0F766E", fontSize: 12, fontWeight: 600, fontFamily: F }}>Loading Supabase data...</div>
        ) : supabaseStatus.error ? (
          <div style={{ padding: "10px 12px", borderRadius: 6, backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", color: "#DC2626", fontSize: 12, fontWeight: 600, fontFamily: F }}>Supabase load failed: {supabaseStatus.error}</div>
        ) : renderPage()}
      </main>
      {recordForm && recordForm.type === "task_create" ? (
        <TaskForm task={{ task_type: "follow_up", priority: "normal", status: "open", assigned_to: "", assigned_by: "Sarah Chen", title: "", due_date: "", agency_id: "", contact_id: "", dataset_id: "", ...recordForm.record }} onClose={() => { setRecordForm(null); setSaveKey(k => k+1); }} />
      ) : recordForm ? (
        <RecordForm type={recordForm.type} record={recordForm.record} onClose={() => { setRecordForm(null); setSaveKey(k => k+1); }} />
      ) : null}
      {showCommForm && <CommForm onClose={() => setShowCommForm(false)} prefillAgency={commFormPrefill.agencyId} prefillDataset={commFormPrefill.datasetId} currentUser={session?.user} />}
    </div>
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
