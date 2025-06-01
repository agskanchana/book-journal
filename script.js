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
            // Use upsert (insert or update) to handle existing profiles
            const { error } = await supabase
                .from('user_profiles')
                .upsert([{
                    id: user.id,
                    email: user.email,
                    full_name: user.user_metadata?.full_name ||
                              user.user_metadata?.name ||
                              user.email.split('@')[0],
                    avatar_url: user.user_metadata?.avatar_url ||
                               user.user_metadata?.picture || ''
                }], {
                    onConflict: 'id',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error('Error creating/updating user profile:', error);
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

        // Setup simple file input listener
        setupFileInputListener();

        this.setupStatusChangeListeners();
        this.setupProgressListeners();
    }

    setupStatusChangeListeners() {
        // Add listener for add book modal
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
        if (!this.currentUser) {
            ons.notification.alert({
                message: '🔒 Please sign in to add books',
                title: 'Authentication Required',
                buttonLabel: 'OK'
            });
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
            // Show loading state - target the correct button
            const saveButton = document.querySelector('.toolbar-button-save');
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = 'Adding...';
                saveButton.style.opacity = '0.6';
            }

            console.log('=== ADD BOOK DEBUG ===');
            console.log('Form data:', formData);
            console.log('Current user:', this.currentUser.id);

            // Upload image if provided
            let cover_url = null;
            if (formData.coverFile) {
                console.log('Uploading image...');
                cover_url = await this.uploadImage(formData.coverFile);
                console.log('Image uploaded:', cover_url);
            }

            // First, add the book to shared_books
            const sharedBookData = {
                name: formData.name,
                author: formData.author,
                category: formData.category,
                summary: formData.summary,
                total_pages: parseInt(formData.total_pages),
                cover_url: cover_url,
                created_by: this.currentUser.id
            };

            console.log('Adding book to shared_books:', sharedBookData);

            const { data: bookData, error: bookError } = await supabase
                .from('shared_books')
                .insert([sharedBookData])
                .select()
                .single();

            if (bookError) throw bookError;

            console.log('Book added to shared_books:', bookData);

            // Then, add the user's personal reading progress
            const progressData = {
                user_id: this.currentUser.id,
                book_id: bookData.id,
                status: formData.status,
                current_page: formData.current_page,
                purchase_date: formData.purchase_date,
                started_reading_at: formData.status === 'Reading' ? new Date().toISOString() : null
            };

            console.log('Adding progress data:', progressData);

            const { error: progressError } = await supabase
                .from('user_reading_progress')
                .insert([progressData]);

            if (progressError) throw progressError;

            console.log('Progress added successfully');

            ons.notification.alert({
                message: '✅ Book added successfully!',
                title: 'Success',
                buttonLabel: 'OK'
            });

            // Close modal and reload
            hideAddBookModal();
            await this.loadBooks(); // Make sure this completes

            console.log('=== ADD BOOK COMPLETED ===');

        } catch (error) {
            console.error('Error adding book:', error);
            ons.notification.alert({
                message: `❌ Error adding book: ${error.message}`,
                title: 'Error',
                buttonLabel: 'OK'
            });
        } finally {
            // Reset button state
            const saveButton = document.querySelector('.toolbar-button-save');
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = 'Save';
                saveButton.style.opacity = '1';
            }
        }
    }

    getFormData() {
        return {
            name: this.getElementValue('bookName'),
            author: this.getElementValue('authorName'),
            purchase_date: this.getElementValue('purchaseDate') || null,
            status: this.getElementValue('status'),
            current_page: this.getElementValue('currentPage') || null,
            total_pages: this.getElementValue('totalPages') || null, // This is now required
            category: this.getElementValue('category') || null,
            summary: this.getElementValue('summary') || null,
            coverFile: document.getElementById('bookCover')?.files[0] || null
        };
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

        console.log('Loading books for user:', this.currentUser.id);

        try {
            // Load ALL shared books with user's personal progress (if any)
            const { data: booksData, error: booksError } = await supabase
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
                    )
                `)
                .eq('user_reading_progress.user_id', this.currentUser.id)
                .order('created_at', { ascending: false });

            if (booksError) throw booksError;

            console.log('Raw books data from database:', booksData);

            // Get unique creator IDs
            const creatorIds = [...new Set(booksData.map(book => book.created_by))];

            // Get creator profiles in a separate query
            const { data: creatorsData, error: creatorsError } = await supabase
                .from('user_profiles')
                .select('id, full_name, email')
                .in('id', creatorIds);

            // Create a map for quick lookup (don't fail if creators query fails)
            const creatorsMap = new Map();
            if (!creatorsError && creatorsData) {
                creatorsData.forEach(creator => {
                    creatorsMap.set(creator.id, creator);
                });
            }

            // Transform data to match the expected format
            this.books = booksData.map(book => {
                const progress = book.user_reading_progress[0] || {};
                const creator = creatorsMap.get(book.created_by) || {};

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

    async ensureCreatorProfiles(creatorIds) {
        const missingIds = [];

        // Check which profiles are missing
        for (const creatorId of creatorIds) {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('id', creatorId)
                .single();

            if (!profile) {
                missingIds.push(creatorId);
            }
        }

        // Create missing profiles
        if (missingIds.length > 0) {
            const missingProfiles = missingIds.map(id => ({
                id: id,
                email: 'unknown@example.com',
                full_name: 'Community Member',
                avatar_url: ''
            }));

            await supabase
                .from('user_profiles')
                .insert(missingProfiles);
        }
    }

    updateStats() {
        // Total Books = All books in the shared library (added by all users)
        const totalBooks = this.books.length;

        // Books that the user is actively tracking
        const trackedBooks = this.books.filter(book => book.hasProgress || book.created_by === this.currentUser.id);

        // Books that user hasn't started tracking yet (available to read)
        const untrackedBooks = this.books.filter(book => !book.hasProgress && book.created_by !== this.currentUser.id);

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

        // Show different buttons based on whether user has started tracking or owns the book
        const actionButtons = book.created_by === this.currentUser.id
            ? `<button class="action-btn btn-edit" onclick="bookJournal.editBookProgress(${book.id})">
                   ✏️ Edit
               </button>
               <button class="action-btn btn-delete" onclick="bookJournal.deleteBook(${book.id})">
                   🗑️ Delete
               </button>`
            : book.hasProgress
            ? `<button class="action-btn btn-edit" onclick="bookJournal.editBookProgress(${book.id})">
                   ✏️ Edit
               </button>`
            : `<button class="action-btn btn-start" onclick="bookJournal.startTrackingBook(${book.id})">
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
                        <button class="action-btn btn-progress" onclick="bookJournal.openProgressModal(${book.id})">
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

    async editBookProgress(bookId) {
        if (!this.currentUser) {
            ons.notification.alert({
                message: '🔒 Please sign in to edit progress',
                title: 'Authentication Required',
                buttonLabel: 'OK'
            });
            return;
        }

        const book = this.books.find(b => b.id === bookId);
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
            const book = this.books.find(b => b.id === this.editingBookId);
            if (book && book.created_by === this.currentUser.id) {
                const { error: bookError } = await supabase
                    .from('shared_books')
                    .update({
                        name: formData.name,
                        author: formData.author,
                        category: formData.category,
                        total_pages: formData.total_pages ? parseInt(formData.total_pages) : null
                    })
                    .eq('id', this.editingBookId)
                    .eq('created_by', this.currentUser.id);

                if (bookError) throw bookError;
            }

            // Update or create user progress
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

        const book = this.books.find(b => b.id === this.currentBookForUpdate);
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
            ons.notification.alert({
                message: '🔒 Please sign in to delete books',
                title: 'Authentication Required',
                buttonLabel: 'OK'
            });
            return;
        }

        const book = this.books.find(b => b.id === id);
        if (!book || book.created_by !== this.currentUser.id) {
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
            console.log('Current user ID:', this.currentUser.id);

            // First check if the book exists and user owns it
            const { data: bookCheck, error: checkError } = await supabase
                .from('shared_books')
                .select('id, name, created_by')
                .eq('id', id)
                .single();

            if (checkError) {
                console.error('Error checking book:', checkError);
                throw checkError;
            }

            console.log('Book found:', bookCheck);

            if (bookCheck.created_by !== this.currentUser.id) {
                ons.notification.alert({
                    message: '❌ You do not have permission to delete this book',
                    title: 'Permission Denied',
                    buttonLabel: 'OK'
                });
                return;
            }

            // Delete progress records first (for ALL users, not just current user)
            console.log('Deleting all progress records for book ID:', id);
            const { data: deletedProgress, error: progressError } = await supabase
                .from('user_reading_progress')
                .delete()
                .eq('book_id', id)
                .select(); // Add select to see what was deleted

            if (progressError) {
                console.error('Error deleting progress records:', progressError);
            } else {
                console.log('Deleted progress records:', deletedProgress);
            }

            // Delete the book
            console.log('Deleting book...');
            const { data: deletedBook, error: bookError } = await supabase
                .from('shared_books')
                .delete()
                .eq('id', id)
                .eq('created_by', this.currentUser.id)
                .select(); // Add select to see what was deleted

            if (bookError) {
                console.error('Error deleting book:', bookError);
                throw bookError;
            }

            console.log('Deleted book:', deletedBook);

            if (!deletedBook || deletedBook.length === 0) {
                ons.notification.alert({
                    message: '❌ No book was deleted. You may not have permission.',
                    title: 'Delete Failed',
                    buttonLabel: 'OK'
                });
                return;
            }

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
            const { data: existingProgress } = await supabase
                .from('user_reading_progress')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .eq('book_id', bookId)
                .single();

            if (existingProgress) {
                ons.notification.alert({
                    message: 'ℹ️ You are already tracking this book',
                    title: 'Already Tracking',
                    buttonLabel: 'OK'
                });
                return;
            }

            // Create new progress record with "Not Read" status
            const { error } = await supabase
                .from('user_reading_progress')
                .insert([{
                    user_id: this.currentUser.id,
                    book_id: bookId,
                    status: 'Not Read'
                }]);

            if (error) throw error;

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
        // Total books = all books in shared library
        const totalBooks = window.bookJournal.books.length;

        // Books that user is tracking
        const trackedBooks = window.bookJournal.books.filter(book =>
            book.hasProgress || book.created_by === window.bookJournal.currentUser.id
        );

        // Books that user hasn't started tracking yet
        const untrackedBooks = window.bookJournal.books.filter(book =>
            !book.hasProgress && book.created_by !== window.bookJournal.currentUser.id
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
            window.bookJournal.currentBookForUpdate = null; // Clear this too
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

// Simple file handling - no complex camera functions needed
function setupFileInputListener() {
    const bookCover = document.getElementById('bookCover');
    if (bookCover) {
        // Remove any existing listeners
        bookCover.removeEventListener('change', handleFileSelect);

        // Add the listener
        bookCover.addEventListener('change', handleFileSelect);

        console.log('File input listener setup completed');
    }
}

function handleFileSelect(event) {
    console.log('File selected:', event.target.files[0]);

    if (window.bookJournal && event.target.files[0]) {
        window.bookJournal.previewImage(event, 'imagePreview');
    }
}

// Update the setupEventListeners method to use the simple approach:
// In the BookJournal class, update this method:
setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            this.searchBooks(e.target.value);
        });
    }

    // Setup simple file input listener
    setupFileInputListener();

    this.setupStatusChangeListeners();
    this.setupProgressListeners();

    // Remove camera permissions setup - not needed anymore
    // this.setupCameraPermissions();
}

