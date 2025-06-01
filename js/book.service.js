// Book service for CRUD operations
class BookService {
    constructor(authService, uploadService, uiService) {
        this.authService = authService;
        this.uploadService = uploadService;
        this.uiService = uiService;
    }

    async loadBooks() {
        if (!this.authService.currentUser) return [];

        console.log('Loading books for user:', this.authService.currentUser.id);

        try {
            const { data: booksData, error: booksError } = await window.BookJournalConfig.supabase
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
                .eq('user_reading_progress.user_id', this.authService.currentUser.id)
                .order('created_at', { ascending: false });

            if (booksError) throw booksError;

            const creatorIds = [...new Set(booksData.map(book => book.created_by))];

            const { data: creatorsData, error: creatorsError } = await window.BookJournalConfig.supabase
                .from('user_profiles')
                .select('id, full_name, email')
                .in('id', creatorIds);

            const creatorsMap = new Map();
            if (!creatorsError && creatorsData) {
                creatorsData.forEach(creator => {
                    creatorsMap.set(creator.id, creator);
                });
            }

            return booksData.map(book => {
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
                    creator_name: creator.full_name ||
                                 (creator.email ? creator.email.split('@')[0] : null) ||
                                 'Community Member',
                    status: progress.status || 'Not Read',
                    current_page: progress.current_page || null,
                    purchase_date: progress.purchase_date || null,
                    personal_notes: progress.personal_notes || null,
                    started_reading_at: progress.started_reading_at || null,
                    finished_reading_at: progress.finished_reading_at || null,
                    hasProgress: !!progress.status
                };
            });
        } catch (error) {
            console.error('Error loading books:', error);
            this.uiService.showNotification('Error loading books', 'error');
            return [];
        }
    }

    async addBook(formData) {
        if (!this.authService.currentUser) {
            this.uiService.showNotification('🔒 Please sign in to add books', 'error');
            return false;
        }

        try {
            let cover_url = null;
            if (formData.coverFile) {
                console.log('Uploading image...');
                try {
                    cover_url = await this.uploadService.uploadImage(formData.coverFile);
                    console.log('Image uploaded successfully:', cover_url);
                } catch (uploadError) {
                    console.error('Image upload failed:', uploadError);
                    cover_url = null;
                }
            }

            const sharedBookData = {
                name: formData.name.trim(),
                author: formData.author.trim(),
                category: formData.category || null,
                summary: formData.summary || null,
                total_pages: parseInt(formData.total_pages),
                cover_url: cover_url,
                created_by: this.authService.currentUser.id
            };

            const { data: bookData, error: bookError } = await window.BookJournalConfig.supabase
                .from('shared_books')
                .insert([sharedBookData])
                .select()
                .single();

            if (bookError) throw bookError;

            const progressData = {
                user_id: this.authService.currentUser.id,
                book_id: bookData.id,
                status: formData.status,
                current_page: formData.current_page ? parseInt(formData.current_page) : null,
                purchase_date: formData.purchase_date || null,
                started_reading_at: formData.status === 'Reading' ? new Date().toISOString() : null
            };

            const { error: progressError } = await window.BookJournalConfig.supabase
                .from('user_reading_progress')
                .insert([progressData]);

            if (progressError) throw progressError;

            this.uiService.showNotification('✅ Book added successfully!', 'success');
            return true;

        } catch (error) {
            console.error('Error adding book:', error);
            this.uiService.showNotification(`❌ Error adding book: ${error.message}`, 'error');
            return false;
        }
    }

    async deleteBook(id) {
        if (!this.authService.currentUser) {
            this.uiService.showNotification('🔒 Please sign in to delete books', 'error');
            return false;
        }

        try {
            const { data: bookCheck, error: checkError } = await window.BookJournalConfig.supabase
                .from('shared_books')
                .select('id, name, created_by')
                .eq('id', id)
                .single();

            if (checkError) throw checkError;

            if (bookCheck.created_by !== this.authService.currentUser.id) {
                this.uiService.showNotification('❌ You do not have permission to delete this book', 'error');
                return false;
            }

            const { error: progressError } = await window.BookJournalConfig.supabase
                .from('user_reading_progress')
                .delete()
                .eq('book_id', id);

            if (progressError) {
                console.error('Error deleting progress records:', progressError);
            }

            const { data: deletedBook, error: bookError } = await window.BookJournalConfig.supabase
                .from('shared_books')
                .delete()
                .eq('id', id)
                .eq('created_by', this.authService.currentUser.id)
                .select();

            if (bookError) throw bookError;

            if (!deletedBook || deletedBook.length === 0) {
                this.uiService.showNotification('❌ No book was deleted. You may not have permission.', 'error');
                return false;
            }

            this.uiService.showNotification('✅ Book deleted successfully!', 'success');
            return true;

        } catch (error) {
            console.error('Error deleting book:', error);
            this.uiService.showNotification(`❌ Error deleting book: ${error.message}`, 'error');
            return false;
        }
    }

    exportData(books) {
        const dataStr = JSON.stringify(books, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'my-reading-progress.json';
        link.click();

        this.uiService.showNotification('Reading progress exported successfully!', 'success');
        hideUserMenu();
    }
}

window.BookService = BookService;