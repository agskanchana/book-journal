// Utility functions
class Utils {
    static getElementValue(id) {
        const element = document.getElementById(id);
        return element ? element.value.trim() : '';
    }

    static setElementValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    }

    static debounce(func, wait) {
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

    static async checkConnection() {
        try {
            const { data, error } = await window.BookJournalConfig.supabase
                .from('shared_books')
                .select('count')
                .limit(1);

            return !error;
        } catch (error) {
            console.error('Connection check failed:', error);
            return false;
        }
    }

    static getFormData() {
        const data = {
            name: Utils.getElementValue('bookName'),
            author: Utils.getElementValue('authorName'),
            purchase_date: Utils.getElementValue('purchaseDate') || null,
            status: Utils.getElementValue('status') || 'Not Read',
            current_page: Utils.getElementValue('currentPage') || null,
            total_pages: Utils.getElementValue('totalPages') || null,
            category: Utils.getElementValue('category') || null,
            summary: Utils.getElementValue('summary') || null,
            coverFile: null
        };

        const fileInput = document.getElementById('bookCover');
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            data.coverFile = fileInput.files[0];
            console.log('Cover file found:', data.coverFile.name, data.coverFile.size);
        } else {
            console.log('No cover file selected');
        }

        return data;
    }

    static getEditFormData() {
        return {
            name: Utils.getElementValue('editBookName'),
            author: Utils.getElementValue('editAuthorName'),
            status: Utils.getElementValue('editStatus'),
            category: Utils.getElementValue('editCategory'),
            current_page: Utils.getElementValue('editCurrentPage') || null,
            total_pages: Utils.getElementValue('editTotalPages') || null,
            purchase_date: Utils.getElementValue('editPurchaseDate') || null,
            personal_notes: Utils.getElementValue('editSummary') || null
        };
    }
}

window.Utils = Utils;