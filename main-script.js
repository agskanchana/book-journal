/* filepath: main-script.js */
// Firebase configuration
// TODO: Replace the placeholder values below with YOUR Firebase web app config.
// Find them in: Firebase Console -> Project settings (gear icon) -> "Your apps"
// -> SDK setup and configuration -> "Config".
// NOTE: these values are NOT secret. Security is enforced by Firestore Security
// Rules (firestore.rules) + the Authorized domains list in Firebase Auth.
const firebaseConfig = {
    apiKey: "AIzaSyC7eKpfe5_pbPuHdD8Gc1LOKMqOPi-0NrY",
    authDomain: "book-journal-edd84.firebaseapp.com",
    projectId: "book-journal-edd84",
    storageBucket: "book-journal-edd84.firebasestorage.app",
    messagingSenderId: "308099076804",
    appId: "1:308099076804:web:4bdf008f5ef2a19c3d6f91"
};

// Cloudinary configuration (unchanged)
const CLOUDINARY_CLOUD_NAME = 'dt7i4uwts';
const CLOUDINARY_UPLOAD_PRESET = 'book-journal';

// Initialize Firebase (only once, even if this script is evaluated more than once)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Firebase service handles
var auth = (typeof firebase !== 'undefined') ? firebase.auth() : null;
var db = (typeof firebase !== 'undefined') ? firebase.firestore() : null;

// Validate that Firebase initialized
if (!auth || !db) {
    console.error('❌ Firebase failed to initialize. Please check that the Firebase compat libraries are loaded in index.html.');
}

// Enable offline persistence so the PWA keeps working without a connection.
// Must run before any other Firestore call (it does, this is at load time).
if (db) {
    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        // failed-precondition = multiple tabs open; unimplemented = unsupported browser
        console.warn('Firestore offline persistence unavailable:', err && err.code);
    });
}

class BookJournal {
    constructor() {
        this.books = [];
        this.editingBookId = null;
        this.currentBookForUpdate = null;
        this.currentUser = null;
        this.booksList = null; // List.js instance for pagination
        this.currentPage = 1;
        this.itemsPerPage = 20; // Show 20 books per page
        this.filteredBooks = [];
        this.wishlist = [];          // global shared wishlist
        this.editingWishlistId = null;
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

    setupAuth() {
        // Firebase fires this once on load with the restored user (or null),
        // and again on every sign-in / sign-out. Replaces getSession + onAuthStateChange.
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // Check if user email is allowed
                if (this.isEmailAllowed(user.email)) {
                    this.currentUser = user;
                    await this.createUserProfile(user);
                    this.showMainApp();
                    this.loadBooks();
                    this.loadWishlist();
                } else {
                    // Sign out unauthorized user
                    await this.signOutUnauthorized(user.email);
                }
            } else {
                this.currentUser = null;
                this.books = [];
                this.showLoginPage();
            }
        });
    }

    async createUserProfile(user) {
        try {
            // Upsert profile (doc id = Firebase UID). Preserve created_at on existing docs.
            const ref = db.collection('user_profiles').doc(user.uid);
            const snap = await ref.get();

            const data = {
                email: user.email,
                full_name: user.displayName || user.email.split('@')[0],
                avatar_url: user.photoURL || ''
            };

            if (!snap.exists) {
                data.created_at = firebase.firestore.FieldValue.serverTimestamp();
            }

            await ref.set(data, { merge: true });
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
            const userName = this.currentUser.displayName || this.currentUser.email;
            const userAvatar = this.currentUser.photoURL || '';

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
        // Remove existing listener to prevent duplicates
        searchInput.removeEventListener('input', this.searchHandler);

        // Create bound handler for combined search and pagination
        this.searchHandler = (e) => {
            this.handleSearchAndFilter();
        };

        searchInput.addEventListener('input', this.searchHandler);
    }

    // Category / status / author / sort filter listeners
    ['categoryFilter', 'statusFilter', 'authorFilter', 'sortBy'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                this.handleSearchAndFilter();
            });
        }
    });

    // Setup pagination button listeners
    this.setupPaginationListeners();

    // Setup file input listener properly
    this.setupFileInputListener();

    // Add these method calls
    this.setupStatusChangeListeners();
    this.setupProgressListeners();

    // Add event delegation for book action buttons
    this.setupBookActionListeners();

    // Add save button listener as backup - UPDATED
    const addBookSaveBtn = document.getElementById('addBookSaveBtn');
    if (addBookSaveBtn) {
        // Remove existing listeners first
        addBookSaveBtn.removeEventListener('click', this.saveHandler);

        // Create bound handler
        this.saveHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Save button clicked via event listener');
            this.addBook();
        };

        addBookSaveBtn.addEventListener('click', this.saveHandler);
        console.log('Add book save button listener attached');
    }
}

    setupBookActionListeners() {
        // Event delegation for currently reading books
        const currentlyReadingContainer = document.getElementById('currentlyReadingBooks');
        if (currentlyReadingContainer) {
            currentlyReadingContainer.addEventListener('click', (e) => {
                this.handleBookAction(e);
            });
        }

        // Event delegation for all books
        const allBooksContainer = document.getElementById('allBooks');
        if (allBooksContainer) {
            allBooksContainer.addEventListener('click', (e) => {
                this.handleBookAction(e);
            });
        }

        // Event delegation for wishlist items
        const wishlistContainer = document.getElementById('wishlistItems');
        if (wishlistContainer) {
            wishlistContainer.addEventListener('click', (e) => {
                this.handleWishlistAction(e);
            });
        }
    }

    handleBookAction(e) {
    const button = e.target.closest('.action-btn');
    if (!button) return;

    const action = button.getAttribute('data-action');
    const bookId = button.getAttribute('data-book-id'); // Firestore doc id (string)

    console.log('Button clicked:', { action, bookId, button });

    if (!action || !bookId) {
        console.error('Missing action or bookId:', { action, bookId });
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    console.log('Executing action:', action, 'for book:', bookId);

    switch (action) {
        case 'edit':
            console.log('Calling editBookProgress');
            this.editBookProgress(bookId);
            break;
        case 'delete':
            console.log('Calling deleteBook');
            this.deleteBook(bookId);
            break;
        case 'start-tracking':
            console.log('Calling startTrackingBook');
            this.startTrackingBook(bookId);
            break;
        case 'progress':
            console.log('Calling openProgressModal');
            this.openProgressModal(bookId);
            break;
        default:
            console.warn('Unknown action:', action);
    }
}

    setupPaginationListeners() {
        // Top pagination
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        // Bottom pagination
        const bottomPrevBtn = document.getElementById('bottomPrevBtn');
        const bottomNextBtn = document.getElementById('bottomNextBtn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.goToPreviousPage());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.goToNextPage());
        }
        if (bottomPrevBtn) {
            bottomPrevBtn.addEventListener('click', () => this.goToPreviousPage());
        }
        if (bottomNextBtn) {
            bottomNextBtn.addEventListener('click', () => this.goToNextPage());
        }

        // Add event listeners for page number clicks
        const pageContainers = [
            document.getElementById('pageNumbers'),
            document.getElementById('bottomPageNumbers')
        ];

        pageContainers.forEach(container => {
            if (container) {
                container.addEventListener('click', (e) => {
                    if (e.target.classList.contains('page-number')) {
                        const page = parseInt(e.target.getAttribute('data-page'));
                        if (page) {
                            this.goToPage(page);
                        }
                    }
                });
            }
        });
    }

    handleSearchAndFilter() {
        const searchValue = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const categoryValue = document.getElementById('categoryFilter')?.value || '';
        const statusValue = document.getElementById('statusFilter')?.value || '';
        const authorValue = document.getElementById('authorFilter')?.value || '';
        const sortValue = document.getElementById('sortBy')?.value || 'newest';

        // Filter books based on search + category + author + status
        this.filteredBooks = this.books.filter(book => {
            const matchesSearch = !searchValue ||
                (book.name && book.name.toLowerCase().includes(searchValue)) ||
                (book.author && book.author.toLowerCase().includes(searchValue)) ||
                (book.category && book.category.toLowerCase().includes(searchValue));

            const matchesCategory = !categoryValue || book.category === categoryValue;
            const matchesAuthor = !authorValue || book.author === authorValue;
            const matchesStatus = !statusValue || this.bookMatchesStatus(book, statusValue);

            return matchesSearch && matchesCategory && matchesAuthor && matchesStatus;
        });

        this.sortBooks(this.filteredBooks, sortValue);

        // Reset to first page when filtering
        this.currentPage = 1;
        this.renderPaginatedBooks();
    }

    bookMatchesStatus(book, statusValue) {
        switch (statusValue) {
            case 'Reading':   return book.status === 'Reading';
            case 'Read':      return book.status === 'Read';
            case 'Not Read':  return book.hasProgress && book.status === 'Not Read';
            case 'Available': return !book.hasProgress; // not yet tracked by you
            default:          return true;
        }
    }

    sortBooks(arr, sortValue) {
        switch (sortValue) {
            case 'oldest':     arr.sort((a, b) => (a.created_at || 0) - (b.created_at || 0)); break;
            case 'title-asc':  arr.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
            case 'title-desc': arr.sort((a, b) => (b.name || '').localeCompare(a.name || '')); break;
            case 'author-asc': arr.sort((a, b) => (a.author || '').localeCompare(b.author || '')); break;
            case 'newest':
            default:           arr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)); break;
        }
    }

    populateAuthorFilter() {
        const authorFilter = document.getElementById('authorFilter');
        if (!authorFilter) return;
        const current = authorFilter.value;
        const authors = [...new Set(this.books.map(b => b.author).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        authorFilter.innerHTML = '<option value="">All Authors</option>' +
            authors.map(a => `<option value="${this.escapeHtml(a)}">${this.escapeHtml(a)}</option>`).join('');
        if (current && authors.includes(current)) authorFilter.value = current;
    }

    renderPaginatedBooks() {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const currentPageBooks = this.filteredBooks.slice(startIndex, endIndex);

        // Render books for current page
        this.renderBooks(currentPageBooks, 'allBooks');

        // Update pagination info and controls
        this.updatePaginationInfo();
        this.updatePaginationControls();
    }

    updatePaginationInfo() {
        const totalBooks = this.filteredBooks.length;
        const startIndex = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endIndex = Math.min(this.currentPage * this.itemsPerPage, totalBooks);

        const infoText = totalBooks > 0
            ? `Showing ${startIndex}-${endIndex} of ${totalBooks} books`
            : 'No books found';

        // Update both pagination info elements
        const paginationInfo = document.getElementById('paginationInfo');
        const bottomPaginationInfo = document.getElementById('bottomPaginationInfo');

        if (paginationInfo) paginationInfo.textContent = infoText;
        if (bottomPaginationInfo) bottomPaginationInfo.textContent = infoText;
    }

    updatePaginationControls() {
        const totalPages = Math.ceil(this.filteredBooks.length / this.itemsPerPage);

        // Update previous buttons
        const prevBtn = document.getElementById('prevBtn');
        const bottomPrevBtn = document.getElementById('bottomPrevBtn');
        const hasPrevious = this.currentPage > 1;

        if (prevBtn) prevBtn.disabled = !hasPrevious;
        if (bottomPrevBtn) bottomPrevBtn.disabled = !hasPrevious;

        // Update next buttons
        const nextBtn = document.getElementById('nextBtn');
        const bottomNextBtn = document.getElementById('bottomNextBtn');
        const hasNext = this.currentPage < totalPages;

        if (nextBtn) nextBtn.disabled = !hasNext;
        if (bottomNextBtn) bottomNextBtn.disabled = !hasNext;

        // Update page numbers
        this.updatePageNumbers(totalPages);
    }

    updatePageNumbers(totalPages) {
        const pageNumbersTop = document.getElementById('pageNumbers');
        const pageNumbersBottom = document.getElementById('bottomPageNumbers');

        const pageNumbersHtml = this.generatePageNumbersHtml(totalPages);

        if (pageNumbersTop) pageNumbersTop.innerHTML = pageNumbersHtml;
        if (pageNumbersBottom) pageNumbersBottom.innerHTML = pageNumbersHtml;
    }

    generatePageNumbersHtml(totalPages) {
        if (totalPages <= 1) return '<span class="page-current">1</span>';

        let html = '';
        const maxVisible = 5; // Show max 5 page numbers
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);

        // Adjust start page if we're near the end
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        // Add first page and ellipsis if needed
        if (startPage > 1) {
            html += `<span class="page-number" data-page="1">1</span>`;
            if (startPage > 2) {
                html += '<span class="page-ellipsis">...</span>';
            }
        }

        // Add page numbers
        for (let i = startPage; i <= endPage; i++) {
            if (i === this.currentPage) {
                html += `<span class="page-current">${i}</span>`;
            } else {
                html += `<span class="page-number" data-page="${i}">${i}</span>`;
            }
        }

        // Add last page and ellipsis if needed
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += '<span class="page-ellipsis">...</span>';
            }
            html += `<span class="page-number" data-page="${totalPages}">${totalPages}</span>`;
        }

        return html;
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.filteredBooks.length / this.itemsPerPage);
        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.renderPaginatedBooks();

            // Scroll to top of book list
            const librarySection = document.getElementById('library-section');
            if (librarySection) {
                librarySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    goToNextPage() {
        const totalPages = Math.ceil(this.filteredBooks.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.goToPage(this.currentPage + 1);
        }
    }

    goToPreviousPage() {
        if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1);
        }
    }

    async addBook() {
        if (!this.currentUser) {
            ons.notification.alert({
                message: '🔒 Please sign in to add books',
                title: 'Authentication Required',
                buttonLabel: 'OK'
            });
            return;
        }

        // Prevent multiple submissions
        const saveButton = document.querySelector('.toolbar-button-save');
        if (saveButton && saveButton.disabled) {
            console.log('Save already in progress, ignoring duplicate click');
            return;
        }

        // Reset any previous modal state
        this.currentBookForUpdate = null;

        const formData = this.getFormData();

        // Validation
        if (!formData.name.trim() || !formData.author.trim() || !formData.total_pages) {
            ons.notification.alert({
                message: '📝 Please fill in all required fields:\n• Book Name\n• Author\n• Total Pages',
                title: 'Missing Information',
                buttonLabel: 'OK'
            });
            return;
        }

        if (formData.total_pages && (isNaN(formData.total_pages) || formData.total_pages < 1)) {
            ons.notification.alert({
                message: '📖 Total pages must be a valid number greater than 0',
                title: 'Invalid Input',
                buttonLabel: 'OK'
            });
            return;
        }

        if (formData.status === 'Reading' && formData.current_page && formData.total_pages) {
            if (parseInt(formData.current_page) > parseInt(formData.total_pages)) {
                ons.notification.alert({
                    message: '📄 Current page cannot exceed total pages',
                    title: 'Invalid Page Number',
                    buttonLabel: 'OK'
                });
                return;
            }
        }

        try {
            // Show loading state
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = 'Adding...';
                saveButton.style.opacity = '0.6';
            }

            console.log('=== ADD BOOK DEBUG ===');
            console.log('Form data:', formData);
            console.log('Current user:', this.currentUser.uid);

            // Upload image if provided (with timeout protection)
            let cover_url = null;
            if (formData.coverFile) {
                console.log('Uploading image...');
                try {
                    // Add timeout for image upload
                    const uploadPromise = this.uploadImage(formData.coverFile);
                    const uploadTimeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Image upload timeout')), 20000)
                    );

                    cover_url = await Promise.race([uploadPromise, uploadTimeoutPromise]);
                    console.log('Image uploaded successfully:', cover_url);
                } catch (uploadError) {
                    console.error('Image upload failed:', uploadError);
                    // Continue without image rather than failing completely
                    ons.notification.alert({
                        message: '⚠️ Image upload failed, but book will be saved without cover. Continue?',
                        title: 'Upload Warning',
                        buttonLabel: 'Continue'
                    });
                    cover_url = null;
                }
            }

            // First, add the book to shared_books (Firestore auto-generated string id)
            const sharedBookData = {
                name: formData.name.trim(),
                author: formData.author.trim(),
                category: formData.category || null,
                summary: formData.summary || null,
                total_pages: parseInt(formData.total_pages),
                cover_url: cover_url,
                created_by: this.currentUser.uid,
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            console.log('Adding book to shared_books:', sharedBookData);

            const bookRef = db.collection('shared_books').doc();
            await bookRef.set(sharedBookData);
            const bookId = bookRef.id;

            console.log('Book added to shared_books with id:', bookId);

            // Then, add the user's personal reading progress (doc id = `${uid}_${bookId}`)
            const progressData = {
                user_id: this.currentUser.uid,
                book_id: bookId,
                status: formData.status,
                current_page: formData.current_page ? parseInt(formData.current_page) : null,
                purchase_date: formData.purchase_date || null,
                personal_notes: null,
                started_reading_at: formData.status === 'Reading' ? firebase.firestore.FieldValue.serverTimestamp() : null,
                finished_reading_at: null,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            console.log('Adding progress data:', progressData);

            await db.collection('user_reading_progress')
                .doc(`${this.currentUser.uid}_${bookId}`)
                .set(progressData);

            console.log('Progress added successfully');

            ons.notification.alert({
                message: '✅ Book added successfully!',
                title: 'Success',
                buttonLabel: 'OK'
            });

            // Close modal and reload
            hideAddBookModal();

            await this.loadBooks();

            console.log('=== ADD BOOK COMPLETED ===');

        } catch (error) {
            console.error('Error adding book:', error);

            // Check if it's a specific error we can handle
            let errorMessage = error.message;
            if (error.message.includes('timeout')) {
                errorMessage = 'The operation is taking too long. Please check your connection and try again.';
            } else if (error.message.includes('duplicate')) {
                errorMessage = 'A book with this title already exists in your library.';
            } else if (error.message.includes('network')) {
                errorMessage = 'Network error. Please check your connection and try again.';
            }

            ons.notification.alert({
                message: `❌ Error adding book: ${errorMessage}`,
                title: 'Error',
                buttonLabel: 'OK'
            });
        } finally {
            // Always reset button state
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = 'Save';
                saveButton.style.opacity = '1';
            }
        }
    }

    getFormData() {
        const data = {
            name: this.getElementValue('bookName'),
            author: this.getElementValue('authorName'),
            purchase_date: this.getElementValue('purchaseDate') || null,
            status: this.getElementValue('status') || 'Not Read',
            current_page: this.getElementValue('currentPage') || null,
            total_pages: this.getElementValue('totalPages') || null,
            category: this.getElementValue('category') || null,
            summary: this.getElementValue('summary') || null,
            coverFile: null
        };

        // Safely get the file
        const fileInput = document.getElementById('bookCover');
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            data.coverFile = fileInput.files[0];
            console.log('Cover file found:', data.coverFile.name, data.coverFile.size);
        } else {
            console.log('No cover file selected');
        }

        return data;
    }

    getEditFormData() {
        return {
            name: this.getElementValue('editBookName'),
            author: this.getElementValue('editAuthorName'),
            status: this.getElementValue('editStatus'),
            category: this.getElementValue('editCategory'),
            current_page: this.getElementValue('editCurrentPage') || null,
            total_pages: this.getElementValue('editTotalPages') || null,
            purchase_date: this.getElementValue('editPurchaseDate') || null,
            personal_notes: this.getElementValue('editSummary') || null
        };
    }

    getElementValue(id) {
        const element = document.getElementById(id);
        return element ? element.value.trim() : '';
    }

    async uploadImage(file) {
        try {
            // Resize image to 350px width before uploading
            const resizedFile = await this.resizeImage(file, 350);  // ← This resizes first

            const formData = new FormData();
            formData.append('file', resizedFile);  // ← Uploads resized file
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            return data.secure_url;
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    }

    // Add this new method for resizing images:
    resizeImage(file, maxWidth) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions - maintains aspect ratio
                const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
                const newWidth = img.width * ratio;
                const newHeight = img.height * ratio;

                // Set canvas dimensions
                canvas.width = newWidth;
                canvas.height = newHeight;

                // Draw and resize image
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                // Convert canvas to blob with 80% quality
                canvas.toBlob((blob) => {
                    const resizedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    resolve(resizedFile);
                }, file.type, 0.8); // ← 80% JPEG quality
            };

            img.src = URL.createObjectURL(file);
        });
    }

    async previewImage(event, previewId) {
        const file = event.target.files[0];
        const preview = document.getElementById(previewId);

        if (file && preview) {
            try {
                // Show original image preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.innerHTML = `
                        <div style="text-align: center;">
                            <img src="${e.target.result}" alt="Preview" style="max-width: 100px; max-height: 150px; border-radius: 8px;">
                            <p style="font-size: 0.8rem; color: #666; margin: 5px 0 0 0;">
                                Original: ${(file.size / 1024).toFixed(1)}KB
                            </p>
                        </div>
                    `;
                };
                reader.readAsDataURL(file);

                // Show what the resized version will look like
                if (this.resizeImage) {
                    const resizedFile = await this.resizeImage(file, 350);
                    const resizedReader = new FileReader();
                    resizedReader.onload = (e) => {
                        preview.innerHTML += `
                            <div style="text-align: center; margin-top: 10px;">
                                <img src="${e.target.result}" alt="Resized Preview" style="max-width: 100px; max-height: 150px; border-radius: 8px; border: 2px solid #4285f4;">
                                <p style="font-size: 0.8rem; color: #4285f4; margin: 5px 0 0 0;">
                                    Resized: ${(resizedFile.size / 1024).toFixed(1)}KB (350px width)
                                </p>
                            </div>
                        `;
                    };
                    resizedReader.readAsDataURL(resizedFile);
                }
            } catch (error) {
                console.error('Error previewing image:', error);
                preview.innerHTML = `<p style="color: #e74c3c;">Error previewing image</p>`;
            }
        } else if (preview) {
            preview.innerHTML = '';
        }
    }

    async loadBooks() {
        if (!this.currentUser) return;

        console.log('Loading books for user:', this.currentUser.uid);

        try {
            // Firestore has no server-side joins, so we do this in three reads:
            // 1) all shared books, 2) this user's progress, 3) creator profiles. Merge in memory.

            // 1) Load ALL shared books
            const booksSnapshot = await db.collection('shared_books')
                .orderBy('created_at', 'desc')
                .get();

            // 2) Load this user's reading progress and index it by book_id
            const progressSnapshot = await db.collection('user_reading_progress')
                .where('user_id', '==', this.currentUser.uid)
                .get();

            const progressMap = new Map();
            progressSnapshot.forEach(doc => {
                const p = doc.data();
                progressMap.set(p.book_id, p);
            });

            // 3) Load creator profiles for the books we have (point reads by UID)
            const creatorIds = [...new Set(booksSnapshot.docs.map(doc => doc.data().created_by))];
            const creatorsMap = new Map();
            await Promise.all(creatorIds.map(async (creatorId) => {
                if (!creatorId) return;
                try {
                    const creatorDoc = await db.collection('user_profiles').doc(creatorId).get();
                    if (creatorDoc.exists) {
                        creatorsMap.set(creatorId, creatorDoc.data());
                    }
                } catch (e) {
                    console.warn('Could not load creator profile:', creatorId, e);
                }
            }));

            // Transform data to match the expected format
            this.books = booksSnapshot.docs.map(doc => {
                const book = doc.data();
                const progress = progressMap.get(doc.id) || {};
                const creator = creatorsMap.get(book.created_by) || {};

                return {
                    id: doc.id, // Firestore doc id (string)
                    name: book.name,
                    author: book.author,
                    category: book.category,
                    summary: book.summary,
                    cover_url: book.cover_url,
                    total_pages: book.total_pages,
                    created_by: book.created_by,
                    created_at: book.created_at ? book.created_at.toMillis() : 0,
                    // Creator info
                    creator_name: creator.full_name ||
                                 (creator.email ? creator.email.split('@')[0] : null) ||
                                 'Community Member',
                    // User-specific data (will be null/default if user hasn't started tracking)
                    status: progress.status || 'Not Read',
                    current_page: progress.current_page || null,
                    purchase_date: progress.purchase_date || null,
                    personal_notes: progress.personal_notes || null,
                    started_reading_at: progress.started_reading_at || null,
                    finished_reading_at: progress.finished_reading_at || null,
                    // Flag to indicate if user has started tracking this book
                    hasProgress: !!progress.status
                };
            });

            console.log('Transformed books:', this.books);
            console.log('Total books loaded:', this.books.length);

            this.displayBooks();
            this.updateStats();
        } catch (error) {
            console.error('Error loading books:', error);
            this.showNotification('Error loading books', 'error');
        }
    }

    updateStats() {
        // Total Books = All books in the shared library (added by all users)
        const totalBooks = this.books.length;

        // Books that the user is actively tracking
        const trackedBooks = this.books.filter(book => book.hasProgress || book.created_by === this.currentUser.uid);

        // Books that user hasn't started tracking yet (available to read)
        const untrackedBooks = this.books.filter(book => !book.hasProgress && book.created_by !== this.currentUser.uid);

        // Personal reading progress
        const readingBooks = trackedBooks.filter(book => book.status === 'Reading').length;
        const completedBooks = trackedBooks.filter(book => book.status === 'Read').length;

        // Personal "Not Read" + All untracked books in library
        const personalNotRead = trackedBooks.filter(book => book.status === 'Not Read').length;
        const toReadBooks = personalNotRead + untrackedBooks.length;

        this.animateNumber('totalBooks', totalBooks);
        this.animateNumber('readingBooks', readingBooks);
        this.animateNumber('completedBooks', completedBooks);
        this.animateNumber('unreadBooks', toReadBooks);
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

        // Always show all currently reading books (no pagination for this section)
        this.renderBooks(currentlyReading, 'currentlyReadingBooks');

        // Refresh the author dropdown, then apply current search/filters/sort
        // (routing through handleSearchAndFilter keeps active filters after reloads)
        this.populateAuthorFilter();
        this.handleSearchAndFilter();
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
        const coverUrl = this.safeUrl(book.cover_url);
        const coverImage = coverUrl
            ? `<img src="${this.escapeHtml(coverUrl)}" alt="Book cover">`
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
            ${book.summary ? `<div><strong>About:</strong> ${this.escapeHtml(book.summary)}</div>` : ''}
            ${book.personal_notes ? `<div><strong>My Notes:</strong> ${this.escapeHtml(book.personal_notes)}</div>` : ''}
           </div>`
        : '';

    // Show who added the book with actual name
    const addedBy = book.created_by !== this.currentUser.uid
        ? `<div class="book-meta">
             <small>👤 Added by ${this.escapeHtml(book.creator_name)}</small>
           </div>`
        : `<div class="book-meta">
             <small>✨ Added by you</small>
           </div>`;

    // Show different buttons based on whether user has started tracking or owns the book
    const actionButtons = book.created_by === this.currentUser.uid
    ? `<button class="action-btn btn-edit" data-action="edit" data-book-id="${book.id}">
           ✏️ Edit
       </button>
       <button class="action-btn btn-delete" data-action="delete" data-book-id="${book.id}">
           🗑️ Delete
       </button>`
    : book.hasProgress
    ? `<button class="action-btn btn-edit" data-action="edit" data-book-id="${book.id}">
           ✏️ Edit
       </button>`
    : `<button class="action-btn btn-start" data-action="start-tracking" data-book-id="${book.id}">
           📖 Start Reading
       </button>`;

    return `
        <div class="book-card">
            <div class="book-card-content">
                <div class="book-cover">
                    ${coverImage}
                </div>
                <div class="book-info">
                    <h3 class="book-title">${this.escapeHtml(book.name)}</h3>
                    <p class="book-author">by ${this.escapeHtml(book.author)}</p>

                    ${book.category || book.purchase_date ? `<div class="book-meta">
                        ${book.category ? `<span class="meta-tag">${this.escapeHtml(book.category)}</span>` : ''}
                        ${book.purchase_date ? `<small>📅 ${this.escapeHtml(new Date(book.purchase_date).toLocaleDateString())}</small>` : ''}
                    </div>` : ''}

                    ${addedBy}
                    ${progressInfo}
                    ${notes}
                </div>
            </div>
            <div class="book-actions">
                <div class="status-badge status-${String(book.status).toLowerCase().replace(' ', '-')}">
                    ${this.escapeHtml(book.status)}
                </div>
                ${book.status === 'Reading' ? `
                <button class="action-btn btn-progress" data-action="progress" data-book-id="${book.id}">
                    📊 Progress
                </button>
            ` : ''}
                ${actionButtons}
            </div>
        </div>
    `;
    }

    searchBooks(query) {
        // This method is now handled by handleSearchAndFilter
        // Keep for backward compatibility but redirect to new method
        this.handleSearchAndFilter();
    }

    async editBookProgress(bookId) {
        if (!this.currentUser) {
            ons.notification.alert({
                message: '🔒 Please sign in to edit progress',
                title: 'Authentication Required',
                buttonLabel: 'OK'
            });
            return;
        }

        const book = this.books.find(b => String(b.id) === String(bookId));
        if (!book) {
            ons.notification.alert({
                message: '❌ Book not found',
                title: 'Error',
                buttonLabel: 'OK'
            });
            return;
        }

        // Set current book for editing
        this.editingBookId = bookId;

        // Populate form with current values - FIX: Use correct field IDs
        this.setElementValue('editBookName', book.name || '');
        this.setElementValue('editAuthorName', book.author || '');
        this.setElementValue('editStatus', book.status || 'Not Read');
        this.setElementValue('editCategory', book.category || '');
        this.setElementValue('editCurrentPage', book.current_page || '');
        this.setElementValue('editTotalPages', book.total_pages || '');
        this.setElementValue('editPurchaseDate', book.purchase_date || '');
        this.setElementValue('editSummary', book.personal_notes || '');

        // Show/hide current page field based on status
        const editPageGroup = document.getElementById('editPageGroup');
        if (editPageGroup) {
            editPageGroup.style.display = book.status === 'Reading' ? 'block' : 'none';
        }

        // Show the modal
        showEditBookModal();

        console.log('Edit progress for book:', bookId, book);
    }

    setElementValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    }

    async saveEditedBook() {
        if (!this.currentUser) {
            ons.notification.alert({
                message: '🔒 Please sign in to edit progress',
                title: 'Authentication Required',
                buttonLabel: 'OK'
            });
            return;
        }

        if (!this.editingBookId) {
            ons.notification.alert({
                message: '❌ No book selected for editing',
                title: 'Error',
                buttonLabel: 'OK'
            });
            return;
        }

        const formData = this.getEditFormData();

        // Validation
        if (!formData.name.trim() || !formData.author.trim()) {
            ons.notification.alert({
                message: '📝 Please fill in required fields (Book Name, Author)',
                title: 'Missing Information',
                buttonLabel: 'OK'
            });
            return;
        }

        if (formData.total_pages && (isNaN(formData.total_pages) || formData.total_pages < 1)) {
            ons.notification.alert({
                message: '📖 Total pages must be a valid number greater than 0',
                title: 'Invalid Input',
                buttonLabel: 'OK'
            });
            return;
        }

        if (formData.current_page && formData.total_pages && parseInt(formData.current_page) > parseInt(formData.total_pages)) {
            ons.notification.alert({
                message: '📄 Current page cannot exceed total pages',
                title: 'Invalid Page Number',
                buttonLabel: 'OK'
            });
            return;
        }

        try {
            // Update the shared book data (if user owns it)
            const book = this.books.find(b => String(b.id) === String(this.editingBookId));
            if (book && book.created_by === this.currentUser.uid) {
                await db.collection('shared_books').doc(String(this.editingBookId)).update({
                    name: formData.name,
                    author: formData.author,
                    category: formData.category,
                    total_pages: formData.total_pages ? parseInt(formData.total_pages) : null
                });
            }

            // Update or create user progress (doc id = `${uid}_${bookId}`)
            const progressRef = db.collection('user_reading_progress')
                .doc(`${this.currentUser.uid}_${this.editingBookId}`);
            const existingSnap = await progressRef.get();
            const existingProgress = existingSnap.exists ? existingSnap.data() : null;

            const updateData = {
                user_id: this.currentUser.uid,
                book_id: String(this.editingBookId),
                status: formData.status,
                current_page: formData.current_page ? parseInt(formData.current_page) : null,
                purchase_date: formData.purchase_date || null,
                personal_notes: formData.personal_notes || null,
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Add timestamps based on status changes
            if (formData.status === 'Reading' && (!existingProgress || existingProgress.status !== 'Reading')) {
                updateData.started_reading_at = firebase.firestore.FieldValue.serverTimestamp();
            } else if (formData.status === 'Read' && (!existingProgress || existingProgress.status !== 'Read')) {
                updateData.finished_reading_at = firebase.firestore.FieldValue.serverTimestamp();
                updateData.current_page = null; // Clear current page when finished
            }

            if (!existingProgress) {
                updateData.created_at = firebase.firestore.FieldValue.serverTimestamp();
            }

            // set with merge handles both "update existing" and "create new"
            await progressRef.set(updateData, { merge: true });

            ons.notification.alert({
                message: '✅ Book updated successfully!',
                title: 'Success',
                buttonLabel: 'OK'
            });

            hideEditBookModal();
            await this.loadBooks();

            // Reset editing state
            this.editingBookId = null;

        } catch (error) {
            console.error('Error updating book:', error);
            ons.notification.alert({
                message: `❌ Error updating book: ${error.message}`,
                title: 'Error',
                buttonLabel: 'OK'
            });
        }
    }


openProgressModal(bookId) {
    this.currentBookForUpdate = bookId;
    const book = this.books.find(b => String(b.id) === String(bookId));

    if (book) {
        this.setElementValue('updateCurrentPage', book.current_page || '');
        this.setElementValue('updateTotalPages', book.total_pages || '');
        this.updateProgressDisplay();
    }

    const modal = document.getElementById('progressModal');
    if (modal) {
        modal.style.display = 'block';
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
            ons.notification.alert({
                message: '🔒 Please sign in to update progress',
                title: 'Authentication Required',
                buttonLabel: 'OK'
            });
            return;
        }

        const currentPage = parseInt(this.getElementValue('updateCurrentPage'));

        if (!currentPage || currentPage < 1) {
            ons.notification.alert({
                message: '📄 Please enter a valid current page number',
                title: 'Invalid Input',
                buttonLabel: 'OK'
            });
            return;
        }

        const book = this.books.find(b => String(b.id) === String(this.currentBookForUpdate));
        if (book && book.total_pages && currentPage > book.total_pages) {
            ons.notification.alert({
                message: '📖 Current page cannot exceed total pages',
                title: 'Invalid Page Number',
                buttonLabel: 'OK'
            });
            return;
        }

        try {
            const updateData = {
                user_id: this.currentUser.uid,
                book_id: String(this.currentBookForUpdate),
                current_page: currentPage,
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            };

            // If reached the end, mark as read
            if (book && book.total_pages && currentPage >= book.total_pages) {
                updateData.status = 'Read';
                updateData.current_page = null;
                updateData.finished_reading_at = firebase.firestore.FieldValue.serverTimestamp();
            }

            await db.collection('user_reading_progress')
                .doc(`${this.currentUser.uid}_${this.currentBookForUpdate}`)
                .set(updateData, { merge: true });

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
            ons.notification.alert({
                message: '🔒 Please sign in to delete books',
                title: 'Authentication Required',
                buttonLabel: 'OK'
            });
            return;
        }

        const book = this.books.find(b => String(b.id) === String(id));
        if (!book || book.created_by !== this.currentUser.uid) {
            ons.notification.alert({
                message: '❌ You can only delete books you added',
                title: 'Permission Denied',
                buttonLabel: 'OK'
            });
            return;
        }

        // Use Onsen UI confirm dialog
        ons.notification.confirm({
            message: `🗑️ Are you sure you want to delete "${book.name}"?\n\nThis will remove it permanently.`,
            title: 'Confirm Delete',
            buttonLabels: ['Cancel', 'Delete']
        }).then((buttonIndex) => {
            if (buttonIndex === 1) { // Delete button clicked
                this.performDelete(id);
            }
        });
    }

    // Add this helper method for the actual deletion:
    async performDelete(id) {
        try {
            console.log('=== DELETE DEBUG INFO ===');
            console.log('Attempting to delete book with ID:', id);
            console.log('Current user ID:', this.currentUser.uid);

            // First check if the book exists and user owns it
            const bookRef = db.collection('shared_books').doc(String(id));
            const bookSnap = await bookRef.get();

            if (!bookSnap.exists) {
                ons.notification.alert({
                    message: '❌ Book not found.',
                    title: 'Delete Failed',
                    buttonLabel: 'OK'
                });
                return;
            }

            const bookCheck = bookSnap.data();
            console.log('Book found:', bookCheck);

            if (bookCheck.created_by !== this.currentUser.uid) {
                ons.notification.alert({
                    message: '❌ You do not have permission to delete this book',
                    title: 'Permission Denied',
                    buttonLabel: 'OK'
                });
                return;
            }

            // Delete this user's own progress record. Security rules only permit
            // deleting your own progress, so the other user's progress (if any) is
            // left orphaned and simply never matched in loadBooks (harmless).
            console.log('Deleting own progress record for book ID:', id);
            try {
                await db.collection('user_reading_progress')
                    .doc(`${this.currentUser.uid}_${id}`)
                    .delete();
            } catch (progressError) {
                console.error('Error deleting progress record:', progressError);
            }

            // Delete the book
            console.log('Deleting book...');
            await bookRef.delete();
            console.log('Deleted book:', id);

            // Force reload books after successful deletion
            console.log('Reloading books...');
            await this.loadBooks();

            ons.notification.alert({
                message: '✅ Book deleted successfully!',
                title: 'Deleted',
                buttonLabel: 'OK'
            });

            console.log('=== DELETE COMPLETED ===');
        } catch (error) {
            console.error('Error deleting book:', error);
            ons.notification.alert({
                message: `❌ Error deleting book: ${error.message}`,
                title: 'Delete Failed',
                buttonLabel: 'OK'
            });
        }
    }

    showNotification(message, type = 'info') {
        // Use Onsen UI dialog instead of custom notification
        let icon = '💬';
        let title = 'Info';

        switch(type) {
            case 'success':
                icon = '✅';
                title = 'Success';
                break;
            case 'error':
                icon = '❌';
                title = 'Error';
                break;
            case 'info':
                icon = 'ℹ️';
                title = 'Info';
                break;
        }

        ons.notification.alert({
            message: `${icon} ${message}`,
            title: title,
            buttonLabel: 'OK'
        });
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

    async startTrackingBook(bookId) {
        if (!this.currentUser) {
            ons.notification.alert({
                message: '🔒 Please sign in to start tracking books',
                title: 'Authentication Required',
                buttonLabel: 'OK'
            });
            return;
        }

        try {
            // Check if user already has progress for this book
            const progressRef = db.collection('user_reading_progress')
                .doc(`${this.currentUser.uid}_${bookId}`);
            const existingSnap = await progressRef.get();

            if (existingSnap.exists) {
                ons.notification.alert({
                    message: 'ℹ️ You are already tracking this book',
                    title: 'Already Tracking',
                    buttonLabel: 'OK'
                });
                return;
            }

            // Create new progress record with "Not Read" status
            await progressRef.set({
                user_id: this.currentUser.uid,
                book_id: String(bookId),
                status: 'Not Read',
                current_page: null,
                purchase_date: null,
                personal_notes: null,
                started_reading_at: null,
                finished_reading_at: null,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            });

            ons.notification.alert({
                message: '✅ Started tracking this book! You can now update your progress.',
                title: 'Tracking Started',
                buttonLabel: 'OK'
            });

            this.loadBooks();
        } catch (error) {
            console.error('Error starting to track book:', error);
            ons.notification.alert({
                message: '❌ Error starting to track book. Please try again.',
                title: 'Error',
                buttonLabel: 'OK'
            });
        }
    }

    resetAddBookForm() {
        // Reset all form fields
        this.setElementValue('bookName', '');
        this.setElementValue('authorName', '');
        this.setElementValue('totalPages', '');
        this.setElementValue('category', '');
        this.setElementValue('summary', '');
        this.setElementValue('status', 'Not Read');
        this.setElementValue('currentPage', '');
        this.setElementValue('purchaseDate', '');

        // Reset file input
        const fileInput = document.getElementById('bookCover');
        if (fileInput) {
            fileInput.value = '';
        }

        // Reset preview
        const preview = document.getElementById('imagePreview');
        if (preview) {
            preview.innerHTML = '';
        }

        // Hide current page group by default
        const currentPageGroup = document.getElementById('currentPageGroup');
        if (currentPageGroup) {
            currentPageGroup.style.display = 'none';
        }

        // Reset ALL modal states
        this.editingBookId = null;
        this.currentBookForUpdate = null;

        console.log('Add book form reset completely');
    }

    resetUpdateForm() {
        // Reset update form fields
        this.setElementValue('updateCurrentPage', '');
        this.setElementValue('updateStatus', 'Not Read');
        this.setElementValue('updatePurchaseDate', '');
        this.setElementValue('updateNotes', '');

        // Reset current book tracking
        this.currentBookForUpdate = null;

        console.log('Update form reset');
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ---------------- Wishlist (global, shared, labelled by owner) ----------------

    async loadWishlist() {
        if (!this.currentUser) return;
        try {
            const snapshot = await db.collection('wishlist')
                .orderBy('created_at', 'desc')
                .get();

            this.wishlist = snapshot.docs.map(doc => {
                const w = doc.data();
                return {
                    id: doc.id,
                    title: w.title,
                    author: w.author || '',
                    note: w.note || '',
                    link: w.link || '',
                    created_by: w.created_by,
                    created_by_name: w.created_by_name || 'Someone'
                };
            });

            this.renderWishlist();
        } catch (error) {
            console.error('Error loading wishlist:', error);
            this.showNotification('Error loading wishlist', 'error');
        }
    }

    renderWishlist() {
        const container = document.getElementById('wishlistItems');
        if (!container) return;

        if (!this.wishlist || this.wishlist.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎁</div>
                    <h3>Wishlist is empty</h3>
                    <p>Add a book you'd love to read or buy next!</p>
                </div>`;
            return;
        }

        container.innerHTML = this.wishlist.map(item => {
            const isOwner = item.created_by === this.currentUser.uid;
            const safeLink = this.safeUrl(item.link);
            const linkHtml = safeLink
                ? `<a href="${this.escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:6px 10px;color:#4285f4;font-weight:600;text-decoration:none;">🔗 View</a>`
                : '';
            const noteHtml = item.note
                ? `<div class="book-summary"><div>${this.escapeHtml(item.note)}</div></div>`
                : '';
            const actions = isOwner
                ? `<button class="action-btn btn-start" data-wish-action="acquire" data-wish-id="${item.id}">📚 Got it!</button>
                   <button class="action-btn btn-edit" data-wish-action="edit" data-wish-id="${item.id}">✏️ Edit</button>
                   <button class="action-btn btn-delete" data-wish-action="delete" data-wish-id="${item.id}">🗑️ Delete</button>`
                : '';

            return `
                <div class="book-card">
                    <div class="book-card-content">
                        <div class="book-info">
                            <h3 class="book-title">${this.escapeHtml(item.title)}</h3>
                            ${item.author ? `<p class="book-author">by ${this.escapeHtml(item.author)}</p>` : ''}
                            <div class="book-meta">
                                <span class="meta-tag">🎁 ${this.escapeHtml(item.created_by_name)}'s wishlist</span>
                            </div>
                            ${noteHtml}
                        </div>
                    </div>
                    <div class="book-actions">
                        ${linkHtml}
                        ${actions}
                    </div>
                </div>`;
        }).join('');
    }

    openWishlistModal(id = null) {
        this.editingWishlistId = id;
        const titleEl = document.getElementById('wishlistModalTitle');

        if (id) {
            const item = this.wishlist.find(w => String(w.id) === String(id));
            if (!item) return;
            if (item.created_by !== this.currentUser.uid) {
                this.showNotification('You can only edit your own wishlist items', 'error');
                return;
            }
            this.setElementValue('wishTitle', item.title || '');
            this.setElementValue('wishAuthor', item.author || '');
            this.setElementValue('wishLink', item.link || '');
            this.setElementValue('wishNote', item.note || '');
            if (titleEl) titleEl.textContent = 'Edit Wishlist Item';
        } else {
            this.setElementValue('wishTitle', '');
            this.setElementValue('wishAuthor', '');
            this.setElementValue('wishLink', '');
            this.setElementValue('wishNote', '');
            if (titleEl) titleEl.textContent = 'Add to Wishlist';
        }

        const modal = document.getElementById('wishlistModal');
        if (modal) modal.style.display = 'block';
    }

    async saveWishlistItem() {
        if (!this.currentUser) return;

        const title = this.getElementValue('wishTitle');
        if (!title || !title.trim()) {
            ons.notification.alert({ message: '📝 Please enter a book title', title: 'Missing Information', buttonLabel: 'OK' });
            return;
        }

        const data = {
            title: title.trim(),
            author: this.getElementValue('wishAuthor').trim() || null,
            link: this.getElementValue('wishLink').trim() || null,
            note: this.getElementValue('wishNote').trim() || null,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (this.editingWishlistId) {
                await db.collection('wishlist').doc(String(this.editingWishlistId)).update(data);
            } else {
                data.created_by = this.currentUser.uid;
                data.created_by_name = this.currentUser.displayName || this.currentUser.email.split('@')[0];
                data.created_at = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('wishlist').add(data);
            }

            hideWishlistModal();
            this.editingWishlistId = null;
            await this.loadWishlist();
            this.showNotification('🎁 Wishlist updated!', 'success');
        } catch (error) {
            console.error('Error saving wishlist item:', error);
            this.showNotification('Error saving wishlist item', 'error');
        }
    }

    async deleteWishlistItem(id) {
        const item = this.wishlist.find(w => String(w.id) === String(id));
        if (!item || item.created_by !== this.currentUser.uid) {
            this.showNotification('You can only delete your own wishlist items', 'error');
            return;
        }

        ons.notification.confirm({
            message: `🗑️ Remove "${item.title}" from the wishlist?`,
            title: 'Confirm Delete',
            buttonLabels: ['Cancel', 'Delete']
        }).then(async (buttonIndex) => {
            if (buttonIndex === 1) {
                try {
                    await db.collection('wishlist').doc(String(id)).delete();
                    await this.loadWishlist();
                    this.showNotification('Removed from wishlist', 'success');
                } catch (error) {
                    console.error('Error deleting wishlist item:', error);
                    this.showNotification('Error removing item', 'error');
                }
            }
        });
    }

    handleWishlistAction(e) {
        const button = e.target.closest('.action-btn');
        if (!button) return;
        const action = button.getAttribute('data-wish-action');
        const id = button.getAttribute('data-wish-id');
        if (!action || !id) return;
        e.preventDefault();
        e.stopPropagation();
        if (action === 'edit') this.openWishlistModal(id);
        else if (action === 'delete') this.deleteWishlistItem(id);
        else if (action === 'acquire') this.moveWishlistToLibrary(id);
    }

    // "Got it!" — turn a wishlist item into a tracked book in the shared library.
    async moveWishlistToLibrary(id) {
        const item = this.wishlist.find(w => String(w.id) === String(id));
        if (!item || item.created_by !== this.currentUser.uid) {
            this.showNotification('You can only move your own wishlist items', 'error');
            return;
        }

        ons.notification.confirm({
            message: `📚 Add "${item.title}" to your library and remove it from the wishlist?`,
            title: 'Move to Library',
            buttonLabels: ['Cancel', 'Add']
        }).then(async (buttonIndex) => {
            if (buttonIndex !== 1) return;
            try {
                const bookRef = db.collection('shared_books').doc();
                await bookRef.set({
                    name: item.title,
                    author: item.author || 'Unknown',
                    category: null,
                    summary: item.note || null,
                    total_pages: null,
                    cover_url: null,
                    created_by: this.currentUser.uid,
                    created_at: firebase.firestore.FieldValue.serverTimestamp()
                });

                await db.collection('user_reading_progress')
                    .doc(`${this.currentUser.uid}_${bookRef.id}`)
                    .set({
                        user_id: this.currentUser.uid,
                        book_id: bookRef.id,
                        status: 'Not Read',
                        current_page: null,
                        purchase_date: null,
                        personal_notes: null,
                        started_reading_at: null,
                        finished_reading_at: null,
                        created_at: firebase.firestore.FieldValue.serverTimestamp(),
                        updated_at: firebase.firestore.FieldValue.serverTimestamp()
                    });

                await db.collection('wishlist').doc(String(id)).delete();
                await this.loadWishlist();
                await this.loadBooks();
                this.showNotification('📚 Added to your library! You can edit the page count there.', 'success');
            } catch (error) {
                console.error('Error moving wishlist item to library:', error);
                this.showNotification('Error moving item to library', 'error');
            }
        });
    }

    // Escape user text before injecting into innerHTML.
    escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(/[&<>"']/g, s => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[s]));
    }

    // Only allow http/https links (blocks javascript: etc.); prepend https:// if missing.
    safeUrl(url) {
        if (!url) return '';
        let u = String(url).trim();
        if (!u) return '';
        if (!/^https?:\/\//i.test(u)) {
            if (/^[\w.-]+\.[a-z]{2,}/i.test(u)) u = 'https://' + u;
            else return '';
        }
        try {
            const parsed = new URL(u);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
        } catch (e) {}
        return '';
    }

    // List of allowed emails
    getAllowedEmails() {
        return [
            'sanda.wijekoon7@gmail.com',
            'agskanchana@gmail.com'
        ];
    }

    // Check if email is in allowed list
    isEmailAllowed(email) {
        if (!email) return false;

        const allowedEmails = this.getAllowedEmails();
        const normalizedEmail = email.toLowerCase().trim();

        return allowedEmails.some(allowedEmail =>
            allowedEmail.toLowerCase().trim() === normalizedEmail
        );
    }

    // Handle unauthorized user sign-in
    async signOutUnauthorized(email) {
        console.log('Unauthorized email attempted login:', email);

        try {
            // Sign out the user
            await auth.signOut();

            // Show access denied message
            ons.notification.alert({
                message: `🚫 Access Denied\n\nSorry, ${email} is not authorized to access this Book Journal.\n\nThis is a private reading tracker limited to specific users only.`,
                title: 'Unauthorized Access',
                buttonLabel: 'OK'
            });

            // Make sure we show the login page
            this.showLoginPage();

        } catch (error) {
            console.error('Error signing out unauthorized user:', error);
        }
    }

    setupFileInputListener() {
        const bookCover = document.getElementById('bookCover');
        if (bookCover) {
            // Remove existing listener to prevent duplicates
            bookCover.removeEventListener('change', this.fileHandler);

            // Create bound handler
            this.fileHandler = (e) => {
                console.log('File selected:', e.target.files[0]);
                if (e.target.files[0]) {
                    this.previewImage(e, 'imagePreview');
                }
            };

            bookCover.addEventListener('change', this.fileHandler);
            console.log('File input listener setup completed');
        }
    }

    setupStatusChangeListeners() {
        // Status change listener for add book form
        const statusSelect = document.getElementById('status');
        if (statusSelect) {
            statusSelect.addEventListener('change', (e) => {
                const currentPageGroup = document.getElementById('currentPageGroup');
                if (currentPageGroup) {
                    currentPageGroup.style.display = e.target.value === 'Reading' ? 'block' : 'none';
                }
            });
        }

        // Status change listener for edit book form
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
        // Progress update listeners for the progress modal
        const updateCurrentPage = document.getElementById('updateCurrentPage');
        const updateTotalPages = document.getElementById('updateTotalPages');

        if (updateCurrentPage) {
            updateCurrentPage.addEventListener('input', () => {
                this.updateProgressDisplay();
            });
        }

        if (updateTotalPages) {
            updateTotalPages.addEventListener('input', () => {
                this.updateProgressDisplay();
            });
        }
    }
}

// Authentication Functions
async function signInWithGoogle() {
    try {
        // Show loading state
        const loginButton = document.querySelector('.google-login-btn');
        if (loginButton) {
            loginButton.disabled = true;
            loginButton.innerHTML = '<ons-icon icon="fa-spinner" class="fa-spin" style="margin-right: 8px;"></ons-icon>Signing in...';
        }

        const provider = new firebase.auth.GoogleAuthProvider();
        // Always show the Google account chooser instead of silently re-using the
        // account you're already signed into (lets you pick "Use another account").
        provider.setCustomParameters({ prompt: 'select_account' });
        await auth.signInWithPopup(provider);

        // Note: The actual email validation happens in setupAuth()
        // (onAuthStateChanged) after successful sign-in.

    } catch (error) {
        console.error('Error signing in:', error);

        // Reset button state
        const loginButton = document.querySelector('.google-login-btn');
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = '<ons-icon icon="fa-google" style="margin-right: 8px;"></ons-icon>Continue with Google';
        }

        ons.notification.alert({
            message: '❌ Error signing in with Google. Please try again.',
            title: 'Sign-in Error',
            buttonLabel: 'OK'
        });
    }
}

async function signOut() {
    try {
        await auth.signOut();

        hideUserMenu();
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Error signing out. Please try again.');
    }
}

// Modal Functions
function showAddBookModal() {
    console.log('Opening add book modal');

    // Reset form before showing modal
    if (window.bookJournal) {
        window.bookJournal.resetAddBookForm();
    }

    const modal = document.getElementById('addBookModal');
    if (modal) {
        modal.style.display = 'block';

        // Reset button state
        const saveButton = document.querySelector('.toolbar-button-save');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Save';
            saveButton.style.opacity = '1';
        }

        // Re-setup file input listener for the modal
        setTimeout(() => {
            if (window.bookJournal) {
                window.bookJournal.setupFileInputListener();
            }
        }, 100);
    }
}

function hideAddBookModal() {
    const modal = document.getElementById('addBookModal');
    if (modal) {
        modal.style.display = 'none';

        // Reset form and state when hiding
        if (window.bookJournal) {
            window.bookJournal.resetAddBookForm();
            window.bookJournal.editingBookId = null; // Clear this
            window.bookJournal.currentBookForUpdate = null; // Clear this
        }

        // Reset button state
        const saveButton = document.querySelector('.toolbar-button-save');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Save';
            saveButton.style.opacity = '1';
        }
    }
}

// Update these functions around line 1360:

function showUserMenu() {
    const modal = document.getElementById('userMenuModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function hideUserMenu() {
    const modal = document.getElementById('userMenuModal');
    if (modal) {
        modal.style.display = 'none';
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
function setActiveSection(section) {
    const sections = {
        reading: document.getElementById('reading-section'),
        library: document.getElementById('library-section'),
        wishlist: document.getElementById('wishlist-section')
    };
    const toggles = {
        reading: document.getElementById('readingToggle'),
        library: document.getElementById('libraryToggle'),
        wishlist: document.getElementById('wishlistToggle')
    };
    Object.keys(sections).forEach(key => {
        if (sections[key]) sections[key].style.display = (key === section) ? 'block' : 'none';
        if (toggles[key]) toggles[key].classList.toggle('active', key === section);
    });
}

function showReadingSection() {
    setActiveSection('reading');
}

function showLibrarySection() {
    setActiveSection('library');
}

function showWishlistSection() {
    setActiveSection('wishlist');
    if (window.bookJournal) window.bookJournal.loadWishlist();
}

function openWishlistModal(id = null) {
    if (window.bookJournal) window.bookJournal.openWishlistModal(id);
}

function saveWishlistItem() {
    if (window.bookJournal) window.bookJournal.saveWishlistItem();
}

function hideWishlistModal() {
    const modal = document.getElementById('wishlistModal');
    if (modal) modal.style.display = 'none';
    if (window.bookJournal) window.bookJournal.editingWishlistId = null;
}

// User Menu Functions
function showStats() {
    if (window.bookJournal && window.bookJournal.books) {
        // Total books = all books in shared library
        const totalBooks = window.bookJournal.books.length;

        // Books that user is tracking
        const trackedBooks = window.bookJournal.books.filter(book =>
            book.hasProgress || book.created_by === window.bookJournal.currentUser.uid
        );

        // Books that user hasn't started tracking yet
        const untrackedBooks = window.bookJournal.books.filter(book =>
            !book.hasProgress && book.created_by !== window.bookJournal.currentUser.uid
        );

        const personalNotRead = trackedBooks.filter(b => b.status === 'Not Read').length;
        const toReadBooks = personalNotRead + untrackedBooks.length;

        const stats = {
            total: totalBooks,
            reading: trackedBooks.filter(b => b.status === 'Reading').length,
            completed: trackedBooks.filter(b => b.status === 'Read').length,
            unread: toReadBooks,
            tracking: trackedBooks.length,
            available: untrackedBooks.length
        };

        const message = `📊 Your Reading Statistics:

📚 Total Books in Library: ${stats.total}
📖 Books You're Tracking: ${stats.tracking}
📚 Available to Start: ${stats.available}

Your Personal Progress:
📖 Currently Reading: ${stats.reading}
✅ Completed: ${stats.completed}
🔖 To Read: ${stats.unread}
   └─ Your "Not Read": ${personalNotRead}
   └─ Available Books: ${stats.available}`;

        ons.notification.alert({
            message: message,
            title: 'Reading Statistics',
            buttonLabel: 'Close'
        });
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
    console.log('submitBook called, window.bookJournal:', window.bookJournal);
    if (window.bookJournal) {
        window.bookJournal.addBook();
    } else {
        console.error('BookJournal instance not found');
        ons.notification.alert({
            message: '❌ Application not ready. Please refresh the page.',
            title: 'Error',
            buttonLabel: 'OK'
        });
    }
}
function saveEditedBook() {
    console.log('saveEditedBook called');
    if (window.bookJournal) {
        window.bookJournal.saveEditedBook();
    }
}

function updateBookProgress() {
    console.log('updateBookProgress called');
    if (window.bookJournal) {
        window.bookJournal.updateBookProgress();
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing BookJournal...');
    window.bookJournal = new BookJournal();

    // Add a small delay to ensure everything is ready
    setTimeout(() => {
        console.log('BookJournal initialized:', window.bookJournal);
    }, 100);
});

// Backup initialization for cases where DOMContentLoaded already fired
if (document.readyState === 'loading') {
    // DOM is still loading
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.bookJournal) {
            console.log('Backup: DOM loaded, initializing BookJournal...');
            window.bookJournal = new BookJournal();
        }
    });
} else {
    // DOM already loaded
    if (!window.bookJournal) {
        console.log('DOM already loaded, initializing BookJournal immediately...');
        window.bookJournal = new BookJournal();
    }
}

function showEditBookModal() {
    const modal = document.getElementById('editBookModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function hideEditBookModal() {
    const modal = document.getElementById('editBookModal');
    if (modal) {
        modal.style.display = 'none';

        // Reset editing state completely
        if (window.bookJournal) {
            window.bookJournal.editingBookId = null;
            window.bookJournal.currentBookForUpdate = null;
        }
    }
}

function hideProgressModal() {
    const modal = document.getElementById('progressModal');
    if (modal) {
        modal.style.display = 'none';

        // Reset current book for update
        if (window.bookJournal) {
            window.bookJournal.currentBookForUpdate = null;
        }
    }
}

