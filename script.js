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
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupEventListeners();
                this.loadBooks();
            });
        } else {
            this.setupEventListeners();
            this.loadBooks();
        }
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchBooks(e.target.value);
            });
        }

        // Image preview for add book modal
        const bookCover = document.getElementById('bookCover');
        if (bookCover) {
            bookCover.addEventListener('change', (e) => {
                this.previewImage(e, 'imagePreview');
            });
        }

        // Status change listeners
        this.setupStatusChangeListeners();
        this.setupProgressListeners();
    }

    setupStatusChangeListeners() {
        // Add book status change
        const statusSelect = document.getElementById('status');
        if (statusSelect) {
            statusSelect.addEventListener('change', (e) => {
                const currentPageGroup = document.getElementById('currentPageGroup');
                if (currentPageGroup) {
                    currentPageGroup.style.display = e.target.value === 'Reading' ? 'block' : 'none';
                }
            });
        }

        // Edit book status change
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
        const formData = this.getFormData();

        if (!formData.name.trim() || !formData.author.trim()) {
            this.showNotification('Please fill in required fields', 'error');
            return;
        }

        try {
            this.showNotification('Adding book...', 'info');

            // Upload image if provided
            if (formData.coverFile) {
                formData.cover_url = await this.uploadImage(formData.coverFile);
            }

            delete formData.coverFile;

            const { data, error } = await supabase
                .from('books')
                .insert([formData])
                .select();

            if (error) throw error;

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
            name: this.getElementValue('editBookName'),
            author: this.getElementValue('editAuthorName'),
            purchase_date: this.getElementValue('editPurchaseDate') || null,
            status: this.getElementValue('editStatus'),
            current_page: this.getElementValue('editCurrentPage') || null,
            total_pages: this.getElementValue('editTotalPages') || null,
            category: this.getElementValue('editCategory') || null,
            summary: this.getElementValue('editSummary') || null
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
        try {
            const { data, error } = await supabase
                .from('books')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.books = data || [];
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

        // Update stats with animation
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
                ? 'No books currently being read'
                : 'No books in your library yet';

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

        const summary = book.summary
            ? `<div class="book-summary">${book.summary}</div>`
            : '';

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
                            ${book.purchase_date ? `<small>${new Date(book.purchase_date).toLocaleDateString()}</small>` : ''}
                        </div>` : ''}

                        ${progressInfo}
                        ${summary}
                    </div>
                </div>
                <div class="book-actions">
                    <div class="status-badge status-${book.status.toLowerCase().replace(' ', '-')}">
                        ${book.status}
                    </div>
                    ${book.status === 'Reading' ? `
                        <button class="action-btn btn-progress" onclick="bookJournal.openProgressModal(${book.id})">
                            Update Progress
                        </button>
                    ` : ''}
                    <button class="action-btn btn-edit" onclick="bookJournal.editBook(${book.id})">
                        Edit
                    </button>
                    <button class="action-btn btn-delete" onclick="bookJournal.deleteBook(${book.id})">
                        Delete
                    </button>
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
            book.author.toLowerCase().includes(query.toLowerCase())
        );

        this.renderBooks(filteredBooks, 'allBooks');
    }

    editBook(id) {
        const book = this.books.find(b => b.id === id);
        if (!book) return;

        this.editingBookId = id;

        // Populate edit form
        this.setElementValue('editBookName', book.name);
        this.setElementValue('editAuthorName', book.author);
        this.setElementValue('editPurchaseDate', book.purchase_date || '');
        this.setElementValue('editStatus', book.status);
        this.setElementValue('editCurrentPage', book.current_page || '');
        this.setElementValue('editTotalPages', book.total_pages || '');
        this.setElementValue('editCategory', book.category || '');
        this.setElementValue('editSummary', book.summary || '');

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
        const formData = this.getEditFormData();

        if (!formData.name.trim() || !formData.author.trim()) {
            this.showNotification('Please fill in required fields', 'error');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('books')
                .update(formData)
                .eq('id', this.editingBookId)
                .select();

            if (error) throw error;

            this.showNotification('Book updated successfully!', 'success');
            hideEditBookModal();
            this.loadBooks();
        } catch (error) {
            console.error('Error updating book:', error);
            this.showNotification('Error updating book. Please try again.', 'error');
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
        const currentPage = parseInt(this.getElementValue('updateCurrentPage'));
        const totalPages = parseInt(this.getElementValue('updateTotalPages'));

        if (!currentPage || currentPage < 1) {
            this.showNotification('Please enter a valid current page', 'error');
            return;
        }

        if (totalPages && currentPage > totalPages) {
            this.showNotification('Current page cannot exceed total pages', 'error');
            return;
        }

        try {
            const updateData = {
                current_page: currentPage,
                total_pages: totalPages || null
            };

            // If reached the end, mark as read
            if (totalPages && currentPage >= totalPages) {
                updateData.status = 'Read';
                updateData.current_page = null;
            }

            const { data, error } = await supabase
                .from('books')
                .update(updateData)
                .eq('id', this.currentBookForUpdate)
                .select();

            if (error) throw error;

            this.showNotification(
                updateData.status === 'Read' ? 'Book marked as completed!' : 'Progress updated!',
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
        if (!confirm('Are you sure you want to delete this book?')) return;

        try {
            const { error } = await supabase
                .from('books')
                .delete()
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Book deleted successfully!', 'success');
            this.loadBooks();
        } catch (error) {
            console.error('Error deleting book:', error);
            this.showNotification('Error deleting book', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        // Add to body
        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
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
    }
}

function hideProgressModal() {
    const modal = document.getElementById('progressModal');
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