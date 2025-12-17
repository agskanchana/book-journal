// Configuration and constants
const SUPABASE_URL = 'https://kqalpririerpragsbcew.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYWxwcmlyaWVycHJhZ3NiY2V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg2OTgyNTQsImV4cCI6MjA2NDI3NDI1NH0.CSx6inFHg83Wxpd-jie7MMRy--RLWGs6rYAIcLjgMxk';

const CLOUDINARY_CLOUD_NAME = 'dt7i4uwts';
const CLOUDINARY_UPLOAD_PRESET = 'book-journal';

// Allowed emails for access control
const ALLOWED_EMAILS = [
    'sanda.wijekoon7@gmail.com',
    'agskanchana@gmail.com'
];

// Export to global scope
// Initialize Supabase client only if not already initialized
if (!window.BookJournalConfig) {
    window.BookJournalConfig = {
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_UPLOAD_PRESET,
        ALLOWED_EMAILS,
        supabase: window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    };
} else {
    // If config already exists, just ensure supabase client is initialized
    if (!window.BookJournalConfig.supabase) {
        window.BookJournalConfig.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
}