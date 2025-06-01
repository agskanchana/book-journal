class PWAManager {
  constructor() {
    this.deferredPrompt = null;
    this.isInstalled = false;
    this.swRegistration = null;
    this.init();
  }

  async init() {
    this.checkInstallation();
    this.registerServiceWorker();
    this.setupInstallPrompt();
    this.setupUpdateCheck();
    this.setupConnectivityListeners();
    this.handleURLShortcuts();
  }

  checkInstallation() {
    this.isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone ||
                      document.referrer.includes('android-app://');

    if (this.isInstalled) {
      console.log('📱 App is installed');
      this.hideInstallButton();
    }
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        this.swRegistration = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Service Worker registered:', this.swRegistration);

        this.swRegistration.addEventListener('updatefound', () => {
          const newWorker = this.swRegistration.installing;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.showUpdateAvailable();
            }
          });
        });

      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
      }
    }
  }

  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('💾 Install prompt available');
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
      console.log('🎉 App installed successfully');
      this.isInstalled = true;
      this.hideInstallButton();
      this.showInstallSuccess();
      this.deferredPrompt = null;
      this.trackInstallation();
    });
  }

  showInstallButton() {
    if (this.isInstalled) return;

    const loginPage = document.getElementById('loginPage');
    if (!loginPage || loginPage.style.display === 'none') return;

    const existingBtn = document.getElementById('installButton');
    if (existingBtn) existingBtn.remove();

    const installButton = document.createElement('ons-button');
    installButton.id = 'installButton';
    installButton.className = 'install-btn';
    installButton.innerHTML = `
      <ons-icon icon="md-download" style="margin-right: 8px;"></ons-icon>
      Install App
    `;

    installButton.addEventListener('click', () => this.installApp());

    const loginForm = document.querySelector('.login-form');
    if (loginForm) {
      loginForm.appendChild(installButton);
    }
  }

  hideInstallButton() {
    const installButton = document.getElementById('installButton');
    if (installButton) {
      installButton.remove();
    }
  }

  async installApp() {
    if (!this.deferredPrompt) {
      console.log('❌ No install prompt available');
      return;
    }

    try {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;

      console.log(`👤 User choice: ${outcome}`);

      this.deferredPrompt = null;
      this.hideInstallButton();

    } catch (error) {
      console.error('❌ Installation failed:', error);
    }
  }

  showInstallSuccess() {
    if (window.ons) {
      ons.notification.alert({
        message: '🎉 Book Journal installed successfully! You can now access it from your home screen.',
        title: 'Installation Complete',
        buttonLabel: 'Great!'
      });
    }
  }

  setupUpdateCheck() {
    if (!this.swRegistration) return;

    setInterval(() => {
      this.swRegistration.update();
    }, 30 * 60 * 1000);
  }

  showUpdateAvailable() {
    if (window.ons) {
      ons.notification.confirm({
        message: '🔄 A new version of Book Journal is available. Update now?',
        title: 'Update Available',
        buttonLabels: ['Later', 'Update']
      }).then((buttonIndex) => {
        if (buttonIndex === 1) {
          this.applyUpdate();
        }
      });
    }
  }

  applyUpdate() {
    if (!this.swRegistration || !this.swRegistration.waiting) return;

    this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  }

  handleURLShortcuts() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');

    if (action && window.bookJournal) {
      switch (action) {
        case 'add-book':
          setTimeout(() => {
            if (window.showAddBookModal) {
              showAddBookModal();
            }
          }, 1000);
          break;
        case 'library':
          setTimeout(() => {
            if (window.showLibrarySection) {
              showLibrarySection();
            }
          }, 1000);
          break;
      }
    }
  }

  trackInstallation() {
    console.log('📊 Tracking app installation');
  }

  setupConnectivityListeners() {
    window.addEventListener('online', () => {
      console.log('🌐 Back online');
      this.handleOnline();
    });

    window.addEventListener('offline', () => {
      console.log('📵 Gone offline');
      this.handleOffline();
    });
  }

  handleOnline() {
    if (window.ons) {
      ons.notification.toast('🌐 Back online! Syncing data...', {
        timeout: 3000
      });
    }
  }

  handleOffline() {
    if (window.ons) {
      ons.notification.toast('📵 You\'re offline. Changes will sync when reconnected.', {
        timeout: 5000
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.pwaManager = new PWAManager();
});

window.PWAManager = PWAManager;