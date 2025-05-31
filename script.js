/* filepath: script.js */
// Supabase configuration
const SUPABASE_URL = 'https://kqalpririerpragsbcew.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYWxwcmlyaWVycHJhZ3NiY2V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg2OTgyNTQsImV4cCI6MjA2NDI3NDI1NH0.CSx6inFHg83Wxpd-jie7MMRy--RLWGs6rYAIcLjgMxk';

// Cloudinary configuration
const CLOUDINARY_CLOUD_NAME = 'dt7i4uwts';
const CLOUDINARY_UPLOAD_PRESET = 'book-journal';

// Initialize Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

class BookJournal {
    constructor() {
        this.books = [];
        this.editingBookId = null;
        this.currentBookForUpdate = null;
        this.currentUser = null;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupAuth();
                this.setupEventListeners();
            });
        } else {
            this.setupAuth();
            this.setupEventListeners();
        }
    }

    async setupAuth() {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            this.currentUser = session.user;
            this.showMainApp();
            this.loadBooks();
        } else {
            this.showLoginPage();
        }

        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                this.currentUser = session.user;
                await this.createUserProfile(session.user);
                this.showMainApp();
                this.loadBooks();
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.books = [];
                this.showLoginPage();
            }
        });
    }

    async createUserProfile(user) {
        try {
            const { data: existingProfile } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (!existingProfile) {
                const { error } = await supabase
                    .from('user_profiles')
                    .insert([{
                        id: user.id,
                        email: user.email,
                        full_name: user.user_metadata?.full_name || user.email,
                        avatar_url: user.user_metadata?.avatar_url || ''
                    }]);

                if (error) {
                    console.error('Error creating user profile:', error);
                }
            }
        } catch (error) {
            console.error('Error with user profile:', error);
        }
    }

    showLoginPage() {
        document.getElementById('loginPage').style.display = 'block';
        document.getElementById('mainPage').style.display = 'none';
    }

    showMainApp() {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('mainPage').style.display = 'block';
        this.updateUserInfo();
    }

    updateUserInfo() {
        if (this.currentUser) {
            const userName = this.currentUser.user_metadata?.full_name || this.currentUser.email;
            const userAvatar = this.currentUser.user_metadata?.avatar_url || '';

            // Update toolbar user info
            const userNameEl = document.getElementById('userName');
            const userAvatarEl = document.getElementById('userAvatar');

            if (userNameEl) userNameEl.textContent = userName.split(' ')[0] || 'User';
            if (userAvatarEl) {
                userAvatarEl.src = userAvatar;
                userAvatarEl.style.display = userAvatar ? 'block' : 'none';
            }

            // Update profile modal
            const profileNameEl = document.getElementById('profileName');
            const profileEmailEl = document.getElementById('profileEmail');
            const profileAvatarEl = document.getElementById('profileAvatar');

            if (profileNameEl) profileNameEl.textContent = userName;
            if (profileEmailEl) profileEmailEl.textContent = this.currentUser.email;
            if (profileAvatarEl) {
                profileAvatarEl.src = userAvatar;
                profileAvatarEl.style.display = userAvatar ? 'block' : 'none';
            }
        }
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchBooks(e.target.value);
            });
        }

        const bookCover = document.getElementById('bookCover');
        if (bookCover) {
            bookCover.addEventListener('change', (e) => {
                this.previewImage(e, 'imagePreview');
            });
        }

        this.setupStatusChangeListeners();
        this.setupProgressListeners();
    }

    setupStatusChangeListeners() {
        const statusSelect = document.getElementById('status');
        if (statusSelect) {
            statusSelect.addEventListener('change', (e) => {
                const currentPageGroup = document.getElementById('currentPageGroup');
                if (currentPageGroup) {
                    currentPageGroup.style.display = e.target.value === 'Reading' ? 'block' : 'none';
                }
            });
        }

        const editStatusSelect = document.getElementById('editStatus');
        if (editStatusSelect) {
            editStatusSelect.addEventListener('change', (e) => {
                const editPageGroup = document.getElementById('editPageGroup');
                if (editPageGroup) {
                    editPageGroup.style.display = e.target.value === 'Reading' ? 'block' : 'none';
                }
            });
        }
    }

    setupProgressListeners() {
        const updateCurrentPage = document.getElementById('updateCurrentPage');
        const updateTotalPages = document.getElementById('updateTotalPages');

        if (updateCurrentPage) {
            updateCurrentPage.addEventListener('input', () => this.updateProgressDisplay());
        }
        if (updateTotalPages) {
            updateTotalPages.addEventListener('input', () => this.updateProgressDisplay());
        }
    }

    async addBook() {
        if (!this.currentUser) {
            this.showNotification('Please sign in to add books', 'error');
            return;
        }

        const formData = this.getFormData();

        if (!formData.name.trim() || !formData.author.trim()) {
            this.showNotification('Please fill in required fields', 'error');
            return;
        }

        try {
            this.showNotification('Adding book...', 'info');

            // Upload image if provided
            let cover_url = null;
            if (formData.coverFile) {
                cover_url = await this.uploadImage(formData.coverFile);
            }

            // First, add the book to shared_books
            const sharedBookData = {
                name: formData.name,
                author: formData.author,
                category: formData.category,
                summary: formData.summary,
                total_pages: formData.total_pages,
                cover_url: cover_url,
                created_by: this.currentUser.id
            };

            const { data: bookData, error: bookError } = await supabase
                .from('shared_books')
                .insert([sharedBookData])
                .select()
                .single();

            if (bookError) throw bookError;

            // Then, add the user's personal reading progress
            const progressData = {
                user_id: this.currentUser.id,
                book_id: bookData.id,
                status: formData.status,
                current_page: formData.current_page,
                purchase_date: formData.purchase_date,
                started_reading_at: formData.status === 'Reading' ? new Date().toISOString() : null
            };

            const { error: progressError } = await supabase
                .from('user_reading_progress')
                .insert([progressData]);

            if (progressError) throw progressError;

            this.showNotification('Book added successfully!', 'success');
            hideAddBookModal();
            this.loadBooks();
        } catch (error) {
            console.error('Error adding book:', error);
            this.showNotification('Error adding book. Please try again.', 'error');
        }
    }

    getFormData() {
        return {
            name: this.getElementValue('bookName'),
            author: this.getElementValue('authorName'),
            purchase_date: this.getElementValue('purchaseDate') || null,
            status: this.getElementValue('status'),
            current_page: this.getElementValue('currentPage') || null,
            total_pages: this.getElementValue('totalPages') || null,
            category: this.getElementValue('category') || null,
            summary: this.getElementValue('summary') || null,
            coverFile: document.getElementById('bookCover')?.files[0] || null
        };
    }

    getEditFormData() {
        return {
            status: this.getElementValue('editStatus'),
            current_page: this.getElementValue('editCurrentPage') || null,
            purchase_date: this.getElementValue('editPurchaseDate') || null,
            personal_notes: this.getElementValue('editSummary') || null
        };
    }

    getElementValue(id) {
        const element = document.getElementById(id);
        return element ? element.value.trim() : '';
    }

    async uploadImage(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        return data.secure_url;
    }

    previewImage(event, previewId) {
        const file = event.target.files[0];
        const preview = document.getElementById(previewId);

        if (file && preview) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 100px; max-height: 150px; border-radius: 8px;">`;
            };
            reader.readAsDataURL(file);
        } else if (preview) {
            preview.innerHTML = '';
        }
    }

    async loadBooks() {
        if (!this.currentUser) return;

        try {
            // Load all shared books with user's personal progress AND creator info
            const { data, error } = await supabase
                .from('shared_books')
                .select(`
                    *,
                    user_reading_progress!left (
                        status,
                        current_page,
                        purchase_date,
                        personal_notes,
                        started_reading_at,
                        finished_reading_at
                    ),
                    user_profiles!shared_books_created_by_fkey (
                        full_name,
                        email
                    )
                `)
                .eq('user_reading_progress.user_id', this.currentUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Transform data to match the expected format
            this.books = data.map(book => {
                const progress = book.user_reading_progress[0] || {};
                const creator = book.user_profiles || {};

                return {
                    id: book.id,
                    name: book.name,
                    author: book.author,
                    category: book.category,
                    summary: book.summary,
                    cover_url: book.cover_url,
                    total_pages: book.total_pages,
                    created_by: book.created_by,
                    // Creator info
                    creator_name: creator.full_name || creator.email || 'Unknown User',
                    // User-specific data
                    status: progress.status || 'Not Read',
                    current_page: progress.current_page || null,
                    purchase_date: progress.purchase_date || null,
                    personal_notes: progress.personal_notes || null,
                    started_reading_at: progress.started_reading_at || null,
                    finished_reading_at: progress.finished_reading_at || null
                };
            });

            this.displayBooks();
            this.updateStats();
        } catch (error) {
            console.error('Error loading books:', error);
            this.showNotification('Error loading books', 'error');
        }
    }

    updateStats() {
        const totalBooks = this.books.length;
        const readingBooks = this.books.filter(book => book.status === 'Reading').length;
        const completedBooks = this.books.filter(book => book.status === 'Read').length;
        const unreadBooks = this.books.filter(book => book.status === 'Not Read').length;

        this.animateNumber('totalBooks', totalBooks);
        this.animateNumber('readingBooks', readingBooks);
        this.animateNumber('completedBooks', completedBooks);
        this.animateNumber('unreadBooks', unreadBooks);
    }

    animateNumber(elementId, targetNumber) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const startNumber = parseInt(element.textContent) || 0;
        const duration = 1000;
        const increment = (targetNumber - startNumber) / (duration / 16);
        let currentNumber = startNumber;

        const timer = setInterval(() => {
            currentNumber += increment;
            if ((increment > 0 && currentNumber >= targetNumber) ||
                (increment < 0 && currentNumber <= targetNumber)) {
                currentNumber = targetNumber;
                clearInterval(timer);
            }
            element.textContent = Math.round(currentNumber);
        }, 16);
    }

    displayBooks() {
        const currentlyReading = this.books.filter(book => book.status === 'Reading');
        const allBooks = this.books;

        this.renderBooks(currentlyReading, 'currentlyReadingBooks');
        this.renderBooks(allBooks, 'allBooks');
    }

    renderBooks(books, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (books.length === 0) {
            const emptyMessage = containerId === 'currentlyReadingBooks'
                ? 'No books currently being read. Start reading something new!'
                : 'No books in the library yet. Add the first book to get started!';

            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📚</div>
                    <h3>No Books Found</h3>
                    <p>${emptyMessage}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = books.map(book => this.createBookCard(book)).join('');
    }

    createBookCard(book) {
        const coverImage = book.cover_url
            ? `<img src="${book.cover_url}" alt="Book cover">`
            : '📚';

        const progressInfo = book.status === 'Reading' && book.current_page && book.total_pages
            ? `<div class="progress-info">
             <div class="reading-progress">
               <div class="progress" style="height: 4px; background: #e9ecef; border-radius: 2px; overflow: hidden;">
                 <div style="width: ${Math.round((book.current_page / book.total_pages) * 100)}%; height: 100%; background: #28a745; border-radius: 2px;"></div>
               </div>
             </div>
             <small>${book.current_page}/${book.total_pages} pages (${Math.round((book.current_page / book.total_pages) * 100)}%)</small>
           </div>`
            : book.status === 'Reading' && book.current_page
            ? `<div class="progress-info"><small>Page ${book.current_page}</small></div>`
            : '';

        // Show both book summary and personal notes
        const notes = book.summary || book.personal_notes
            ? `<div class="book-summary">
            ${book.summary ? `<div><strong>About:</strong> ${book.summary}</div>` : ''}
            ${book.personal_notes ? `<div><strong>My Notes:</strong> ${book.personal_notes}</div>` : ''}
           </div>`
            : '';

        // Show who added the book with actual name
        const addedBy = book.created_by !== this.currentUser.id
            ? `<div class="book-meta">
             <small>👤 Added by ${book.creator_name}</small>
           </div>`
            : `<div class="book-meta">
             <small>✨ Added by you</small>
           </div>`;

        return `
            <div class="book-card">
                <div class="book-card-content">
                    <div class="book-cover">
                        ${coverImage}
                    </div>
                    <div class="book-info">
                        <h3 class="book-title">${book.name}</h3>
                        <p class="book-author">by ${book.author}</p>

                        ${book.category || book.purchase_date ? `<div class="book-meta">
                            ${book.category ? `<span class="meta-tag">${book.category}</span>` : ''}
                            ${book.purchase_date ? `<small>📅 ${new Date(book.purchase_date).toLocaleDateString()}</small>` : ''}
                        </div>` : ''}

                        ${addedBy}
                        ${progressInfo}
                        ${notes}
                    </div>
                </div>
                <div class="book-actions">
                    <div class="status-badge status-${book.status.toLowerCase().replace(' ', '-')}">
                        ${book.status}
                    </div>
                    ${book.status === 'Reading' ? `
                        <button class="action-btn btn-progress" onclick="bookJournal.openProgressModal(${book.id})">
                            📊 Progress
                        </button>
                    ` : ''}
                    <button class="action-btn btn-edit" onclick="bookJournal.editBookProgress(${book.id})">
                        ✏️ My Progress
                    </button>
                    ${book.created_by === this.currentUser.id ? `
                        <button class="action-btn btn-delete" onclick="bookJournal.deleteBook(${book.id})">
                            🗑️ Delete
                        </button>
                    ` : `
                        <button class="action-btn btn-add" onclick="bookJournal.addToMyLibrary(${book.id})">
                            ➕ Add to Mine
                        </button>
                    `}
                </div>
            </div>
        `;
    }

    searchBooks(query) {
        if (!query.trim()) {
            this.displayBooks();
            return;
        }

        const filteredBooks = this.books.filter(book =>
            book.name.toLowerCase().includes(query.toLowerCase()) ||
            book.author.toLowerCase().includes(query.toLowerCase()) ||
            (book.category && book.category.toLowerCase().includes(query.toLowerCase()))
        );

        this.renderBooks(filteredBooks, 'allBooks');

        const currentlyReading = filteredBooks.filter(book => book.status === 'Reading');
        this.renderBooks(currentlyReading, 'currentlyReadingBooks');
    }

    async addToMyLibrary(bookId) {
        if (!this.currentUser) {
            this.showNotification('Please sign in to add books', 'error');
            return;
        }

        try {
            // Check if user already has this book in their progress
            const { data: existingProgress } = await supabase
                .from('user_reading_progress')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .eq('book_id', bookId)
                .single();

            if (existingProgress) {
                this.showNotification('Book is already in your library', 'info');
                return;
            }

            // Add book to user's reading progress
            const { error } = await supabase
                .from('user_reading_progress')
                .insert([{
                    user_id: this.currentUser.id,
                    book_id: bookId,
                    status: 'Not Read'
                }]);

            if (error) throw error;

            this.showNotification('Book added to your library!', 'success');
            this.loadBooks();
        } catch (error) {
            console.error('Error adding book to library:', error);
            this.showNotification('Error adding book to library', 'error');
        }
    }

    editBookProgress(id) {
        const book = this.books.find(b => b.id === id);
        if (!book) return;

        this.editingBookId = id;

        // For editing progress, we only allow editing user-specific fields
        this.setElementValue('editStatus', book.status);
        this.setElementValue('editCurrentPage', book.current_page || '');
        this.setElementValue('editPurchaseDate', book.purchase_date || '');
        this.setElementValue('editSummary', book.personal_notes || '');

        // Update labels for clarity
        const editBookNameField = document.getElementById('editBookName');
        const editAuthorField = document.getElementById('editAuthorName');
        const editCategoryField = document.getElementById('editCategory');
        const editTotalPagesField = document.getElementById('editTotalPages');

        // Make book info read-only and show current values
        if (editBookNameField) {
            editBookNameField.value = book.name;
            editBookNameField.disabled = true;
        }
        if (editAuthorField) {
            editAuthorField.value = book.author;
            editAuthorField.disabled = true;
        }
        if (editCategoryField) {
            editCategoryField.value = book.category || '';
            editCategoryField.disabled = true;
        }
        if (editTotalPagesField) {
            editTotalPagesField.value = book.total_pages || '';
            editTotalPagesField.disabled = true;
        }

        // Show/hide page fields based on status
        const editPageGroup = document.getElementById('editPageGroup');
        if (editPageGroup) {
            editPageGroup.style.display = book.status === 'Reading' ? 'block' : 'none';
        }

        // Show edit modal
        const modal = document.getElementById('editBookModal');
        if (modal) {
            modal.show();
        }
    }

    setElementValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    }

    async saveEditedBook() {
        if (!this.currentUser) {
            this.showNotification('Please sign in to edit progress', 'error');
            return;
        }

        const formData = this.getEditFormData();

        try {
            // Check if progress record exists
            const { data: existingProgress } = await supabase
                .from('user_reading_progress')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .eq('book_id', this.editingBookId)
                .single();

            const updateData = {
                status: formData.status,
                current_page: formData.current_page,
                purchase_date: formData.purchase_date,
                personal_notes: formData.personal_notes
            };

            // Add timestamps based on status changes
            if (formData.status === 'Reading' && (!existingProgress || existingProgress.status !== 'Reading')) {
                updateData.started_reading_at = new Date().toISOString();
            } else if (formData.status === 'Read' && (!existingProgress || existingProgress.status !== 'Read')) {
                updateData.finished_reading_at = new Date().toISOString();
                updateData.current_page = null; // Clear current page when finished
            }

            if (existingProgress) {
                // Update existing progress
                const { error } = await supabase
                    .from('user_reading_progress')
                    .update(updateData)
                    .eq('user_id', this.currentUser.id)
                    .eq('book_id', this.editingBookId);

                if (error) throw error;
            } else {
                // Create new progress record
                const { error } = await supabase
                    .from('user_reading_progress')
                    .insert([{
                        user_id: this.currentUser.id,
                        book_id: this.editingBookId,
                        ...updateData
                    }]);

                if (error) throw error;
            }

            this.showNotification('Progress updated successfully!', 'success');
            hideEditBookModal();
            this.loadBooks();
        } catch (error) {
            console.error('Error updating progress:', error);
            this.showNotification('Error updating progress. Please try again.', 'error');
        }
    }

    openProgressModal(bookId) {
        this.currentBookForUpdate = bookId;
        const book = this.books.find(b => b.id === bookId);

        if (book) {
            this.setElementValue('updateCurrentPage', book.current_page || '');
            this.setElementValue('updateTotalPages', book.total_pages || '');
            this.updateProgressDisplay();
        }

        const modal = document.getElementById('progressModal');
        if (modal) {
            modal.show();
        }
    }

    updateProgressDisplay() {
        const currentPage = parseInt(this.getElementValue('updateCurrentPage')) || 0;
        const totalPages = parseInt(this.getElementValue('updateTotalPages')) || 0;

        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');

        if (currentPage && totalPages && currentPage <= totalPages) {
            const percentage = Math.round((currentPage / totalPages) * 100);
            if (progressBar) progressBar.value = percentage / 100;
            if (progressText) progressText.textContent = `${percentage}% completed`;
        } else {
            if (progressBar) progressBar.value = 0;
            if (progressText) progressText.textContent = '0% completed';
        }
    }

    async updateBookProgress() {
        if (!this.currentUser) {
            this.showNotification('Please sign in to update progress', 'error');
            return;
        }

        const currentPage = parseInt(this.getElementValue('updateCurrentPage'));

        if (!currentPage || currentPage < 1) {
            this.showNotification('Please enter a valid current page', 'error');
            return;
        }

        const book = this.books.find(b => b.id === this.currentBookForUpdate);
        if (book && book.total_pages && currentPage > book.total_pages) {
            this.showNotification('Current page cannot exceed total pages', 'error');
            return;
        }

        try {
            const updateData = {
                current_page: currentPage
            };

            // If reached the end, mark as read
            if (book && book.total_pages && currentPage >= book.total_pages) {
                updateData.status = 'Read';
                updateData.current_page = null;
                updateData.finished_reading_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from('user_reading_progress')
                .update(updateData)
                .eq('user_id', this.currentUser.id)
                .eq('book_id', this.currentBookForUpdate);

            if (error) throw error;

            this.showNotification(
                updateData.status === 'Read' ? '🎉 Book completed!' : '📊 Progress updated!',
                'success'
            );

            hideProgressModal();
            this.loadBooks();
        } catch (error) {
            console.error('Error updating progress:', error);
            this.showNotification('Error updating progress', 'error');
        }
    }

    async deleteBook(id) {
        if (!this.currentUser) {
            this.showNotification('Please sign in to delete books', 'error');
            return;
        }

        const book = this.books.find(b => b.id === id);
        if (!book || book.created_by !== this.currentUser.id) {
            this.showNotification('You can only delete books you added', 'error');
            return;
        }

        if (!confirm('Are you sure you want to delete this book? This will remove it for all users.')) return;

        try {
            const { error } = await supabase
                .from('shared_books')
                .delete()
                .eq('id', id)
                .eq('created_by', this.currentUser.id);

            if (error) throw error;

            this.showNotification('Book deleted successfully!', 'success');
            this.loadBooks();
        } catch (error) {
            console.error('Error deleting book:', error);
            this.showNotification('Error deleting book', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    exportData() {
        const dataStr = JSON.stringify(this.books, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'my-reading-progress.json';
        link.click();

        this.showNotification('Reading progress exported successfully!', 'success');
        hideUserMenu();
    }
}

// Authentication Functions
async function signInWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: 'https://agskanchana.github.io/book-journal/'
            }
        });

        if (error) throw error;
    } catch (error) {
        console.error('Error signing in:', error);
        alert('Error signing in. Please try again.');
    }
}

async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        hideUserMenu();
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Error signing out. Please try again.');
    }
}

// Modal Functions
function showAddBookModal() {
    const modal = document.getElementById('addBookModal');
    if (modal) {
        modal.show();
    }
}

function hideAddBookModal() {
    const modal = document.getElementById('addBookModal');
    if (modal) {
        modal.hide();
    }
    clearAddForm();
}

function hideEditBookModal() {
    const modal = document.getElementById('editBookModal');
    if (modal) {
        modal.hide();
        // Re-enable fields that were disabled
        ['editBookName', 'editAuthorName', 'editCategory', 'editTotalPages'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.disabled = false;
        });
    }
}

function hideProgressModal() {
    const modal = document.getElementById('progressModal');
    if (modal) {
        modal.hide();
    }
}

function showUserMenu() {
    const modal = document.getElementById('userMenuModal');
    if (modal) {
        modal.show();
    }
}

function hideUserMenu() {
    const modal = document.getElementById('userMenuModal');
    if (modal) {
        modal.hide();
    }
}

function clearAddForm() {
    const fields = ['bookName', 'authorName', 'status', 'category', 'purchaseDate', 'currentPage', 'totalPages', 'summary'];
    fields.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });

    const bookCover = document.getElementById('bookCover');
    if (bookCover) bookCover.value = '';

    const imagePreview = document.getElementById('imagePreview');
    if (imagePreview) imagePreview.innerHTML = '';

    const currentPageGroup = document.getElementById('currentPageGroup');
    if (currentPageGroup) currentPageGroup.style.display = 'none';
}

// Section Toggle Functions
function showReadingSection() {
    const readingSection = document.getElementById('reading-section');
    const librarySection = document.getElementById('library-section');
    const readingToggle = document.getElementById('readingToggle');
    const libraryToggle = document.getElementById('libraryToggle');

    if (readingSection) readingSection.style.display = 'block';
    if (librarySection) librarySection.style.display = 'none';
    if (readingToggle) readingToggle.classList.add('active');
    if (libraryToggle) libraryToggle.classList.remove('active');
}

function showLibrarySection() {
    const readingSection = document.getElementById('reading-section');
    const librarySection = document.getElementById('library-section');
    const readingToggle = document.getElementById('readingToggle');
    const libraryToggle = document.getElementById('libraryToggle');

    if (readingSection) readingSection.style.display = 'none';
    if (librarySection) librarySection.style.display = 'block';
    if (readingToggle) readingToggle.classList.remove('active');
    if (libraryToggle) libraryToggle.classList.add('active');
}

// User Menu Functions
function showStats() {
    if (window.bookJournal && window.bookJournal.books) {
        const stats = {
            total: window.bookJournal.books.length,
            reading: window.bookJournal.books.filter(b => b.status === 'Reading').length,
            completed: window.bookJournal.books.filter(b => b.status === 'Read').length,
            unread: window.bookJournal.books.filter(b => b.status === 'Not Read').length
        };

        alert(`📊 Your Reading Statistics:\n\n📚 Total Books: ${stats.total}\n📖 Currently Reading: ${stats.reading}\n✅ Completed: ${stats.completed}\n🔖 To Read: ${stats.unread}`);
    }
    hideUserMenu();
}

function exportData() {
    if (window.bookJournal) {
        window.bookJournal.exportData();
    }
}

// Book Functions
function submitBook() {
    if (window.bookJournal) {
        window.bookJournal.addBook();
    }
}

function saveEditedBook() {
    if (window.bookJournal) {
        window.bookJournal.saveEditedBook();
    }
}

function updateBookProgress() {
    if (window.bookJournal) {
        window.bookJournal.updateBookProgress();
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.bookJournal = new BookJournal();
});