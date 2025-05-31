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
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadBooks();
    }

    setupEventListeners() {
        // Form submission
        document.getElementById('bookForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addBook();
        });

        // Status change to show/hide current page
        document.getElementById('status').addEventListener('change', (e) => {
            const currentPageGroup = document.getElementById('currentPageGroup');
            if (e.target.value === 'Reading') {
                currentPageGroup.style.display = 'block';
            } else {
                currentPageGroup.style.display = 'none';
            }
        });

        // Image preview
        document.getElementById('bookCover').addEventListener('change', (e) => {
            this.previewImage(e);
        });

        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchBooks(e.target.value);
        });
    }

    async addBook() {
        const formData = this.getFormData();

        try {
            // Upload image if provided
            if (formData.coverFile) {
                formData.cover_url = await this.uploadImage(formData.coverFile);
            }

            // Remove file from formData before sending to database
            delete formData.coverFile;

            if (this.editingBookId) {
                // Update existing book
                const { data, error } = await supabase
                    .from('books')
                    .update(formData)
                    .eq('id', this.editingBookId)
                    .select();

                if (error) throw error;

                this.editingBookId = null; // Reset editing state
                alert('Book updated successfully!');
            } else {
                // Add new book
                const { data, error } = await supabase
                    .from('books')
                    .insert([formData])
                    .select();

                if (error) throw error;

                alert('Book added successfully!');
            }

            this.clearForm();
            this.loadBooks();
        } catch (error) {
            console.error('Error saving book:', error);
            alert('Error saving book. Please try again.');
        }
    }

    getFormData() {
        return {
            name: document.getElementById('bookName').value.trim(),
            author: document.getElementById('authorName').value.trim(),
            purchase_date: document.getElementById('purchaseDate').value || null,
            status: document.getElementById('status').value,
            current_page: document.getElementById('currentPage').value || null,
            category: document.getElementById('category').value || null,
            coverFile: document.getElementById('bookCover').files[0] || null
        };
    }

    async uploadImage(file) {
        return new Promise((resolve, reject) => {
            const widget = cloudinary.createUploadWidget({
                cloudName: CLOUDINARY_CLOUD_NAME,
                uploadPreset: CLOUDINARY_UPLOAD_PRESET,
                sources: ['local'],
                multiple: false,
                resourceType: 'image'
            }, (error, result) => {
                if (error) {
                    reject(error);
                } else if (result && result.event === 'success') {
                    resolve(result.info.secure_url);
                }
            });

            // Create a file input and trigger upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => resolve(data.secure_url))
            .catch(error => reject(error));
        });
    }

    previewImage(event) {
        const file = event.target.files[0];
        const preview = document.getElementById('imagePreview');

        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            };
            reader.readAsDataURL(file);
        } else {
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
        } catch (error) {
            console.error('Error loading books:', error);
        }
    }

    displayBooks() {
        const currentlyReading = this.books.filter(book => book.status === 'Reading');
        const allBooks = this.books;

        this.renderBooks(currentlyReading, 'currentlyReadingBooks');
        this.renderBooks(allBooks, 'allBooks');
    }

    renderBooks(books, containerId) {
        const container = document.getElementById(containerId);

        if (books.length === 0) {
            container.innerHTML = '<p>No books found.</p>';
            return;
        }

        container.innerHTML = books.map(book => this.createBookCard(book)).join('');
    }

    createBookCard(book) {
        const coverImage = book.cover_url
            ? `<img src="${book.cover_url}" alt="Book cover" class="book-cover">`
            : '<div class="book-cover">📚</div>';

        const currentPageInfo = book.status === 'Reading' && book.current_page
            ? `<p><strong>Current Page:</strong> ${book.current_page}</p>`
            : '';

        return `
            <div class="book-card">
                ${coverImage}
                <div class="book-info">
                    <h3>${book.name}</h3>
                    <p><strong>Author:</strong> ${book.author}</p>
                    ${book.purchase_date ? `<p><strong>Purchased:</strong> ${new Date(book.purchase_date).toLocaleDateString()}</p>` : ''}
                    ${book.category ? `<p><strong>Genre:</strong> ${book.category}</p>` : ''}
                    ${currentPageInfo}
                </div>
                <div class="book-actions">
                    <div class="status-badge status-${book.status.toLowerCase().replace(' ', '-')}">${book.status}</div>
                    <button class="btn-edit" onclick="bookJournal.editBook(${book.id})">Edit</button>
                    <button class="btn-delete" onclick="bookJournal.deleteBook(${book.id})">Delete</button>
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

    async deleteBook(id) {
        if (!confirm('Are you sure you want to delete this book?')) return;

        try {
            const { error } = await supabase
                .from('books')
                .delete()
                .eq('id', id);

            if (error) throw error;

            this.loadBooks();
            alert('Book deleted successfully!');
        } catch (error) {
            console.error('Error deleting book:', error);
            alert('Error deleting book. Please try again.');
        }
    }

    async editBook(id) {
        const book = this.books.find(b => b.id === id);
        if (!book) return;

        // Populate the form with existing book data
        document.getElementById('bookName').value = book.name;
        document.getElementById('authorName').value = book.author;
        document.getElementById('purchaseDate').value = book.purchase_date || '';
        document.getElementById('status').value = book.status;
        document.getElementById('currentPage').value = book.current_page || '';
        document.getElementById('category').value = book.category || '';

        // Show current page field if status is Reading
        if (book.status === 'Reading') {
            document.getElementById('currentPageGroup').style.display = 'block';
        }

        // Show existing image preview if available
        if (book.cover_url) {
            document.getElementById('imagePreview').innerHTML = `<img src="${book.cover_url}" alt="Current cover">`;
        }

        // Store the book ID for updating instead of adding new
        this.editingBookId = id;

        // Update the form submit button text
        const submitButton = document.querySelector('#bookForm button[type="submit"]');
        submitButton.textContent = 'Update Book';

        // Scroll to form
        document.querySelector('.add-book-section').scrollIntoView({ behavior: 'smooth' });
    }

    clearForm() {
        document.getElementById('bookForm').reset();
        document.getElementById('imagePreview').innerHTML = '';
        document.getElementById('currentPageGroup').style.display = 'none';

        // Reset editing state and button text
        this.editingBookId = null;
        const submitButton = document.querySelector('#bookForm button[type="submit"]');
        submitButton.textContent = 'Add Book';
    }
}

// Initialize the app
const bookJournal = new BookJournal();