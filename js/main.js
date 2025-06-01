// Main application class
class BookJournal {
    constructor() {
        this.books = [];
        this.editingBookId = null;
        this.currentBookForUpdate = null;

        // Initialize services
        this.authService = new AuthService();
        this.uploadService = new UploadService();
        this.uiService = window.uiService;
        this.bookService = new BookService(this.authService, this.uploadService, this.uiService);

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
        const { data: { session } } = await window.BookJournalConfig.supabase.auth.getSession();

        if (session) {
            if (this.authService.isEmailAllowed(session.user.email)) {
                this.authService.currentUser = session.user;
                this.uiService.showMainApp();
                this.authService.updateUserInfo();
                this.loadBooks();
            } else {
                await this.authService.signOutUnauthorized(session.user.email);
            }
        } else {
            this.uiService.showLoginPage();
        }

        window.BookJournalConfig.supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                if (this.authService.isEmailAllowed(session.user.email)) {
                    this.authService.currentUser = session.user;
                    await this.authService.createUserProfile(session.user);
                    this.uiService.showMainApp();
                    this.authService.updateUserInfo();
                    this.loadBooks();
                } else {
                    await this.authService.signOutUnauthorized(session.user.email);
                }
            } else if (event === 'SIGNED_OUT') {
                this.authService.currentUser = null;
                this.books = [];
                this.uiService.showLoginPage();
            }
        });
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.removeEventListener('input', this.searchHandler);

            this.searchHandler = (e) => {
                this.searchBooks(e.target.value);
            };

            searchInput.addEventListener('input', this.searchHandler);
        }

        this.setupFileInputListener();
        this.setupStatusChangeListeners();
        this.setupProgressListeners();
    }

    setupFileInputListener() {
        const bookCover = document.getElementById('bookCover');
        if (bookCover) {
            bookCover.removeEventListener('change', this.fileHandler);

            this.fileHandler = (e) => {
                console.log('File selected:', e.target.files[0]);
                if (e.target.files[0]) {
                    this.uploadService.previewImage(e, 'imagePreview');
                }
            };

            bookCover.addEventListener('change', this.fileHandler);
            console.log('File input listener setup completed');
        }
    }

    setupStatusChangeListeners() {
        document.addEventListener('change', (e) => {
            if (e.target.id === 'status') {
                const currentPageGroup = document.getElementById('currentPageGroup');
                if (currentPageGroup) {
                    currentPageGroup.style.display = e.target.value === 'Reading' ? 'block' : 'none';
                }
            }

            if (e.target.id === 'editStatus') {
                const editPageGroup = document.getElementById('editPageGroup');
                if (editPageGroup) {
                    editPageGroup.style.display = e.target.value === 'Reading' ? 'block' : 'none';
                }
            }
        });
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
        const saveButton = document.querySelector('.toolbar-button-save');
        if (saveButton && saveButton.disabled) {
            console.log('Save already in progress, ignoring duplicate click');
            return;
        }

        this.currentBookForUpdate = null;
        const formData = Utils.getFormData();

        // Validation
        if (!formData.name.trim() || !formData.author.trim() || !formData.total_pages) {
            this.uiService.showNotification('📝 Please fill in all required fields:\n• Book Name\n• Author\n• Total Pages', 'error');
            return;
        }

        if (formData.total_pages && (isNaN(formData.total_pages) || formData.total_pages < 1)) {
            this.uiService.showNotification('📖 Total pages must be a valid number greater than 0', 'error');
            return;
        }

        if (formData.status === 'Reading' && formData.current_page && formData.total_pages) {
            if (parseInt(formData.current_page) > parseInt(formData.total_pages)) {
                this.uiService.showNotification('📄 Current page cannot exceed total pages', 'error');
                return;
            }
        }

        try {
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = 'Adding...';
                saveButton.style.opacity = '0.6';
            }

            const success = await this.bookService.addBook(formData);

            if (success) {
                hideAddBookModal();
                await this.loadBooks();
            }

        } catch (error) {
            console.error('Error adding book:', error);
            this.uiService.showNotification(`❌ Error adding book: ${error.message}`, 'error');
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = 'Save';
                saveButton.style.opacity = '1';
            }
        }
    }

    async loadBooks() {
        if (!this.authService.currentUser) return;

        try {
            this.books = await this.bookService.loadBooks();
            console.log('Transformed books:', this.books);
            console.log('Total books loaded:', this.books.length);

            this.displayBooks();
            this.updateStats();
        } catch (error) {
            console.error('Error loading books:', error);
            this.uiService.showNotification('Error loading books', 'error');
        }
    }

    updateStats() {
        const totalBooks = this.books.length;
        const trackedBooks = this.books.filter(book => book.hasProgress || book.created_by === this.authService.currentUser.id);
        const untrackedBooks = this.books.filter(book => !book.hasProgress && book.created_by !== this.authService.currentUser.id);

        const readingBooks = trackedBooks.filter(book => book.status === 'Reading').length;
        const completedBooks = trackedBooks.filter(book => book.status === 'Read').length;

        const personalNotRead = trackedBooks.filter(book => book.status === 'Not Read').length;
        const toReadBooks = personalNotRead + untrackedBooks.length;

        this.uiService.animateNumber('totalBooks', totalBooks);
        this.uiService.animateNumber('readingBooks', readingBooks);
        this.uiService.animateNumber('completedBooks', completedBooks);
        this.uiService.animateNumber('unreadBooks', toReadBooks);
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

        const notes = book.summary || book.personal_notes
            ? `<div class="book-summary">
            ${book.summary ? `<div><strong>About:</strong> ${book.summary}</div>` : ''}
            ${book.personal_notes ? `<div><strong>My Notes:</strong> ${book.personal_notes}</div>` : ''}
           </div>`
            : '';

        const addedBy = book.created_by !== this.authService.currentUser.id
            ? `<div class="book-meta">
             <small>👤 Added by ${book.creator_name}</small>
           </div>`
            : `<div class="book-meta">
             <small>✨ Added by you</small>
           </div>`;

        const actionButtons = book.created_by === this.authService.currentUser.id
    ? `<button class="action-btn btn-edit" onclick="window.bookJournal.editBookProgress(${book.id})">
           ✏️ Edit
       </button>
       <button class="action-btn btn-delete" onclick="window.bookJournal.deleteBook(${book.id})">
           🗑️ Delete
       </button>`
    : book.hasProgress
    ? `<button class="action-btn btn-edit" onclick="window.bookJournal.editBookProgress(${book.id})">
           ✏️ Edit
       </button>`
    : `<button class="action-btn btn-start" onclick="window.bookJournal.startTrackingBook(${book.id})">
           📖 Start Reading
       </button>`;

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
                    <button class="action-btn btn-progress" onclick="window.bookJournal.openProgressModal(${book.id})">
                        📊 Progress
                    </button>
                ` : ''}
                    ${actionButtons}
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

    async deleteBook(id) {
        const book = this.books.find(b => b.id === id);
        if (!book || book.created_by !== this.authService.currentUser.id) {
            this.uiService.showNotification('❌ You can only delete books you added', 'error');
            return;
        }

        ons.notification.confirm({
            message: `🗑️ Are you sure you want to delete "${book.name}"?\n\nThis will remove it permanently.`,
            title: 'Confirm Delete',
            buttonLabels: ['Cancel', 'Delete']
        }).then(async (buttonIndex) => {
            if (buttonIndex === 1) {
                const success = await this.bookService.deleteBook(id);
                if (success) {
                    await this.loadBooks();
                }
            }
        });
    }

    // Add other methods for editing, progress updates, etc...
    async editBookProgress(bookId) {
        // Implementation for editing book progress
        // Similar to original but using services
    }

    resetAddBookForm() {
        // Reset form implementation
        Utils.setElementValue('bookName', '');
        Utils.setElementValue('authorName', '');
        Utils.setElementValue('totalPages', '');
        // ... etc
    }

    // Other methods...
}

// Global functions for HTML onclick handlers
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