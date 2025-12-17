// Configuration and constants - wrapped to prevent redeclaration errors
(function() {
    'use strict';
    
    // Only initialize if not already done
    if (window.BookJournalConfig) {
        console.log('BookJournalConfig already initialized, skipping...');
        return;
    }
    
    const SUPABASE_URL = 'https://kqalpririerpragsbcew.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYWxwcmlyaWVycHJhZ3NiY2V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg2OTgyNTQsImV4cCI6MjA2NDI3NDI1NH0.CSx6inFHg83Wxpd-jie7MMRy--RLWGs6rYAIcLjgMxk';
    
    const CLOUDINARY_CLOUD_NAME = 'dt7i4uwts';
    const CLOUDINARY_UPLOAD_PRESET = 'book-journal';
    
    // Allowed emails for access control
    const ALLOWED_EMAILS = [
        'sanda.wijekoon7@gmail.com',
        'agskanchana@gmail.com'
    ];
    
    // Check if Supabase library is loaded
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        console.error('Supabase library failed to load. Please check your connection or try refreshing the page.');
        // Set a minimal config to prevent undefined errors
        window.BookJournalConfig = {
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            CLOUDINARY_CLOUD_NAME,
            CLOUDINARY_UPLOAD_PRESET,
            ALLOWED_EMAILS,
            supabase: null,
            error: 'Supabase library not loaded'
        };
        return;
    }
    
    // Export to global scope
    window.BookJournalConfig = {
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_UPLOAD_PRESET,
        ALLOWED_EMAILS,
        supabase: window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    };
    
    console.log('BookJournalConfig initialized successfully');
})();