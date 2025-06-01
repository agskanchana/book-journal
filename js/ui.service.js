// UI service for modal and page management
class UIService {
    showLoginPage() {
        document.getElementById('loginPage').style.display = 'block';
        document.getElementById('mainPage').style.display = 'none';
    }

    showMainApp() {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('mainPage').style.display = 'block';
    }

    showNotification(message, type = 'info') {
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
}

// Modal Functions
function showAddBookModal() {
    console.log('Opening add book modal');

    if (window.bookJournal) {
        window.bookJournal.resetAddBookForm();
    }

    const modal = document.getElementById('addBookModal');
    if (modal) {
        modal.style.display = 'block';

        const saveButton = document.querySelector('.toolbar-button-save');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Save';
            saveButton.style.opacity = '1';
        }

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

        if (window.bookJournal) {
            window.bookJournal.resetAddBookForm();
            window.bookJournal.editingBookId = null;
            window.bookJournal.currentBookForUpdate = null;
        }

        const saveButton = document.querySelector('.toolbar-button-save');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Save';
            saveButton.style.opacity = '1';
        }
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

        if (window.bookJournal) {
            window.bookJournal.currentBookForUpdate = null;
        }
    }
}

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
        const totalBooks = window.bookJournal.books.length;

        const trackedBooks = window.bookJournal.books.filter(book =>
            book.hasProgress || book.created_by === window.bookJournal.authService.currentUser.id
        );

        const untrackedBooks = window.bookJournal.books.filter(book =>
            !book.hasProgress && book.created_by !== window.bookJournal.authService.currentUser.id
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
        window.bookJournal.bookService.exportData();
    }
}

window.UIService = UIService;
window.uiService = new UIService();